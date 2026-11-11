package uz.medix.inventory.transfer;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.inventory.ZoneType;
import uz.medix.inventory.transfer.ZoneTransferModels.Status;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneRef;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneStockRow;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneTransferDetail;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneTransferLine;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneTransferLineRequest;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneTransferPage;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneTransferRequest;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneTransferSummary;
import uz.medix.notification.Notifications;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * ZK — zona ko'chirishi (bitta ombor ichida). Karantindan sotuvga ochiq zonaga ko'chirish tasdiq talab qiladi (T12: transfer.quar):
 * ruxsati yo'q xodim yaratsa — «Tasdiqda», tovar joyida qoladi; tasdiqlanganda o'tkaziladi. Qolgan hollarda — darhol o'tkaziladi.
 * O'tkazish — bitta tranzaksiya: qoldiq satrlari qulflanadi, faol zahira ayriladi (zahiralangan tovar ko'chirilmaydi), jurnal +
 * qoldiq (StockLedger) + hujjat holati + audit.
 */
@Service
class ZoneTransfers {

    static final String DOC_TYPE = "ZK";

    private final JdbcClient jdbc;
    private final StockLedger ledger;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final Notifications notifications;

    ZoneTransfers(JdbcClient jdbc, StockLedger ledger, AuditLog audit, DocumentSequenceService numbers, Notifications notifications) {
        this.jdbc = jdbc;
        this.ledger = ledger;
        this.audit = audit;
        this.numbers = numbers;
        this.notifications = notifications;
    }

    record ZoneInfo(long id, String name, ZoneType type, boolean active, boolean sellable, long warehouseId, boolean warehouseActive,
            long branchId, String branchCode) {}

    /** Karantindan sotuvga ochiq zonaga — tasdiq kerak. */
    static boolean needsApproval(ZoneType from, ZoneType to) {
        return from == ZoneType.QUARANTINE && to.sellable();
    }

    // ===== O'qish =====

    @Transactional(readOnly = true)
    ZoneTransferPage list(Actor actor, Long branchId, Long warehouseId, Status status, int page, int size) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new HashMap<>();
        if (!actor.allBranches()) {
            where.append(" AND t.branch_id = :own");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        if (branchId != null) {
            where.append(" AND t.branch_id = :b");
            params.put("b", branchId);
        }
        if (warehouseId != null) {
            where.append(" AND t.warehouse_id = :w");
            params.put("w", warehouseId);
        }
        if (status != null) {
            where.append(" AND t.status = :s");
            params.put("s", status.name());
        }
        long total = jdbc.sql("SELECT count(*) FROM zone_transfer t" + where).params(params).query(Long.class).single();
        List<ZoneTransferSummary> items = jdbc.sql("""
                SELECT t.id, t.number, t.branch_id, t.warehouse_id, w.name AS warehouse,
                       fz.id AS from_id, fz.name AS from_name, fz.type AS from_type, tz.id AS to_id, tz.name AS to_name, tz.type AS to_type,
                       t.status, t.needs_approval, coalesce(l.lines, 0) AS lines, coalesce(l.qty, 0) AS qty,
                       e.full_name AS created_by, t.created_at, t.posted_at
                FROM zone_transfer t
                JOIN warehouse w ON w.id = t.warehouse_id
                JOIN zone fz ON fz.id = t.from_zone_id
                JOIN zone tz ON tz.id = t.to_zone_id
                JOIN employee e ON e.id = t.created_by
                LEFT JOIN (SELECT transfer_id, count(*) AS lines, sum(qty) AS qty FROM zone_transfer_line GROUP BY transfer_id) l
                       ON l.transfer_id = t.id""" + where + " ORDER BY t.created_at DESC, t.id DESC LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query((rs, n) -> new ZoneTransferSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        rs.getLong("warehouse_id"), rs.getString("warehouse"),
                        new ZoneRef(rs.getLong("from_id"), rs.getString("from_name"), ZoneType.valueOf(rs.getString("from_type"))),
                        new ZoneRef(rs.getLong("to_id"), rs.getString("to_name"), ZoneType.valueOf(rs.getString("to_type"))),
                        Status.valueOf(rs.getString("status")), rs.getBoolean("needs_approval"), rs.getInt("lines"), rs.getLong("qty"),
                        rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(), instant(rs.getTimestamp("posted_at"))))
                .list();
        return new ZoneTransferPage(items, total, page, size);
    }

    @Transactional(readOnly = true)
    Optional<ZoneTransferDetail> find(long id, Actor actor) {
        record HeadRow(long id, String number, long branchId, long warehouseId, String warehouse, ZoneRef from, ZoneRef to, String status,
                boolean needsApproval, String note, String createdBy, Timestamp createdAt, String postedBy, Timestamp postedAt,
                String rejectedBy, Timestamp rejectedAt, String rejectReason, String cancelledBy, Timestamp cancelledAt) {}
        Optional<HeadRow> head = jdbc.sql("""
                SELECT t.id, t.number, t.branch_id, t.warehouse_id, w.name AS warehouse,
                       fz.id AS from_id, fz.name AS from_name, fz.type AS from_type, tz.id AS to_id, tz.name AS to_name, tz.type AS to_type,
                       t.status, t.needs_approval, t.note, cb.full_name AS created_by, t.created_at, pb.full_name AS posted_by, t.posted_at,
                       rb.full_name AS rejected_by, t.rejected_at, t.reject_reason, xb.full_name AS cancelled_by, t.cancelled_at
                FROM zone_transfer t
                JOIN warehouse w ON w.id = t.warehouse_id
                JOIN zone fz ON fz.id = t.from_zone_id
                JOIN zone tz ON tz.id = t.to_zone_id
                JOIN employee cb ON cb.id = t.created_by
                LEFT JOIN employee pb ON pb.id = t.posted_by
                LEFT JOIN employee rb ON rb.id = t.rejected_by
                LEFT JOIN employee xb ON xb.id = t.cancelled_by
                WHERE t.id = :id""")
                .param("id", id)
                .query((rs, n) -> new HeadRow(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("warehouse_id"),
                        rs.getString("warehouse"),
                        new ZoneRef(rs.getLong("from_id"), rs.getString("from_name"), ZoneType.valueOf(rs.getString("from_type"))),
                        new ZoneRef(rs.getLong("to_id"), rs.getString("to_name"), ZoneType.valueOf(rs.getString("to_type"))),
                        rs.getString("status"), rs.getBoolean("needs_approval"), rs.getString("note"), rs.getString("created_by"),
                        rs.getTimestamp("created_at"), rs.getString("posted_by"), rs.getTimestamp("posted_at"), rs.getString("rejected_by"),
                        rs.getTimestamp("rejected_at"), rs.getString("reject_reason"), rs.getString("cancelled_by"),
                        rs.getTimestamp("cancelled_at")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        HeadRow h = head.get();
        List<ZoneTransferLine> lines = jdbc.sql("""
                SELECT l.id, l.line_no, l.batch_id, b.number AS batch_number, b.expiry_date, l.product_id, p.code, p.name, l.qty
                FROM zone_transfer_line l JOIN batch b ON b.id = l.batch_id JOIN product p ON p.id = l.product_id
                WHERE l.transfer_id = :id ORDER BY l.line_no""")
                .param("id", id)
                .query((rs, n) -> new ZoneTransferLine(rs.getLong("id"), rs.getInt("line_no"), rs.getLong("batch_id"),
                        rs.getString("batch_number"), rs.getDate("expiry_date").toLocalDate(), rs.getLong("product_id"), rs.getString("code"),
                        rs.getString("name"), rs.getInt("qty")))
                .list();
        long totalQty = lines.stream().mapToLong(ZoneTransferLine::qty).sum();
        return Optional.of(new ZoneTransferDetail(h.id(), h.number(), h.branchId(), h.warehouseId(), h.warehouse(), h.from(), h.to(),
                Status.valueOf(h.status()), h.needsApproval(), h.note(), h.createdBy(), h.createdAt().toInstant(), h.postedBy(),
                instant(h.postedAt()), h.rejectedBy(), instant(h.rejectedAt()), h.rejectReason(), h.cancelledBy(),
                instant(h.cancelledAt()), totalQty, lines));
    }

    /** Zonadagi partiyalar — ko'chirish uchun tanlash (bo'sh = qoldiq − faol zahira). */
    @Transactional(readOnly = true)
    List<ZoneStockRow> zoneStock(Actor actor, long zoneId) {
        zone(actor, zoneId);
        return jdbc.sql("""
                SELECT s.batch_id, b.number, b.expiry_date, s.product_id, p.code, p.name, s.qty, coalesce(r.qty, 0) AS reserved
                FROM stock_balance s JOIN batch b ON b.id = s.batch_id JOIN product p ON p.id = s.product_id
                LEFT JOIN (SELECT batch_id, sum(qty) AS qty FROM stock_reservation WHERE status = 'ACTIVE' AND zone_id = :z GROUP BY batch_id) r
                       ON r.batch_id = s.batch_id
                WHERE s.zone_id = :z AND s.qty > 0
                ORDER BY p.name, b.expiry_date, b.number""")
                .param("z", zoneId)
                .query((rs, n) -> {
                    int qty = rs.getInt("qty");
                    int reserved = rs.getInt("reserved");
                    return new ZoneStockRow(rs.getLong("batch_id"), rs.getString("number"), rs.getDate("expiry_date").toLocalDate(),
                            rs.getLong("product_id"), rs.getString("code"), rs.getString("name"), qty, reserved, Math.max(qty - reserved, 0));
                })
                .list();
    }

    // ===== Yozish =====

    /** Yaratish: tasdiq kerak bo'lmasa yoki xodimda transfer.quar bo'lsa — darhol o'tkaziladi. */
    @Transactional
    long create(Actor actor, ZoneTransferRequest r, boolean canApprove) {
        Route route = route(actor, r);
        long id = insertHead(actor, route, r, "PENDING");
        String number = number(id);
        insertLines(id, r.lines());
        // Tasdiqqa yuborilganda ham qoldiq yetishi tekshiriladi — yo'q tovar tasdiqqa bormasin.
        checkFree(route.from().id(), route.to().id(), lines(id));
        audit.record(AuditEntry.of("transfer.zk.create", "zone_transfer", id)
                .change(null, Map.of("number", number, "lines", r.lines().size(), "approval", route.approval())), actor);
        postOrAsk(actor, id, number, route, canApprove);
        return id;
    }

    /** Qoralama (prototip TransferDoc — avtomatik saqlanadi): tovar joyida qoladi, qoldiq yetishi qulfsiz tekshiriladi. */
    @Transactional
    long createDraft(Actor actor, ZoneTransferRequest r) {
        Route route = route(actor, r);
        long id = insertHead(actor, route, r, "DRAFT");
        insertLines(id, r.lines());
        checkFreeSoft(route.from().id(), lines(id));
        audit.record(AuditEntry.of("transfer.zk.draft", "zone_transfer", id)
                .change(null, Map.of("number", number(id), "lines", r.lines().size())), actor);
        return id;
    }

    /** Qoralamani tahrirlash: ombor, zonalar, izoh va qatorlar to'liq almashtiriladi. Filial o'zgarmaydi; faqat qoralama. */
    @Transactional
    void update(Actor actor, long id, ZoneTransferRequest r) {
        Head h = lock(id, actor);
        require(h, Status.DRAFT);
        Route route = route(actor, r);
        if (route.from().branchId() != h.branchId()) {
            throw MedixException.badRequest("transfer.zk.otherBranch");
        }
        jdbc.sql("""
                UPDATE zone_transfer SET warehouse_id = :w, from_zone_id = :f, to_zone_id = :t, needs_approval = :a, note = :note,
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("w", route.from().warehouseId())
                .param("f", route.from().id())
                .param("t", route.to().id())
                .param("a", route.approval())
                .param("note", blankToNull(r.note()))
                .param("id", id)
                .update();
        jdbc.sql("DELETE FROM zone_transfer_line WHERE transfer_id = :id").param("id", id).update();
        insertLines(id, r.lines());
        checkFreeSoft(route.from().id(), lines(id));
        audit.record(AuditEntry.of("transfer.zk.update", "zone_transfer", id)
                .change(null, Map.of("number", h.number(), "lines", r.lines().size())), actor);
    }

    /** Qoralamani o'tkazish: tasdiq kerak bo'lmasa yoki xodimda transfer.quar bo'lsa — darhol, aks holda «Tasdiqda». */
    @Transactional
    void submit(Actor actor, long id, boolean canApprove) {
        Head h = lock(id, actor);
        require(h, Status.DRAFT);
        ZoneInfo from = zone(actor, h.fromZoneId());
        ZoneInfo to = zone(actor, h.toZoneId());
        if (!from.warehouseActive()) {
            throw MedixException.badRequest("transfer.zk.warehouseInactive");
        }
        if (!to.active()) {
            throw MedixException.badRequest("transfer.zk.zoneInactive", to.name());
        }
        List<LineQty> lines = lines(id);
        if (lines.isEmpty()) {
            throw MedixException.badRequest("transfer.zk.noLines");
        }
        Route route = new Route(from, to, needsApproval(from.type(), to.type()));
        checkFree(from.id(), to.id(), lines);
        if (route.approval()) {
            jdbc.sql("UPDATE zone_transfer SET status = 'PENDING', needs_approval = true, updated_at = now(), "
                            + "version = version + 1 WHERE id = :id")
                    .param("id", id)
                    .update();
        }
        audit.record(AuditEntry.of("transfer.zk.submit", "zone_transfer", id)
                .change(null, Map.of("number", h.number(), "lines", lines.size(), "approval", route.approval())), actor);
        postOrAsk(actor, id, h.number(), route, canApprove);
    }

    /** Bekor qilish — faqat qoralama (tovar joyida). */
    @Transactional
    void cancel(Actor actor, long id) {
        Head h = lock(id, actor);
        require(h, Status.DRAFT);
        jdbc.sql("""
                UPDATE zone_transfer SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("transfer.zk.cancel", "zone_transfer", id).change(null, Map.of("number", h.number())), actor);
    }

    private record Route(ZoneInfo from, ZoneInfo to, boolean approval) {}

    private Route route(Actor actor, ZoneTransferRequest r) {
        ZoneInfo from = zone(actor, r.fromZoneId());
        ZoneInfo to = zone(actor, r.toZoneId());
        if (from.id() == to.id()) {
            throw MedixException.badRequest("transfer.zk.sameZone");
        }
        if (from.warehouseId() != to.warehouseId()) {
            throw MedixException.badRequest("transfer.zk.otherWarehouse");
        }
        if (!from.warehouseActive()) {
            throw MedixException.badRequest("transfer.zk.warehouseInactive");
        }
        if (!to.active()) {
            throw MedixException.badRequest("transfer.zk.zoneInactive", to.name());
        }
        Set<Long> seen = new HashSet<>();
        for (ZoneTransferLineRequest l : r.lines()) {
            if (!seen.add(l.batchId())) {
                throw MedixException.badRequest("transfer.zk.duplicateBatch");
            }
        }
        return new Route(from, to, needsApproval(from.type(), to.type()));
    }

    private long insertHead(Actor actor, Route route, ZoneTransferRequest r, String status) {
        String number = numbers.next(DocumentPrefix.ZK, route.from().branchCode()).toString();
        return jdbc.sql("""
                INSERT INTO zone_transfer (number, branch_id, warehouse_id, from_zone_id, to_zone_id, needs_approval, note, status, created_by)
                VALUES (:n, :b, :w, :f, :t, :a, :note, :s, :by) RETURNING id""")
                .param("n", number)
                .param("b", route.from().branchId())
                .param("w", route.from().warehouseId())
                .param("f", route.from().id())
                .param("t", route.to().id())
                .param("a", route.approval())
                .param("note", blankToNull(r.note()))
                .param("s", status)
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
    }

    private String number(long id) {
        return jdbc.sql("SELECT number FROM zone_transfer WHERE id = :id").param("id", id).query(String.class).single();
    }

    private void insertLines(long id, List<ZoneTransferLineRequest> lines) {
        int lineNo = 0;
        for (ZoneTransferLineRequest l : lines) {
            Long product = jdbc.sql("SELECT product_id FROM batch WHERE id = :b").param("b", l.batchId()).query(Long.class).optional()
                    .orElseThrow(() -> MedixException.badRequest("stock.batchUnknown"));
            jdbc.sql("""
                    INSERT INTO zone_transfer_line (transfer_id, line_no, batch_id, product_id, qty) VALUES (:t, :no, :b, :p, :q)""")
                    .param("t", id)
                    .param("no", ++lineNo)
                    .param("b", l.batchId())
                    .param("p", product)
                    .param("q", l.qty())
                    .update();
        }
    }

    private void postOrAsk(Actor actor, long id, String number, Route route, boolean canApprove) {
        if (!route.approval() || canApprove) {
            doPost(actor, id, number, route.from().id(), route.to().id());
        } else {
            // Tasdiqlovchilarga (transfer.quar, filial doirasida) — karantindan chiqarish so'rovi
            notifications.notify("transfer.quar", route.from().branchId(), List.of(),
                    notifications.message("transfer.zk.approval", "transfer.zk.approval", "/zone-transfers/" + id,
                            "transfer.zk.approval:" + id, number, route.from().name(), route.to().name()));
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    @Transactional
    void approve(Actor actor, long id) {
        Head h = lock(id, actor);
        requirePending(h);
        doPost(actor, id, h.number(), h.fromZoneId(), h.toZoneId());
    }

    @Transactional
    void reject(Actor actor, long id, String reason) {
        Head h = lock(id, actor);
        requirePending(h);
        jdbc.sql("""
                UPDATE zone_transfer SET status = 'REJECTED', rejected_by = :by, rejected_at = now(), reject_reason = :r, updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", reason.strip())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("transfer.zk.reject", "zone_transfer", id).change(null, Map.of("reason", reason.strip())), actor);
    }

    // ===== Ichki =====

    private record LineQty(long batchId, int qty) {}

    private record Head(long id, String number, long branchId, long fromZoneId, long toZoneId, Status status) {}

    private void doPost(Actor actor, long id, String number, long fromZone, long toZone) {
        List<LineQty> lines = lines(id);
        checkFree(fromZone, toZone, lines);
        List<Move> moves = new ArrayList<>();
        for (LineQty l : lines) {
            moves.add(Move.out(fromZone, l.batchId(), l.qty()));
            moves.add(Move.in(toZone, l.batchId(), l.qty()));
        }
        ledger.post(new DocRef(DOC_TYPE, id, number), moves);
        jdbc.sql("""
                UPDATE zone_transfer SET status = 'POSTED', posted_by = :by, posted_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("transfer.zk.post", "zone_transfer", id).change(null, Map.of("number", number, "lines", lines.size())), actor);
    }

    /**
     * Ikkala zonadagi qoldiq satrlarini umumiy (zona, partiya) tartibida qulflaydi — StockLedger va StockReservations bilan bir xil
     * tartib, qarama-qarshi ko'chirishlar deadlock bermaydi — va faol zahirani ayirib tekshiradi: zahiralangan tovar ko'chirilmaydi.
     */
    private void checkFree(long zoneId, long toZoneId, List<LineQty> lines) {
        List<long[]> keys = new ArrayList<>();
        for (LineQty l : lines) {
            keys.add(new long[] {zoneId, l.batchId()});
            keys.add(new long[] {toZoneId, l.batchId()});
        }
        keys.sort(Comparator.<long[]>comparingLong(k -> k[0]).thenComparingLong(k -> k[1]));
        Map<Long, Integer> fromQty = new HashMap<>();
        for (long[] k : keys) {
            Optional<Integer> q = jdbc.sql("SELECT qty FROM stock_balance WHERE zone_id = :z AND batch_id = :b FOR UPDATE")
                    .param("z", k[0])
                    .param("b", k[1])
                    .query(Integer.class)
                    .optional();
            if (k[0] == zoneId) {
                fromQty.put(k[1], q.orElse(0));
            }
        }
        for (LineQty l : lines) {
            int qty = fromQty.getOrDefault(l.batchId(), 0);
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
                throw MedixException.conflict("transfer.zk.notEnough", label, String.valueOf(Math.max(qty - reserved, 0)),
                        String.valueOf(reserved), String.valueOf(l.qty()));
            }
        }
    }

    private List<LineQty> lines(long id) {
        return jdbc.sql("SELECT batch_id, qty FROM zone_transfer_line WHERE transfer_id = :id ORDER BY line_no")
                .param("id", id)
                .query((rs, n) -> new LineQty(rs.getLong("batch_id"), rs.getInt("qty")))
                .list();
    }

    private Head lock(long id, Actor actor) {
        return jdbc.sql("SELECT id, number, branch_id, from_zone_id, to_zone_id, status FROM zone_transfer WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("from_zone_id"),
                        rs.getLong("to_zone_id"), Status.valueOf(rs.getString("status"))))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static void requirePending(Head h) {
        if (h.status() != Status.PENDING) {
            throw MedixException.conflict("transfer.zk.notPending", h.status().name());
        }
    }

    private static void require(Head h, Status status) {
        if (h.status() != status) {
            throw MedixException.conflict("transfer.zk.notDraft", h.status().name());
        }
    }

    /** Qoralama uchun qulfsiz tekshiruv: bo'sh miqdor (qoldiq − faol zahira) yetadimi — yo'q tovarga hujjat tuzilmasin. */
    private void checkFreeSoft(long zoneId, List<LineQty> lines) {
        for (LineQty l : lines) {
            int qty = jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_balance WHERE zone_id = :z AND batch_id = :b")
                    .param("z", zoneId)
                    .param("b", l.batchId())
                    .query(Integer.class)
                    .single();
            int reserved = jdbc.sql("""
                    SELECT coalesce(sum(qty), 0) FROM stock_reservation WHERE zone_id = :z AND batch_id = :b AND status = 'ACTIVE'""")
                    .param("z", zoneId)
                    .param("b", l.batchId())
                    .query(Integer.class)
                    .single();
            if (qty - reserved < l.qty()) {
                throw MedixException.conflict("transfer.zk.notEnough", label(l.batchId()), String.valueOf(Math.max(qty - reserved, 0)),
                        String.valueOf(reserved), String.valueOf(l.qty()));
            }
        }
    }

    private String label(long batchId) {
        return jdbc.sql("SELECT p.name || ' · ' || b.number FROM batch b JOIN product p ON p.id = b.product_id WHERE b.id = :b")
                .param("b", batchId)
                .query(String.class)
                .optional()
                .orElse("?");
    }

    private ZoneInfo zone(Actor actor, long zoneId) {
        return jdbc.sql("""
                SELECT z.id, z.name, z.type, z.active, z.sellable, w.id AS warehouse_id, w.active AS warehouse_active, b.id AS branch_id,
                       b.code AS branch_code
                FROM zone z JOIN warehouse w ON w.id = z.warehouse_id JOIN branch b ON b.id = w.branch_id WHERE z.id = :z""")
                .param("z", zoneId)
                .query((rs, n) -> new ZoneInfo(rs.getLong("id"), rs.getString("name"), ZoneType.valueOf(rs.getString("type")),
                        rs.getBoolean("active"), rs.getBoolean("sellable"), rs.getLong("warehouse_id"), rs.getBoolean("warehouse_active"),
                        rs.getLong("branch_id"), rs.getString("branch_code")))
                .optional()
                .filter(z -> actor.canAccessBranch(z.branchId()))
                .orElseThrow(() -> MedixException.badRequest("stock.zoneUnknown"));
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
