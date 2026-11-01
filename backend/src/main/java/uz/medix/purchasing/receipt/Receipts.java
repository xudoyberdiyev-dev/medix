package uz.medix.purchasing.receipt;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
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
import uz.medix.inventory.ZoneType;
import uz.medix.purchasing.receipt.ReceiptModels.AcceptLine;
import uz.medix.purchasing.receipt.ReceiptModels.DiffReason;
import uz.medix.purchasing.receipt.ReceiptModels.DiscountKind;
import uz.medix.purchasing.receipt.ReceiptModels.PaymentType;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptDetail;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptLine;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptLineRequest;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptPage;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptRequest;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptStatus;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptSummary;
import uz.medix.purchasing.receipt.ReceiptModels.Resolution;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * KR — kirim (SPEC 5.1). Qoralama (qoldiq va qarzga ta'sir qilmaydi) → Qabul qilindi (Ombor mudiri sanaydi; tovar Qabul
 * zonasida, sotuvga yopiq) → O'tkazildi (saqlash zonalariga, shikastlangani Karantinga; qarz va to'lov kuni yoziladi).
 * Har o'tish — bitta tranzaksiya: hujjat + partiyalar + ombor jurnali + qarz jurnali + audit.
 */
@Service
class Receipts {

    static final String DOC_TYPE = "KR";
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final StockLedger stock;
    private final PartyLedger parties;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final Clock clock;

    Receipts(JdbcClient jdbc, StockLedger stock, PartyLedger parties, AuditLog audit, DocumentSequenceService numbers, Clock clock) {
        this.jdbc = jdbc;
        this.stock = stock;
        this.parties = parties;
        this.audit = audit;
        this.numbers = numbers;
        this.clock = clock;
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(TASHKENT));
    }

    // ===== O'qish =====

    @Transactional(readOnly = true)
    ReceiptPage list(Actor actor, Long branchId, ReceiptStatus status, Long supplierId, int page, int size, boolean prices) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new HashMap<>();
        if (!actor.allBranches()) {
            where.append(" AND r.branch_id = :own");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        if (branchId != null) {
            where.append(" AND r.branch_id = :b");
            params.put("b", branchId);
        }
        if (status != null) {
            where.append(" AND r.status = :s");
            params.put("s", status.name());
        }
        if (supplierId != null) {
            where.append(" AND r.supplier_id = :sup");
            params.put("sup", supplierId);
        }
        long total = jdbc.sql("SELECT count(*) FROM receipt r" + where).params(params).query(Long.class).single();
        List<ReceiptSummary> items = jdbc.sql("""
                SELECT r.id, r.number, r.branch_id, w.name AS warehouse, r.supplier_id, c.name AS supplier, r.receipt_date, r.invoice_number,
                       r.status, coalesce(t.lines, 0) AS lines, coalesce(t.qty, 0) AS qty, t.amount, r.due_date, r.prepaid, r.debt_amount,
                       e.full_name AS created_by, r.created_at
                FROM receipt r
                JOIN warehouse w ON w.id = r.warehouse_id
                JOIN counterparty c ON c.id = r.supplier_id
                JOIN employee e ON e.id = r.created_by
                LEFT JOIN (SELECT receipt_id, count(*) AS lines, sum(qty + bonus_qty) AS qty, sum(price * qty) AS amount
                           FROM receipt_line GROUP BY receipt_id) t ON t.receipt_id = r.id""" + where
                        + " ORDER BY r.created_at DESC, r.id DESC LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query((rs, n) -> {
                    BigDecimal debt = rs.getBigDecimal("debt_amount");
                    BigDecimal amount = debt != null ? debt : rs.getBigDecimal("amount");
                    return new ReceiptSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getString("warehouse"),
                            rs.getLong("supplier_id"), rs.getString("supplier"), rs.getDate("receipt_date").toLocalDate(),
                            rs.getString("invoice_number"), ReceiptStatus.valueOf(rs.getString("status")), rs.getInt("lines"), rs.getLong("qty"),
                            prices && amount != null ? new Money(amount).toString() : null, localDate(rs.getDate("due_date")),
                            rs.getBoolean("prepaid"), rs.getString("created_by"), rs.getTimestamp("created_at").toInstant());
                })
                .list();
        return new ReceiptPage(items, total, page, size);
    }

    @Transactional(readOnly = true)
    Optional<ReceiptDetail> find(long id, Actor actor, boolean prices) {
        record HeadRow(long id, String number, long branchId, long warehouseId, String warehouse, long supplierId, String supplier,
                Date receiptDate, String invoiceNumber, Date invoiceDate, String paymentType, Date dueDate, boolean dueManual, Long ownerId,
                String owner, boolean prepaid, String discountKind, BigDecimal discountValue, Date discountDate, String note, String status,
                String resolution, BigDecimal debtAmount, String createdBy, Timestamp createdAt, String acceptedBy, Timestamp acceptedAt,
                String postedBy, Timestamp postedAt, String cancelledBy, Timestamp cancelledAt, String cancelReason) {}
        Optional<HeadRow> head = jdbc.sql("""
                SELECT r.id, r.number, r.branch_id, r.warehouse_id, w.name AS warehouse, r.supplier_id, c.name AS supplier, r.receipt_date,
                       r.invoice_number, r.invoice_date, r.payment_type, r.due_date, r.due_manual, r.owner_id, ow.full_name AS owner, r.prepaid,
                       r.discount_kind, r.discount_value, r.discount_date, r.note, r.status, r.resolution, r.debt_amount,
                       cb.full_name AS created_by, r.created_at, ab.full_name AS accepted_by, r.accepted_at, pb.full_name AS posted_by,
                       r.posted_at, xb.full_name AS cancelled_by, r.cancelled_at, r.cancel_reason
                FROM receipt r
                JOIN warehouse w ON w.id = r.warehouse_id
                JOIN counterparty c ON c.id = r.supplier_id
                JOIN employee cb ON cb.id = r.created_by
                LEFT JOIN employee ow ON ow.id = r.owner_id
                LEFT JOIN employee ab ON ab.id = r.accepted_by
                LEFT JOIN employee pb ON pb.id = r.posted_by
                LEFT JOIN employee xb ON xb.id = r.cancelled_by
                WHERE r.id = :id""")
                .param("id", id)
                .query(HeadRow.class)
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        HeadRow h = head.get();
        List<LineRow> rows = lines(id);
        Money amount = Money.ZERO;
        Money actual = Money.ZERO;
        boolean priced = true;
        long qty = 0;
        long bonus = 0;
        boolean diff = false;
        List<ReceiptLine> out = new ArrayList<>();
        for (LineRow l : rows) {
            qty += l.qty();
            bonus += l.bonusQty();
            if (l.price() == null) {
                priced = false;
            } else {
                Money p = new Money(l.price());
                amount = amount.plus(p.times(l.qty()));
                if (l.receivedQty() != null) {
                    actual = actual.plus(p.times(l.receivedQty() + l.damagedQty()));
                }
            }
            diff |= l.hasDiff();
            out.add(new ReceiptLine(l.id(), l.lineNo(), l.productId(), l.code(), l.name(), l.batchNumber(), localDate(l.producedOn()),
                    l.expiryDate().toLocalDate(), l.zoneId(), l.zone(), ZoneType.valueOf(l.zoneType()), l.qty(), l.bonusQty(),
                    prices && l.price() != null ? new Money(l.price()).toString() : null, l.receivedQty(), l.damagedQty(),
                    l.diffReason() == null ? null : DiffReason.valueOf(l.diffReason()), l.batch(), l.bonusBatch()));
        }
        boolean accepted = !rows.isEmpty() && rows.getFirst().receivedQty() != null;
        String balance = prices ? parties.balance(h.branchId(), h.supplierId(), Side.SUPPLIER).toString() : null;
        return Optional.of(new ReceiptDetail(h.id(), h.number(), h.branchId(), h.warehouseId(), h.warehouse(), h.supplierId(), h.supplier(),
                h.receiptDate().toLocalDate(), h.invoiceNumber(), localDate(h.invoiceDate()), PaymentType.valueOf(h.paymentType()),
                localDate(h.dueDate()), h.dueManual(), h.ownerId(), h.owner(), h.prepaid(),
                h.discountKind() == null ? null : DiscountKind.valueOf(h.discountKind()),
                h.discountValue() == null ? null : new Money(h.discountValue()).toString(), localDate(h.discountDate()), h.note(),
                ReceiptStatus.valueOf(h.status()), h.resolution() == null ? null : Resolution.valueOf(h.resolution()), prices,
                prices && priced && !rows.isEmpty() ? amount.toString() : null, prices && priced && accepted ? actual.toString() : null,
                prices && h.debtAmount() != null ? new Money(h.debtAmount()).toString() : null, balance, qty, bonus, diff, h.createdBy(),
                h.createdAt().toInstant(), h.acceptedBy(), instant(h.acceptedAt()), h.postedBy(), instant(h.postedAt()), h.cancelledBy(),
                instant(h.cancelledAt()), h.cancelReason(), out));
    }

    record LineRow(long id, int lineNo, long productId, String code, String name, boolean controlled, String batchNumber, Date producedOn,
            Date expiryDate, long zoneId, String zone, String zoneType, int qty, int bonusQty, BigDecimal price, Integer receivedQty,
            Integer damagedQty, String diffReason, Long batchId, String batch, Long bonusBatchId, String bonusBatch) {

        boolean hasDiff() {
            return receivedQty != null && (receivedQty + damagedQty != qty || damagedQty > 0);
        }
    }

    private List<LineRow> lines(long receiptId) {
        return jdbc.sql("""
                SELECT l.id, l.line_no, l.product_id, p.code, p.name, p.controlled, l.batch_number, l.produced_on, l.expiry_date, l.zone_id,
                       z.name AS zone, z.type AS zone_type, l.qty, l.bonus_qty, l.price, l.received_qty, l.damaged_qty, l.diff_reason,
                       l.batch_id, b.number AS batch, l.bonus_batch_id, bb.number AS bonus_batch
                FROM receipt_line l JOIN product p ON p.id = l.product_id JOIN zone z ON z.id = l.zone_id
                LEFT JOIN batch b ON b.id = l.batch_id LEFT JOIN batch bb ON bb.id = l.bonus_batch_id
                WHERE l.receipt_id = :id ORDER BY l.line_no""")
                .param("id", receiptId)
                .query(LineRow.class)
                .list();
    }

    // ===== Qoralama =====

    @Transactional
    long create(Actor actor, ReceiptRequest r, boolean pricesVisible) {
        Place place = place(actor, r.warehouseId());
        checkSupplier(r.supplierId(), place.branchId());
        checkHeader(r);
        String number = numbers.next(DocumentPrefix.KR, place.branchCode()).toString();
        long id = jdbc.sql("""
                INSERT INTO receipt (number, branch_id, warehouse_id, supplier_id, receipt_date, payment_type, prepaid, created_by)
                VALUES (:n, :b, :w, :s, :d, :pt, :pp, :by) RETURNING id""")
                .param("n", number)
                .param("b", place.branchId())
                .param("w", r.warehouseId())
                .param("s", r.supplierId())
                .param("d", Date.valueOf(r.receiptDate()))
                .param("pt", r.paymentType().name())
                .param("pp", r.prepaid())
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        writeHeader(id, place.branchId(), r);
        insertLines(id, r.warehouseId(), r.lines(), pricesVisible);
        audit.record(AuditEntry.of("receipt.create", "receipt", id).change(null, Map.of("number", number, "lines", r.lines().size())));
        return id;
    }

    @Transactional
    void update(Actor actor, long id, ReceiptRequest r, boolean pricesVisible) {
        Head h = lock(id, actor);
        requireStatus(h, ReceiptStatus.DRAFT);
        if (!pricesVisible) {
            boolean priced = jdbc.sql("SELECT EXISTS (SELECT 1 FROM receipt_line WHERE receipt_id = :id AND price IS NOT NULL)")
                    .param("id", id).query(Boolean.class).single();
            if (priced) {
                // Narxni ko'rmaydigan xodim qatorlarni almashtirsa, kiritilgan narxlar yo'qoladi.
                throw MedixException.forbidden("receipt.pricesHidden");
            }
        }
        Place place = place(actor, r.warehouseId());
        checkSupplier(r.supplierId(), place.branchId());
        checkHeader(r);
        jdbc.sql("""
                UPDATE receipt SET branch_id = :b, warehouse_id = :w, supplier_id = :s, receipt_date = :d, payment_type = :pt, prepaid = :pp,
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("b", place.branchId())
                .param("w", r.warehouseId())
                .param("s", r.supplierId())
                .param("d", Date.valueOf(r.receiptDate()))
                .param("pt", r.paymentType().name())
                .param("pp", r.prepaid())
                .param("id", id)
                .update();
        writeHeader(id, place.branchId(), r);
        jdbc.sql("DELETE FROM receipt_line WHERE receipt_id = :id").param("id", id).update();
        insertLines(id, r.warehouseId(), r.lines(), pricesVisible);
        audit.record(AuditEntry.of("receipt.update", "receipt", id).change(null, Map.of("lines", r.lines().size())));
    }

    private void checkHeader(ReceiptRequest r) {
        if (r.receiptDate().isAfter(today())) {
            throw MedixException.badRequest("receipt.futureDate");
        }
        if (r.invoiceDate() != null && r.invoiceDate().isAfter(today())) {
            throw MedixException.badRequest("receipt.futureDate");
        }
        if ((r.discountKind() == null) != (r.discountValue() == null || r.discountValue().isBlank())) {
            throw MedixException.badRequest("receipt.discountIncomplete");
        }
        if (r.discountKind() != null) {
            Money v = Money.of(r.discountValue());
            if (v.isZero() || (r.discountKind() == DiscountKind.PERCENT && v.compareTo(Money.of(100)) > 0)) {
                throw MedixException.badRequest("receipt.discountInvalid");
            }
        }
        if (r.dueDate() != null && r.dueDate().isBefore(r.receiptDate())) {
            throw MedixException.badRequest("receipt.dueBeforeDate");
        }
    }

    /** To'lov kuni: 100% oldindan to'langan — yo'q; aks holda kiritilgani yoki kirim sanasi + YB sharti (SPEC 5.1). */
    private void writeHeader(long id, long branchId, ReceiptRequest r) {
        LocalDate standard = r.receiptDate().plusDays(supplierDays(r.supplierId(), branchId));
        LocalDate due = r.prepaid() ? null : (r.dueDate() == null ? standard : r.dueDate());
        boolean manual = !r.prepaid() && r.dueDate() != null && !r.dueDate().equals(standard);
        if (r.ownerId() != null) {
            boolean ok = jdbc.sql("SELECT EXISTS (SELECT 1 FROM employee WHERE id = :e AND status <> 'BLOCKED')")
                    .param("e", r.ownerId()).query(Boolean.class).single();
            if (!ok) {
                throw MedixException.badRequest("receipt.ownerUnknown");
            }
        }
        jdbc.sql("""
                UPDATE receipt SET invoice_number = :inv, invoice_date = :invd, due_date = :due, due_manual = :dm, owner_id = :o,
                       discount_kind = :dk, discount_value = :dv, discount_date = :dd, note = :note WHERE id = :id""")
                .param("inv", blankToNull(r.invoiceNumber()))
                .param("invd", r.invoiceDate() == null ? null : Date.valueOf(r.invoiceDate()))
                .param("due", due == null ? null : Date.valueOf(due))
                .param("dm", manual)
                .param("o", r.ownerId())
                .param("dk", r.discountKind() == null ? null : r.discountKind().name())
                .param("dv", r.discountKind() == null ? null : Money.of(r.discountValue()).amount())
                .param("dd", r.discountDate() == null ? null : Date.valueOf(r.discountDate()))
                .param("note", blankToNull(r.note()))
                .param("id", id)
                .update();
    }

    private int supplierDays(long supplierId, long branchId) {
        return jdbc.sql("SELECT supplier_payment_days FROM counterparty_branch_terms WHERE counterparty_id = :c AND branch_id = :b")
                .param("c", supplierId)
                .param("b", branchId)
                .query(Integer.class)
                .optional()
                .orElse(0);
    }

    private record ZoneRef(long id, String name, ZoneType type, boolean controlled) {}

    private Map<Long, ZoneRef> zones(long warehouseId) {
        Map<Long, ZoneRef> m = new HashMap<>();
        jdbc.sql("SELECT id, name, type, controlled FROM zone WHERE warehouse_id = :w AND active")
                .param("w", warehouseId)
                .query((rs, n) -> m.put(rs.getLong("id"), new ZoneRef(rs.getLong("id"), rs.getString("name"),
                        ZoneType.valueOf(rs.getString("type")), rs.getBoolean("controlled"))))
                .list();
        return m;
    }

    /** Saqlash zonasi (kirim qatorining manzili): Asosiy, Sovuq, Seyf yoki Karantin. Nazoratdagi mahsulot — faqat Seyf yoki Karantin. */
    private static void checkTargetZone(ZoneRef z, boolean controlled, int lineNo) {
        if (z == null || z.type() == ZoneType.RECEIVING || z.type() == ZoneType.SHIPPING) {
            throw MedixException.badRequest("receipt.zoneInvalid", lineNo);
        }
        if (controlled && z.type() != ZoneType.SAFE && z.type() != ZoneType.QUARANTINE) {
            throw MedixException.badRequest("receipt.controlledZone", lineNo);
        }
    }

    private void insertLines(long id, long warehouseId, List<ReceiptLineRequest> lines, boolean pricesVisible) {
        Map<Long, ZoneRef> zones = zones(warehouseId);
        Map<Long, Boolean> products = new HashMap<>();
        List<Long> ids = lines.stream().map(ReceiptLineRequest::productId).distinct().toList();
        if (!ids.isEmpty()) {
            jdbc.sql("SELECT id, controlled FROM product WHERE id IN (:ids) AND active")
                    .param("ids", ids)
                    .query((rs, n) -> products.put(rs.getLong("id"), rs.getBoolean("controlled")))
                    .list();
        }
        Set<String> seen = new HashSet<>();
        int no = 0;
        for (ReceiptLineRequest l : lines) {
            no++;
            Boolean controlled = products.get(l.productId());
            if (controlled == null) {
                throw MedixException.badRequest("receipt.productUnknown", no);
            }
            checkTargetZone(zones.get(l.zoneId()), controlled, no);
            if (l.producedOn() != null && l.producedOn().isAfter(l.expiryDate())) {
                throw MedixException.badRequest("receipt.producedAfterExpiry", no);
            }
            if (!seen.add(l.productId() + "|" + l.batchNumber().strip().toUpperCase(Locale.ROOT))) {
                throw MedixException.badRequest("receipt.duplicateBatch", no);
            }
            String price = pricesVisible ? l.price() : null;
            jdbc.sql("""
                    INSERT INTO receipt_line (receipt_id, line_no, product_id, batch_number, produced_on, expiry_date, zone_id, qty, bonus_qty,
                                              price)
                    VALUES (:r, :no, :p, :bn, :prod, :exp, :z, :q, :bq, :price)""")
                    .param("r", id)
                    .param("no", no)
                    .param("p", l.productId())
                    .param("bn", l.batchNumber().strip())
                    .param("prod", l.producedOn() == null ? null : Date.valueOf(l.producedOn()))
                    .param("exp", Date.valueOf(l.expiryDate()))
                    .param("z", l.zoneId())
                    .param("q", l.qty())
                    .param("bq", l.bonusQty())
                    .param("price", price == null ? null : Money.of(price).amount())
                    .update();
        }
    }

    // ===== Qabul (Ombor mudiri) =====

    /** Haqiqiy soni kiritiladi; farq bo'lsa sababi majburiy. Partiyalar yaratiladi, tovar Qabul zonasiga tushadi (sotuvga yopiq). */
    @Transactional
    void accept(Actor actor, long id, List<AcceptLine> request) {
        Head h = lock(id, actor);
        requireStatus(h, ReceiptStatus.DRAFT);
        List<LineRow> rows = lines(id);
        if (rows.isEmpty()) {
            throw MedixException.badRequest("receipt.noLines");
        }
        Map<Long, AcceptLine> byLine = new HashMap<>();
        for (AcceptLine a : request) {
            byLine.put(a.lineId(), a);
        }
        if (byLine.size() != rows.size() || rows.stream().anyMatch(r -> !byLine.containsKey(r.id()))) {
            throw MedixException.badRequest("receipt.acceptAllLines");
        }
        Map<Long, ZoneRef> zones = zones(h.warehouseId());
        long receiving = zoneOf(zones, ZoneType.RECEIVING);
        List<Move> moves = new ArrayList<>();
        for (LineRow l : rows) {
            if (l.price() == null) {
                throw MedixException.conflict("receipt.priceMissing", l.lineNo());
            }
            AcceptLine a = byLine.get(l.id());
            long zone = a.zoneId() == null ? l.zoneId() : a.zoneId();
            checkTargetZone(zones.get(zone), l.controlled(), l.lineNo());
            int arrived = a.receivedQty() + a.damagedQty();
            DiffReason expected = a.damagedQty() > 0 ? DiffReason.DAMAGED
                    : arrived < l.qty() ? DiffReason.SHORT : arrived > l.qty() ? DiffReason.EXCESS : null;
            if (expected != null && a.diffReason() == null) {
                throw MedixException.badRequest("receipt.diffReasonRequired", l.lineNo());
            }
            if (a.diffReason() != expected) {
                throw MedixException.badRequest(expected == null ? "receipt.diffReasonWithoutDiff" : "receipt.diffReasonMismatch", l.lineNo());
            }
            LocalDate produced = localDate(l.producedOn());
            Long batch = null;
            if (arrived > 0) {
                batch = stock.createBatch(l.productId(), l.batchNumber(), produced, l.expiryDate().toLocalDate(), new Money(l.price()), false,
                        DOC_TYPE, l.id());
                moves.add(Move.in(receiving, batch, arrived));
            }
            Long bonusBatch = null;
            if (l.bonusQty() > 0) {
                bonusBatch = stock.createBatch(l.productId(), l.batchNumber(), produced, l.expiryDate().toLocalDate(), Money.ZERO, true,
                        DOC_TYPE, l.id());
                moves.add(Move.in(receiving, bonusBatch, l.bonusQty()));
            }
            jdbc.sql("""
                    UPDATE receipt_line SET received_qty = :rq, damaged_qty = :dq, diff_reason = :dr, zone_id = :z, batch_id = :b,
                           bonus_batch_id = :bb WHERE id = :id""")
                    .param("rq", a.receivedQty())
                    .param("dq", a.damagedQty())
                    .param("dr", a.diffReason() == null ? null : a.diffReason().name())
                    .param("z", zone)
                    .param("b", batch)
                    .param("bb", bonusBatch)
                    .param("id", l.id())
                    .update();
        }
        stock.post(new DocRef(DOC_TYPE, id, h.number()), moves);
        jdbc.sql("""
                UPDATE receipt SET status = 'ACCEPTED', accepted_by = :by, accepted_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("receipt.accept", "receipt", id)
                .change(Map.of("status", ReceiptStatus.DRAFT.name()), Map.of("status", ReceiptStatus.ACCEPTED.name())));
    }

    // ===== O'tkazish =====

    /**
     * Tovar saqlash zonalariga (shikastlangani Karantinga), qarz va to'lov kuni yoziladi. Farq bo'lsa qaror: haqiqiy soni
     * (kelgan = yaroqli + shikastlangan) yoki hujjat bo'yicha. Chegirma qarzdan ayrilmaydi (bonus balans — BNS).
     */
    @Transactional
    void post(Actor actor, long id, Resolution resolution) {
        Head h = lock(id, actor);
        requireStatus(h, ReceiptStatus.ACCEPTED);
        List<LineRow> rows = lines(id);
        boolean diff = rows.stream().anyMatch(LineRow::hasDiff);
        if (diff && resolution == null) {
            throw MedixException.badRequest("receipt.resolutionRequired");
        }
        Resolution applied = diff ? resolution : null;
        Map<Long, ZoneRef> zones = zones(h.warehouseId());
        long receiving = zoneOf(zones, ZoneType.RECEIVING);
        long quarantine = zoneOf(zones, ZoneType.QUARANTINE);
        List<Move> moves = new ArrayList<>();
        Money debt = Money.ZERO;
        for (LineRow l : rows) {
            if (!zones.containsKey(l.zoneId())) {
                throw MedixException.conflict("receipt.zoneInvalid", l.lineNo());
            }
            int arrived = l.receivedQty() + l.damagedQty();
            if (l.batchId() != null) {
                moves.add(Move.out(receiving, l.batchId(), arrived));
                if (l.receivedQty() > 0) {
                    moves.add(Move.in(l.zoneId(), l.batchId(), l.receivedQty()));
                }
                if (l.damagedQty() > 0) {
                    moves.add(Move.in(quarantine, l.batchId(), l.damagedQty()));
                }
            }
            if (l.bonusBatchId() != null) {
                moves.add(Move.out(receiving, l.bonusBatchId(), l.bonusQty()));
                moves.add(Move.in(l.zoneId(), l.bonusBatchId(), l.bonusQty()));
            }
            int paid = applied == Resolution.DOCUMENT ? l.qty() : arrived;
            debt = debt.plus(new Money(l.price()).times(paid));
        }
        stock.post(new DocRef(DOC_TYPE, id, h.number()), moves);
        record Terms(long supplierId, Date dueDate) {}
        Terms t = jdbc.sql("SELECT supplier_id, due_date FROM receipt WHERE id = :id").param("id", id).query(Terms.class).single();
        parties.record(new PartyLedger.DocRef(DOC_TYPE, id, h.number()), h.branchId(), t.supplierId(), Side.SUPPLIER, debt,
                localDate(t.dueDate()), null);
        jdbc.sql("""
                UPDATE receipt SET status = 'POSTED', resolution = :res, debt_amount = :debt, posted_by = :by, posted_at = now(),
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("res", applied == null ? null : applied.name())
                .param("debt", debt.amount())
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        Map<String, Object> after = new HashMap<>();
        after.put("status", ReceiptStatus.POSTED.name());
        after.put("debt", debt.toString());
        after.put("resolution", applied == null ? "" : applied.name());
        audit.record(AuditEntry.of("receipt.post", "receipt", id).change(Map.of("status", ReceiptStatus.ACCEPTED.name()), after));
    }

    // ===== Bekor qilish =====

    /**
     * Qoralama — o'zgarishsiz; qabul qilingan — tovar Qabul zonasidan chiqariladi; o'tkazilgan (faqat receipt.cancelPosted) —
     * tovar sotilmagan / ko'chirilmagan bo'lsa saqlash zonalaridan chiqariladi va qarz teskari yoziladi (SPEC 5.1-4).
     */
    @Transactional
    void cancel(Actor actor, long id, String reason, boolean canCancel, boolean canCancelPosted) {
        Head h = lock(id, actor);
        String why = reason.strip();
        if (h.status() == ReceiptStatus.CANCELLED) {
            throw MedixException.conflict("receipt.badStatus", h.status().name());
        }
        if (h.status() == ReceiptStatus.POSTED && !canCancelPosted) {
            throw MedixException.forbidden("receipt.cancelPostedForbidden");
        }
        if (h.status() != ReceiptStatus.POSTED && !canCancel) {
            throw MedixException.forbidden("receipt.cancelForbidden");
        }
        if (h.status() != ReceiptStatus.DRAFT) {
            boolean used = jdbc.sql("""
                    SELECT EXISTS (SELECT 1 FROM stock_move m
                                   WHERE m.batch_id IN (SELECT batch_id FROM receipt_line WHERE receipt_id = :id AND batch_id IS NOT NULL
                                                        UNION SELECT bonus_batch_id FROM receipt_line WHERE receipt_id = :id
                                                                                                        AND bonus_batch_id IS NOT NULL)
                                     AND NOT (m.doc_type = :t AND m.doc_id = :id))""")
                    .param("id", id)
                    .param("t", DOC_TYPE)
                    .query(Boolean.class)
                    .single();
            if (used) {
                throw MedixException.conflict("receipt.batchUsed");
            }
            // Partiyalarning joriy qoldig'i (shu hujjat harakatlari yig'indisi) — teskari harakatlar bilan nolga tushiriladi.
            List<Move> reverse = jdbc.sql("""
                    SELECT zone_id, batch_id, sum(qty) AS qty FROM stock_move WHERE doc_type = :t AND doc_id = :id
                    GROUP BY zone_id, batch_id HAVING sum(qty) <> 0 ORDER BY zone_id, batch_id""")
                    .param("t", DOC_TYPE)
                    .param("id", id)
                    .query((rs, n) -> new Move(rs.getLong("zone_id"), rs.getLong("batch_id"), -rs.getInt("qty"), "Bekor qilindi"))
                    .list();
            stock.post(new DocRef(DOC_TYPE, id, h.number()), reverse);
            if (h.status() == ReceiptStatus.POSTED) {
                Money total = parties.docTotal(DOC_TYPE, id);
                long supplier = jdbc.sql("SELECT supplier_id FROM receipt WHERE id = :id").param("id", id).query(Long.class).single();
                parties.record(new PartyLedger.DocRef(DOC_TYPE, id, h.number()), h.branchId(), supplier, Side.SUPPLIER,
                        Money.ZERO.minus(total), null, "Bekor qilindi");
            }
        }
        jdbc.sql("""
                UPDATE receipt SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r, updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", why)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("receipt.cancel", "receipt", id)
                .change(Map.of("status", h.status().name()), Map.of("status", ReceiptStatus.CANCELLED.name()))
                .withReason(why));
    }

    // ===== Ichki =====

    private record Head(long id, String number, long branchId, long warehouseId, ReceiptStatus status) {}

    private Head lock(long id, Actor actor) {
        return jdbc.sql("SELECT id, number, branch_id, warehouse_id, status FROM receipt WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("warehouse_id"),
                        ReceiptStatus.valueOf(rs.getString("status"))))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static void requireStatus(Head h, ReceiptStatus expected) {
        if (h.status() != expected) {
            throw MedixException.conflict(expected == ReceiptStatus.DRAFT ? "receipt.notDraft" : "receipt.badStatus", h.status().name());
        }
    }

    private static long zoneOf(Map<Long, ZoneRef> zones, ZoneType type) {
        return zones.values().stream().filter(z -> z.type() == type).map(ZoneRef::id).findFirst()
                .orElseThrow(() -> MedixException.conflict("receipt.zoneMissing", type.defaultName()));
    }

    private record Place(long branchId, String branchCode) {}

    private Place place(Actor actor, long warehouseId) {
        return jdbc.sql("""
                SELECT w.branch_id, b.code FROM warehouse w JOIN branch b ON b.id = w.branch_id
                WHERE w.id = :w AND w.active AND b.active""")
                .param("w", warehouseId)
                .query((rs, n) -> new Place(rs.getLong("branch_id"), rs.getString("code")))
                .optional()
                .filter(p -> actor.canAccessBranch(p.branchId()))
                .orElseThrow(() -> MedixException.badRequest("receipt.warehouseUnknown"));
    }

    private void checkSupplier(long supplierId, long branchId) {
        record Party(boolean supplier, boolean active, boolean blocked) {}
        Party p = jdbc.sql("SELECT is_supplier AS supplier, active, blocked FROM counterparty WHERE id = :id")
                .param("id", supplierId)
                .query(Party.class)
                .optional()
                .orElseThrow(() -> MedixException.badRequest("receipt.supplierUnknown"));
        if (!p.supplier() || !p.active()) {
            throw MedixException.badRequest("receipt.supplierUnknown");
        }
        if (p.blocked()) {
            throw MedixException.conflict("receipt.supplierBlocked");
        }
    }

    private static LocalDate localDate(Date d) {
        return d == null ? null : d.toLocalDate();
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
