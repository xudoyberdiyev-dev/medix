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
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.ZoneType;
import uz.medix.inventory.count.InventoryCountModels.InventoryBatchHit;
import uz.medix.inventory.count.InventoryCountModels.InventoryEvent;
import uz.medix.inventory.count.InventoryCountModels.InventoryScopeOptions;
import uz.medix.inventory.count.InventoryCountModels.MemberRef;
import uz.medix.inventory.count.InventoryCountModels.ProductRef;
import uz.medix.inventory.count.InventoryCountModels.ScopeMode;
import uz.medix.inventory.count.InventoryCountModels.ScopeProduct;
import uz.medix.inventory.count.InventoryCountModels.ScopeProductZone;
import uz.medix.inventory.count.InventoryCountModels.ScopeZone;
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
import uz.medix.shared.settings.SettingKey;
import uz.medix.shared.settings.SystemSettings;

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

    private final JdbcClient jdbc;
    private final StockLedger ledger;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final Notifications notifications;
    private final SystemSettings settings;

    InventoryCounts(JdbcClient jdbc, StockLedger ledger, AuditLog audit, DocumentSequenceService numbers, Notifications notifications,
            SystemSettings settings) {
        this.settings = settings;
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
                       e.full_name AS created_by, c.created_at, c.posted_at, c.commission, c.scope_mode, c.count_date,
                       (SELECT string_agg(z2.name, chr(31) ORDER BY z2.name) FROM inventory_count_zone cz JOIN zone z2 ON z2.id = cz.zone_id
                        WHERE cz.count_id = c.id) AS zone_names,
                       (SELECT count(*) FROM inventory_count_product cp WHERE cp.count_id = c.id) AS products
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
                        instant(rs.getTimestamp("posted_at")), rs.getString("commission"), ScopeMode.valueOf(rs.getString("scope_mode")),
                        splitNames(rs.getString("zone_names")), rs.getInt("products"),
                        rs.getDate("count_date") == null ? null : rs.getDate("count_date").toLocalDate()))
                .list();
        return new InventoryCountPage(items, total, page, size);
    }

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
                        WHERE c.warehouse_id = w.id AND c.scope_mode = 'WAREHOUSE' AND c.status = 'POSTED') AS last
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
        return new InventoryOverview(statuses, last, settings.intValue(SettingKey.invRemindDays));
    }

    @Transactional(readOnly = true)
    Optional<InventoryCountDetail> find(long id, Actor actor) {
        record HeadRow(long id, String number, long branchId, long warehouseId, String warehouse, ZoneRef zone, boolean blind,
                String commission, String note, String status, boolean needsDirector, int shortageQty, int surplusQty,
                BigDecimal shortageCost, BigDecimal surplusCost, String createdBy, Timestamp createdAt, String startedBy,
                Timestamp startedAt, String submittedBy, Timestamp submittedAt, String postedBy, Timestamp postedAt, String cancelledBy,
                Timestamp cancelledAt, String cancelReason, String scopeMode, java.sql.Date countDate, Long chairId) {}
        Optional<HeadRow> head = jdbc.sql("""
                SELECT c.id, c.number, c.branch_id, c.warehouse_id, w.name AS warehouse, z.id AS zone_id, z.name AS zone_name,
                       z.type AS zone_type, c.blind, c.commission, c.note, c.status, c.needs_director, c.shortage_qty, c.surplus_qty,
                       c.shortage_cost, c.surplus_cost, cb.full_name AS created_by, c.created_at, sb.full_name AS started_by, c.started_at,
                       ub.full_name AS submitted_by, c.submitted_at, pb.full_name AS posted_by, c.posted_at, xb.full_name AS cancelled_by,
                       c.cancelled_at, c.cancel_reason, c.scope_mode, c.count_date, c.chair_id
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
                        rs.getString("cancel_reason"), rs.getString("scope_mode"), rs.getDate("count_date"),
                        rs.getObject("chair_id", Long.class)))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        HeadRow h = head.get();
        List<InventoryCountLine> lines = jdbc.sql("""
                SELECT l.id, z.id AS zone_id, z.name AS zone_name, z.type AS zone_type, l.batch_id, b.number AS batch_number, b.expiry_date,
                       l.product_id, p.code, p.name, p.controlled, l.book_qty, l.counted_qty, l.added, l.cost, e.full_name AS counted_by,
                       l.counted_at, l.note, l.recount
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
                            diff == null ? null : cost.times(diff).toString(), rs.getString("counted_by"), instant(rs.getTimestamp("counted_at")),
                            rs.getString("note"), rs.getBoolean("recount"));
                })
                .list();
        int counted = (int) lines.stream().filter(l -> l.countedQty() != null).count();
        List<ZoneRef> zones = jdbc.sql("""
                SELECT z.id, z.name, z.type FROM inventory_count_zone cz JOIN zone z ON z.id = cz.zone_id WHERE cz.count_id = :id ORDER BY z.name""")
                .param("id", id)
                .query((rs, n) -> new ZoneRef(rs.getLong("id"), rs.getString("name"), ZoneType.valueOf(rs.getString("type"))))
                .list();
        List<ProductRef> products = jdbc.sql("""
                SELECT p.id, p.code, p.name FROM inventory_count_product cp JOIN product p ON p.id = cp.product_id WHERE cp.count_id = :id
                ORDER BY p.name""")
                .param("id", id)
                .query((rs, n) -> new ProductRef(rs.getLong("id"), rs.getString("code"), rs.getString("name")))
                .list();
        List<MemberRef> members = jdbc.sql("""
                SELECT e.id, e.full_name FROM inventory_count_member m JOIN employee e ON e.id = m.employee_id WHERE m.count_id = :id
                ORDER BY e.full_name""")
                .param("id", id)
                .query((rs, n) -> new MemberRef(rs.getLong("id"), rs.getString("full_name")))
                .list();
        List<InventoryEvent> events = new ArrayList<>();
        events.add(new InventoryEvent("create", h.createdBy(), h.createdAt().toInstant(), null));
        jdbc.sql("""
                SELECT e.full_name, a.occurred_at FROM audit_log a LEFT JOIN employee e ON e.id = a.employee_id
                WHERE a.entity_type = 'inventory_count' AND a.entity_id = :id AND a.action = 'inventory.recount'
                ORDER BY a.occurred_at""")
                .param("id", String.valueOf(id))
                .query((rs, n) -> new InventoryEvent("recount", rs.getString("full_name"), rs.getTimestamp("occurred_at").toInstant(), null))
                .list()
                .forEach(events::add);
        if (h.startedAt() != null) {
            events.add(new InventoryEvent("start", h.startedBy(), h.startedAt().toInstant(), null));
        }
        if (h.submittedAt() != null) {
            events.add(new InventoryEvent("submit", h.submittedBy(), h.submittedAt().toInstant(), null));
        }
        if (h.postedAt() != null) {
            events.add(new InventoryEvent("post", h.postedBy(), h.postedAt().toInstant(), null));
        }
        if (h.cancelledAt() != null) {
            events.add(new InventoryEvent("cancel", h.cancelledBy(), h.cancelledAt().toInstant(), h.cancelReason()));
        }
        events.sort(java.util.Comparator.comparing(InventoryEvent::at));
        return Optional.of(new InventoryCountDetail(h.id(), h.number(), h.branchId(), h.warehouseId(), h.warehouse(), h.zone(), h.blind(), false,
                h.commission(), h.note(), Status.valueOf(h.status()), h.needsDirector(), h.shortageQty(), h.surplusQty(), money(h.shortageCost()),
                money(h.surplusCost()), h.createdBy(), h.createdAt().toInstant(), h.startedBy(), instant(h.startedAt()), h.submittedBy(),
                instant(h.submittedAt()), h.postedBy(), instant(h.postedAt()), h.cancelledBy(), instant(h.cancelledAt()), h.cancelReason(),
                counted, lines, ScopeMode.valueOf(h.scopeMode()), zones, products, h.countDate() == null ? null : h.countDate().toLocalDate(),
                members, h.chairId(), events));
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
        Wh w = warehouse(actor, r.warehouseId());
        Scope sc = scope(w.id(), r);
        String active = activeNumber(w.id());
        if (active != null) {
            throw MedixException.conflict("inventory.alreadyActive", active);
        }
        String number = numbers.next(DocumentPrefix.IN, w.branchCode()).toString();
        long id;
        try {
            id = jdbc.sql("""
                    INSERT INTO inventory_count (number, branch_id, warehouse_id, zone_id, scope_mode, count_date, chair_id, blind, commission,
                                                 note, status, created_by)
                    VALUES (:n, :b, :w, :z, :mode, :d, :chair, :blind, :com, :note, 'DRAFT', :by) RETURNING id""")
                    .param("n", number)
                    .param("b", w.branchId())
                    .param("w", w.id())
                    .param("z", sc.singleZone())
                    .param("mode", sc.mode().name())
                    .param("d", r.countDate() != null ? r.countDate() : java.time.LocalDate.now(java.time.ZoneId.of("Asia/Tashkent")))
                    .param("chair", sc.chairId())
                    .param("blind", r.blind())
                    .param("com", commissionText(r.commission(), sc.memberIds()))
                    .param("note", blankToNull(r.note()))
                    .param("by", actor.employeeId())
                    .query(Long.class)
                    .single();
        } catch (DuplicateKeyException e) {
            throw MedixException.conflict("inventory.alreadyActive", String.valueOf(activeNumber(w.id())));
        }
        saveScope(id, sc);
        audit.record(AuditEntry.of("inventory.create", "inventory_count", id)
                .change(null, Map.of("number", number, "warehouse", w.id(), "scope", sc.mode().name(), "zones", sc.zoneIds(), "blind", r.blind())),
                actor);
        return id;
    }

    /** Qoralamani yangilash (prototip: avtomatik saqlash) — ombor (shu filialda), sana, qamrov, komissiya, ko'r sanoq. */
    @Transactional
    void update(Actor actor, long id, InventoryCountRequest r) {
        Head h = head(id, actor, true);
        requireStatus(h, Status.DRAFT);
        Wh w = warehouse(actor, r.warehouseId());
        if (w.branchId() != h.branchId()) {
            throw MedixException.badRequest("inventory.warehouseOtherBranch");
        }
        Scope sc = scope(w.id(), r);
        if (w.id() != h.warehouseId()) {
            String active = activeNumber(w.id());
            if (active != null) {
                throw MedixException.conflict("inventory.alreadyActive", active);
            }
        }
        try {
            jdbc.sql("""
                    UPDATE inventory_count SET warehouse_id = :w, zone_id = :z, scope_mode = :mode, count_date = coalesce(:d, count_date),
                           chair_id = :chair, blind = :blind, commission = :com, note = :note, updated_at = now(), version = version + 1
                    WHERE id = :id""")
                    .param("w", w.id())
                    .param("z", sc.singleZone())
                    .param("mode", sc.mode().name())
                    .param("d", r.countDate())
                    .param("chair", sc.chairId())
                    .param("blind", r.blind())
                    .param("com", commissionText(r.commission(), sc.memberIds()))
                    .param("note", blankToNull(r.note()))
                    .param("id", id)
                    .update();
        } catch (DuplicateKeyException e) {
            throw MedixException.conflict("inventory.alreadyActive", String.valueOf(activeNumber(w.id())));
        }
        jdbc.sql("DELETE FROM inventory_count_zone WHERE count_id = :id").param("id", id).update();
        jdbc.sql("DELETE FROM inventory_count_product WHERE count_id = :id").param("id", id).update();
        jdbc.sql("DELETE FROM inventory_count_member WHERE count_id = :id").param("id", id).update();
        saveScope(id, sc);
        audit.record(AuditEntry.of("inventory.update", "inventory_count", id)
                .change(null, Map.of("warehouse", w.id(), "scope", sc.mode().name(), "zones", sc.zoneIds(), "products", sc.productIds().size(),
                        "members", sc.memberIds(), "blind", r.blind())), actor);
    }

    /** Qoralama formasi: ombor zonalari, mahsulotlari (zonalar boʻyicha partiyalar soni) va filial xodimlari. */
    @Transactional(readOnly = true)
    InventoryScopeOptions scopeOptions(Actor actor, long warehouseId) {
        Wh w = warehouse(actor, warehouseId);
        List<ScopeZone> zones = jdbc.sql("""
                SELECT z.id, z.name, z.type,
                       (SELECT count(*) FROM stock_balance s WHERE s.zone_id = z.id AND s.qty > 0) AS batches,
                       (SELECT c.number FROM inventory_count c WHERE c.warehouse_id = z.warehouse_id AND c.status IN ('COUNTING', 'CHECK')
                          AND (c.scope_mode = 'WAREHOUSE'
                               OR EXISTS (SELECT 1 FROM inventory_count_zone cz WHERE cz.count_id = c.id AND cz.zone_id = z.id)
                               OR (c.scope_mode = 'PRODUCTS'
                                   AND EXISTS (SELECT 1 FROM inventory_count_line l WHERE l.count_id = c.id AND l.zone_id = z.id)))
                        LIMIT 1) AS locked_by
                FROM zone z WHERE z.warehouse_id = :w AND z.active ORDER BY z.id""")
                .param("w", w.id())
                .query((rs, n) -> new ScopeZone(rs.getLong("id"), rs.getString("name"), ZoneType.valueOf(rs.getString("type")),
                        rs.getInt("batches"), rs.getString("locked_by")))
                .list();
        record Pz(long productId, String code, String name, String category, long zoneId, int batches) {}
        List<Pz> rows = jdbc.sql("""
                SELECT p.id, p.code, p.name, c.name AS category, s.zone_id, count(*) AS batches
                FROM stock_balance s JOIN zone z ON z.id = s.zone_id JOIN product p ON p.id = s.product_id
                LEFT JOIN category c ON c.id = p.category_id
                WHERE z.warehouse_id = :w AND s.qty > 0
                GROUP BY p.id, p.code, p.name, c.name, s.zone_id ORDER BY p.name, s.zone_id""")
                .param("w", w.id())
                .query((rs, n) -> new Pz(rs.getLong("id"), rs.getString("code"), rs.getString("name"), rs.getString("category"),
                        rs.getLong("zone_id"), rs.getInt("batches")))
                .list();
        Map<Long, ScopeProduct> products = new java.util.LinkedHashMap<>();
        for (Pz x : rows) {
            products.computeIfAbsent(x.productId(), k -> new ScopeProduct(x.productId(), x.code(), x.name(), x.category(), new ArrayList<>()))
                    .zones()
                    .add(new ScopeProductZone(x.zoneId(), x.batches()));
        }
        List<MemberRef> staff = jdbc.sql("""
                SELECT id, full_name FROM employee WHERE status = 'ACTIVE' AND branch_id = :b ORDER BY full_name""")
                .param("b", w.branchId())
                .query((rs, n) -> new MemberRef(rs.getLong("id"), rs.getString("full_name")))
                .list();
        return new InventoryScopeOptions(zones, List.copyOf(products.values()), staff);
    }

    /** Qoralama → Sanoq: ombor qulflanadi, qamrovdagi qoldiq surati qatorlarga yoziladi. */
    @Transactional
    void start(Actor actor, long id) {
        Head h = head(id, actor, true);
        requireStatus(h, Status.DRAFT);
        validateForStart(h);
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
                WHERE z.warehouse_id = :w AND s.qty > 0
                  AND (:mode = 'WAREHOUSE' OR EXISTS (SELECT 1 FROM inventory_count_zone cz WHERE cz.count_id = :id AND cz.zone_id = s.zone_id)
                       OR (:mode = 'PRODUCTS' AND NOT EXISTS (SELECT 1 FROM inventory_count_zone cz WHERE cz.count_id = :id)))
                  AND (:mode <> 'PRODUCTS'
                       OR EXISTS (SELECT 1 FROM inventory_count_product cp WHERE cp.count_id = :id AND cp.product_id = s.product_id))
                ORDER BY s.zone_id, s.batch_id""")
                .param("id", id)
                .param("w", h.warehouseId())
                .param("mode", h.scopeMode().name())
                .update();
        if (lines == 0) {
            throw MedixException.badRequest("inventory.emptyScope");
        }
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
            boolean inScope = jdbc.sql("""
                    SELECT count(*) > 0 FROM zone z WHERE z.id = :z AND z.warehouse_id = :w
                      AND (:mode = 'WAREHOUSE' OR EXISTS (SELECT 1 FROM inventory_count_zone cz WHERE cz.count_id = :id AND cz.zone_id = z.id)
                           OR (:mode = 'PRODUCTS' AND NOT EXISTS (SELECT 1 FROM inventory_count_zone cz WHERE cz.count_id = :id)))
                      AND (:mode <> 'PRODUCTS' OR EXISTS (SELECT 1 FROM inventory_count_product cp JOIN batch b ON b.product_id = cp.product_id
                                                           WHERE cp.count_id = :id AND b.id = :b))""")
                    .param("z", e.zoneId())
                    .param("w", h.warehouseId())
                    .param("mode", h.scopeMode().name())
                    .param("id", id)
                    .param("b", e.batchId())
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
        boolean director = t.shortageCost().compareTo(settings.money(SettingKey.ivDirApprove)) > 0 || t.controlledDiff();
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
    void recount(Actor actor, long id, List<Long> lineIds) {
        Head h = head(id, actor, true);
        requireStatus(h, Status.CHECK);
        jdbc.sql("""
                UPDATE inventory_count SET status = 'COUNTING', needs_director = false, submitted_by = NULL, submitted_at = NULL,
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("id", id)
                .update();
        int reset = 0;
        if (lineIds != null && !lineIds.isEmpty()) {
            reset = jdbc.sql("""
                    UPDATE inventory_count_line SET counted_qty = NULL, counted_by = NULL, counted_at = NULL, recount = true
                    WHERE count_id = :id AND id IN (:l) AND NOT added""")
                    .param("id", id)
                    .param("l", lineIds)
                    .update();
            if (reset != lineIds.size()) {
                throw MedixException.badRequest("inventory.lineUnknown");
            }
        }
        audit.record(AuditEntry.of("inventory.recount", "inventory_count", id).change(null, Map.of("number", h.number(), "lines", reset)), actor);
    }

    /** Qator izohi (sanoq yoki tekshirish holatida). */
    @Transactional
    void note(Actor actor, long id, long lineId, String note) {
        Head h = head(id, actor, true);
        if (h.status() != Status.COUNTING && h.status() != Status.CHECK) {
            throw MedixException.conflict("inventory.wrongStatus", h.status().name());
        }
        int n = jdbc.sql("UPDATE inventory_count_line SET note = :n WHERE id = :l AND count_id = :id")
                .param("n", blankToNull(note))
                .param("l", lineId)
                .param("id", id)
                .update();
        if (n == 0) {
            throw MedixException.badRequest("inventory.lineUnknown");
        }
    }

    /** Tekshirish → Tasdiqlangan: farqlar jurnalga (kamomad — chiqim, ortiqcha — kirim), qulf yechiladi. */
    @Transactional
    void approve(Actor actor, long id, Approver approver) {
        Head h = head(id, actor, true);
        requireStatus(h, Status.CHECK);
        if (!approver.canPost(h.needsDirector())) {
            throw MedixException.forbidden("inventory.directorRequired", settings.money(SettingKey.ivDirApprove).format());
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

    record Head(long id, String number, long branchId, long warehouseId, Long zoneId, Status status, boolean needsDirector, boolean blind,
            ScopeMode scopeMode) {}

    record Wh(long id, long branchId, String branchCode) {}

    /** Tekshirilgan qamrov: zonalar ombornikidir, mahsulotlar mavjud, komissiya — filial xodimlari, rais — aʼzolardan. */
    record Scope(ScopeMode mode, List<Long> zoneIds, List<Long> productIds, List<Long> memberIds, Long chairId) {

        Long singleZone() {
            return mode == ScopeMode.ZONES && zoneIds.size() == 1 ? zoneIds.getFirst() : null;
        }
    }

    record Totals(int uncounted, int shortageQty, Money shortageCost, int surplusQty, Money surplusCost, boolean controlledDiff) {}

    Head head(long id, Actor actor, boolean lock) {
        return jdbc.sql("""
                        SELECT id, number, branch_id, warehouse_id, zone_id, status, needs_director, blind, scope_mode FROM inventory_count
                        WHERE id = :id""" + (lock ? " FOR UPDATE" : ""))
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("warehouse_id"),
                        rs.getObject("zone_id", Long.class), Status.valueOf(rs.getString("status")), rs.getBoolean("needs_director"),
                        rs.getBoolean("blind"), ScopeMode.valueOf(rs.getString("scope_mode"))))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private Wh warehouse(Actor actor, long warehouseId) {
        record Row(long id, long branchId, String branchCode, boolean active) {}
        Row w = jdbc.sql("SELECT w.id, w.branch_id, b.code, w.active FROM warehouse w JOIN branch b ON b.id = w.branch_id WHERE w.id = :w")
                .param("w", warehouseId)
                .query((rs, n) -> new Row(rs.getLong("id"), rs.getLong("branch_id"), rs.getString("code"), rs.getBoolean("active")))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.badRequest("inventory.warehouseUnknown"));
        if (!w.active()) {
            throw MedixException.badRequest("inventory.warehouseInactive");
        }
        return new Wh(w.id(), w.branchId(), w.branchCode());
    }

    private Scope scope(long warehouseId, InventoryCountRequest r) {
        List<Long> zones = r.zoneIds() != null && !r.zoneIds().isEmpty() ? r.zoneIds().stream().distinct().toList()
                : r.zoneId() != null ? List.of(r.zoneId()) : List.of();
        ScopeMode mode = r.scopeMode() != null ? r.scopeMode() : zones.isEmpty() ? ScopeMode.WAREHOUSE : ScopeMode.ZONES;
        if (mode == ScopeMode.WAREHOUSE) {
            zones = List.of();
        }
        if (!zones.isEmpty()) {
            long ok = jdbc.sql("SELECT count(*) FROM zone WHERE id IN (:z) AND warehouse_id = :w")
                    .param("z", zones)
                    .param("w", warehouseId)
                    .query(Long.class)
                    .single();
            if (ok != zones.size()) {
                throw MedixException.badRequest("stock.zoneUnknown");
            }
        }
        List<Long> products = mode == ScopeMode.PRODUCTS && r.productIds() != null ? r.productIds().stream().distinct().toList() : List.of();
        if (!products.isEmpty()) {
            long ok = jdbc.sql("SELECT count(*) FROM product WHERE id IN (:p)").param("p", products).query(Long.class).single();
            if (ok != products.size()) {
                throw MedixException.badRequest("inventory.productUnknown");
            }
        }
        List<Long> members = r.memberIds() == null ? List.of() : r.memberIds().stream().distinct().toList();
        if (!members.isEmpty()) {
            long ok = jdbc.sql("""
                    SELECT count(*) FROM employee e JOIN warehouse w ON w.branch_id = e.branch_id WHERE e.id IN (:m) AND w.id = :w""")
                    .param("m", members)
                    .param("w", warehouseId)
                    .query(Long.class)
                    .single();
            if (ok != members.size()) {
                throw MedixException.badRequest("inventory.memberUnknown");
            }
        }
        Long chair = r.chairId() != null && members.contains(r.chairId()) ? r.chairId() : null;
        return new Scope(mode, zones, products, members, chair);
    }

    private void saveScope(long id, Scope sc) {
        for (long z : sc.zoneIds()) {
            jdbc.sql("INSERT INTO inventory_count_zone (count_id, zone_id) VALUES (:id, :z)").param("id", id).param("z", z).update();
        }
        for (long p : sc.productIds()) {
            jdbc.sql("INSERT INTO inventory_count_product (count_id, product_id) VALUES (:id, :p)").param("id", id).param("p", p).update();
        }
        for (long m : sc.memberIds()) {
            jdbc.sql("INSERT INTO inventory_count_member (count_id, employee_id) VALUES (:id, :m)").param("id", id).param("m", m).update();
        }
    }

    /** Sanoqni boshlashdan oldin (prototip startErrs): zonalar / mahsulotlar tanlangan, komissiya kamida 2 xodim va rais. */
    private void validateForStart(Head h) {
        long zones = jdbc.sql("SELECT count(*) FROM inventory_count_zone WHERE count_id = :id").param("id", h.id()).query(Long.class).single();
        long products = jdbc.sql("SELECT count(*) FROM inventory_count_product WHERE count_id = :id").param("id", h.id()).query(Long.class).single();
        if (h.scopeMode() == ScopeMode.ZONES && zones == 0) {
            throw MedixException.badRequest("inventory.zonesRequired");
        }
        if (h.scopeMode() == ScopeMode.PRODUCTS && products == 0) {
            throw MedixException.badRequest("inventory.productsRequired");
        }
        record Comm(long members, boolean chair, boolean text) {}
        Comm c = jdbc.sql("""
                SELECT (SELECT count(*) FROM inventory_count_member m WHERE m.count_id = c.id) AS members, c.chair_id IS NOT NULL AS chair,
                       c.commission IS NOT NULL AS text
                FROM inventory_count c WHERE c.id = :id""")
                .param("id", h.id())
                .query((rs, n) -> new Comm(rs.getLong("members"), rs.getBoolean("chair"), rs.getBoolean("text")))
                .single();
        if (c.members() == 0 ? !c.text() : c.members() < 2) {
            throw MedixException.badRequest("inventory.commissionRequired");
        }
        if (c.members() > 0 && !c.chair()) {
            throw MedixException.badRequest("inventory.chairRequired");
        }
    }

    private String commissionText(String text, List<Long> members) {
        if (members.isEmpty()) {
            return blankToNull(text);
        }
        return jdbc.sql("SELECT left(string_agg(full_name, ', ' ORDER BY full_name), 500) FROM employee WHERE id IN (:m)")
                .param("m", members)
                .query(String.class)
                .single();
    }

    private static List<String> splitNames(String s) {
        return s == null || s.isEmpty() ? List.of() : List.of(s.split(String.valueOf((char) 31)));
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
