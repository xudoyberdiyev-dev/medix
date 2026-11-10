package uz.medix.inventory.transfer;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
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
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.inventory.ZoneType;
import uz.medix.inventory.transfer.WarehouseTransferModels.ReceiveLineRequest;
import uz.medix.inventory.transfer.WarehouseTransferModels.ReceiveRequest;
import uz.medix.inventory.transfer.WarehouseTransferModels.Status;
import uz.medix.inventory.transfer.WarehouseTransferModels.WarehouseRef;
import uz.medix.inventory.transfer.WarehouseTransferModels.WarehouseTransferDetail;
import uz.medix.inventory.transfer.WarehouseTransferModels.WarehouseTransferLine;
import uz.medix.inventory.transfer.WarehouseTransferModels.WarehouseTransferLineRequest;
import uz.medix.inventory.transfer.WarehouseTransferModels.WarehouseTransferPage;
import uz.medix.inventory.transfer.WarehouseTransferModels.WarehouseTransferRequest;
import uz.medix.inventory.transfer.WarehouseTransferModels.WarehouseTransferSummary;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneRef;
import uz.medix.notification.Notifications;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * OK — ombor ko'chirishi (bitta filial ichida). Qoralama → «Jo'natish»: tovar manba zonadan chiqadi (jurnal), hujjat «Yo'lda» →
 * «Qabul qilish»: qabul qiluvchi ombor zonasiga kelgan miqdor kiradi, farq — kamomad (hal qilish kutiladi, transfer.resolve).
 * Har o'tish — bitta tranzaksiya: hujjat {@code FOR UPDATE}, qoldiq satrlari (zona, partiya) tartibida qulflanadi, faol zahira
 * ko'chirilmaydi, jurnal + qoldiq (StockLedger) + holat + audit.
 */
@Service
class WarehouseTransfers {

    static final String DOC_TYPE = "OK";

    private final JdbcClient jdbc;
    private final StockLedger ledger;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final Notifications notifications;

    WarehouseTransfers(JdbcClient jdbc, StockLedger ledger, AuditLog audit, DocumentSequenceService numbers, Notifications notifications) {
        this.jdbc = jdbc;
        this.ledger = ledger;
        this.audit = audit;
        this.numbers = numbers;
        this.notifications = notifications;
    }

    private record ZoneInfo(long id, String name, ZoneType type, boolean active, long warehouseId, String warehouse,
            boolean warehouseActive, long branchId, String branchCode) {}

    private record WarehouseInfo(long id, String name, boolean active, long branchId) {}

    private record Head(long id, String number, long branchId, long fromZoneId, long toWarehouseId, Status status) {}

    private record LineRow(long id, long batchId, int qty) {}

    private static final String SELECT_HEAD = """
            SELECT t.id, t.number, t.branch_id, t.status, t.note, t.shortage_qty, t.receive_note, t.created_at, t.sent_at, t.received_at,
                   t.cancelled_at,
                   fw.id AS fw_id, fw.name AS fw_name, fz.id AS fz_id, fz.name AS fz_name, fz.type AS fz_type,
                   tw.id AS tw_id, tw.name AS tw_name, tz.id AS tz_id, tz.name AS tz_name, tz.type AS tz_type,
                   cb.full_name AS created_by, sb.full_name AS sent_by, rb.full_name AS received_by, xb.full_name AS cancelled_by,
                   coalesce(l.lines, 0) AS lines, coalesce(l.qty, 0) AS qty
            FROM warehouse_transfer t
            JOIN warehouse fw ON fw.id = t.from_warehouse_id
            JOIN zone fz ON fz.id = t.from_zone_id
            JOIN warehouse tw ON tw.id = t.to_warehouse_id
            LEFT JOIN zone tz ON tz.id = t.to_zone_id
            JOIN employee cb ON cb.id = t.created_by
            LEFT JOIN employee sb ON sb.id = t.sent_by
            LEFT JOIN employee rb ON rb.id = t.received_by
            LEFT JOIN employee xb ON xb.id = t.cancelled_by
            LEFT JOIN (SELECT transfer_id, count(*) AS lines, sum(qty) AS qty FROM warehouse_transfer_line GROUP BY transfer_id) l
                   ON l.transfer_id = t.id""";

    // ===== O'qish =====

    @Transactional(readOnly = true)
    WarehouseTransferPage list(Actor actor, Long branchId, Long warehouseId, Status status, int page, int size) {
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
            where.append(" AND (t.from_warehouse_id = :w OR t.to_warehouse_id = :w)");
            params.put("w", warehouseId);
        }
        if (status != null) {
            where.append(" AND t.status = :s");
            params.put("s", status.name());
        }
        long total = jdbc.sql("SELECT count(*) FROM warehouse_transfer t" + where).params(params).query(Long.class).single();
        List<WarehouseTransferSummary> items = jdbc.sql(SELECT_HEAD + where + " ORDER BY t.created_at DESC, t.id DESC LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query((rs, n) -> new WarehouseTransferSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        new WarehouseRef(rs.getLong("fw_id"), rs.getString("fw_name")), fromZone(rs),
                        new WarehouseRef(rs.getLong("tw_id"), rs.getString("tw_name")), toZone(rs), Status.valueOf(rs.getString("status")),
                        rs.getInt("lines"), rs.getLong("qty"), rs.getInt("shortage_qty"), rs.getString("created_by"),
                        rs.getTimestamp("created_at").toInstant(), instant(rs.getTimestamp("sent_at")), instant(rs.getTimestamp("received_at"))))
                .list();
        return new WarehouseTransferPage(items, total, page, size);
    }

    @Transactional(readOnly = true)
    Optional<WarehouseTransferDetail> find(long id, Actor actor) {
        Optional<WarehouseTransferDetail> head = jdbc.sql(SELECT_HEAD + " WHERE t.id = :id")
                .param("id", id)
                .query((rs, n) -> new WarehouseTransferDetail(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        new WarehouseRef(rs.getLong("fw_id"), rs.getString("fw_name")), fromZone(rs),
                        new WarehouseRef(rs.getLong("tw_id"), rs.getString("tw_name")), toZone(rs), Status.valueOf(rs.getString("status")),
                        rs.getString("note"), rs.getInt("shortage_qty"), rs.getString("receive_note"), rs.getString("created_by"),
                        rs.getTimestamp("created_at").toInstant(), rs.getString("sent_by"), instant(rs.getTimestamp("sent_at")),
                        rs.getString("received_by"), instant(rs.getTimestamp("received_at")), rs.getString("cancelled_by"),
                        instant(rs.getTimestamp("cancelled_at")), rs.getLong("qty"), List.of()))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        WarehouseTransferDetail h = head.get();
        List<WarehouseTransferLine> lines = jdbc.sql("""
                SELECT l.id, l.line_no, l.batch_id, b.number AS batch_number, b.expiry_date, l.product_id, p.code, p.name, l.qty, l.received_qty,
                       l.damaged_qty, l.diff_reason, lz.id AS lz_id, lz.name AS lz_name, lz.type AS lz_type
                FROM warehouse_transfer_line l JOIN batch b ON b.id = l.batch_id JOIN product p ON p.id = l.product_id
                LEFT JOIN zone lz ON lz.id = l.to_zone_id
                WHERE l.transfer_id = :id ORDER BY l.line_no""")
                .param("id", id)
                .query((rs, n) -> new WarehouseTransferLine(rs.getLong("id"), rs.getInt("line_no"), rs.getLong("batch_id"),
                        rs.getString("batch_number"), rs.getDate("expiry_date").toLocalDate(), rs.getLong("product_id"), rs.getString("code"),
                        rs.getString("name"), rs.getInt("qty"), (Integer) rs.getObject("received_qty"),
                        rs.getObject("lz_id") == null ? null
                                : new ZoneRef(rs.getLong("lz_id"), rs.getString("lz_name"), ZoneType.valueOf(rs.getString("lz_type"))),
                        rs.getInt("damaged_qty"), rs.getString("diff_reason")))
                .list();
        return Optional.of(new WarehouseTransferDetail(h.id(), h.number(), h.branchId(), h.fromWarehouse(), h.fromZone(), h.toWarehouse(),
                h.toZone(), h.status(), h.note(), h.shortageQty(), h.receiveNote(), h.createdBy(), h.createdAt(), h.sentBy(), h.sentAt(),
                h.receivedBy(), h.receivedAt(), h.cancelledBy(), h.cancelledAt(), h.totalQty(), lines));
    }

    // ===== Yozish =====

    /** Qoralama: manba zona (filial ichidagi faol ombor), qabul qiluvchi boshqa ombor — shu filialda. */
    @Transactional
    long create(Actor actor, WarehouseTransferRequest r) {
        ZoneInfo from = zone(actor, r.fromZoneId());
        WarehouseInfo to = warehouse(actor, r.toWarehouseId());
        if (from.warehouseId() == to.id()) {
            throw MedixException.badRequest("transfer.ok.sameWarehouse");
        }
        if (from.branchId() != to.branchId()) {
            throw MedixException.badRequest("transfer.ok.otherBranch");
        }
        if (!from.warehouseActive() || !to.active()) {
            throw MedixException.badRequest("transfer.ok.warehouseInactive");
        }
        Set<Long> seen = new HashSet<>();
        for (WarehouseTransferLineRequest l : r.lines()) {
            if (!seen.add(l.batchId())) {
                throw MedixException.badRequest("transfer.zk.duplicateBatch");
            }
        }
        String number = numbers.next(DocumentPrefix.OK, from.branchCode()).toString();
        long id = jdbc.sql("""
                INSERT INTO warehouse_transfer (number, branch_id, from_warehouse_id, from_zone_id, to_warehouse_id, note, status, created_by)
                VALUES (:n, :b, :fw, :fz, :tw, :note, 'DRAFT', :by) RETURNING id""")
                .param("n", number)
                .param("b", from.branchId())
                .param("fw", from.warehouseId())
                .param("fz", from.id())
                .param("tw", to.id())
                .param("note", blankToNull(r.note()))
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        int lineNo = 0;
        for (WarehouseTransferLineRequest l : r.lines()) {
            Long product = jdbc.sql("SELECT product_id FROM batch WHERE id = :b").param("b", l.batchId()).query(Long.class).optional()
                    .orElseThrow(() -> MedixException.badRequest("stock.batchUnknown"));
            jdbc.sql("INSERT INTO warehouse_transfer_line (transfer_id, line_no, batch_id, product_id, qty) VALUES (:t, :no, :b, :p, :q)")
                    .param("t", id)
                    .param("no", ++lineNo)
                    .param("b", l.batchId())
                    .param("p", product)
                    .param("q", l.qty())
                    .update();
        }
        // Qoralamada ham qoldiq yetishi tekshiriladi (qulfsiz) — yo'q tovarga hujjat tuzilmasin; jo'natishda qayta, qulf bilan.
        checkFree(from.id(), lines(id), false);
        audit.record(AuditEntry.of("transfer.ok.create", "warehouse_transfer", id)
                .change(null, Map.of("number", number, "lines", r.lines().size(), "to", to.name())), actor);
        return id;
    }

    /** Jo'natish: tovar manba zonadan chiqadi, hujjat «Yo'lda». Qabul qiluvchilarga (transfer.receive) bildirishnoma. */
    @Transactional
    void send(Actor actor, long id) {
        Head h = lock(id, actor);
        require(h, Status.DRAFT);
        List<LineRow> lines = lines(id);
        checkFree(h.fromZoneId(), lines, true);
        List<Move> moves = new ArrayList<>();
        for (LineRow l : lines) {
            moves.add(Move.out(h.fromZoneId(), l.batchId(), l.qty()));
        }
        ledger.post(new DocRef(DOC_TYPE, id, h.number()), moves);
        jdbc.sql("""
                UPDATE warehouse_transfer SET status = 'IN_TRANSIT', sent_by = :by, sent_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("transfer.ok.send", "warehouse_transfer", id).change(null, Map.of("number", h.number())), actor);
        String to = jdbc.sql("SELECT name FROM warehouse WHERE id = :w").param("w", h.toWarehouseId()).query(String.class).single();
        notifications.notify("transfer.receive", h.branchId(), List.of(),
                notifications.message("transfer.ok.sent", "transfer.ok.sent", "/warehouse-transfers?status=IN_TRANSIT&open=" + id,
                        "transfer.ok.sent:" + id, h.number(), to));
    }

    /**
     * Qabul: qabul qiluvchi ombor zonasiga kelgan miqdor kiradi. Ko'rsatilmagan qator — to'liq keldi. Kamomad bo'lsa — hujjatda
     * qayd etiladi va hal qiluvchilarga (transfer.resolve) bildirishnoma.
     */
    @Transactional
    void receive(Actor actor, long id, ReceiveRequest r) {
        Head h = lock(id, actor);
        require(h, Status.IN_TRANSIT);
        ZoneInfo toZone = zone(actor, r.toZoneId());
        if (toZone.warehouseId() != h.toWarehouseId()) {
            throw MedixException.badRequest("transfer.ok.zoneNotInTarget");
        }
        if (!toZone.active()) {
            throw MedixException.badRequest("transfer.zk.zoneInactive", toZone.name());
        }
        List<LineRow> lines = lines(id);
        Map<Long, ReceiveLineRequest> given = new HashMap<>();
        if (r.lines() != null) {
            Set<Long> known = new HashSet<>();
            lines.forEach(l -> known.add(l.id()));
            for (ReceiveLineRequest l : r.lines()) {
                if (!known.contains(l.lineId()) || given.put(l.lineId(), l) != null) {
                    throw MedixException.badRequest("transfer.ok.badLine");
                }
            }
        }
        // Qator zonasi berilmasa — hujjat zonasi; har biri qabul qiluvchi omborda va faol
        Set<Long> zonesOk = new HashSet<>();
        zonesOk.add(toZone.id());
        int shortage = 0;
        int damaged = 0;
        boolean reasonsGiven = true;
        for (LineRow l : lines) {
            ReceiveLineRequest g = given.get(l.id());
            int got = g == null ? l.qty() : g.receivedQty();
            int dmg = g == null || g.damagedQty() == null ? 0 : g.damagedQty();
            if (got > l.qty()) {
                throw MedixException.badRequest("transfer.ok.surplus", String.valueOf(l.qty()), String.valueOf(got));
            }
            if (dmg > got) {
                throw MedixException.badRequest("transfer.ok.damagedOver", String.valueOf(got), String.valueOf(dmg));
            }
            if (g != null && g.toZoneId() != null && !zonesOk.contains(g.toZoneId())) {
                ZoneInfo z = zone(actor, g.toZoneId());
                if (z.warehouseId() != h.toWarehouseId()) {
                    throw MedixException.badRequest("transfer.ok.zoneNotInTarget");
                }
                if (!z.active()) {
                    throw MedixException.badRequest("transfer.zk.zoneInactive", z.name());
                }
                zonesOk.add(z.id());
            }
            shortage += l.qty() - got;
            damaged += dmg;
            if ((got < l.qty() || dmg > 0) && (g == null || g.reason() == null)) {
                reasonsGiven = false;
            }
        }
        String note = blankToNull(r.note());
        if ((shortage > 0 || damaged > 0) && note == null && !reasonsGiven) {
            throw MedixException.badRequest("transfer.ok.shortageNote");
        }
        long quarantine = damaged > 0 ? quarantineZone(h.toWarehouseId()) : 0L;
        List<Move> moves = new ArrayList<>();
        for (LineRow l : lines) {
            ReceiveLineRequest g = given.get(l.id());
            int got = g == null ? l.qty() : g.receivedQty();
            int dmg = g == null || g.damagedQty() == null ? 0 : g.damagedQty();
            long lineZone = g == null || g.toZoneId() == null ? toZone.id() : g.toZoneId();
            if (got - dmg > 0) {
                moves.add(Move.in(lineZone, l.batchId(), got - dmg));
            }
            if (dmg > 0) {
                moves.add(Move.in(quarantine, l.batchId(), dmg));
            }
            String reason = g == null || (got == l.qty() && dmg == 0) ? null : g.reason();
            jdbc.sql("""
                    UPDATE warehouse_transfer_line SET received_qty = :q, damaged_qty = :d, to_zone_id = :z, diff_reason = :r
                    WHERE id = :id""")
                    .param("q", got)
                    .param("d", dmg)
                    .param("z", lineZone)
                    .param("r", reason)
                    .param("id", l.id())
                    .update();
        }
        ledger.post(new DocRef(DOC_TYPE, id, h.number()), moves);
        jdbc.sql("""
                UPDATE warehouse_transfer SET status = 'RECEIVED', to_zone_id = :z, shortage_qty = :s, receive_note = :note, received_by = :by,
                       received_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("z", toZone.id())
                .param("s", shortage)
                .param("note", note)
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("transfer.ok.receive", "warehouse_transfer", id)
                .change(null, Map.of("number", h.number(), "zone", toZone.name(), "shortage", shortage, "damaged", damaged)), actor);
        if (shortage > 0) {
            notifications.notify("transfer.resolve", h.branchId(), List.of(),
                    notifications.message("transfer.ok.shortage", "transfer.ok.shortage", "/warehouse-transfers?open=" + id,
                            "transfer.ok.shortage:" + id, h.number(), String.valueOf(shortage)));
        }
    }

    /** Bekor qilish — faqat qoralama (tovar hali joyida). */
    @Transactional
    void cancel(Actor actor, long id) {
        Head h = lock(id, actor);
        require(h, Status.DRAFT);
        jdbc.sql("""
                UPDATE warehouse_transfer SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("transfer.ok.cancel", "warehouse_transfer", id).change(null, Map.of("number", h.number())), actor);
    }

    // ===== Ichki =====

    /**
     * Manba zonadagi qoldiqni tekshiradi: qoldiq − faol zahira ≥ miqdor. {@code lock} bo'lsa satrlar partiya tartibida
     * {@code FOR UPDATE} bilan qulflanadi (StockLedger bilan bir xil tartib — deadlock yo'q).
     */
    private void checkFree(long zoneId, List<LineRow> lines, boolean lock) {
        List<LineRow> ordered = new ArrayList<>(lines);
        ordered.sort((a, b) -> Long.compare(a.batchId(), b.batchId()));
        for (LineRow l : ordered) {
            int qty = jdbc.sql("SELECT qty FROM stock_balance WHERE zone_id = :z AND batch_id = :b" + (lock ? " FOR UPDATE" : ""))
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
                throw MedixException.conflict("transfer.zk.notEnough", label, String.valueOf(Math.max(qty - reserved, 0)),
                        String.valueOf(reserved), String.valueOf(l.qty()));
            }
        }
    }

    private List<LineRow> lines(long id) {
        return jdbc.sql("SELECT id, batch_id, qty FROM warehouse_transfer_line WHERE transfer_id = :id ORDER BY line_no")
                .param("id", id)
                .query((rs, n) -> new LineRow(rs.getLong("id"), rs.getLong("batch_id"), rs.getInt("qty")))
                .list();
    }

    private Head lock(long id, Actor actor) {
        return jdbc.sql("SELECT id, number, branch_id, from_zone_id, to_warehouse_id, status FROM warehouse_transfer WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("from_zone_id"),
                        rs.getLong("to_warehouse_id"), Status.valueOf(rs.getString("status"))))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static void require(Head h, Status expected) {
        if (h.status() != expected) {
            throw MedixException.conflict("transfer.ok.badStatus", h.status().name());
        }
    }

    /** Qabul qiluvchi omborning faol Karantin zonasi (shikastlangan miqdor uchun). */
    private long quarantineZone(long warehouseId) {
        return jdbc.sql("SELECT id FROM zone WHERE warehouse_id = :w AND type = 'QUARANTINE' AND active ORDER BY id LIMIT 1")
                .param("w", warehouseId)
                .query(Long.class)
                .optional()
                .orElseThrow(() -> MedixException.badRequest("transfer.ok.noQuarantine"));
    }

    private ZoneInfo zone(Actor actor, long zoneId) {
        return jdbc.sql("""
                SELECT z.id, z.name, z.type, z.active, w.id AS warehouse_id, w.name AS warehouse, w.active AS warehouse_active,
                       b.id AS branch_id, b.code AS branch_code
                FROM zone z JOIN warehouse w ON w.id = z.warehouse_id JOIN branch b ON b.id = w.branch_id WHERE z.id = :z""")
                .param("z", zoneId)
                .query((rs, n) -> new ZoneInfo(rs.getLong("id"), rs.getString("name"), ZoneType.valueOf(rs.getString("type")),
                        rs.getBoolean("active"), rs.getLong("warehouse_id"), rs.getString("warehouse"), rs.getBoolean("warehouse_active"),
                        rs.getLong("branch_id"), rs.getString("branch_code")))
                .optional()
                .filter(z -> actor.canAccessBranch(z.branchId()))
                .orElseThrow(() -> MedixException.badRequest("stock.zoneUnknown"));
    }

    private WarehouseInfo warehouse(Actor actor, long warehouseId) {
        return jdbc.sql("SELECT id, name, active, branch_id FROM warehouse WHERE id = :w")
                .param("w", warehouseId)
                .query((rs, n) -> new WarehouseInfo(rs.getLong("id"), rs.getString("name"), rs.getBoolean("active"), rs.getLong("branch_id")))
                .optional()
                .filter(w -> actor.canAccessBranch(w.branchId()))
                .orElseThrow(() -> MedixException.badRequest("transfer.ok.warehouseUnknown"));
    }

    private static ZoneRef fromZone(ResultSet rs) throws SQLException {
        return new ZoneRef(rs.getLong("fz_id"), rs.getString("fz_name"), ZoneType.valueOf(rs.getString("fz_type")));
    }

    private static ZoneRef toZone(ResultSet rs) throws SQLException {
        long id = rs.getLong("tz_id");
        return rs.wasNull() ? null : new ZoneRef(id, rs.getString("tz_name"), ZoneType.valueOf(rs.getString("tz_type")));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
