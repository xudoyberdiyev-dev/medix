package uz.medix.purchasing.receipt;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
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
import uz.medix.purchasing.receipt.ExpectedReceiptModels.ExpectedReceiptDetail;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.ExpectedReceiptFile;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.ExpectedReceiptLine;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.ExpectedReceiptLineRequest;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.ExpectedReceiptPage;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.ExpectedReceiptRequest;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.ExpectedReceiptSummary;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.FileData;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.InTransitDoc;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.InTransitRow;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.KkStatus;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.KkLinkedReceipt;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.PaymentKind;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.KkReceiveLineRequest;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.KkReceiveRequest;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.KkReceiveResult;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * KK — kutilayotgan kirim (yuk xati), O15 (egasi 17.11.2026; SPEC 5.1). Qoralamada tahrirlanadi; «Tasdiqlash» — bitta tranzaksiya:
 * to'lov «qarzga» bo'lsa YB qarzi DARHOL yoziladi (party_ledger, doc KK; to'lov kuni = hisob-faktura sanasi (yo'q bo'lsa yuk xati
 * sanasi) + YB sharti, O7 qoidasi), holat «Yo'lda». Qoldiq o'zgarmaydi. «Bekor qilish» — faqat hech narsa qabul qilinmagan bo'lsa;
 * yozilgan qarz teskari yoziladi. Narx (tannarx) faqat narx ko'rish huquqi bilan kiritiladi va ko'rsatiladi.
 */
@Service
class ExpectedReceipts {

    static final String DOC_TYPE = "KK";
    static final int MAX_FILE_BYTES = 10 * 1024 * 1024;
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    private static final Set<String> FILE_TYPES = Set.of("application/pdf", "image/jpeg", "image/png");

    private final JdbcClient jdbc;
    private final PartyLedger parties;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final Clock clock;
    private final Receipts receipts;

    ExpectedReceipts(JdbcClient jdbc, PartyLedger parties, AuditLog audit, DocumentSequenceService numbers, Clock clock, Receipts receipts) {
        this.receipts = receipts;
        this.jdbc = jdbc;
        this.parties = parties;
        this.audit = audit;
        this.numbers = numbers;
        this.clock = clock;
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(TASHKENT));
    }

    // ===== O'qish =====

    private static final String LATE_SQL = " coalesce(h.status IN ('IN_TRANSIT', 'PARTIAL') AND h.expected_date < :today, false) ";

    @Transactional(readOnly = true)
    ExpectedReceiptPage list(Actor actor, Long branchId, Long supplierId, Long warehouseId, KkStatus status, boolean open, boolean lateOnly,
            String q, int page, int size, boolean prices) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new HashMap<>();
        params.put("today", Date.valueOf(today()));
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
        if (warehouseId != null) {
            where.append(" AND h.warehouse_id = :w");
            params.put("w", warehouseId);
        }
        if (status != null) {
            where.append(" AND h.status = :st");
            params.put("st", status.name());
        }
        if (open) {
            where.append(" AND h.status IN ('IN_TRANSIT', 'PARTIAL')");
        }
        if (lateOnly) {
            where.append(" AND").append(LATE_SQL);
        }
        if (q != null && !q.isBlank()) {
            where.append(" AND (h.number ILIKE :q OR h.waybill_number ILIKE :q OR h.invoice_number ILIKE :q OR c.name ILIKE :q)");
            params.put("q", "%" + q.strip().replace("%", "\\%").replace("_", "\\_") + "%");
        }
        long total = jdbc.sql("SELECT count(*) FROM expected_receipt h JOIN counterparty c ON c.id = h.supplier_id" + where)
                .params(params).query(Long.class).single();
        List<ExpectedReceiptSummary> items = jdbc.sql("""
                SELECT h.id, h.number, h.branch_id, h.warehouse_id, w.name AS warehouse, h.supplier_id, c.name AS supplier, h.waybill_number,
                       h.waybill_date, h.invoice_number, h.invoice_date, h.payment_kind, h.expected_date, h.due_date, h.status,
                       coalesce(l.lines, 0) AS lines, coalesce(l.qty, 0) AS qty, coalesce(l.received, 0) AS received, h.total_amount,
                       h.debt_amount,""" + LATE_SQL + """
                       AS late, e.full_name AS created_by, h.created_at
                FROM expected_receipt h
                JOIN warehouse w ON w.id = h.warehouse_id
                JOIN counterparty c ON c.id = h.supplier_id
                JOIN employee e ON e.id = h.created_by
                LEFT JOIN (SELECT expected_receipt_id, count(*) AS lines, sum(qty) AS qty, sum(received_qty) AS received
                           FROM expected_receipt_line GROUP BY expected_receipt_id) l ON l.expected_receipt_id = h.id""" + where
                + " ORDER BY h.created_at DESC, h.id DESC LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query((rs, n) -> new ExpectedReceiptSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        rs.getLong("warehouse_id"), rs.getString("warehouse"), rs.getLong("supplier_id"), rs.getString("supplier"),
                        rs.getString("waybill_number"), rs.getDate("waybill_date").toLocalDate(), rs.getString("invoice_number"),
                        localDate(rs.getDate("invoice_date")), PaymentKind.valueOf(rs.getString("payment_kind")),
                        localDate(rs.getDate("expected_date")), localDate(rs.getDate("due_date")), KkStatus.valueOf(rs.getString("status")),
                        rs.getInt("lines"), rs.getLong("qty"), rs.getLong("received"),
                        prices ? money(rs.getBigDecimal("total_amount")) : null, prices ? money(rs.getBigDecimal("debt_amount")) : null,
                        rs.getBoolean("late"), rs.getString("created_by"), rs.getTimestamp("created_at").toInstant()))
                .list();
        return new ExpectedReceiptPage(items, total, page, size);
    }

    @Transactional(readOnly = true)
    Optional<ExpectedReceiptDetail> find(long id, Actor actor, boolean prices) {
        record HeadRow(long id, String number, long branchId, long warehouseId, String warehouse, long supplierId, String supplier,
                String waybillNumber, Date waybillDate, String invoiceNumber, Date invoiceDate, String contract, String paymentKind,
                Date expectedDate, Date dueDate, boolean dueManual, String note, String status, boolean late, BigDecimal total,
                BigDecimal debt, String createdBy, Timestamp createdAt, String approvedBy, Timestamp approvedAt, String cancelledBy,
                Timestamp cancelledAt, String cancelReason) {}
        Optional<HeadRow> head = jdbc.sql("""
                SELECT h.id, h.number, h.branch_id, h.warehouse_id, w.name AS warehouse, h.supplier_id, c.name AS supplier, h.waybill_number,
                       h.waybill_date, h.invoice_number, h.invoice_date, h.contract, h.payment_kind, h.expected_date, h.due_date, h.due_manual,
                       h.note, h.status,""" + LATE_SQL + """
                       AS late, h.total_amount AS total, h.debt_amount AS debt, cb.full_name AS created_by, h.created_at,
                       ab.full_name AS approved_by, h.approved_at, xb.full_name AS cancelled_by, h.cancelled_at, h.cancel_reason
                FROM expected_receipt h
                JOIN warehouse w ON w.id = h.warehouse_id
                JOIN counterparty c ON c.id = h.supplier_id
                JOIN employee cb ON cb.id = h.created_by
                LEFT JOIN employee ab ON ab.id = h.approved_by
                LEFT JOIN employee xb ON xb.id = h.cancelled_by
                WHERE h.id = :id""")
                .param("id", id)
                .param("today", Date.valueOf(today()))
                .query(HeadRow.class)
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        HeadRow h = head.get();
        List<ExpectedReceiptLine> lines = jdbc.sql("""
                SELECT l.id, l.line_no, l.product_id, p.code, p.name, l.qty, l.price, l.vat_rate, l.batch_number, l.expiry_date,
                       l.received_qty, l.written_off_qty
                FROM expected_receipt_line l JOIN product p ON p.id = l.product_id
                WHERE l.expected_receipt_id = :id ORDER BY l.line_no""")
                .param("id", id)
                .query((rs, n) -> {
                    BigDecimal price = rs.getBigDecimal("price");
                    int qty = rs.getInt("qty");
                    int received = rs.getInt("received_qty");
                    int off = rs.getInt("written_off_qty");
                    Integer vat = rs.getObject("vat_rate") == null ? null : rs.getInt("vat_rate");
                    return new ExpectedReceiptLine(rs.getLong("id"), rs.getInt("line_no"), rs.getLong("product_id"), rs.getString("code"),
                            rs.getString("name"), qty, prices ? money(price) : null,
                            prices && price != null ? new Money(price).times(qty).toString() : null, vat, rs.getString("batch_number"),
                            localDate(rs.getDate("expiry_date")), received, off, Math.max(0, qty - received - off));
                })
                .list();
        List<ExpectedReceiptFile> files = jdbc.sql("""
                SELECT f.id, f.file_name, f.content_type, f.size_bytes, e.full_name AS created_by, f.created_at
                FROM expected_receipt_file f JOIN employee e ON e.id = f.created_by
                WHERE f.expected_receipt_id = :id ORDER BY f.id""")
                .param("id", id)
                .query((rs, n) -> new ExpectedReceiptFile(rs.getLong("id"), rs.getString("file_name"), rs.getString("content_type"),
                        rs.getInt("size_bytes"), rs.getString("created_by"), rs.getTimestamp("created_at").toInstant()))
                .list();
        List<KkLinkedReceipt> receipts = jdbc.sql("""
                SELECT id, number, status, receipt_date FROM receipt WHERE expected_receipt_id = :id ORDER BY id""")
                .param("id", id)
                .query((rs, n) -> new KkLinkedReceipt(rs.getLong("id"), rs.getString("number"), rs.getString("status"),
                        rs.getDate("receipt_date").toLocalDate()))
                .list();
        long qty = lines.stream().mapToLong(ExpectedReceiptLine::qty).sum();
        long received = lines.stream().mapToLong(ExpectedReceiptLine::receivedQty).sum();
        boolean booked = h.debt() != null && h.debt().signum() > 0;
        return Optional.of(new ExpectedReceiptDetail(h.id(), h.number(), h.branchId(), h.warehouseId(), h.warehouse(), h.supplierId(),
                h.supplier(), h.waybillNumber(), h.waybillDate().toLocalDate(), h.invoiceNumber(), localDate(h.invoiceDate()), h.contract(),
                PaymentKind.valueOf(h.paymentKind()), localDate(h.expectedDate()), localDate(h.dueDate()), h.dueManual(), h.note(),
                KkStatus.valueOf(h.status()), h.late(), prices ? money(h.total()) : null, prices ? money(h.debt()) : null,
                prices && booked ? parties.docOpen(DOC_TYPE, id).toString() : null, h.createdBy(), h.createdAt().toInstant(),
                h.approvedBy(), instant(h.approvedAt()), h.cancelledBy(), instant(h.cancelledAt()), h.cancelReason(), qty, received, lines,
                files, receipts));
    }

    /**
     * Yo'ldagi tovar: KK «Yo'lda» / «Qisman» qatorlarining qolgan soni (soni − qabul qilingan − hisobdan chiqarilgan), mahsulot bo'yicha.
     * Qoldiqqa kirmaydi, zahiralanmaydi — faqat ko'rsatish (Qoldiqlar, mahsulot kartochkasi, buyurtma kiritish, xarid taklifi).
     */
    @Transactional(readOnly = true)
    List<InTransitRow> inTransit(Actor actor, List<Long> productIds, Long branchId, Long warehouseId) {
        StringBuilder where = new StringBuilder(" WHERE h.status IN ('IN_TRANSIT', 'PARTIAL') AND l.qty - l.received_qty - l.written_off_qty > 0");
        Map<String, Object> params = new HashMap<>();
        params.put("today", Date.valueOf(today()));
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
        if (productIds != null && !productIds.isEmpty()) {
            where.append(" AND l.product_id IN (:p)");
            params.put("p", productIds);
        }
        record Row(long productId, String productCode, String productName, long id, String number, String supplier, Date expectedDate, boolean late, int remaining) {}
        List<Row> rows = jdbc.sql("""
                SELECT l.product_id, p.code AS product_code, p.name AS product_name, h.id, h.number, c.name AS supplier, h.expected_date,""" + LATE_SQL + """
                       AS late, sum(l.qty - l.received_qty - l.written_off_qty)::int AS remaining
                FROM expected_receipt_line l
                JOIN expected_receipt h ON h.id = l.expected_receipt_id
                JOIN counterparty c ON c.id = h.supplier_id
                JOIN product p ON p.id = l.product_id""" + where + """

                GROUP BY l.product_id, p.code, p.name, h.id, h.number, c.name, h.expected_date, h.status
                ORDER BY p.name, l.product_id, h.expected_date NULLS LAST, h.id LIMIT 5000""")
                .params(params)
                .query(Row.class)
                .list();
        Map<Long, List<InTransitDoc>> byProduct = new java.util.LinkedHashMap<>();
        Map<Long, String[]> names = new HashMap<>();
        for (Row r : rows) {
            names.putIfAbsent(r.productId(), new String[] {r.productCode(), r.productName()});
            byProduct.computeIfAbsent(r.productId(), k -> new java.util.ArrayList<>())
                    .add(new InTransitDoc(r.id(), r.number(), r.supplier(), localDate(r.expectedDate()), r.late(), r.remaining()));
        }
        return byProduct.entrySet().stream()
                .map(e -> new InTransitRow(e.getKey(), names.get(e.getKey())[0], names.get(e.getKey())[1], e.getValue().stream().mapToLong(InTransitDoc::remainingQty).sum(),
                        e.getValue().stream().map(InTransitDoc::expectedDate).filter(java.util.Objects::nonNull).min(LocalDate::compareTo)
                                .orElse(null), e.getValue()))
                .toList();
    }

    // ===== Yaratish / tahrirlash (qoralama) =====

    @Transactional
    long create(Actor actor, ExpectedReceiptRequest r, boolean prices) {
        Place place = place(actor, r.warehouseId());
        checkSupplier(r.supplierId());
        checkHeader(r);
        String number = numbers.next(DocumentPrefix.KK, place.branchCode()).toString();
        long id = jdbc.sql("""
                INSERT INTO expected_receipt (number, branch_id, warehouse_id, supplier_id, waybill_number, waybill_date, payment_kind,
                                              created_by)
                VALUES (:n, :b, :w, :s, :wn, :wd, :pk, :by) RETURNING id""")
                .param("n", number)
                .param("b", place.branchId())
                .param("w", r.warehouseId())
                .param("s", r.supplierId())
                .param("wn", r.waybillNumber().strip())
                .param("wd", Date.valueOf(r.waybillDate()))
                .param("pk", r.paymentKind().name())
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        writeHeader(id, place.branchId(), r);
        writeLines(id, r.lines(), prices, Map.of());
        audit.record(AuditEntry.of("kk.create", "expected_receipt", id)
                .change(null, Map.of("number", number, "waybill", r.waybillNumber().strip(), "lines", r.lines().size())), actor);
        return id;
    }

    @Transactional
    void update(Actor actor, long id, ExpectedReceiptRequest r, boolean prices) {
        Head h = lock(id, actor);
        requireStatus(h, KkStatus.DRAFT);
        Place place = place(actor, r.warehouseId());
        if (place.branchId() != h.branchId()) {
            throw MedixException.badRequest("receipt.warehouseUnknown");
        }
        checkSupplier(r.supplierId());
        checkHeader(r);
        // Narx ko'rmaydigan xodim tahririda avvalgi narxlar mahsulot bo'yicha saqlanadi.
        Map<Long, BigDecimal> kept = new HashMap<>();
        if (!prices) {
            jdbc.sql("SELECT product_id, price FROM expected_receipt_line WHERE expected_receipt_id = :id AND price IS NOT NULL ORDER BY line_no")
                    .param("id", id)
                    .query((rs, n) -> kept.putIfAbsent(rs.getLong("product_id"), rs.getBigDecimal("price")))
                    .list();
        }
        jdbc.sql("""
                UPDATE expected_receipt SET warehouse_id = :w, supplier_id = :s, waybill_number = :wn, waybill_date = :wd, payment_kind = :pk,
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("w", r.warehouseId())
                .param("s", r.supplierId())
                .param("wn", r.waybillNumber().strip())
                .param("wd", Date.valueOf(r.waybillDate()))
                .param("pk", r.paymentKind().name())
                .param("id", id)
                .update();
        writeHeader(id, h.branchId(), r);
        jdbc.sql("DELETE FROM expected_receipt_line WHERE expected_receipt_id = :id").param("id", id).update();
        writeLines(id, r.lines(), prices, kept);
        audit.record(AuditEntry.of("kk.update", "expected_receipt", id).change(null, Map.of("lines", r.lines().size())), actor);
    }

    private void checkHeader(ExpectedReceiptRequest r) {
        LocalDate today = today();
        if (r.waybillDate().isAfter(today) || (r.invoiceDate() != null && r.invoiceDate().isAfter(today))) {
            throw MedixException.badRequest("receipt.futureDate");
        }
        if (r.expectedDate() != null && r.expectedDate().isBefore(r.waybillDate())) {
            throw MedixException.badRequest("kk.expectedBeforeWaybill");
        }
        if (r.paymentKind() == PaymentKind.CREDIT && r.dueDate() != null && r.dueDate().isBefore(dueBase(r))) {
            throw MedixException.badRequest("kk.dueBeforeDate");
        }
    }

    /** To'lov kuni hisoblanadigan sana: hisob-faktura sanasi, yo'q bo'lsa yuk xati sanasi (O7, O15). */
    static LocalDate dueBase(ExpectedReceiptRequest r) {
        return r.invoiceDate() != null ? r.invoiceDate() : r.waybillDate();
    }

    private void writeHeader(long id, long branchId, ExpectedReceiptRequest r) {
        boolean credit = r.paymentKind() == PaymentKind.CREDIT;
        LocalDate standard = dueBase(r).plusDays(supplierDays(r.supplierId(), branchId));
        LocalDate due = !credit ? null : (r.dueDate() == null ? standard : r.dueDate());
        boolean manual = credit && r.dueDate() != null && !r.dueDate().equals(standard);
        jdbc.sql("""
                UPDATE expected_receipt SET invoice_number = :inv, invoice_date = :invd, contract = :ct, expected_date = :ed, due_date = :due,
                       due_manual = :dm, note = :note WHERE id = :id""")
                .param("inv", blankToNull(r.invoiceNumber()))
                .param("invd", r.invoiceDate() == null ? null : Date.valueOf(r.invoiceDate()))
                .param("ct", blankToNull(r.contract()))
                .param("ed", r.expectedDate() == null ? null : Date.valueOf(r.expectedDate()))
                .param("due", due == null ? null : Date.valueOf(due))
                .param("dm", manual)
                .param("note", blankToNull(r.note()))
                .param("id", id)
                .update();
    }

    private void writeLines(long id, List<ExpectedReceiptLineRequest> lines, boolean prices, Map<Long, BigDecimal> kept) {
        Set<Long> active = new HashSet<>();
        List<Long> ids = lines.stream().map(ExpectedReceiptLineRequest::productId).distinct().toList();
        jdbc.sql("SELECT id FROM product WHERE id IN (:ids) AND active").param("ids", ids).query(Long.class).list().forEach(active::add);
        Set<String> seen = new HashSet<>();
        Money total = Money.ZERO;
        int no = 0;
        for (ExpectedReceiptLineRequest l : lines) {
            no++;
            if (!active.contains(l.productId())) {
                throw MedixException.badRequest("receipt.productUnknown", no);
            }
            String batch = blankToNull(l.batchNumber());
            if (!seen.add(l.productId() + "|" + (batch == null ? "" : batch.toUpperCase(Locale.ROOT)))) {
                throw MedixException.badRequest("kk.duplicateLine", no);
            }
            BigDecimal price;
            if (prices) {
                price = l.price() == null || l.price().isBlank() ? null : parsePrice(l.price(), no).amount();
            } else {
                price = kept.get(l.productId());
            }
            if (price != null) {
                total = total.plus(new Money(price).times(l.qty()));
            }
            jdbc.sql("""
                    INSERT INTO expected_receipt_line (expected_receipt_id, line_no, product_id, qty, price, vat_rate, batch_number, expiry_date)
                    VALUES (:h, :no, :p, :q, :price, :vat, :bn, :exp)""")
                    .param("h", id)
                    .param("no", no)
                    .param("p", l.productId())
                    .param("q", l.qty())
                    .param("price", price)
                    .param("vat", l.vatRate())
                    .param("bn", batch)
                    .param("exp", l.expiryDate() == null ? null : Date.valueOf(l.expiryDate()))
                    .update();
        }
        jdbc.sql("UPDATE expected_receipt SET total_amount = :t WHERE id = :id").param("t", total.amount()).param("id", id).update();
    }

    private static Money parsePrice(String raw, int lineNo) {
        try {
            Money m = Money.of(raw.strip());
            if (m.isNegative()) {
                throw MedixException.badRequest("kk.priceInvalid", lineNo);
            }
            return m;
        } catch (NumberFormatException | ArithmeticException e) {
            throw MedixException.badRequest("kk.priceInvalid", lineNo);
        }
    }

    // ===== Tasdiqlash / bekor qilish =====

    /**
     * «Tasdiqlash»: «qarzga» — YB qarzi darhol (summa = soni × narx; hamma narx majburiy), holat «Yo'lda». Oldindan to'langan / naqd —
     * qarz yozilmaydi (kirim o'tkazilganda odatdagidek). Bitta tranzaksiya, hujjat qulflanadi.
     */
    @Transactional
    void approve(Actor actor, long id) {
        Head h = lock(id, actor);
        requireStatus(h, KkStatus.DRAFT);
        checkSupplier(h.supplierId());
        record LineRow(int qty, BigDecimal price) {}
        List<LineRow> rows = jdbc.sql("SELECT qty, price FROM expected_receipt_line WHERE expected_receipt_id = :id")
                .param("id", id).query(LineRow.class).list();
        if (rows.isEmpty()) {
            throw MedixException.badRequest("kk.noLines");
        }
        Money total = Money.ZERO;
        boolean missing = false;
        for (LineRow l : rows) {
            if (l.price() == null) {
                missing = true;
            } else {
                total = total.plus(new Money(l.price()).times(l.qty()));
            }
        }
        boolean credit = h.paymentKind() == PaymentKind.CREDIT;
        if (credit && missing) {
            throw MedixException.conflict("kk.pricesMissing");
        }
        Money debt = credit ? total : Money.ZERO;
        if (debt.isPositive()) {
            Date due = jdbc.sql("SELECT due_date FROM expected_receipt WHERE id = :id").param("id", id).query(Date.class).single();
            parties.record(new PartyLedger.DocRef(DOC_TYPE, id, h.number()), h.branchId(), h.supplierId(), Side.SUPPLIER, debt,
                    localDate(due), null);
        }
        jdbc.sql("""
                UPDATE expected_receipt SET status = 'IN_TRANSIT', total_amount = :t, debt_amount = :d, approved_by = :by, approved_at = now(),
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("t", total.amount())
                .param("d", debt.amount())
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("kk.approve", "expected_receipt", id).change(Map.of("status", KkStatus.DRAFT.name()),
                Map.of("status", KkStatus.IN_TRANSIT.name(), "debt", debt.toString())), actor);
    }

    /** Qoralama — kk.create; tasdiqlangan — kk.approve va faqat hech narsa qabul qilinmagan bo'lsa (qarz teskari yoziladi). */
    @Transactional
    void cancel(Actor actor, long id, String reason, boolean canApprove) {
        Head h = lock(id, actor);
        if (h.status() == KkStatus.PARTIAL) {
            throw MedixException.conflict("kk.cancelReceived");
        }
        if (h.status() != KkStatus.DRAFT && h.status() != KkStatus.IN_TRANSIT) {
            throw MedixException.conflict("kk.badStatus", h.status().name());
        }
        if (h.status() == KkStatus.IN_TRANSIT) {
            if (!canApprove) {
                throw MedixException.forbidden("auth.forbidden");
            }
            boolean anyReceipt = jdbc.sql("""
                    SELECT EXISTS (SELECT 1 FROM receipt WHERE expected_receipt_id = :id AND status <> 'CANCELLED')
                        OR EXISTS (SELECT 1 FROM expected_receipt_line WHERE expected_receipt_id = :id AND received_qty > 0)""")
                    .param("id", id).query(Boolean.class).single();
            if (anyReceipt) {
                throw MedixException.conflict("kk.cancelReceived");
            }
            Money debt = h.debt() == null ? Money.ZERO : new Money(h.debt());
            if (debt.isPositive()) {
                parties.record(new PartyLedger.DocRef(DOC_TYPE, id, h.number()), h.branchId(), h.supplierId(), Side.SUPPLIER,
                        Money.ZERO.minus(debt), null, reason.strip());
            }
        }
        jdbc.sql("""
                UPDATE expected_receipt SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r,
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", reason.strip())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("kk.cancel", "expected_receipt", id)
                .change(Map.of("status", h.status().name()), Map.of("status", KkStatus.CANCELLED.name(), "reason", reason.strip())), actor);
    }

    // ===== Qabul qilish =====

    /**
     * KK dan kirim qoralamasi: tanlangan qatorlar (soni ≤ qolgan − boshqa ochiq kirimlardagi), narx KK dan (server nusxalaydi —
     * Ombor mudiri ko'rmaydi), partiya/yaroqlilik/zona — ombordan. Kirim odatdagidek qabul qilinadi va o'tkaziladi; o'tkazishda KK
     * yangilanadi (ExpectedReceiptLinks). Qisman kelish — bitta KK dan bir nechta kirim.
     */
    @Transactional
    KkReceiveResult receive(Actor actor, long id, KkReceiveRequest req) {
        Head h = lock(id, actor);
        if (h.status() != KkStatus.IN_TRANSIT && h.status() != KkStatus.PARTIAL) {
            throw MedixException.conflict("kk.badStatus", h.status().name());
        }
        record KLine(long id, int lineNo, long productId, BigDecimal price, int remaining, int pending) {}
        Map<Long, KLine> klines = new HashMap<>();
        jdbc.sql("""
                SELECT l.id, l.line_no, l.product_id, l.price, l.qty - l.received_qty - l.written_off_qty AS remaining,
                       coalesce((SELECT sum(rl.qty) FROM receipt_line rl JOIN receipt r ON r.id = rl.receipt_id
                                 WHERE rl.expected_line_id = l.id AND r.status IN ('DRAFT', 'ACCEPTED')), 0) AS pending
                FROM expected_receipt_line l WHERE l.expected_receipt_id = :id""")
                .param("id", id)
                .query(KLine.class)
                .list()
                .forEach(k -> klines.put(k.id(), k));
        Map<Long, Integer> asked = new HashMap<>();
        for (KkReceiveLineRequest l : req.lines()) {
            KLine k = klines.get(l.expectedLineId());
            if (k == null) {
                throw MedixException.badRequest("kk.lineUnknown");
            }
            int total = asked.merge(k.id(), l.qty(), Integer::sum);
            if (total > k.remaining() - k.pending()) {
                throw MedixException.conflict("kk.receiveTooMuch", k.lineNo(), Math.max(0, k.remaining() - k.pending()));
            }
        }
        record KHead(long warehouseId, long supplierId, String invoiceNumber, Date invoiceDate, Date dueDate) {}
        KHead kh = jdbc.sql("SELECT warehouse_id, supplier_id, invoice_number, invoice_date, due_date FROM expected_receipt WHERE id = :id")
                .param("id", id).query(KHead.class).single();
        LocalDate today = today();
        LocalDate due = localDate(kh.dueDate());
        if (due != null && due.isBefore(today)) {
            due = null; // kirimning o'z to'lov kuni ahamiyatsiz («qarzga» — qarz KK da); standart hisoblanadi
        }
        ReceiptModels.PaymentType type = h.paymentKind() == PaymentKind.CASH ? ReceiptModels.PaymentType.CASH : ReceiptModels.PaymentType.TRANSFER;
        List<ReceiptModels.ReceiptLineRequest> lines = req.lines().stream()
                .map(l -> {
                    BigDecimal price = klines.get(l.expectedLineId()).price();
                    return new ReceiptModels.ReceiptLineRequest(klines.get(l.expectedLineId()).productId(), l.batchNumber(), l.producedOn(),
                            l.expiryDate(), l.zoneId(), l.qty(), 0, price == null ? null : new Money(price).amount().toPlainString());
                })
                .toList();
        ReceiptModels.ReceiptRequest rr = new ReceiptModels.ReceiptRequest(kh.warehouseId(), kh.supplierId(), today, kh.invoiceNumber(),
                localDate(kh.invoiceDate()), type, due, null, h.paymentKind() == PaymentKind.PREPAID, null, null, null, null,
                h.number(), lines, null);
        long receiptId = receipts.create(actor, rr, true);
        jdbc.sql("UPDATE receipt SET expected_receipt_id = :k WHERE id = :r").param("k", id).param("r", receiptId).update();
        int no = 0;
        for (KkReceiveLineRequest l : req.lines()) {
            jdbc.sql("UPDATE receipt_line SET expected_line_id = :el WHERE receipt_id = :r AND line_no = :no")
                    .param("el", l.expectedLineId())
                    .param("r", receiptId)
                    .param("no", ++no)
                    .update();
        }
        String number = jdbc.sql("SELECT number FROM receipt WHERE id = :r").param("r", receiptId).query(String.class).single();
        audit.record(AuditEntry.of("kk.receive", "expected_receipt", id).change(null, Map.of("receipt", number, "lines", req.lines().size())),
                actor);
        return new KkReceiveResult(receiptId, number);
    }

    /** Yakuniy qabul (Qisman holatida): qolgan kelmagan soni hisobdan chiqariladi, «qarzga» — qarz shu summaga kamayadi. */
    @Transactional
    void close(Actor actor, long id, String reason) {
        Head h = lock(id, actor);
        if (h.status() != KkStatus.PARTIAL) {
            throw MedixException.conflict("kk.badStatus", h.status().name());
        }
        boolean pending = jdbc.sql("SELECT EXISTS (SELECT 1 FROM receipt WHERE expected_receipt_id = :id AND status IN ('DRAFT', 'ACCEPTED'))")
                .param("id", id).query(Boolean.class).single();
        if (pending) {
            throw MedixException.conflict("kk.closePending");
        }
        record Rest(int remaining, BigDecimal price) {}
        List<Rest> rest = jdbc.sql("""
                SELECT qty - received_qty - written_off_qty AS remaining, price FROM expected_receipt_line
                WHERE expected_receipt_id = :id AND qty - received_qty - written_off_qty > 0""")
                .param("id", id).query(Rest.class).list();
        Money amount = Money.ZERO;
        for (Rest r : rest) {
            if (r.price() != null) {
                amount = amount.plus(new Money(r.price()).times(r.remaining()));
            }
        }
        if (h.paymentKind() == PaymentKind.CREDIT && amount.isPositive()) {
            parties.record(new PartyLedger.DocRef(DOC_TYPE, id, h.number()), h.branchId(), h.supplierId(), Side.SUPPLIER,
                    Money.ZERO.minus(amount), null, "Kelmadi: " + reason.strip());
        }
        jdbc.sql("""
                UPDATE expected_receipt_line SET written_off_qty = written_off_qty + (qty - received_qty - written_off_qty)
                WHERE expected_receipt_id = :id AND qty - received_qty - written_off_qty > 0""")
                .param("id", id).update();
        jdbc.sql("""
                UPDATE expected_receipt SET status = 'RECEIVED', closed_by = :by, closed_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("kk.close", "expected_receipt", id)
                .change(Map.of("status", KkStatus.PARTIAL.name()), Map.of("status", KkStatus.RECEIVED.name(), "writtenOff", amount.toString(),
                        "reason", reason.strip())), actor);
    }

    // ===== Yuk xati fayli =====

    @Transactional
    long upload(Actor actor, long id, String fileName, String contentType, byte[] data) {
        String type = normalizeType(contentType, fileName);
        if (type == null || !FILE_TYPES.contains(type) || !magicMatches(type, data)) {
            throw MedixException.badRequest("kk.fileType");
        }
        if (data.length == 0 || data.length > MAX_FILE_BYTES) {
            throw MedixException.badRequest("kk.fileSize");
        }
        Head h = lock(id, actor);
        if (h.status() == KkStatus.CANCELLED) {
            throw MedixException.conflict("kk.badStatus", h.status().name());
        }
        String name = fileName == null || fileName.isBlank() ? "yuk-xati" : fileName.strip();
        name = name.replaceAll("[\\r\\n\"\\\\/]", "_");
        if (name.length() > 200) {
            name = name.substring(name.length() - 200);
        }
        long fileId = jdbc.sql("""
                INSERT INTO expected_receipt_file (expected_receipt_id, file_name, content_type, size_bytes, data, created_by)
                VALUES (:k, :n, :ct, :sz, :d, :by) RETURNING id""")
                .param("k", id)
                .param("n", name)
                .param("ct", type)
                .param("sz", data.length)
                .param("d", data)
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        audit.record(AuditEntry.of("kk.file", "expected_receipt", id).change(null, Map.of("file", name)), actor);
        return fileId;
    }

    @Transactional(readOnly = true)
    FileData file(Actor actor, long fileId) {
        record Row(long branchId, String fileName, String contentType, byte[] data) {}
        Row r = jdbc.sql("""
                SELECT h.branch_id, f.file_name, f.content_type, f.data FROM expected_receipt_file f
                JOIN expected_receipt h ON h.id = f.expected_receipt_id WHERE f.id = :id""")
                .param("id", fileId)
                .query(Row.class)
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        return new FileData(r.fileName(), r.contentType(), r.data());
    }

    private static String normalizeType(String contentType, String fileName) {
        String ct = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT).split(";")[0].strip();
        if (FILE_TYPES.contains(ct)) {
            return ct;
        }
        String n = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        if (n.endsWith(".pdf")) {
            return "application/pdf";
        }
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        return n.endsWith(".png") ? "image/png" : null;
    }

    private static boolean magicMatches(String type, byte[] d) {
        return switch (type) {
            case "application/pdf" -> d.length > 4 && d[0] == '%' && d[1] == 'P' && d[2] == 'D' && d[3] == 'F';
            case "image/jpeg" -> d.length > 3 && (d[0] & 0xFF) == 0xFF && (d[1] & 0xFF) == 0xD8;
            case "image/png" -> d.length > 8 && (d[0] & 0xFF) == 0x89 && d[1] == 'P' && d[2] == 'N' && d[3] == 'G';
            default -> false;
        };
    }

    // ===== Ichki =====

    private record Head(long id, String number, long branchId, long warehouseId, long supplierId, KkStatus status,
            PaymentKind paymentKind, BigDecimal debt) {}

    private Head lock(long id, Actor actor) {
        return jdbc.sql("""
                SELECT id, number, branch_id, warehouse_id, supplier_id, status, payment_kind, debt_amount FROM expected_receipt
                WHERE id = :id FOR UPDATE""")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("warehouse_id"),
                        rs.getLong("supplier_id"), KkStatus.valueOf(rs.getString("status")), PaymentKind.valueOf(rs.getString("payment_kind")),
                        rs.getBigDecimal("debt_amount")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static void requireStatus(Head h, KkStatus expected) {
        if (h.status() != expected) {
            throw MedixException.conflict(expected == KkStatus.DRAFT ? "kk.notDraft" : "kk.badStatus", h.status().name());
        }
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

    private void checkSupplier(long supplierId) {
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

    private int supplierDays(long supplierId, long branchId) {
        return jdbc.sql("SELECT supplier_payment_days FROM counterparty_branch_terms WHERE counterparty_id = :c AND branch_id = :b")
                .param("c", supplierId)
                .param("b", branchId)
                .query(Integer.class)
                .optional()
                .orElse(0);
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

    private static String money(BigDecimal v) {
        return v == null ? null : new Money(v).toString();
    }
}
