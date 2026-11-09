package uz.medix.inventory.count;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.inventory.ZoneType;
import uz.medix.inventory.count.InventoryCountModels.InventoryBatchHit;
import uz.medix.inventory.count.InventoryCountModels.InventoryCountDetail;
import uz.medix.inventory.count.InventoryCountModels.InventoryCountEntry;
import uz.medix.inventory.count.InventoryCountModels.InventoryCountLine;
import uz.medix.inventory.count.InventoryCountModels.InventoryCountPage;
import uz.medix.inventory.count.InventoryCountModels.InventoryCountRequest;
import uz.medix.inventory.count.InventoryCountModels.InventoryCountSummary;
import uz.medix.inventory.count.InventoryCountModels.InventoryLastFull;
import uz.medix.inventory.count.InventoryCountModels.InventoryOverview;
import uz.medix.inventory.count.InventoryCountModels.InventoryStatusCount;
import uz.medix.inventory.count.InventoryCountModels.Status;
import uz.medix.inventory.count.InventoryCountModels.ZoneRef;
import uz.medix.notification.Notifications;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * IN — inventarizatsiya (T12: draft → count → check → posted; cancelled). Sanoq ochilganda (inventory.openCount) qamrovdagi qoldiq
 * surati qatorlarga yoziladi va zonalar qulflanadi (StockLedger ivLock). Sanoq (inventory.count) — mavjud qatorlarga miqdor, topilgan
 * partiyalar qo'shiladi. Tekshiruvga yuborilganda farqlar hisoblanadi: kamomad tannarxi 5 000 000 dan katta yoki nazoratdagi tovarda
 * farq — Direktor (inventory.director). Tasdiq (inventory.approve) — bitta tranzaksiya: farqlar jurnalga + qoldiq + holat + audit.
 */
@Service
class InventoryCounts {

    static final String DOC_TYPE = "IN";

    /** T12 ivDirApprove: kamomad tannarxi shundan KATTA bo'lsa — Direktor tasdig'i. */
    static final Money DIRECTOR_LIMIT = Money.of(5_000_000);

    private final JdbcClient jdbc;
    private final StockLedger ledger;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final Notifications notifications;

    InventoryCounts(JdbcClient jdbc, StockLedger ledger, AuditLog audit, DocumentSequenceService numbers, Notifications notifications) {
        this.jdbc = jdbc;
        this.ledger = ledger;
        this.audit = audit;
        this.numbers = numbers;
        this.notifications = notifications;
    }

    /** Xodimning tasdiq ruxsatlari. */
    record Approver(boolean approve, boolean director) {

        boolean canPost(boolean needsDirector) {
            return approve && (!needsDirector || director);
        }
    }

    // ===== O'qish =====

    @Transactional(readOnly = true)
    InventoryCountPage list(Actor actor, Long branchId, Long warehouseId, Status status, int page, int size) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new HashMap<>();
        if (!actor.allBranches()) {
            where.append(" AND c.branch_id = :own");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        if (branchId != null) {
            where.append(" AND c.branch_id = :b");
            params.put("b", branchId);
        }
        if (warehouseId != null) {
            where.append(" AND c.warehouse_id = :w");
            params.put("w", warehouseId);
        }
        if (status != null) {
            where.append(" AND c.status = :s");
            params.put("s", status.name());
        }
        long total = jdbc.sql("SELECT count(*) FROM inventory_count c" + where).params(params).query(Long.class).single();
        List<InventoryCountSummary> items = jdbc.sql("""
                SELECT c.id, c.number, c.branch_id, c.warehouse_id, w.name AS warehouse, z.id AS zone_id, z.name AS zone_name,
                       z.type AS zone_type, c.blind, c.status, c.needs_director, coalesce(l.lines, 0) AS lines,
                       coalesce(l.counted, 0) AS counted, c.shortage_qty, c.surplus_qty, c.shortage_cost, c.surplus_cost,
                       e.full_name AS created_by, c.created_at, c.posted_at, c.commission
                FROM inventory_count c
                JOIN warehouse w ON w.id = c.warehouse_id
                LEFT JOIN zone z ON z.id = c.zone_id
                JOIN employee e ON e.id = c.created_by
                LEFT JOIN (SELECT count_id, count(*) AS lines, count(counted_qty) AS counted FROM inventory_count_line GROUP BY count_id) l
                       ON l.count_id = c.id""" + where + " ORDER BY c.created_at DESC, c.id DESC LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query((rs, n) -> new InventoryCountSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        rs.getLong("warehouse_id"), rs.getString("warehouse"), zoneRef(rs.getObject("zone_id", Long.class),
                                rs.getString("zone_name"), rs.getString("zone_type")),
                        rs.getBoolean("blind"), Status.valueOf(rs.getString("status")), rs.getBoolean("needs_director"), rs.getInt("lines"),
                        rs.getInt("counted"), rs.getInt("shortage_qty"), rs.getInt("surplus_qty"), money(rs.getBigDecimal("shortage_cost")),
                        money(rs.getBigDecimal("surplus_cost")), rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(),
                        instant(rs.getTimestamp("posted_at")), rs.getString("commission")))
                .list();
        return new InventoryCountPage(items, total, page, size);
    }

    static final int REMIND_DAYS = 90;

    /** Roʻyxat yuqorisi (prototip Inventory): holatlar soni va har ombor boʻyicha oxirgi toʻliq inventarizatsiya. */
    @Transactional(readOnly = true)
    InventoryOverview overview(Actor actor, Long branchId) {
        Long scope = branchId != null ? branchId : actor.allBranches() ? null : (actor.branchId() == null ? -1L : actor.branchId());
        if (branchId != null && !actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        List<InventoryStatusCount> statuses = jdbc.sql("""
                SELECT status, count(*) AS n FROM inventory_count WHERE CAST(:b AS BIGINT) IS NULL OR branch_id = :b GROUP BY status""")
                .param("b", scope)
                .query((rs, n) -> new InventoryStatusCount(Status.valueOf(rs.getString("status")), rs.getLong("n")))
                .list();
        java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Tashkent"));
        List<InventoryLastFull> last = jdbc.sql("""
                SELECT w.id, w.name, b.name AS bname,
                       (SELECT max((c.posted_at AT TIME ZONE 'Asia/Tashkent')::date) FROM inventory_count c
                        WHERE c.warehouse_id = w.id AND c.zone_id IS NULL AND c.status = 'POSTED') AS last
                FROM warehouse w JOIN branch b ON b.id = w.branch_id
                WHERE w.active AND (CAST(:b AS BIGINT) IS NULL OR w.branch_id = :b)
                ORDER BY b.name, w.name""")
                .param("b", scope)
                .query((rs, n) -> {
                    java.time.LocalDate d = rs.getDate("last") == null ? null : rs.getDate("last").toLocalDate();
                    return new InventoryLastFull(rs.getLong("id"), rs.getString("name"), rs.getString("bname"), d,
                            d == null ? null : (int) java.time.temporal.ChronoUnit.DAYS.between(d, today));
                })
                .list();
        return new InventoryOverview(statuses, last, REMIND_DAYS);
    }

    @Transactional(readOnly = true)
    Optional<InventoryCountDetail> find(long id, Actor actor) {
        record HeadRow(long id, String number, long branchId, long warehouseId, String warehouse, ZoneRef zone, boolean blind,
                String commission, String note, String status, boolean needsDirector, int shortageQty, int surplusQty,
                BigDecimal shortageCost, BigDecimal surplusCost, String createdBy, Timestamp createdAt, String startedBy,
                Timestamp startedAt, String submittedBy, Timestamp submittedAt, String postedBy, Timestamp postedAt, String cancelledBy,
                Timestamp cancelledAt, String cancelReason) {}
        Optional<HeadRow> head = jdbc.sql("""
                SELECT c.id, c.number, c.branch_id, c.warehouse_id, w.name AS warehouse, z.id AS zone_id, z.name AS zone_name,
                       z.type AS zone_type, c.blind, c.commission, c.note, c.status, c.needs_director, c.shortage_qty, c.surplus_qty,
                       c.shortage_cost, c.surplus_cost, cb.full_name AS created_by, c.created_at, sb.full_name AS started_by, c.started_at,
                       ub.full_name AS submitted_by, c.submitted_at, pb.full_name AS posted_by, c.posted_at, xb.full_name AS cancelled_by,
                       c.cancelled_at, c.cancel_reason
                FROM inventory_count c
                JOIN warehouse w ON w.id = c.warehouse_id
                LEFT JOIN zone z ON z.id = c.zone_id
                JOIN employee cb ON cb.id = c.created_by
                LEFT JOIN employee sb ON sb.id = c.started_by
                LEFT JOIN employee ub ON ub.id = c.submitted_by
                LEFT JOIN employee pb ON pb.id = c.posted_by
                LEFT JOIN employee xb ON xb.id = c.cancelled_by
                WHERE c.id = :id""")
                .param("id", id)
                .query((rs, n) -> new HeadRow(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("warehouse_id"),
                        rs.getString("warehouse"), zoneRef(rs.getObject("zone_id", Long.class), rs.getString("zone_name"),
                                rs.getString("zone_type")),
                        rs.getBoolean("blind"), rs.getString("commission"), rs.getString("note"), rs.getString("status"),
                        rs.getBoolean("needs_director"), rs.getInt("shortage_qty"), rs.getInt("surplus_qty"), rs.getBigDecimal("shortage_cost"),
                        rs.getBigDecimal("surplus_cost"), rs.getString("created_by"), rs.getTimestamp("created_at"), rs.getString("started_by"),
                        rs.getTimestamp("started_at"), rs.getString("submitted_by"), rs.getTimestamp("submitted_at"), rs.getString("posted_by"),
                        rs.getTimestamp("posted_at"), rs.getString("cancelled_by"), rs.getTimestamp("cancelled_at"),
                        rs.getString("cancel_reason")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        HeadRow h = head.get();
        List<InventoryCountLine> lines = jdbc.sql("""
                SELECT l.id, z.id AS zone_id, z.name AS zone_name, z.type AS zone_type, l.batch_id, b.number AS batch_number, b.expiry_date,
                       l.product_id, p.code, p.name, p.controlled, l.book_qty, l.counted_qty, l.added, l.cost, e.full_name AS counted_by,
                       l.counted_at
                FROM inventory_count_line l
                JOIN zone z ON z.id = l.zone_id JOIN batch b ON b.id = l.batch_id JOIN product p ON p.id = l.product_id
                LEFT JOIN employee e ON e.id = l.counted_by
                WHERE l.count_id = :id ORDER BY z.name, p.name, b.expiry_date, b.number""")
                .param("id", id)
                .query((rs, n) -> {
                    int book = rs.getInt("book_qty");
                    Integer counted = rs.getObject("counted_qty", Integer.class);
                    Integer diff = counted == null ? null : counted - book;
                    Money cost = new Money(rs.getBigDecimal("cost"));
                    return new InventoryCountLine(rs.getLong("id"), new ZoneRef(rs.getLong("zone_id"), rs.getString("zone_name"),
                            ZoneType.valueOf(rs.getString("zone_type"))), rs.getLong("batch_id"), rs.getString("batch_number"),
                            rs.getDate("expiry_date").toLocalDate(), rs.getLong("product_id"), rs.getString("code"), rs.getString("name"),
                            rs.getBoolean("controlled"), book, counted, diff, rs.getBoolean("added"), cost.toString(),
                            diff == null ? null : cost.times(diff).toString(), rs.getString("counted_by"), instant(rs.getTimestamp("counted_at")));
                })
                .list();
        int counted = (int) lines.stream().filter(l -> l.countedQty() != null).count();
        return Optional.of(new InventoryCountDetail(h.id(), h.number(), h.branchId(), h.warehouseId(), h.warehouse(), h.zone(), h.blind(), false,
                h.commission(), h.note(), Status.valueOf(h.status()), h.needsDirector(), h.shortageQty(), h.surplusQty(), money(h.shortageCost()),
                money(h.surplusCost()), h.createdBy(), h.createdAt().toInstant(), h.startedBy(), instant(h.startedAt()), h.submittedBy(),
                instant(h.submittedAt()), h.postedBy(), instant(h.postedAt()), h.cancelledBy(), instant(h.cancelledAt()), h.cancelReason(),
                counted, lines));
    }

    /** Sanoqda topilgan partiyani raqami bo'yicha qidirish (qamrovdagi ombor filialida mavjud bo'lishi shart emas). */
    @Transactional(readOnly = true)
    List<InventoryBatchHit> findBatches(Actor actor, long id, String query) {
        head(id, actor, false);
        String q = query == null ? "" : query.strip().toLowerCase();
        if (q.length() < 2) {
            return List.of();
        }
        return jdbc.sql("""
                SELECT b.id, b.number, b.expiry_date, p.id AS product_id, p.code, p.name
                FROM batch b JOIN product p ON p.id = b.product_id
                WHERE lower(b.number) LIKE :q OR p.code = :exact OR p.search_text LIKE :q
                ORDER BY p.name, b.expiry_date LIMIT 20""")
                .param("q", "%" + q.replace("%", "").replace("_", "") + "%")
                .param("exact", q)
                .query((rs, n) -> new InventoryBatchHit(rs.getLong("id"), rs.getString("number"), rs.getDate("expiry_date").toLocalDate(),
                        rs.getLong("product_id"), rs.getString("code"), rs.getString("name")))
                .list();
    }

    // ===== Yozish =====

    @Transactional
    long create(Actor actor, InventoryCountRequest r) {
        record Wh(long id, long branchId, String branchCode, boolean active) {}
        Wh w = jdbc.sql("SELECT w.id, w.branch_id, b.code, w.active FROM warehouse w JOIN branch b ON b.id = w.branch_id WHERE w.id = :w")
                .param("w", r.warehouseId())
                .query((rs, n) -> new Wh(rs.getLong("id"), rs.getLong("branch_id"), rs.getString("code"), rs.getBoolean("active")))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.badRequest("inventory.warehouseUnknown"));
        if (!w.active()) {
            throw MedixException.badRequest("inventory.warehouseInactive");
        }
        if (r.zoneId() != null) {
            boolean ok = jdbc.sql("SELECT count(*) > 0 FROM zone WHERE id = :z AND warehouse_id = :w")
                    .param("z", r.zoneId())
                    .param("w", w.id())
                    .query(Boolean.class)
                    .single();
            if (!ok) {
                throw MedixException.badRequest("stock.zoneUnknown");
            }
        }
        String active = activeNumber(w.id());
        if (active != null) {
            throw MedixException.conflict("inventory.alreadyActive", active);
        }
        String number = numbers.next(DocumentPrefix.IN, w.branchCode()).toString();
        long id;
        try {
            id = jdbc.sql("""
                    INSERT INTO inventory_count (number, branch_id, warehouse_id, zone_id, blind, commission, note, status, created_by)
                    VALUES (:n, :b, :w, :z, :blind, :com, :note, 'DRAFT', :by) RETURNING id""")
                    .param("n", number)
                    .param("b", w.branchId())
                    .param("w", w.id())
                    .param("z", r.zoneId())
                    .param("blind", r.blind())
                    .param("com", blankToNull(r.commission()))
                    .param("note", blankToNull(r.note()))
                    .param("by", actor.employeeId())
                    .query(Long.class)
                    .single();
        } catch (DuplicateKeyException e) {
            throw MedixException.conflict("inventory.alreadyActive", String.valueOf(activeNumber(w.id())));
        }
        audit.record(AuditEntry.of("inventory.create", "inventory_count", id)
                .change(null, Map.of("number", number, "warehouse", w.id(), "zone", r.zoneId() == null ? "" : r.zoneId(), "blind", r.blind())),
                actor);
        return id;
    }

    /** Qoralama → Sanoq: ombor qulflanadi, qamrovdagi qoldiq surati qatorlarga yoziladi. */
    @Transactional
    void start(Actor actor, long id) {
        Head h = head(id, actor, true);
        requireStatus(h, Status.DRAFT);
        // Yarim yo'ldagi ombor harakatlari tugashini kutadi (StockLedger omborni FOR SHARE bilan ushlaydi)
        jdbc.sql("SELECT id FROM warehouse WHERE id = :w FOR UPDATE").param("w", h.warehouseId()).query(Long.class).single();
        jdbc.sql("""
                UPDATE inventory_count SET status = 'COUNTING', started_by = :by, started_at = now(), updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        int lines = jdbc.sql("""
                INSERT INTO inventory_count_line (count_id, zone_id, batch_id, product_id, book_qty, cost)
                SELECT :id, s.zone_id, s.batch_id, s.product_id, s.qty, b.cost
                FROM stock_balance s JOIN zone z ON z.id = s.zone_id JOIN batch b ON b.id = s.batch_id
                WHERE z.warehouse_id = :w AND (CAST(:z AS BIGINT) IS NULL OR s.zone_id = :z) AND s.qty > 0
                ORDER BY s.zone_id, s.batch_id""")
                .param("id", id)
                .param("w", h.warehouseId())
                .param("z", h.zoneId())
                .update();
        audit.record(AuditEntry.of("inventory.start", "inventory_count", id).change(null, Map.of("number", h.number(), "lines", lines)), actor);
    }

    /** Sanalgan miqdorlar: mavjud qatorga yoki topilgan partiya — yangi qator (hisobda 0). */
    @Transactional
    void count(Actor actor, long id, List<InventoryCountEntry> entries) {
        Head h = head(id, actor, true);
        requireStatus(h, Status.COUNTING);
        for (InventoryCountEntry e : entries) {
            if (e.lineId() != null) {
                int updated = jdbc.sql("""
                        UPDATE inventory_count_line SET counted_qty = :q, counted_by = :by, counted_at = now()
                        WHERE id = :l AND count_id = :id""")
                        .param("q", e.countedQty())
                        .param("by", actor.employeeId())
                        .param("l", e.lineId())
                        .param("id", id)
                        .update();
                if (updated == 0) {
                    throw MedixException.badRequest("inventory.lineUnknown");
                }
                continue;
            }
            if (e.zoneId() == null || e.batchId() == null) {
                throw MedixException.badRequest("inventory.lineUnknown");
            }
            boolean inScope = jdbc.sql("SELECT count(*) > 0 FROM zone WHERE id = :z AND warehouse_id = :w AND (CAST(:only AS BIGINT) IS NULL OR id = :only)")
                    .param("z", e.zoneId())
                    .param("w", h.warehouseId())
                    .param("only", h.zoneId())
                    .query(Boolean.class)
                    .single();
            if (!inScope) {
                throw MedixException.badRequest("inventory.zoneOutOfScope");
            }
            record BatchRow(long productId, BigDecimal cost) {}
            BatchRow b = jdbc.sql("SELECT product_id, cost FROM batch WHERE id = :b")
                    .param("b", e.batchId())
                    .query((rs, n) -> new BatchRow(rs.getLong("product_id"), rs.getBigDecimal("cost")))
                    .optional()
                    .orElseThrow(() -> MedixException.badRequest("stock.batchUnknown"));
            jdbc.sql("""
                    INSERT INTO inventory_count_line (count_id, zone_id, batch_id, product_id, book_qty, counted_qty, cost, added, counted_by,
                                                      counted_at)
                    VALUES (:id, :z, :b, :p, 0, :q, :c, true, :by, now())
                    ON CONFLICT (count_id, zone_id, batch_id) DO UPDATE SET counted_qty = EXCLUDED.counted_qty,
                           counted_by = EXCLUDED.counted_by, counted_at = EXCLUDED.counted_at""")
                    .param("id", id)
                    .param("z", e.zoneId())
                    .param("b", e.batchId())
                    .param("p", b.productId())
                    .param("q", e.countedQty())
                    .param("c", b.cost())
                    .param("by", actor.employeeId())
                    .update();
        }
        jdbc.sql("UPDATE inventory_count SET updated_at = now(), version = version + 1 WHERE id = :id").param("id", id).update();
        audit.record(AuditEntry.of("inventory.count", "inventory_count", id).change(null, Map.of("entries", entries.size())), actor);
    }

    /** Sanoq → Tekshirish: hamma qator sanalgan bo'lishi shart; farqlar va Direktor darajasi hisoblanadi. */
    @Transactional
    void submit(Actor actor, long id) {
        Head h = head(id, actor, true);
        requireStatus(h, Status.COUNTING);
        Totals t = totals(id);
        if (t.uncounted() > 0) {
            throw MedixException.badRequest("inventory.notCounted", String.valueOf(t.uncounted()));
        }
        boolean director = t.shortageCost().compareTo(DIRECTOR_LIMIT) > 0 || t.controlledDiff();
        jdbc.sql("""
                UPDATE inventory_count SET status = 'CHECK', shortage_qty = :sq, shortage_cost = :sc, surplus_qty = :pq, surplus_cost = :pc,
                       needs_director = :dir, submitted_by = :by, submitted_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("sq", t.shortageQty())
                .param("sc", t.shortageCost().amount())
                .param("pq", t.surplusQty())
                .param("pc", t.surplusCost().amount())
                .param("dir", director)
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("inventory.submit", "inventory_count", id)
                .change(null, Map.of("shortageQty", t.shortageQty(), "shortageCost", t.shortageCost().toString(), "surplusQty", t.surplusQty(),
                        "director", director)), actor);
        notifications.notify(director ? "inventory.director" : "inventory.approve", h.branchId(), List.of(),
                notifications.message("inventory.check", "inventory.check", "/inventory-counts?status=CHECK&open=" + id, "inventory.check:" + id, h.number(),
                        String.valueOf(t.shortageQty()), String.valueOf(t.surplusQty())));
    }

    /** Tekshirish → Sanoq (qayta sanash). */
    @Transactional
    void recount(Actor actor, long id) {
        Head h = head(id, actor, true);
        requireStatus(h, Status.CHECK);
        jdbc.sql("""
                UPDATE inventory_count SET status = 'COUNTING', needs_director = false, submitted_by = NULL, submitted_at = NULL,
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("inventory.recount", "inventory_count", id).change(null, Map.of("number", h.number())), actor);
    }

    /** Tekshirish → Tasdiqlangan: farqlar jurnalga (kamomad — chiqim, ortiqcha — kirim), qulf yechiladi. */
    @Transactional
    void approve(Actor actor, long id, Approver approver) {
        Head h = head(id, actor, true);
        requireStatus(h, Status.CHECK);
        if (!approver.canPost(h.needsDirector())) {
            throw MedixException.forbidden("inventory.directorRequired", DIRECTOR_LIMIT.format());
        }
        record Diff(long zoneId, long batchId, int book, int counted) {}
        List<Diff> diffs = jdbc.sql("""
                SELECT zone_id, batch_id, book_qty, counted_qty FROM inventory_count_line
                WHERE count_id = :id AND counted_qty <> book_qty ORDER BY zone_id, batch_id""")
                .param("id", id)
                .query((rs, n) -> new Diff(rs.getLong("zone_id"), rs.getLong("batch_id"), rs.getInt("book_qty"), rs.getInt("counted_qty")))
                .list();
        List<Move> moves = new ArrayList<>();
        for (Diff d : diffs) {
            // Qulf tufayli qoldiq o'zgarmagan bo'lishi kerak; himoya — o'zgargan bo'lsa qayta sanash
            int now = jdbc.sql("SELECT qty FROM stock_balance WHERE zone_id = :z AND batch_id = :b FOR UPDATE")
                    .param("z", d.zoneId())
                    .param("b", d.batchId())
                    .query(Integer.class)
                    .optional()
                    .orElse(0);
            if (now != d.book()) {
                throw MedixException.conflict("inventory.bookChanged", label(d.batchId()));
            }
            if (d.counted() < d.book()) {
                int reserved = jdbc.sql("""
                        SELECT coalesce(sum(qty), 0) FROM stock_reservation WHERE zone_id = :z AND batch_id = :b AND status = 'ACTIVE'""")
                        .param("z", d.zoneId())
                        .param("b", d.batchId())
                        .query(Integer.class)
                        .single();
                if (reserved > d.counted()) {
                    throw MedixException.conflict("inventory.reservedShortage", label(d.batchId()), String.valueOf(reserved),
                            String.valueOf(d.counted()));
                }
            }
            int delta = d.counted() - d.book();
            moves.add(delta > 0 ? Move.in(d.zoneId(), d.batchId(), delta) : Move.out(d.zoneId(), d.batchId(), -delta));
        }
        ledger.post(new DocRef(DOC_TYPE, id, h.number()), moves);
        jdbc.sql("""
                UPDATE inventory_count SET status = 'POSTED', posted_by = :by, posted_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("inventory.post", "inventory_count", id).change(null, Map.of("number", h.number(), "moves", moves.size())),
                actor);
    }

    @Transactional
    void cancel(Actor actor, long id, String reason) {
        Head h = head(id, actor, true);
        if (h.status() == Status.POSTED || h.status() == Status.CANCELLED) {
            throw MedixException.conflict("inventory.finished", h.status().name());
        }
        jdbc.sql("""
                UPDATE inventory_count SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r,
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", reason.strip())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("inventory.cancel", "inventory_count", id).change(null, Map.of("reason", reason.strip())), actor);
    }

    // ===== Ichki =====

    record Head(long id, String number, long branchId, long warehouseId, Long zoneId, Status status, boolean needsDirector, boolean blind) {}

    record Totals(int uncounted, int shortageQty, Money shortageCost, int surplusQty, Money surplusCost, boolean controlledDiff) {}

    Head head(long id, Actor actor, boolean lock) {
        return jdbc.sql("SELECT id, number, branch_id, warehouse_id, zone_id, status, needs_director, blind FROM inventory_count WHERE id = :id"
                        + (lock ? " FOR UPDATE" : ""))
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("warehouse_id"),
                        rs.getObject("zone_id", Long.class), Status.valueOf(rs.getString("status")), rs.getBoolean("needs_director"),
                        rs.getBoolean("blind")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private Totals totals(long id) {
        return jdbc.sql("""
                SELECT count(*) FILTER (WHERE l.counted_qty IS NULL) AS uncounted,
                       coalesce(sum(l.book_qty - l.counted_qty) FILTER (WHERE l.counted_qty < l.book_qty), 0) AS sq,
                       coalesce(sum((l.book_qty - l.counted_qty) * l.cost) FILTER (WHERE l.counted_qty < l.book_qty), 0) AS sc,
                       coalesce(sum(l.counted_qty - l.book_qty) FILTER (WHERE l.counted_qty > l.book_qty), 0) AS pq,
                       coalesce(sum((l.counted_qty - l.book_qty) * l.cost) FILTER (WHERE l.counted_qty > l.book_qty), 0) AS pc,
                       coalesce(bool_or(p.controlled AND l.counted_qty <> l.book_qty), false) AS controlled
                FROM inventory_count_line l JOIN product p ON p.id = l.product_id WHERE l.count_id = :id""")
                .param("id", id)
                .query((rs, n) -> new Totals(rs.getInt("uncounted"), rs.getInt("sq"), new Money(rs.getBigDecimal("sc")), rs.getInt("pq"),
                        new Money(rs.getBigDecimal("pc")), rs.getBoolean("controlled")))
                .single();
    }

    private String activeNumber(long warehouseId) {
        return jdbc.sql("SELECT number FROM inventory_count WHERE warehouse_id = :w AND status IN ('DRAFT', 'COUNTING', 'CHECK')")
                .param("w", warehouseId)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    private String label(long batchId) {
        return jdbc.sql("SELECT p.name || ' · ' || b.number FROM batch b JOIN product p ON p.id = b.product_id WHERE b.id = :b")
                .param("b", batchId)
                .query(String.class)
                .optional()
                .orElse("?");
    }

    private static void requireStatus(Head h, Status expected) {
        if (h.status() != expected) {
            throw MedixException.conflict("inventory.wrongStatus", h.status().name());
        }
    }

    private static ZoneRef zoneRef(Long id, String name, String type) {
        return id == null ? null : new ZoneRef(id, name, ZoneType.valueOf(type));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static String money(BigDecimal v) {
        return v == null ? null : new Money(v).toString();
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
