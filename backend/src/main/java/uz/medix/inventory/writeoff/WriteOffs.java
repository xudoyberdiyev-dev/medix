package uz.medix.inventory.writeoff;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.ZoneType;
import uz.medix.inventory.writeoff.WriteOffModels.Reason;
import uz.medix.inventory.writeoff.WriteOffModels.Status;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffDetail;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffLine;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffLineRequest;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffPage;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffRequest;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffStockRow;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffSummary;
import uz.medix.inventory.writeoff.WriteOffModels.ZoneRef;
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
 * HC — hisobdan chiqarish (T12: draft → posted; hc.create / hc.approve / hc.director, hcDirApprove = 5 000 000). Yaratilganda
 * «Tasdiqda»; yaratuvchida kerakli tasdiq ruxsati bo'lsa (hc.approve, tannarx summasi chegaradan katta bo'lsa — hc.director ham)
 * darhol o'tkaziladi. O'tkazish — bitta tranzaksiya: qoldiq satrlari qulflanadi, faol zahira ayriladi (zahiralangan tovar
 * chiqarilmaydi), jurnal + qoldiq (StockLedger) + hujjat holati + audit. Tannarx qator yaratilganda partiyadan olinadi.
 */
@Service
class WriteOffs {

    static final String DOC_TYPE = "HC";

    /** T12 hcDirApprove: tannarx summasi shundan KATTA bo'lsa — Direktor tasdig'i. */

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final StockLedger ledger;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final Notifications notifications;
    private final SystemSettings settings;
    private final Clock clock;

    WriteOffs(JdbcClient jdbc, StockLedger ledger, AuditLog audit, DocumentSequenceService numbers, Notifications notifications, Clock clock,
            SystemSettings settings) {
        this.settings = settings;
        this.jdbc = jdbc;
        this.ledger = ledger;
        this.audit = audit;
        this.numbers = numbers;
        this.notifications = notifications;
        this.clock = clock;
    }

    /** Xodimning tasdiq ruxsatlari. */
    record Approver(boolean approve, boolean director) {

        boolean canPost(boolean needsDirector) {
            return approve && (!needsDirector || director);
        }
    }

    record ZoneInfo(long id, String name, ZoneType type, boolean active, long warehouseId, boolean warehouseActive, long branchId,
            String branchCode) {}

    boolean needsDirector(Money total) {
        return total.compareTo(settings.money(SettingKey.hcDirApprove)) > 0;
    }

    // ===== O'qish =====

    @Transactional(readOnly = true)
    WriteOffPage list(Actor actor, Long branchId, Long warehouseId, Status status, Reason reason, int page, int size) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new HashMap<>();
        if (!actor.allBranches()) {
            where.append(" AND h.branch_id = :own");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        if (branchId != null) {
            where.append(" AND h.branch_id = :b");
            params.put("b", branchId);
        }
        if (warehouseId != null) {
            where.append(" AND h.warehouse_id = :w");
            params.put("w", warehouseId);
        }
        if (status != null) {
            where.append(" AND h.status = :s");
            params.put("s", status.name());
        }
        if (reason != null) {
            where.append(" AND h.reason = :r");
            params.put("r", reason.name());
        }
        long total = jdbc.sql("SELECT count(*) FROM write_off h" + where).params(params).query(Long.class).single();
        List<WriteOffSummary> items = jdbc.sql("""
                SELECT h.id, h.number, h.branch_id, h.warehouse_id, w.name AS warehouse, z.id AS zone_id, z.name AS zone_name,
                       z.type AS zone_type, h.reason, h.status, h.needs_director, coalesce(l.lines, 0) AS lines, coalesce(l.qty, 0) AS qty,
                       h.total_cost, e.full_name AS created_by, h.created_at, h.posted_at
                FROM write_off h
                JOIN warehouse w ON w.id = h.warehouse_id
                JOIN zone z ON z.id = h.zone_id
                JOIN employee e ON e.id = h.created_by
                LEFT JOIN (SELECT write_off_id, count(*) AS lines, sum(qty) AS qty FROM write_off_line GROUP BY write_off_id) l
                       ON l.write_off_id = h.id""" + where + " ORDER BY h.created_at DESC, h.id DESC LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query((rs, n) -> new WriteOffSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        rs.getLong("warehouse_id"), rs.getString("warehouse"),
                        new ZoneRef(rs.getLong("zone_id"), rs.getString("zone_name"), ZoneType.valueOf(rs.getString("zone_type"))),
                        Reason.valueOf(rs.getString("reason")), Status.valueOf(rs.getString("status")), rs.getBoolean("needs_director"),
                        rs.getInt("lines"), rs.getLong("qty"), money(rs.getBigDecimal("total_cost")), rs.getString("created_by"),
                        rs.getTimestamp("created_at").toInstant(), instant(rs.getTimestamp("posted_at"))))
                .list();
        return new WriteOffPage(items, total, page, size);
    }

    @Transactional(readOnly = true)
    Optional<WriteOffDetail> find(long id, Actor actor) {
        record HeadRow(long id, String number, long branchId, long warehouseId, String warehouse, ZoneRef zone, String reason, String actNo,
                String commission, String note, String status, boolean needsDirector, BigDecimal totalCost, String createdBy,
                Timestamp createdAt, String postedBy, Timestamp postedAt, String rejectedBy, Timestamp rejectedAt, String rejectReason,
                String sourceTransfer) {}
        Optional<HeadRow> head = jdbc.sql("""
                SELECT h.id, h.number, h.branch_id, h.warehouse_id, w.name AS warehouse, z.id AS zone_id, z.name AS zone_name,
                       z.type AS zone_type, h.reason, h.act_no, h.commission, h.note, h.status, h.needs_director, h.total_cost,
                       cb.full_name AS created_by, h.created_at, pb.full_name AS posted_by, h.posted_at, rb.full_name AS rejected_by,
                       h.rejected_at, h.reject_reason, COALESCE(st.number, sf.number) AS source_transfer
                FROM write_off h
                LEFT JOIN warehouse_transfer st ON st.id = h.source_transfer_id
                LEFT JOIN branch_sale sf ON sf.id = h.source_branch_sale_id
                JOIN warehouse w ON w.id = h.warehouse_id
                JOIN zone z ON z.id = h.zone_id
                JOIN employee cb ON cb.id = h.created_by
                LEFT JOIN employee pb ON pb.id = h.posted_by
                LEFT JOIN employee rb ON rb.id = h.rejected_by
                WHERE h.id = :id""")
                .param("id", id)
                .query((rs, n) -> new HeadRow(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("warehouse_id"),
                        rs.getString("warehouse"),
                        new ZoneRef(rs.getLong("zone_id"), rs.getString("zone_name"), ZoneType.valueOf(rs.getString("zone_type"))),
                        rs.getString("reason"), rs.getString("act_no"), rs.getString("commission"), rs.getString("note"), rs.getString("status"),
                        rs.getBoolean("needs_director"), rs.getBigDecimal("total_cost"), rs.getString("created_by"), rs.getTimestamp("created_at"),
                        rs.getString("posted_by"), rs.getTimestamp("posted_at"), rs.getString("rejected_by"), rs.getTimestamp("rejected_at"),
                        rs.getString("reject_reason"), rs.getString("source_transfer")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        HeadRow h = head.get();
        List<WriteOffLine> lines = jdbc.sql("""
                SELECT l.id, l.line_no, l.batch_id, b.number AS batch_number, b.expiry_date, l.product_id, p.code, p.name, l.qty, l.cost,
                       l.amount
                FROM write_off_line l JOIN batch b ON b.id = l.batch_id JOIN product p ON p.id = l.product_id
                WHERE l.write_off_id = :id ORDER BY l.line_no""")
                .param("id", id)
                .query((rs, n) -> new WriteOffLine(rs.getLong("id"), rs.getInt("line_no"), rs.getLong("batch_id"), rs.getString("batch_number"),
                        rs.getDate("expiry_date").toLocalDate(), rs.getLong("product_id"), rs.getString("code"), rs.getString("name"),
                        rs.getInt("qty"), money(rs.getBigDecimal("cost")), money(rs.getBigDecimal("amount"))))
                .list();
        long totalQty = lines.stream().mapToLong(WriteOffLine::qty).sum();
        return Optional.of(new WriteOffDetail(h.id(), h.number(), h.branchId(), h.warehouseId(), h.warehouse(), h.zone(),
                Reason.valueOf(h.reason()), h.actNo(), h.commission(), h.note(), Status.valueOf(h.status()), h.needsDirector(),
                money(h.totalCost()), h.createdBy(), h.createdAt().toInstant(), h.postedBy(), instant(h.postedAt()), h.rejectedBy(),
                instant(h.rejectedAt()), h.rejectReason(), h.sourceTransfer(), totalQty, lines));
    }

    /** Zonadagi partiyalar — hisobdan chiqarish uchun tanlash (bo'sh = qoldiq − faol zahira), tannarxsiz. */
    @Transactional(readOnly = true)
    List<WriteOffStockRow> zoneStock(Actor actor, long zoneId) {
        zone(actor, zoneId);
        LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
        return jdbc.sql("""
                SELECT s.batch_id, b.number, b.expiry_date, s.product_id, p.code, p.name, s.qty, coalesce(r.qty, 0) AS reserved
                FROM stock_balance s JOIN batch b ON b.id = s.batch_id JOIN product p ON p.id = s.product_id
                LEFT JOIN (SELECT batch_id, sum(qty) AS qty FROM stock_reservation WHERE status = 'ACTIVE' AND zone_id = :z GROUP BY batch_id) r
                       ON r.batch_id = s.batch_id
                WHERE s.zone_id = :z AND s.qty > 0
                ORDER BY b.expiry_date, p.name, b.number""")
                .param("z", zoneId)
                .query((rs, n) -> {
                    int qty = rs.getInt("qty");
                    int reserved = rs.getInt("reserved");
                    LocalDate expiry = rs.getDate("expiry_date").toLocalDate();
                    return new WriteOffStockRow(rs.getLong("batch_id"), rs.getString("number"), expiry, expiry.isBefore(today),
                            rs.getLong("product_id"), rs.getString("code"), rs.getString("name"), qty, reserved, Math.max(qty - reserved, 0));
                })
                .list();
    }

    // ===== Yozish =====

    @Transactional
    long create(Actor actor, WriteOffRequest r, Approver approver) {
        ZoneInfo zone = zone(actor, r.zoneId());
        if (!zone.warehouseActive()) {
            throw MedixException.badRequest("hc.warehouseInactive");
        }
        String note = blankToNull(r.note());
        if (r.reason() == Reason.OTHER && note == null) {
            throw MedixException.badRequest("hc.noteRequired");
        }
        Set<Long> seen = new HashSet<>();
        for (WriteOffLineRequest l : r.lines()) {
            if (!seen.add(l.batchId())) {
                throw MedixException.badRequest("hc.duplicateBatch");
            }
        }
        Created c = insert(actor, zone, r.reason(), blankToNull(r.actNo()), blankToNull(r.commission()), note,
                r.lines().stream().map(l -> new LineQty(l.batchId(), l.qty())).toList(), null);
        // Tasdiqqa yuborilganda ham qoldiq yetishi tekshiriladi — yo'q tovar tasdiqqa bormasin.
        checkFree(zone.id(), lines(c.id()));
        postOrNotify(actor, c, zone, approver);
        return c.id();
    }

    /** Yaratilgan hujjat: id, raqam, Direktor darajasimi, jami dona. */
    record Created(long id, String number, boolean director, long qty) {}

    /**
     * Hujjat va qatorlarni yozadi (holat «Tasdiqda»). Tannarx — partiyadan; summa chegaradan katta bo'lsa — Direktor darajasi.
     * {@code sourceTransfer} — OK kamomadi (qoldiq harakati bo'lmaydi).
     */
    Created insert(Actor actor, ZoneInfo zone, Reason reason, String actNo, String commission, String note, List<LineQty> req,
            Long sourceTransfer) {
        return insert(actor, zone, reason, actNo, commission, note, req, sourceTransfer, null);
    }

    /** {@code sourceBranchSale} — FS kamomadi (qoldiq harakati bo'lmaydi, tovar jo'natishda allaqachon chiqqan). */
    Created insert(Actor actor, ZoneInfo zone, Reason reason, String actNo, String commission, String note, List<LineQty> req,
            Long sourceTransfer, Long sourceBranchSale) {
        record Priced(long batchId, long productId, int qty, Money cost, Money amount) {}
        List<Priced> priced = new ArrayList<>();
        Money total = Money.ZERO;
        for (LineQty l : req) {
            record BatchRow(long productId, BigDecimal cost) {}
            BatchRow b = jdbc.sql("SELECT product_id, cost FROM batch WHERE id = :b")
                    .param("b", l.batchId())
                    .query((rs, n) -> new BatchRow(rs.getLong("product_id"), rs.getBigDecimal("cost")))
                    .optional()
                    .orElseThrow(() -> MedixException.badRequest("stock.batchUnknown"));
            Money cost = new Money(b.cost());
            Money amount = cost.times(l.qty());
            priced.add(new Priced(l.batchId(), b.productId(), l.qty(), cost, amount));
            total = total.plus(amount);
        }
        boolean director = needsDirector(total);
        String number = numbers.next(DocumentPrefix.HC, zone.branchCode()).toString();
        long id = jdbc.sql("""
                INSERT INTO write_off (number, branch_id, warehouse_id, zone_id, reason, act_no, commission, note, total_cost, needs_director,
                                       status, created_by, source_transfer_id, source_branch_sale_id)
                VALUES (:n, :b, :w, :z, :r, :act, :com, :note, :total, :dir, 'PENDING', :by, :src, :srcFs) RETURNING id""")
                .param("n", number)
                .param("b", zone.branchId())
                .param("w", zone.warehouseId())
                .param("z", zone.id())
                .param("r", reason.name())
                .param("act", actNo)
                .param("com", commission)
                .param("note", note)
                .param("total", total.amount())
                .param("dir", director)
                .param("by", actor.employeeId())
                .param("src", sourceTransfer)
                .param("srcFs", sourceBranchSale)
                .query(Long.class)
                .single();
        int lineNo = 0;
        for (Priced l : priced) {
            jdbc.sql("""
                    INSERT INTO write_off_line (write_off_id, line_no, batch_id, product_id, qty, cost, amount)
                    VALUES (:h, :no, :b, :p, :q, :c, :a)""")
                    .param("h", id)
                    .param("no", ++lineNo)
                    .param("b", l.batchId())
                    .param("p", l.productId())
                    .param("q", l.qty())
                    .param("c", l.cost().amount())
                    .param("a", l.amount().amount())
                    .update();
        }
        long qty = priced.stream().mapToLong(Priced::qty).sum();
        audit.record(AuditEntry.of("hc.create", "write_off", id)
                .change(null, Map.of("number", number, "reason", reason.name(), "lines", priced.size(), "total", total.toString(),
                        "director", director, "sourceTransfer", sourceTransfer == null ? "" : String.valueOf(sourceTransfer),
                        "sourceBranchSale", sourceBranchSale == null ? "" : String.valueOf(sourceBranchSale))), actor);
        return new Created(id, number, director, qty);
    }

    /** Ruxsat yetsa — darhol o'tkaziladi, aks holda tasdiqlovchilarga (hc.approve yoki hc.director) bildirishnoma. */
    void postOrNotify(Actor actor, Created c, ZoneInfo zone, Approver approver) {
        if (approver.canPost(c.director())) {
            doPost(actor, c.id(), c.number(), zone.id());
        } else {
            notifications.notify(c.director() ? "hc.director" : "hc.approve", zone.branchId(), List.of(),
                    notifications.message("hc.approval", "hc.approval", "/write-offs?status=PENDING&open=" + c.id(), "hc.approval:" + c.id(),
                            c.number(), zone.name(), String.valueOf(c.qty())));
        }
    }

    @Transactional
    void approve(Actor actor, long id, Approver approver) {
        Head h = lock(id, actor);
        requirePending(h);
        requireLevel(h, approver);
        doPost(actor, id, h.number(), h.zoneId());
    }

    @Transactional
    void reject(Actor actor, long id, String reason, Approver approver) {
        Head h = lock(id, actor);
        requirePending(h);
        requireLevel(h, approver);
        jdbc.sql("""
                UPDATE write_off SET status = 'REJECTED', rejected_by = :by, rejected_at = now(), reject_reason = :r, updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", reason.strip())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("hc.reject", "write_off", id).change(null, Map.of("reason", reason.strip())), actor);
    }

    // ===== Ichki =====

    record LineQty(long batchId, int qty) {}

    private record Head(long id, String number, long branchId, long zoneId, Status status, boolean needsDirector) {}

    private void doPost(Actor actor, long id, String number, long zone) {
        List<LineQty> lines = lines(id);
        boolean shortage = jdbc.sql("SELECT source_transfer_id IS NOT NULL OR source_branch_sale_id IS NOT NULL FROM write_off WHERE id = :id").param("id", id)
                .query(Boolean.class).single();
        // OK / FS kamomadi: tovar jo'natishda zonadan allaqachon chiqqan — qoldiq harakati yo'q, faqat hujjat
        if (!shortage) {
            checkFree(zone, lines);
            List<Move> moves = new ArrayList<>();
            for (LineQty l : lines) {
                moves.add(Move.out(zone, l.batchId(), l.qty()));
            }
            ledger.post(new DocRef(DOC_TYPE, id, number), moves);
        }
        jdbc.sql("""
                UPDATE write_off SET status = 'POSTED', posted_by = :by, posted_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("hc.post", "write_off", id).change(null, Map.of("number", number, "lines", lines.size())), actor);
    }

    /** Zonadagi qoldiq satrlarini partiya tartibida qulflaydi (StockLedger bilan bir xil tartib) va faol zahirani ayirib tekshiradi. */
    private void checkFree(long zoneId, List<LineQty> lines) {
        List<LineQty> sorted = lines.stream().sorted((a, b) -> Long.compare(a.batchId(), b.batchId())).toList();
        for (LineQty l : sorted) {
            int qty = jdbc.sql("SELECT qty FROM stock_balance WHERE zone_id = :z AND batch_id = :b FOR UPDATE")
                    .param("z", zoneId)
                    .param("b", l.batchId())
                    .query(Integer.class)
                    .optional()
                    .orElse(0);
            int reserved = jdbc.sql("""
                    SELECT coalesce(sum(qty), 0) FROM stock_reservation WHERE zone_id = :z AND batch_id = :b AND status = 'ACTIVE'""")
                    .param("z", zoneId)
                    .param("b", l.batchId())
                    .query(Integer.class)
                    .single();
            if (qty - reserved < l.qty()) {
                String label = jdbc.sql("SELECT p.name || ' · ' || b.number FROM batch b JOIN product p ON p.id = b.product_id WHERE b.id = :b")
                        .param("b", l.batchId())
                        .query(String.class)
                        .optional()
                        .orElse("?");
                throw MedixException.conflict("hc.notEnough", label, String.valueOf(Math.max(qty - reserved, 0)), String.valueOf(reserved),
                        String.valueOf(l.qty()));
            }
        }
    }

    private List<LineQty> lines(long id) {
        return jdbc.sql("SELECT batch_id, qty FROM write_off_line WHERE write_off_id = :id ORDER BY line_no")
                .param("id", id)
                .query((rs, n) -> new LineQty(rs.getLong("batch_id"), rs.getInt("qty")))
                .list();
    }

    private Head lock(long id, Actor actor) {
        return jdbc.sql("SELECT id, number, branch_id, zone_id, status, needs_director FROM write_off WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("zone_id"),
                        Status.valueOf(rs.getString("status")), rs.getBoolean("needs_director")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static void requirePending(Head h) {
        if (h.status() != Status.PENDING) {
            throw MedixException.conflict("hc.notPending", h.status().name());
        }
    }

    private void requireLevel(Head h, Approver approver) {
        if (!approver.canPost(h.needsDirector())) {
            throw MedixException.forbidden("hc.directorRequired", settings.money(SettingKey.hcDirApprove).format());
        }
    }

    ZoneInfo zone(Actor actor, long zoneId) {
        return jdbc.sql("""
                SELECT z.id, z.name, z.type, z.active, w.id AS warehouse_id, w.active AS warehouse_active, b.id AS branch_id,
                       b.code AS branch_code
                FROM zone z JOIN warehouse w ON w.id = z.warehouse_id JOIN branch b ON b.id = w.branch_id WHERE z.id = :z""")
                .param("z", zoneId)
                .query((rs, n) -> new ZoneInfo(rs.getLong("id"), rs.getString("name"), ZoneType.valueOf(rs.getString("type")),
                        rs.getBoolean("active"), rs.getLong("warehouse_id"), rs.getBoolean("warehouse_active"), rs.getLong("branch_id"),
                        rs.getString("branch_code")))
                .optional()
                .filter(z -> actor.canAccessBranch(z.branchId()))
                .orElseThrow(() -> MedixException.badRequest("stock.zoneUnknown"));
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
