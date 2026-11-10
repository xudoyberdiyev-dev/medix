package uz.medix.sales.order;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.PartyLedger;
import uz.medix.inventory.StockLedger;
import uz.medix.notification.Notifications;
import uz.medix.sales.order.CustomerReturnModels.CustomerReturnDetail;
import uz.medix.sales.order.CustomerReturnModels.CustomerReturnLine;
import uz.medix.sales.order.CustomerReturnModels.CustomerReturnLineRequest;
import uz.medix.sales.order.CustomerReturnModels.CustomerReturnPage;
import uz.medix.sales.order.CustomerReturnModels.CustomerReturnRequest;
import uz.medix.sales.order.CustomerReturnModels.CustomerReturnSummary;
import uz.medix.sales.order.CustomerReturnModels.Reason;
import uz.medix.sales.order.CustomerReturnModels.ReturnableLine;
import uz.medix.sales.order.CustomerReturnModels.ReturnableSale;
import uz.medix.sales.order.CustomerReturnModels.Status;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * QM — mijozdan qaytarish (prototip StockDocs `qm`; ruxsatlar qm.view / qm.create / qm.approve). Yetkazilgan sotuv asosida:
 * har qatorda qaytarish mumkin = sotilgan − o'tkazilgan QM (qisman yetkazish ham) − kutilayotgan QM. Narx — sotuv narxi (chegirma
 * bilan). Yaratilganda «Qabul kutilmoqda»; yaratuvchida qm.approve bo'lsa darhol qabul qilinadi. Qabul — bitta tranzaksiya: sotuv
 * qulflanadi, qoldiq qayta tekshiriladi, `sales_return` (QQS va tannarx sotuv qatoridan), tovar Karantin zonasiga (StockLedger),
 * mijoz qarzi kamayadi (PartyLedger, SV ga qo'llanadi), hujjat holati + audit.
 */
@Service
class CustomerReturns {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    private static final String VIEW_LINK = "/customer-returns?open=";

    private final JdbcClient jdbc;
    private final StockLedger stock;
    private final PartyLedger parties;
    private final DocumentSequenceService numbers;
    private final AuditLog audit;
    private final Notifications notifications;
    private final Clock clock;

    CustomerReturns(JdbcClient jdbc, StockLedger stock, PartyLedger parties, DocumentSequenceService numbers, AuditLog audit,
            Notifications notifications, Clock clock) {
        this.jdbc = jdbc;
        this.stock = stock;
        this.parties = parties;
        this.numbers = numbers;
        this.audit = audit;
        this.notifications = notifications;
        this.clock = clock;
    }

    private static String money(BigDecimal v) {
        return v == null ? null : new Money(v).toString();
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }

    // ===== O'qish =====

    @Transactional(readOnly = true)
    CustomerReturnPage list(Actor actor, Long branchId, Long customerId, Long saleId, Status status, String q, int page, int size) {
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
        if (customerId != null) {
            where.append(" AND h.customer_id = :c");
            params.put("c", customerId);
        }
        if (saleId != null) {
            where.append(" AND h.sale_id = :s");
            params.put("s", saleId);
        }
        if (status != null) {
            where.append(" AND h.status = :st");
            params.put("st", status.name());
        }
        if (q != null && !q.isBlank()) {
            where.append(" AND (h.number ILIKE :q OR c.name ILIKE :q OR s.number ILIKE :q)");
            params.put("q", "%" + q.strip() + "%");
        }
        String from = """
                 FROM customer_return h
                JOIN counterparty c ON c.id = h.customer_id
                JOIN sale s ON s.id = h.sale_id
                JOIN branch br ON br.id = h.branch_id
                JOIN warehouse w ON w.id = h.warehouse_id
                JOIN employee e ON e.id = h.created_by
                LEFT JOIN region rg ON rg.id = c.region_id""";
        long total = jdbc.sql("SELECT count(*)" + from + where).params(params).query(Long.class).single();
        List<CustomerReturnSummary> items = jdbc.sql("""
                SELECT h.id, h.number, h.branch_id, br.name AS branch, h.customer_id, c.name AS customer, rg.name AS region, h.sale_id,
                       s.number AS sale_number, h.warehouse_id, w.name AS warehouse, h.return_date, h.status, h.total,
                       e.full_name AS created_by, h.created_at, h.posted_at,
                       (SELECT count(*) FROM customer_return_line l WHERE l.customer_return_id = h.id) AS lines,
                       (SELECT coalesce(sum(l.qty), 0) FROM customer_return_line l WHERE l.customer_return_id = h.id) AS qty""" + from + where
                + " ORDER BY h.created_at DESC, h.id DESC LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query((rs, n) -> new CustomerReturnSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        rs.getString("branch"), rs.getLong("customer_id"), rs.getString("customer"), rs.getString("region"),
                        rs.getLong("sale_id"), rs.getString("sale_number"), rs.getLong("warehouse_id"), rs.getString("warehouse"),
                        rs.getDate("return_date").toLocalDate(), Status.valueOf(rs.getString("status")), rs.getInt("lines"), rs.getLong("qty"),
                        money(rs.getBigDecimal("total")), rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(),
                        instant(rs.getTimestamp("posted_at"))))
                .list();
        return new CustomerReturnPage(items, total, page, size);
    }

    @Transactional(readOnly = true)
    Optional<CustomerReturnDetail> find(long id, Actor actor) {
        record H(long id, String number, long branchId, String branch, long customerId, String customer, long saleId, String saleNumber,
                LocalDate saleDate, long orderId, String orderNumber, long warehouseId, String warehouse, String quarantine, LocalDate date,
                String status, String note, BigDecimal total, String createdBy, Timestamp createdAt, String postedBy, Timestamp postedAt,
                String rejectedBy, Timestamp rejectedAt, String rejectReason) {}
        Optional<H> head = jdbc.sql("""
                SELECT h.id, h.number, h.branch_id, br.name AS branch, h.customer_id, c.name AS customer, h.sale_id, s.number AS sale_number,
                       s.sale_date, h.order_id, o.number AS order_number, h.warehouse_id, w.name AS warehouse,
                       (SELECT z.name FROM zone z WHERE z.warehouse_id = h.warehouse_id AND z.type = 'QUARANTINE' AND z.active
                        ORDER BY z.id LIMIT 1) AS quarantine,
                       h.return_date, h.status, h.note, h.total, cb.full_name AS created_by, h.created_at, pb.full_name AS posted_by,
                       h.posted_at, rb.full_name AS rejected_by, h.rejected_at, h.reject_reason
                FROM customer_return h
                JOIN branch br ON br.id = h.branch_id
                JOIN counterparty c ON c.id = h.customer_id
                JOIN sale s ON s.id = h.sale_id
                JOIN sales_order o ON o.id = h.order_id
                JOIN warehouse w ON w.id = h.warehouse_id
                JOIN employee cb ON cb.id = h.created_by
                LEFT JOIN employee pb ON pb.id = h.posted_by
                LEFT JOIN employee rb ON rb.id = h.rejected_by
                WHERE h.id = :id""")
                .param("id", id)
                .query((rs, n) -> new H(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getString("branch"),
                        rs.getLong("customer_id"), rs.getString("customer"), rs.getLong("sale_id"), rs.getString("sale_number"),
                        rs.getDate("sale_date").toLocalDate(), rs.getLong("order_id"), rs.getString("order_number"), rs.getLong("warehouse_id"),
                        rs.getString("warehouse"), rs.getString("quarantine"), rs.getDate("return_date").toLocalDate(), rs.getString("status"),
                        rs.getString("note"), rs.getBigDecimal("total"), rs.getString("created_by"), rs.getTimestamp("created_at"),
                        rs.getString("posted_by"), rs.getTimestamp("posted_at"), rs.getString("rejected_by"), rs.getTimestamp("rejected_at"),
                        rs.getString("reject_reason")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        H h = head.get();
        List<CustomerReturnLine> lines = jdbc.sql("""
                SELECT l.id, l.line_no, l.sale_line_id, l.product_id, p.code, p.name, l.batch_id, b.number AS batch_number, b.expiry_date,
                       l.qty, l.price, l.amount, l.reason
                FROM customer_return_line l JOIN product p ON p.id = l.product_id JOIN batch b ON b.id = l.batch_id
                WHERE l.customer_return_id = :id ORDER BY l.line_no""")
                .param("id", id)
                .query((rs, n) -> new CustomerReturnLine(rs.getLong("id"), rs.getInt("line_no"), rs.getLong("sale_line_id"),
                        rs.getLong("product_id"), rs.getString("code"), rs.getString("name"), rs.getLong("batch_id"),
                        rs.getString("batch_number"), rs.getDate("expiry_date").toLocalDate(), rs.getInt("qty"),
                        money(rs.getBigDecimal("price")), money(rs.getBigDecimal("amount")), Reason.valueOf(rs.getString("reason"))))
                .list();
        long qty = lines.stream().mapToLong(CustomerReturnLine::qty).sum();
        return Optional.of(new CustomerReturnDetail(h.id(), h.number(), h.branchId(), h.branch(), h.customerId(), h.customer(), h.saleId(),
                h.saleNumber(), h.saleDate(), h.orderId(), h.orderNumber(), h.warehouseId(), h.warehouse(), h.quarantine(), h.date(),
                Status.valueOf(h.status()), h.note(), money(h.total()), qty, h.createdBy(), h.createdAt().toInstant(), h.postedBy(),
                instant(h.postedAt()), h.rejectedBy(), instant(h.rejectedAt()), h.rejectReason(), lines));
    }

    /** Qatorlar bo'yicha qaytarilgan: o'tkazilgan QM (sales_return_line) + kutilayotgan QM (customer_return PENDING). */
    private static final String RETURNED_SQL = """
            (SELECT coalesce(sum(r.qty), 0) FROM sales_return_line r WHERE r.sale_line_id = sl.id)
            + (SELECT coalesce(sum(cl.qty), 0) FROM customer_return_line cl JOIN customer_return ch ON ch.id = cl.customer_return_id
               WHERE cl.sale_line_id = sl.id AND ch.status = 'PENDING')""";

    /** Mijozning yetkazilgan sotuvlari (filial doirasida), qaytarsa bo'ladigan qatorlar soni bilan; yangilari birinchi. */
    @Transactional(readOnly = true)
    List<ReturnableSale> sales(Actor actor, long customerId, Long branchId) {
        StringBuilder where = new StringBuilder(" WHERE s.customer_id = :c AND s.status = 'POSTED' AND o.status = 'DELIVERED'");
        Map<String, Object> params = new HashMap<>();
        params.put("c", customerId);
        if (!actor.allBranches()) {
            where.append(" AND s.branch_id = :own");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        if (branchId != null) {
            where.append(" AND s.branch_id = :b");
            params.put("b", branchId);
        }
        return jdbc.sql("""
                SELECT s.id, s.number, s.sale_date, s.total, s.warehouse_id, w.name AS warehouse,
                       (SELECT count(*) FROM sale_line sl WHERE sl.sale_id = s.id AND sl.qty > """ + RETURNED_SQL + """
                       ) AS returnable
                FROM sale s JOIN sales_order o ON o.id = s.order_id JOIN warehouse w ON w.id = s.warehouse_id""" + where
                + " ORDER BY s.sale_date DESC, s.id DESC LIMIT 200")
                .params(params)
                .query((rs, n) -> new ReturnableSale(rs.getLong("id"), rs.getString("number"), rs.getDate("sale_date").toLocalDate(),
                        money(rs.getBigDecimal("total")), rs.getLong("warehouse_id"), rs.getString("warehouse"), rs.getInt("returnable")))
                .list();
    }

    @Transactional(readOnly = true)
    List<ReturnableLine> saleLines(Actor actor, long saleId) {
        saleHead(actor, saleId, false);
        return lines(saleId);
    }

    private List<ReturnableLine> lines(long saleId) {
        return jdbc.sql("""
                SELECT sl.id, sl.product_id, p.code, p.name, p.marked, sl.batch_id, b.number AS batch_number, b.expiry_date, sl.qty, sl.price,
                       """ + RETURNED_SQL + """
                 AS returned
                FROM sale_line sl JOIN product p ON p.id = sl.product_id JOIN batch b ON b.id = sl.batch_id
                JOIN sales_order_line ol ON ol.id = sl.order_line_id
                WHERE sl.sale_id = :s ORDER BY ol.line_no, sl.id""")
                .param("s", saleId)
                .query((rs, n) -> {
                    int sold = rs.getInt("qty");
                    int returned = rs.getInt("returned");
                    return new ReturnableLine(rs.getLong("id"), rs.getLong("product_id"), rs.getString("code"), rs.getString("name"),
                            rs.getBoolean("marked"), rs.getLong("batch_id"), rs.getString("batch_number"),
                            rs.getDate("expiry_date").toLocalDate(), sold, returned, Math.max(0, sold - returned),
                            money(rs.getBigDecimal("price")));
                })
                .list();
    }

    private record SaleHead(long id, String number, long orderId, long branchId, String branchCode, long customerId, String customer,
            long warehouseId) {}

    /** Yetkazilgan, o'tkazilgan sotuv (filial doirasida). lock — sotuv qatori qulflanadi (bir sotuvga parallel QM navbatlanadi). */
    private SaleHead saleHead(Actor actor, long saleId, boolean lock) {
        SaleHead s = jdbc.sql("""
                SELECT s.id, s.number, s.order_id, s.branch_id, br.code, s.customer_id, c.name AS customer, s.warehouse_id, s.status,
                       o.status AS order_status
                FROM sale s JOIN sales_order o ON o.id = s.order_id JOIN branch br ON br.id = s.branch_id
                JOIN counterparty c ON c.id = s.customer_id
                WHERE s.id = :id""" + (lock ? " FOR UPDATE OF s" : ""))
                .param("id", saleId)
                .query((rs, n) -> "POSTED".equals(rs.getString("status")) && "DELIVERED".equals(rs.getString("order_status"))
                        ? new SaleHead(rs.getLong("id"), rs.getString("number"), rs.getLong("order_id"), rs.getLong("branch_id"),
                                rs.getString("code"), rs.getLong("customer_id"), rs.getString("customer"), rs.getLong("warehouse_id"))
                        : null)
                .optional()
                .orElse(null);
        if (s == null || !actor.canAccessBranch(s.branchId())) {
            throw MedixException.notFound("qm.saleNotFound");
        }
        return s;
    }

    // ===== Yozish =====

    @Transactional
    long create(Actor actor, CustomerReturnRequest r, boolean canApprove) {
        SaleHead sale = saleHead(actor, r.saleId(), true);
        Map<Long, ReturnableLine> avail = lines(sale.id()).stream()
                .collect(Collectors.toMap(ReturnableLine::saleLineId, l -> l, (a, b) -> a, LinkedHashMap::new));
        Set<Long> seen = new HashSet<>();
        String note = r.note() == null || r.note().isBlank() ? null : r.note().strip();
        Money total = Money.ZERO;
        record P(CustomerReturnLineRequest req, ReturnableLine line, Money amount) {}
        List<P> priced = new ArrayList<>();
        for (CustomerReturnLineRequest l : r.lines()) {
            ReturnableLine a = avail.get(l.saleLineId());
            if (a == null || !seen.add(l.saleLineId())) {
                throw MedixException.badRequest("qm.lineInvalid");
            }
            if (l.qty() > a.left()) {
                throw MedixException.conflict("qm.qtyExceeds", a.productName(), a.left());
            }
            if (l.reason() == Reason.OTHER && note == null) {
                throw MedixException.badRequest("qm.noteRequired");
            }
            Money amount = new Money(new BigDecimal(a.price())).times(l.qty());
            total = total.plus(amount);
            priced.add(new P(l, a, amount));
        }
        String number = numbers.next(DocumentPrefix.QM, sale.branchCode()).toString();
        long id = jdbc.sql("""
                INSERT INTO customer_return (number, branch_id, sale_id, order_id, customer_id, warehouse_id, return_date, note, total, created_by)
                VALUES (:n, :b, :s, :o, :c, :w, :d, :note, :t, :by) RETURNING id""")
                .param("n", number)
                .param("b", sale.branchId())
                .param("s", sale.id())
                .param("o", sale.orderId())
                .param("c", sale.customerId())
                .param("w", sale.warehouseId())
                .param("d", Date.valueOf(LocalDate.now(clock.withZone(TASHKENT))))
                .param("note", note)
                .param("t", total.amount())
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        int no = 0;
        long qty = 0;
        for (P p : priced) {
            jdbc.sql("""
                    INSERT INTO customer_return_line (customer_return_id, line_no, sale_line_id, product_id, batch_id, qty, price, amount, reason)
                    VALUES (:h, :no, :sl, :p, :b, :q, :price, :a, :r)""")
                    .param("h", id)
                    .param("no", ++no)
                    .param("sl", p.line().saleLineId())
                    .param("p", p.line().productId())
                    .param("b", p.line().batchId())
                    .param("q", p.req().qty())
                    .param("price", new BigDecimal(p.line().price()))
                    .param("a", p.amount().amount())
                    .param("r", p.req().reason().name())
                    .update();
            qty += p.req().qty();
        }
        audit.record(AuditEntry.of("qm.create", "customer_return", id)
                .change(null, Map.of("number", number, "sale", sale.number(), "lines", priced.size(), "total", total.toString())), actor);
        if (canApprove) {
            doPost(actor, id);
        } else {
            notifications.notify("qm.approve", sale.branchId(), List.of(),
                    notifications.message("qm.accept", "qm.accept", VIEW_LINK + id, "qm.accept:" + id, number, sale.customer(),
                            String.valueOf(qty)));
        }
        return id;
    }

    @Transactional
    void approve(Actor actor, long id) {
        doPost(actor, id);
    }

    private record Head(long id, String number, long branchId, long saleId, long customerId, long warehouseId, String note, String status) {}

    private Head lockHead(Actor actor, long id) {
        Head h = jdbc.sql("""
                SELECT id, number, branch_id, sale_id, customer_id, warehouse_id, note, status FROM customer_return WHERE id = :id FOR UPDATE""")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("sale_id"),
                        rs.getLong("customer_id"), rs.getLong("warehouse_id"), rs.getString("note"), rs.getString("status")))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (!"PENDING".equals(h.status())) {
            throw MedixException.conflict("qm.notPending");
        }
        return h;
    }

    private void doPost(Actor actor, long id) {
        Head h = lockHead(actor, id);
        SaleHead sale = saleHead(actor, h.saleId(), true);
        record L(long saleLineId, long productId, long batchId, int qty, BigDecimal price, BigDecimal amount, String reason,
                BigDecimal vatRate, BigDecimal cost, int sold, int posted) {}
        List<L> lines = jdbc.sql("""
                SELECT l.sale_line_id, l.product_id, l.batch_id, l.qty, l.price, l.amount, l.reason, sl.vat_rate, sl.cost, sl.qty AS sold,
                       (SELECT coalesce(sum(r.qty), 0) FROM sales_return_line r WHERE r.sale_line_id = sl.id) AS posted
                FROM customer_return_line l JOIN sale_line sl ON sl.id = l.sale_line_id
                WHERE l.customer_return_id = :id ORDER BY l.line_no""")
                .param("id", id)
                .query((rs, n) -> new L(rs.getLong("sale_line_id"), rs.getLong("product_id"), rs.getLong("batch_id"), rs.getInt("qty"),
                        rs.getBigDecimal("price"), rs.getBigDecimal("amount"), rs.getString("reason"), rs.getBigDecimal("vat_rate"),
                        rs.getBigDecimal("cost"), rs.getInt("sold"), rs.getInt("posted")))
                .list();
        // Sotuv qulflangan — o'tkazilgan QM (qisman yetkazish ham) bilan birga sotilgandan oshmasligi qayta tekshiriladi.
        for (L l : lines) {
            if (l.posted() + l.qty() > l.sold()) {
                String product = jdbc.sql("SELECT name FROM product WHERE id = :p").param("p", l.productId()).query(String.class).single();
                throw MedixException.conflict("qm.qtyExceeds", product, Math.max(0, l.sold() - l.posted()));
            }
        }
        long quarantine = jdbc.sql("SELECT id FROM zone WHERE warehouse_id = :w AND type = 'QUARANTINE' AND active ORDER BY id LIMIT 1")
                .param("w", h.warehouseId())
                .query(Long.class)
                .optional()
                .orElseThrow(() -> MedixException.conflict("receipt.zoneMissing", "Karantin"));
        Money total = Money.ZERO;
        Money vatTotal = Money.ZERO;
        Money costTotal = Money.ZERO;
        List<BigDecimal> vats = new ArrayList<>();
        for (L l : lines) {
            Money vat = new Money(l.amount().multiply(l.vatRate()).divide(BigDecimal.valueOf(100).add(l.vatRate()), Money.SCALE,
                    RoundingMode.HALF_UP));
            vats.add(vat.amount());
            total = total.plus(new Money(l.amount()));
            vatTotal = vatTotal.plus(vat);
            costTotal = costTotal.plus(new Money(l.cost()).times(l.qty()));
        }
        String reasons = lines.stream().map(L::reason).distinct().collect(Collectors.joining(", "));
        String why = h.note() == null ? reasons : reasons + ": " + h.note();
        long srId = jdbc.sql("""
                INSERT INTO sales_return (number, sale_id, order_id, branch_id, warehouse_id, customer_id, trip_id, return_date, total, vat_total,
                                          cost_total, reason, created_by)
                VALUES (:n, :s, :o, :b, :w, :c, NULL, :d, :total, :vat, :cost, :r, :by) RETURNING id""")
                .param("n", h.number())
                .param("s", sale.id())
                .param("o", sale.orderId())
                .param("b", h.branchId())
                .param("w", h.warehouseId())
                .param("c", h.customerId())
                .param("d", Date.valueOf(LocalDate.now(clock.withZone(TASHKENT))))
                .param("total", total.amount())
                .param("vat", vatTotal.amount())
                .param("cost", costTotal.amount())
                .param("r", why.length() > 300 ? why.substring(0, 300) : why)
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        List<StockLedger.Move> moves = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            L l = lines.get(i);
            jdbc.sql("""
                    INSERT INTO sales_return_line (return_id, sale_line_id, product_id, batch_id, qty, price, amount, vat_rate, vat_amount, cost)
                    VALUES (:r, :sl, :p, :b, :q, :price, :a, :vr, :va, :c)""")
                    .param("r", srId)
                    .param("sl", l.saleLineId())
                    .param("p", l.productId())
                    .param("b", l.batchId())
                    .param("q", l.qty())
                    .param("price", l.price())
                    .param("a", l.amount())
                    .param("vr", l.vatRate())
                    .param("va", vats.get(i))
                    .param("c", l.cost())
                    .update();
            moves.add(StockLedger.Move.in(quarantine, l.batchId(), l.qty()));
        }
        stock.post(new StockLedger.DocRef(OrderSales.RETURN_DOC_TYPE, srId, h.number()), moves);
        parties.record(new PartyLedger.DocRef(OrderSales.RETURN_DOC_TYPE, srId, h.number()), h.branchId(), h.customerId(),
                PartyLedger.Side.CUSTOMER, new Money(total.amount().negate()), null, "Mijozdan qaytarish (" + sale.number() + ")",
                new PartyLedger.DocRef(OrderSales.DOC_TYPE, sale.id(), sale.number()));
        jdbc.sql("""
                UPDATE customer_return SET status = 'POSTED', posted_by = :by, posted_at = now(), sales_return_id = :sr, version = version + 1
                WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("sr", srId)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("qm.post", "customer_return", id)
                .change(Map.of("status", "PENDING"), Map.of("status", "POSTED", "total", total.toString(), "zone", "QUARANTINE")), actor);
    }

    @Transactional
    void reject(Actor actor, long id, String reason) {
        Head h = lockHead(actor, id);
        String why = reason.strip();
        jdbc.sql("""
                UPDATE customer_return SET status = 'REJECTED', rejected_by = :by, rejected_at = now(), reject_reason = :r, version = version + 1
                WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", why)
                .param("id", h.id())
                .update();
        audit.record(AuditEntry.of("qm.reject", "customer_return", id).change(Map.of("status", "PENDING"), Map.of("status", "REJECTED"))
                .withReason(why), actor);
    }
}
