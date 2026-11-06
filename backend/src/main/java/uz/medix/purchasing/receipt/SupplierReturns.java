package uz.medix.purchasing.receipt;

import java.math.BigDecimal;
import java.sql.Date;
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
import uz.medix.finance.PartyLedger;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.notification.Notifications;
import uz.medix.purchasing.receipt.SupplierReturnModels.Reason;
import uz.medix.purchasing.receipt.SupplierReturnModels.ReturnStockRow;
import uz.medix.purchasing.receipt.SupplierReturnModels.Status;
import uz.medix.purchasing.receipt.SupplierReturnModels.SupplierReturnDetail;
import uz.medix.purchasing.receipt.SupplierReturnModels.SupplierReturnLine;
import uz.medix.purchasing.receipt.SupplierReturnModels.SupplierReturnLineRequest;
import uz.medix.purchasing.receipt.SupplierReturnModels.SupplierReturnPage;
import uz.medix.purchasing.receipt.SupplierReturnModels.SupplierReturnRequest;
import uz.medix.purchasing.receipt.SupplierReturnModels.SupplierReturnSummary;
import uz.medix.purchasing.receipt.SupplierReturnModels.ZoneRef;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * QY — yetkazib beruvchiga qaytarish (T12: draft → posted; qy.create / qy.approve). Bitta o'tkazilgan kirim (KR) va bitta zona;
 * faqat shu kirim partiyalari. Yaratilganda «Tasdiqda»; yaratuvchida qy.approve bo'lsa darhol o'tkaziladi. O'tkazish — bitta
 * tranzaksiya: qoldiq satrlari qulflanadi, faol zahira ayriladi (zahiralangan tovar qaytarilmaydi), jurnal + qoldiq (StockLedger),
 * YB qarzi kirim narxida kamayadi (KR ga qo'llanadi; kirim to'langan bo'lsa — avans) yoki bonus balansdan to'langan kirimda summa
 * bonus balansga qaytadi; hujjat holati + audit.
 */
@Service
class SupplierReturns {

    static final String DOC_TYPE = "QY";

    private final JdbcClient jdbc;
    private final StockLedger ledger;
    private final PartyLedger parties;
    private final SupplierBonuses bonuses;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final Notifications notifications;

    SupplierReturns(JdbcClient jdbc, StockLedger ledger, PartyLedger parties, SupplierBonuses bonuses, AuditLog audit,
            DocumentSequenceService numbers, Notifications notifications) {
        this.jdbc = jdbc;
        this.ledger = ledger;
        this.parties = parties;
        this.bonuses = bonuses;
        this.audit = audit;
        this.numbers = numbers;
        this.notifications = notifications;
    }

    // ===== O'qish =====

    @Transactional(readOnly = true)
    SupplierReturnPage list(Actor actor, Long branchId, Long supplierId, Long receiptId, Status status, int page, int size) {
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
        if (supplierId != null) {
            where.append(" AND h.supplier_id = :s");
            params.put("s", supplierId);
        }
        if (receiptId != null) {
            where.append(" AND h.receipt_id = :r");
            params.put("r", receiptId);
        }
        if (status != null) {
            where.append(" AND h.status = :st");
            params.put("st", status.name());
        }
        long total = jdbc.sql("SELECT count(*) FROM supplier_return h" + where).params(params).query(Long.class).single();
        List<SupplierReturnSummary> items = jdbc.sql("""
                SELECT h.id, h.number, h.branch_id, h.warehouse_id, w.name AS warehouse, z.id AS zone_id, z.name AS zone_name,
                       z.type AS zone_type, h.supplier_id, c.name AS supplier, h.receipt_id, r.number AS receipt_number, h.reason, h.status,
                       h.from_bonus, coalesce(l.lines, 0) AS lines, coalesce(l.qty, 0) AS qty, h.total_amount, e.full_name AS created_by,
                       h.created_at, h.posted_at
                FROM supplier_return h
                JOIN warehouse w ON w.id = h.warehouse_id
                JOIN zone z ON z.id = h.zone_id
                JOIN counterparty c ON c.id = h.supplier_id
                JOIN receipt r ON r.id = h.receipt_id
                JOIN employee e ON e.id = h.created_by
                LEFT JOIN (SELECT supplier_return_id, count(*) AS lines, sum(qty) AS qty FROM supplier_return_line
                           GROUP BY supplier_return_id) l ON l.supplier_return_id = h.id""" + where
                + " ORDER BY h.created_at DESC, h.id DESC LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query((rs, n) -> new SupplierReturnSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        rs.getLong("warehouse_id"), rs.getString("warehouse"),
                        new ZoneRef(rs.getLong("zone_id"), rs.getString("zone_name"), rs.getString("zone_type")), rs.getLong("supplier_id"),
                        rs.getString("supplier"), rs.getLong("receipt_id"), rs.getString("receipt_number"), Reason.valueOf(rs.getString("reason")),
                        Status.valueOf(rs.getString("status")), rs.getBoolean("from_bonus"), rs.getInt("lines"), rs.getLong("qty"),
                        money(rs.getBigDecimal("total_amount")), rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(),
                        instant(rs.getTimestamp("posted_at"))))
                .list();
        return new SupplierReturnPage(items, total, page, size);
    }

    @Transactional(readOnly = true)
    Optional<SupplierReturnDetail> find(long id, Actor actor) {
        record HeadRow(long id, String number, long branchId, long warehouseId, String warehouse, ZoneRef zone, long supplierId,
                String supplier, long receiptId, String receiptNumber, Date receiptDate, String reason, String note, String status,
                boolean fromBonus, BigDecimal total, String createdBy, Timestamp createdAt, String postedBy, Timestamp postedAt,
                String rejectedBy, Timestamp rejectedAt, String rejectReason) {}
        Optional<HeadRow> head = jdbc.sql("""
                SELECT h.id, h.number, h.branch_id, h.warehouse_id, w.name AS warehouse, z.id AS zone_id, z.name AS zone_name,
                       z.type AS zone_type, h.supplier_id, c.name AS supplier, h.receipt_id, r.number AS receipt_number, r.receipt_date,
                       h.reason, h.note, h.status, h.from_bonus, h.total_amount, cb.full_name AS created_by, h.created_at,
                       pb.full_name AS posted_by, h.posted_at, rb.full_name AS rejected_by, h.rejected_at, h.reject_reason
                FROM supplier_return h
                JOIN warehouse w ON w.id = h.warehouse_id
                JOIN zone z ON z.id = h.zone_id
                JOIN counterparty c ON c.id = h.supplier_id
                JOIN receipt r ON r.id = h.receipt_id
                JOIN employee cb ON cb.id = h.created_by
                LEFT JOIN employee pb ON pb.id = h.posted_by
                LEFT JOIN employee rb ON rb.id = h.rejected_by
                WHERE h.id = :id""")
                .param("id", id)
                .query((rs, n) -> new HeadRow(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("warehouse_id"),
                        rs.getString("warehouse"), new ZoneRef(rs.getLong("zone_id"), rs.getString("zone_name"), rs.getString("zone_type")),
                        rs.getLong("supplier_id"), rs.getString("supplier"), rs.getLong("receipt_id"), rs.getString("receipt_number"),
                        rs.getDate("receipt_date"), rs.getString("reason"), rs.getString("note"), rs.getString("status"),
                        rs.getBoolean("from_bonus"), rs.getBigDecimal("total_amount"), rs.getString("created_by"), rs.getTimestamp("created_at"),
                        rs.getString("posted_by"), rs.getTimestamp("posted_at"), rs.getString("rejected_by"), rs.getTimestamp("rejected_at"),
                        rs.getString("reject_reason")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        HeadRow h = head.get();
        List<SupplierReturnLine> lines = jdbc.sql("""
                SELECT l.id, l.line_no, l.batch_id, b.number AS batch_number, b.expiry_date, l.product_id, p.code, p.name, l.bonus, l.qty,
                       l.price, l.amount
                FROM supplier_return_line l JOIN batch b ON b.id = l.batch_id JOIN product p ON p.id = l.product_id
                WHERE l.supplier_return_id = :id ORDER BY l.line_no""")
                .param("id", id)
                .query((rs, n) -> new SupplierReturnLine(rs.getLong("id"), rs.getInt("line_no"), rs.getLong("batch_id"),
                        rs.getString("batch_number"), rs.getDate("expiry_date").toLocalDate(), rs.getLong("product_id"), rs.getString("code"),
                        rs.getString("name"), rs.getBoolean("bonus"), rs.getInt("qty"), money(rs.getBigDecimal("price")),
                        money(rs.getBigDecimal("amount"))))
                .list();
        long totalQty = lines.stream().mapToLong(SupplierReturnLine::qty).sum();
        return Optional.of(new SupplierReturnDetail(h.id(), h.number(), h.branchId(), h.warehouseId(), h.warehouse(), h.zone(),
                h.supplierId(), h.supplier(), h.receiptId(), h.receiptNumber(), h.receiptDate().toLocalDate(), Reason.valueOf(h.reason()),
                h.note(), Status.valueOf(h.status()), h.fromBonus(), money(h.total()), h.createdBy(), h.createdAt().toInstant(),
                h.postedBy(), instant(h.postedAt()), h.rejectedBy(), instant(h.rejectedAt()), h.rejectReason(), totalQty, lines));
    }

    /** Kirim partiyalarining joriy qoldig'i (kirim omboridagi barcha zonalar): bo'sh = qoldiq − faol zahira. */
    @Transactional(readOnly = true)
    List<ReturnStockRow> receiptStock(Actor actor, long receiptId) {
        ReceiptInfo r = receipt(actor, receiptId);
        return jdbc.sql("""
                SELECT z.id AS zone_id, z.name AS zone_name, z.type AS zone_type, s.batch_id, b.number, b.expiry_date, s.product_id, p.code,
                       p.name, (s.batch_id = rl.bonus_batch_id) AS bonus, s.qty, coalesce(res.qty, 0) AS reserved,
                       CASE WHEN s.batch_id = rl.bonus_batch_id THEN 0 ELSE rl.price END AS price
                FROM receipt_line rl
                JOIN stock_balance s ON s.batch_id IN (rl.batch_id, rl.bonus_batch_id)
                JOIN zone z ON z.id = s.zone_id
                JOIN batch b ON b.id = s.batch_id
                JOIN product p ON p.id = s.product_id
                LEFT JOIN (SELECT zone_id, batch_id, sum(qty) AS qty FROM stock_reservation WHERE status = 'ACTIVE' GROUP BY zone_id, batch_id) res
                       ON res.zone_id = s.zone_id AND res.batch_id = s.batch_id
                JOIN warehouse w ON w.id = z.warehouse_id
                WHERE rl.receipt_id = :r AND s.qty > 0 AND w.branch_id = :branch
                ORDER BY z.name, p.name, b.number""")
                .param("r", r.id())
                .param("branch", r.branchId())
                .query((rs, n) -> {
                    int qty = rs.getInt("qty");
                    int reserved = rs.getInt("reserved");
                    return new ReturnStockRow(new ZoneRef(rs.getLong("zone_id"), rs.getString("zone_name"), rs.getString("zone_type")),
                            rs.getLong("batch_id"), rs.getString("number"), rs.getDate("expiry_date").toLocalDate(), rs.getLong("product_id"),
                            rs.getString("code"), rs.getString("name"), rs.getBoolean("bonus"), qty, reserved, Math.max(qty - reserved, 0),
                            money(rs.getBigDecimal("price")));
                })
                .list();
    }

    // ===== Yozish =====

    @Transactional
    long create(Actor actor, SupplierReturnRequest r, boolean canApprove) {
        ReceiptInfo receipt = receipt(actor, r.receiptId());
        // Qulflash tartibi: kirim (FOR SHARE) → qoldiq satrlari — kirimni bekor qilish bilan bir xil, deadlock yo'q.
        jdbc.sql("SELECT id FROM receipt WHERE id = :r FOR SHARE").param("r", receipt.id()).query(Long.class).single();
        if (!"POSTED".equals(receipt.status())) {
            throw MedixException.conflict("qy.receiptNotPosted", receipt.number());
        }
        ZoneInfo zone = zone(r.zoneId());
        if (zone.branchId() != receipt.branchId()) {
            throw MedixException.badRequest("qy.zoneOtherBranch");
        }
        if (!zone.warehouseActive()) {
            throw MedixException.badRequest("qy.warehouseInactive");
        }
        String note = blankToNull(r.note());
        if (r.reason() == Reason.OTHER && note == null) {
            throw MedixException.badRequest("qy.noteRequired");
        }
        Set<Long> seen = new HashSet<>();
        for (SupplierReturnLineRequest l : r.lines()) {
            if (!seen.add(l.batchId())) {
                throw MedixException.badRequest("qy.duplicateBatch");
            }
        }
        record Priced(long receiptLineId, long batchId, long productId, boolean bonus, int qty, Money price, Money amount) {}
        List<Priced> priced = new ArrayList<>();
        Money total = Money.ZERO;
        for (SupplierReturnLineRequest l : r.lines()) {
            record Src(long id, long productId, boolean bonus, BigDecimal price) {}
            Src src = jdbc.sql("""
                    SELECT id, product_id, (bonus_batch_id IS NOT DISTINCT FROM :b) AS bonus, price FROM receipt_line
                    WHERE receipt_id = :r AND (batch_id = :b OR bonus_batch_id = :b) LIMIT 1""")
                    .param("r", receipt.id())
                    .param("b", l.batchId())
                    .query((rs, n) -> new Src(rs.getLong("id"), rs.getLong("product_id"), rs.getBoolean("bonus"), rs.getBigDecimal("price")))
                    .optional()
                    .orElseThrow(() -> MedixException.badRequest("qy.batchNotInReceipt", receipt.number()));
            Money price = src.bonus() || src.price() == null ? Money.ZERO : new Money(src.price());
            Money amount = price.times(l.qty());
            priced.add(new Priced(src.id(), l.batchId(), src.productId(), src.bonus(), l.qty(), price, amount));
            total = total.plus(amount);
        }
        String number = numbers.next(DocumentPrefix.QY, zone.branchCode()).toString();
        long id = jdbc.sql("""
                INSERT INTO supplier_return (number, branch_id, warehouse_id, zone_id, supplier_id, receipt_id, reason, note, total_amount,
                                             from_bonus, status, created_by)
                VALUES (:n, :b, :w, :z, :s, :r, :reason, :note, :total, :fb, 'PENDING', :by) RETURNING id""")
                .param("n", number)
                .param("b", receipt.branchId())
                .param("w", zone.warehouseId())
                .param("z", zone.id())
                .param("s", receipt.supplierId())
                .param("r", receipt.id())
                .param("reason", r.reason().name())
                .param("note", note)
                .param("total", total.amount())
                .param("fb", receipt.fromBonus())
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        int lineNo = 0;
        for (Priced l : priced) {
            jdbc.sql("""
                    INSERT INTO supplier_return_line (supplier_return_id, line_no, receipt_line_id, batch_id, product_id, bonus, qty, price, amount)
                    VALUES (:h, :no, :rl, :b, :p, :bonus, :q, :price, :a)""")
                    .param("h", id)
                    .param("no", ++lineNo)
                    .param("rl", l.receiptLineId())
                    .param("b", l.batchId())
                    .param("p", l.productId())
                    .param("bonus", l.bonus())
                    .param("q", l.qty())
                    .param("price", l.price().amount())
                    .param("a", l.amount().amount())
                    .update();
        }
        audit.record(AuditEntry.of("qy.create", "supplier_return", id)
                .change(null, Map.of("number", number, "receipt", receipt.number(), "reason", r.reason().name(), "lines", priced.size(),
                        "total", total.toString())), actor);
        // Tasdiqqa yuborilganda ham qoldiq yetishi tekshiriladi — yo'q tovar tasdiqqa bormasin.
        checkFree(zone.id(), lines(id));
        if (canApprove) {
            doPost(actor, id);
        } else {
            long qty = priced.stream().mapToLong(Priced::qty).sum();
            notifications.notify("qy.approve", receipt.branchId(), List.of(),
                    notifications.message("qy.approval", "qy.approval", "/supplier-returns?status=PENDING&open=" + id, "qy.approval:" + id,
                            number, receipt.supplier(), String.valueOf(qty)));
        }
        return id;
    }

    @Transactional
    void approve(Actor actor, long id) {
        Head h = lock(id, actor);
        requirePending(h);
        doPost(actor, id);
    }

    @Transactional
    void reject(Actor actor, long id, String reason) {
        Head h = lock(id, actor);
        requirePending(h);
        jdbc.sql("""
                UPDATE supplier_return SET status = 'REJECTED', rejected_by = :by, rejected_at = now(), reject_reason = :r, updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", reason.strip())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("qy.reject", "supplier_return", id).change(null, Map.of("reason", reason.strip())), actor);
    }

    // ===== Ichki =====

    record LineQty(long batchId, int qty) {}

    private record Head(long id, String number, long branchId, long zoneId, long supplierId, long receiptId, Status status,
            boolean fromBonus, BigDecimal total) {}

    private record ReceiptInfo(long id, String number, long branchId, long warehouseId, long supplierId, String supplier, String status,
            boolean fromBonus) {}

    private record ZoneInfo(long id, String name, long warehouseId, boolean warehouseActive, long branchId, String branchCode) {}

    private void doPost(Actor actor, long id) {
        Head h = lock(id, actor);
        // Kirim bekor qilinmagan bo'lishi shart (qatorni qulflab — parallel bekor qilish bilan to'qnashmasin).
        String receiptStatus = jdbc.sql("SELECT status FROM receipt WHERE id = :r FOR SHARE").param("r", h.receiptId())
                .query(String.class).single();
        if (!"POSTED".equals(receiptStatus)) {
            throw MedixException.conflict("qy.receiptNotPosted", h.number());
        }
        List<LineQty> lines = lines(id);
        checkFree(h.zoneId(), lines);
        List<Move> moves = new ArrayList<>();
        for (LineQty l : lines) {
            moves.add(Move.out(h.zoneId(), l.batchId(), l.qty()));
        }
        ledger.post(new DocRef(DOC_TYPE, id, h.number()), moves);
        Money total = new Money(h.total());
        if (h.fromBonus()) {
            // Kirim bonus balansdan to'langan — qaytarilgan summa balansga qaytadi (qarz yo'q); faqat bonus partiya — ta'sir yo'q.
            if (!total.isZero()) {
                bonuses.lock(h.branchId(), h.supplierId());
                bonuses.record(h.branchId(), h.supplierId(), total, DOC_TYPE, id, h.number(), "YB ga qaytarish");
            }
        } else {
            String receiptNumber = jdbc.sql("SELECT number FROM receipt WHERE id = :r").param("r", h.receiptId()).query(String.class).single();
            parties.record(new PartyLedger.DocRef(DOC_TYPE, id, h.number()), h.branchId(), h.supplierId(), Side.SUPPLIER,
                    Money.ZERO.minus(total), null, "YB ga qaytarish (" + receiptNumber + ")",
                    new PartyLedger.DocRef(Receipts.DOC_TYPE, h.receiptId(), receiptNumber));
        }
        jdbc.sql("""
                UPDATE supplier_return SET status = 'POSTED', posted_by = :by, posted_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("qy.post", "supplier_return", id)
                .change(null, Map.of("number", h.number(), "lines", lines.size(), "total", total.toString())), actor);
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
                throw MedixException.conflict("qy.notEnough", label, String.valueOf(Math.max(qty - reserved, 0)), String.valueOf(reserved),
                        String.valueOf(l.qty()));
            }
        }
    }

    private List<LineQty> lines(long id) {
        return jdbc.sql("SELECT batch_id, qty FROM supplier_return_line WHERE supplier_return_id = :id ORDER BY line_no")
                .param("id", id)
                .query((rs, n) -> new LineQty(rs.getLong("batch_id"), rs.getInt("qty")))
                .list();
    }

    private Head lock(long id, Actor actor) {
        return jdbc.sql("""
                SELECT id, number, branch_id, zone_id, supplier_id, receipt_id, status, from_bonus, total_amount FROM supplier_return
                WHERE id = :id FOR UPDATE""")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("zone_id"),
                        rs.getLong("supplier_id"), rs.getLong("receipt_id"), Status.valueOf(rs.getString("status")), rs.getBoolean("from_bonus"),
                        rs.getBigDecimal("total_amount")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static void requirePending(Head h) {
        if (h.status() != Status.PENDING) {
            throw MedixException.conflict("qy.notPending", h.status().name());
        }
    }

    private ReceiptInfo receipt(Actor actor, long receiptId) {
        return jdbc.sql("""
                SELECT r.id, r.number, r.branch_id, r.warehouse_id, r.supplier_id, c.name AS supplier, r.status, r.from_bonus
                FROM receipt r JOIN counterparty c ON c.id = r.supplier_id WHERE r.id = :r""")
                .param("r", receiptId)
                .query((rs, n) -> new ReceiptInfo(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("warehouse_id"),
                        rs.getLong("supplier_id"), rs.getString("supplier"), rs.getString("status"), rs.getBoolean("from_bonus")))
                .optional()
                .filter(r -> actor.canAccessBranch(r.branchId()))
                .orElseThrow(() -> MedixException.badRequest("qy.receiptUnknown"));
    }

    private ZoneInfo zone(long zoneId) {
        return jdbc.sql("""
                SELECT z.id, z.name, w.id AS warehouse_id, w.active AS warehouse_active, b.id AS branch_id, b.code AS branch_code
                FROM zone z JOIN warehouse w ON w.id = z.warehouse_id JOIN branch b ON b.id = w.branch_id WHERE z.id = :z""")
                .param("z", zoneId)
                .query((rs, n) -> new ZoneInfo(rs.getLong("id"), rs.getString("name"), rs.getLong("warehouse_id"),
                        rs.getBoolean("warehouse_active"), rs.getLong("branch_id"), rs.getString("branch_code")))
                .optional()
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
