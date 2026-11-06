package uz.medix.sales.order;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.PartyLedger;
import uz.medix.inventory.StockLedger;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * Sotuv (SV) va hisob-faktura (HF), SPEC 5.2 №9: tovar Jo'natish zonasidan chiqadi, mijoz qarzi oshadi (to'lov muddati — filial
 * shartidagi kunlar), markirovka kodlari sotiladi, buyurtma «Yo'lda». Chaqiruvchi tranzaksiyasida (hammasi yoki hech narsa).
 */
@Service
class OrderSales {

    static final String DOC_TYPE = "SV";
    static final String RETURN_DOC_TYPE = "QM";
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final StockLedger stock;
    private final PartyLedger parties;
    private final DocumentSequenceService numbers;
    private final AuditLog audit;
    private final Clock clock;
    private final org.springframework.context.ApplicationEventPublisher events;

    OrderSales(JdbcClient jdbc, StockLedger stock, PartyLedger parties, DocumentSequenceService numbers, AuditLog audit, Clock clock,
            org.springframework.context.ApplicationEventPublisher events) {
        this.events = events;
        this.jdbc = jdbc;
        this.stock = stock;
        this.parties = parties;
        this.numbers = numbers;
        this.audit = audit;
        this.clock = clock;
    }

    private record Head(long id, String number, long branchId, String branchCode, long warehouseId, long customerId, String status,
            Integer paymentDays) {}

    private record Piece(long lineId, long productId, long batchId, long zoneId, int qty, BigDecimal price, BigDecimal vatRate, BigDecimal cost) {}

    /** Sotuvni yozadi; qaytaradi: SV raqami. Buyurtma «Yuklanmoqda» bo'lishi shart. */
    @Transactional(propagation = Propagation.MANDATORY)
    String post(Actor actor, long orderId, Long tripId) {
        Head h = jdbc.sql("""
                SELECT o.id, o.number, o.branch_id, b.code, o.warehouse_id, o.customer_id, o.status, t.payment_days
                FROM sales_order o JOIN branch b ON b.id = o.branch_id
                LEFT JOIN counterparty_branch_terms t ON t.counterparty_id = o.customer_id AND t.branch_id = o.branch_id
                WHERE o.id = :id FOR UPDATE OF o""")
                .param("id", orderId)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getString("code"),
                        rs.getLong("warehouse_id"), rs.getLong("customer_id"), rs.getString("status"), (Integer) rs.getObject("payment_days")))
                .single();
        if (!actor.canAccessBranch(h.branchId())) {
            throw MedixException.notFound("error.notFound");
        }
        if (!OrderModels.OrderStatus.LOADING.name().equals(h.status())) {
            throw MedixException.conflict("order.badStatus", h.status());
        }
        List<Piece> pieces = jdbc.sql("""
                WITH picked AS (SELECT line_id, batch_id, to_zone_id AS z, sum(qty) AS q FROM sales_order_pick WHERE order_id = :o
                                GROUP BY line_id, batch_id, to_zone_id),
                     ret AS (SELECT batch_id, from_zone_id AS z, sum(qty) AS q FROM sales_order_pick_return WHERE order_id = :o
                             GROUP BY batch_id, from_zone_id)
                SELECT p.line_id, l.product_id, p.batch_id, p.z, (p.q - coalesce(r.q, 0))::int AS qty, l.price, pr.vat_rate, b.cost
                FROM picked p LEFT JOIN ret r ON r.batch_id = p.batch_id AND r.z = p.z
                JOIN sales_order_line l ON l.id = p.line_id JOIN product pr ON pr.id = l.product_id JOIN batch b ON b.id = p.batch_id
                WHERE p.q - coalesce(r.q, 0) > 0 ORDER BY l.line_no, b.expiry_date, b.id""")
                .param("o", orderId)
                .query((rs, n) -> new Piece(rs.getLong("line_id"), rs.getLong("product_id"), rs.getLong("batch_id"), rs.getLong("z"),
                        rs.getInt("qty"), rs.getBigDecimal("price"), rs.getBigDecimal("vat_rate"), rs.getBigDecimal("cost")))
                .list();
        // Har qatorning sof yig'ilgani buyurtma miqdoriga teng bo'lishi shart
        Map<Long, Integer> byLine = new HashMap<>();
        pieces.forEach(p -> byLine.merge(p.lineId(), p.qty(), Integer::sum));
        List<long[]> lines = jdbc.sql("SELECT id, qty FROM sales_order_line WHERE order_id = :o")
                .param("o", orderId)
                .query((rs, n) -> new long[] {rs.getLong("id"), rs.getInt("qty")})
                .list();
        for (long[] l : lines) {
            if (byLine.getOrDefault(l[0], 0) != l[1]) {
                throw MedixException.conflict("sale.qtyMismatch");
            }
        }
        if (pieces.stream().anyMatch(p -> p.price() == null)) {
            throw MedixException.conflict("sale.priceMissing");
        }
        LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
        String number = numbers.next(DocumentPrefix.SV, h.branchCode()).toString();
        String invoice = numbers.next(DocumentPrefix.HF, h.branchCode()).toString();
        LocalDate due = h.paymentDays() == null ? null : today.plusDays(h.paymentDays());
        record Calc(Piece p, Money amount, Money vat) {}
        List<Calc> calcs = new ArrayList<>();
        Money total = Money.ZERO;
        Money vatTotal = Money.ZERO;
        Money costTotal = Money.ZERO;
        for (Piece p : pieces) {
            Money amount = new Money(p.price()).times(p.qty());
            // Narx QQS bilan: QQS = summa × stavka / (100 + stavka), HALF_UP
            Money vat = new Money(amount.amount().multiply(p.vatRate())
                    .divide(BigDecimal.valueOf(100).add(p.vatRate()), Money.SCALE, RoundingMode.HALF_UP));
            calcs.add(new Calc(p, amount, vat));
            total = total.plus(amount);
            vatTotal = vatTotal.plus(vat);
            costTotal = costTotal.plus(new Money(p.cost()).times(p.qty()));
        }
        long saleId = jdbc.sql("""
                INSERT INTO sale (number, invoice_number, order_id, branch_id, warehouse_id, customer_id, sale_date, total, vat_total, cost_total,
                                  due_date, trip_id, created_by)
                VALUES (:n, :inv, :o, :b, :w, :c, :d, :total, :vat, :cost, :due, :t, :by) RETURNING id""")
                .param("n", number)
                .param("inv", invoice)
                .param("o", orderId)
                .param("b", h.branchId())
                .param("w", h.warehouseId())
                .param("c", h.customerId())
                .param("d", Date.valueOf(today))
                .param("total", total.amount())
                .param("vat", vatTotal.amount())
                .param("cost", costTotal.amount())
                .param("due", due == null ? null : Date.valueOf(due))
                .param("t", tripId)
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        List<StockLedger.Move> moves = new ArrayList<>();
        for (Calc c : calcs) {
            Piece p = c.p();
            jdbc.sql("""
                    INSERT INTO sale_line (sale_id, order_line_id, product_id, batch_id, qty, price, amount, vat_rate, vat_amount, cost)
                    VALUES (:s, :l, :p, :b, :q, :price, :a, :vr, :va, :c)""")
                    .param("s", saleId)
                    .param("l", p.lineId())
                    .param("p", p.productId())
                    .param("b", p.batchId())
                    .param("q", p.qty())
                    .param("price", p.price())
                    .param("a", c.amount().amount())
                    .param("vr", p.vatRate())
                    .param("va", c.vat().amount())
                    .param("c", p.cost())
                    .update();
            moves.add(StockLedger.Move.out(p.zoneId(), p.batchId(), p.qty()));
        }
        stock.post(new StockLedger.DocRef(DOC_TYPE, saleId, number), moves);
        parties.record(new PartyLedger.DocRef(DOC_TYPE, saleId, number), h.branchId(), h.customerId(), PartyLedger.Side.CUSTOMER, total, due,
                "HF " + invoice);
        jdbc.sql("""
                UPDATE sales_order_mark SET status = 'SOLD', closed_by = :by, closed_at = now() WHERE order_id = :o AND status = 'ACTIVE'""")
                .param("by", actor.employeeId())
                .param("o", orderId)
                .update();
        jdbc.sql("""
                UPDATE sales_order SET status = 'IN_TRANSIT', status_changed_at = now(), updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("id", orderId)
                .update();
        audit.record(AuditEntry.of("sale.post", "sale", saleId).change(Map.of("order", h.number(), "status", "LOADING"),
                Map.of("number", number, "invoice", invoice, "total", total.toString(), "status", "IN_TRANSIT")));
        return number;
    }

    /** «Yetkazilmadi»: sotuv bekor, qarz teskari, kodlar bo'shaydi, tovar «Qaytmoqda». Chaqiruvchi tranzaksiyasida. */
    @Transactional(propagation = Propagation.MANDATORY)
    void cancelUndelivered(Actor actor, long orderId, String reason) {
        record S(long id, String number, long branchId, long customerId, long warehouseId, BigDecimal total, String orderStatus) {}
        S sale = jdbc.sql("""
                SELECT s.id, s.number, s.branch_id, s.customer_id, s.warehouse_id, s.total, o.status AS order_status
                FROM sale s JOIN sales_order o ON o.id = s.order_id WHERE s.order_id = :o AND s.status = 'POSTED' FOR UPDATE OF s, o""")
                .param("o", orderId)
                .query((rs, n) -> new S(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("customer_id"),
                        rs.getLong("warehouse_id"), rs.getBigDecimal("total"), rs.getString("order_status")))
                .optional()
                .orElseThrow(() -> MedixException.conflict("trip.orderNotInTransit"));
        if (!actor.canAccessBranch(sale.branchId()) || !"IN_TRANSIT".equals(sale.orderStatus())) {
            throw MedixException.conflict("trip.orderNotInTransit");
        }
        String why = reason.strip();
        jdbc.sql("UPDATE sale SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r WHERE id = :id")
                .param("by", actor.employeeId())
                .param("r", why)
                .param("id", sale.id())
                .update();
        parties.record(new PartyLedger.DocRef(DOC_TYPE, sale.id(), sale.number()), sale.branchId(), sale.customerId(), PartyLedger.Side.CUSTOMER,
                new Money(sale.total().negate()), null, "Yetkazilmadi: " + why);
        jdbc.sql("""
                INSERT INTO sales_return_pending (order_id, sale_id, batch_id, product_id, warehouse_id, qty)
                SELECT :o, :s, batch_id, product_id, :w, sum(qty) FROM sale_line WHERE sale_id = :s GROUP BY batch_id, product_id""")
                .param("o", orderId)
                .param("s", sale.id())
                .param("w", sale.warehouseId())
                .update();
        jdbc.sql("""
                UPDATE sales_order_mark SET status = 'RELEASED', closed_by = :by, closed_at = now(), close_reason = :r
                WHERE order_id = :o AND status = 'SOLD'""")
                .param("by", actor.employeeId())
                .param("r", "Yetkazilmadi: " + why)
                .param("o", orderId)
                .update();
        jdbc.sql("""
                UPDATE sales_order SET status = 'UNDELIVERED', cancel_reason = :r, status_changed_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("r", why)
                .param("id", orderId)
                .update();
        audit.record(AuditEntry.of("order.undelivered", "sales_order", orderId)
                .change(Map.of("status", "IN_TRANSIT"), Map.of("status", "UNDELIVERED", "sale", sale.number())).withReason(why));
    }

    record PendingReturn(long id, long orderId, String orderNumber, String customer, String product, String batch, int qty, java.time.Instant createdAt) {}

    @Transactional(readOnly = true)
    List<PendingReturn> pendingReturns(Actor actor) {
        return jdbc.sql("""
                SELECT r.id, r.order_id, o.number, c.name AS customer, p.name AS product, b.number AS batch, r.qty, r.created_at, o.branch_id
                FROM sales_return_pending r JOIN sales_order o ON o.id = r.order_id JOIN counterparty c ON c.id = o.customer_id
                JOIN product p ON p.id = r.product_id JOIN batch b ON b.id = r.batch_id
                WHERE r.received_at IS NULL ORDER BY r.created_at, r.id""")
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id"))
                        ? new PendingReturn(rs.getLong("id"), rs.getLong("order_id"), rs.getString("number"), rs.getString("customer"),
                                rs.getString("product"), rs.getString("batch"), rs.getInt("qty"), rs.getTimestamp("created_at").toInstant())
                        : null)
                .list()
                .stream()
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    /** Qaytgan tovarni sanab qabul qilish → Karantin (SPEC 5.4). Kam kelsa — muammo yoziladi. */
    @Transactional
    void acceptReturn(Actor actor, long returnId, int receivedQty) {
        record R(long orderId, long saleId, String saleNumber, long batchId, long warehouseId, int qty, long branchId, String orderNumber,
                Long qmId, String qmNumber) {}
        R r = jdbc.sql("""
                SELECT r.order_id, r.sale_id, s.number AS sale_number, r.batch_id, r.warehouse_id, r.qty, o.branch_id, o.number AS order_number,
                       r.return_id, q.number AS qm_number
                FROM sales_return_pending r JOIN sale s ON s.id = r.sale_id JOIN sales_order o ON o.id = r.order_id
                LEFT JOIN sales_return q ON q.id = r.return_id
                WHERE r.id = :id AND r.received_at IS NULL FOR UPDATE OF r""")
                .param("id", returnId)
                .query((rs, n) -> new R(rs.getLong("order_id"), rs.getLong("sale_id"), rs.getString("sale_number"), rs.getLong("batch_id"),
                        rs.getLong("warehouse_id"), rs.getInt("qty"), rs.getLong("branch_id"), rs.getString("order_number"),
                        (Long) rs.getObject("return_id"), rs.getString("qm_number")))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (receivedQty < 0 || receivedQty > r.qty()) {
            throw MedixException.badRequest("return.qtyInvalid", r.qty());
        }
        long quarantine = jdbc.sql("SELECT id FROM zone WHERE warehouse_id = :w AND type = 'QUARANTINE' AND active")
                .param("w", r.warehouseId())
                .query(Long.class)
                .optional()
                .orElseThrow(() -> MedixException.conflict("receipt.zoneMissing", "Karantin"));
        if (receivedQty > 0) {
            StockLedger.DocRef doc = r.qmId() != null
                    ? new StockLedger.DocRef(RETURN_DOC_TYPE, r.qmId(), r.qmNumber())
                    : new StockLedger.DocRef(DOC_TYPE, r.saleId(), r.saleNumber());
            stock.post(doc, List.of(StockLedger.Move.in(quarantine, r.batchId(), receivedQty)));
        }
        jdbc.sql("UPDATE sales_return_pending SET received_qty = :q, received_by = :by, received_at = now() WHERE id = :id")
                .param("q", receivedQty)
                .param("by", actor.employeeId())
                .param("id", returnId)
                .update();
        if (receivedQty < r.qty()) {
            jdbc.sql("""
                    INSERT INTO sales_order_issue (order_id, stage, reason, note, created_by) VALUES (:o, :st, 'SHORTAGE', :n, :by)""")
                    .param("st", r.qmId() != null ? "DELIVERED" : "UNDELIVERED")
                    .param("o", r.orderId())
                    .param("n", "Qaytgan tovar kam: kutilgan " + r.qty() + ", keldi " + receivedQty)
                    .param("by", actor.employeeId())
                    .update();
        }
        audit.record(AuditEntry.of("order.returnAccept", "sales_order", r.orderId()).change(null, Map.of("expected", r.qty(), "received", receivedQty)));
        events.publishEvent(new uz.medix.sales.SalesReturnAccepted(r.orderId()));
    }

    // ===== Qisman yetkazish — QM (SPEC 5.4) =====

    @Transactional(readOnly = true)
    List<uz.medix.sales.OrderDispatch.SaleLine> saleLines(long orderId) {
        return jdbc.sql("""
                SELECT sl.id, p.name AS product, b.number AS batch, sl.qty, sl.price, sl.amount, p.marked
                FROM sale_line sl JOIN sale s ON s.id = sl.sale_id JOIN product p ON p.id = sl.product_id JOIN batch b ON b.id = sl.batch_id
                JOIN sales_order_line l ON l.id = sl.order_line_id
                WHERE s.order_id = :o AND s.status = 'POSTED' ORDER BY l.line_no, sl.id""")
                .param("o", orderId)
                .query((rs, n) -> new uz.medix.sales.OrderDispatch.SaleLine(rs.getLong("id"), rs.getString("product"), rs.getString("batch"),
                        rs.getInt("qty"), new Money(rs.getBigDecimal("price")).toString(), new Money(rs.getBigDecimal("amount")).toString(),
                        rs.getBoolean("marked")))
                .list();
    }

    /**
     * Qisman yetkazish: qaytgan qism asl sotuv narxida QM (QQS — qaytgan summadan, HALF_UP), mijoz qarzi QM summasiga kamayadi,
     * tovar «Qaytmoqda», buyurtma «Yetkazildi». Chaqiruvchi tranzaksiyasida. Hammasi qaytsa — «Yetkazilmadi» ishlatiladi.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    uz.medix.sales.OrderDispatch.PartialResult partialReturn(Actor actor, long orderId, Long tripId, String reason, Map<Long, Integer> returned) {
        record S(long id, String number, long branchId, String branchCode, long customerId, long warehouseId, BigDecimal total, String orderStatus,
                String orderNumber) {}
        S sale = jdbc.sql("""
                SELECT s.id, s.number, s.branch_id, b.code, s.customer_id, s.warehouse_id, s.total, o.status AS order_status, o.number AS order_number
                FROM sale s JOIN sales_order o ON o.id = s.order_id JOIN branch b ON b.id = s.branch_id
                WHERE s.order_id = :o AND s.status = 'POSTED' FOR UPDATE OF s, o""")
                .param("o", orderId)
                .query((rs, n) -> new S(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getString("code"),
                        rs.getLong("customer_id"), rs.getLong("warehouse_id"), rs.getBigDecimal("total"), rs.getString("order_status"),
                        rs.getString("order_number")))
                .optional()
                .orElseThrow(() -> MedixException.conflict("trip.orderNotInTransit"));
        if (!actor.canAccessBranch(sale.branchId()) || !"IN_TRANSIT".equals(sale.orderStatus())) {
            throw MedixException.conflict("trip.orderNotInTransit");
        }
        record L(long id, long productId, long batchId, int qty, BigDecimal price, BigDecimal vatRate, BigDecimal cost) {}
        Map<Long, L> lines = new java.util.LinkedHashMap<>();
        jdbc.sql("SELECT id, product_id, batch_id, qty, price, vat_rate, cost FROM sale_line WHERE sale_id = :s ORDER BY id")
                .param("s", sale.id())
                .query((rs, n) -> new L(rs.getLong("id"), rs.getLong("product_id"), rs.getLong("batch_id"), rs.getInt("qty"),
                        rs.getBigDecimal("price"), rs.getBigDecimal("vat_rate"), rs.getBigDecimal("cost")))
                .list()
                .forEach(l -> lines.put(l.id(), l));
        int soldQty = lines.values().stream().mapToInt(L::qty).sum();
        int backQty = 0;
        for (Map.Entry<Long, Integer> e : returned.entrySet()) {
            L l = lines.get(e.getKey());
            Integer q = e.getValue();
            if (l == null || q == null || q < 0 || q > l.qty()) {
                throw MedixException.badRequest("partial.qtyInvalid");
            }
            backQty += q;
        }
        if (backQty == 0) {
            throw MedixException.badRequest("partial.nothingReturned");
        }
        if (backQty == soldQty) {
            throw MedixException.badRequest("partial.allReturned");
        }
        String why = reason.strip();
        LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
        String number = numbers.next(DocumentPrefix.QM, sale.branchCode()).toString();
        record C(L l, int qty, Money amount, Money vat) {}
        List<C> calcs = new ArrayList<>();
        Money total = Money.ZERO;
        Money vatTotal = Money.ZERO;
        Money costTotal = Money.ZERO;
        for (L l : lines.values()) {
            int q = returned.getOrDefault(l.id(), 0);
            if (q == 0) {
                continue;
            }
            Money amount = new Money(l.price()).times(q);
            Money vat = new Money(amount.amount().multiply(l.vatRate())
                    .divide(BigDecimal.valueOf(100).add(l.vatRate()), Money.SCALE, RoundingMode.HALF_UP));
            calcs.add(new C(l, q, amount, vat));
            total = total.plus(amount);
            vatTotal = vatTotal.plus(vat);
            costTotal = costTotal.plus(new Money(l.cost()).times(q));
        }
        long qmId = jdbc.sql("""
                INSERT INTO sales_return (number, sale_id, order_id, branch_id, warehouse_id, customer_id, trip_id, return_date, total, vat_total,
                                          cost_total, reason, created_by)
                VALUES (:n, :s, :o, :b, :w, :c, :t, :d, :total, :vat, :cost, :r, :by) RETURNING id""")
                .param("n", number)
                .param("s", sale.id())
                .param("o", orderId)
                .param("b", sale.branchId())
                .param("w", sale.warehouseId())
                .param("c", sale.customerId())
                .param("t", tripId)
                .param("d", Date.valueOf(today))
                .param("total", total.amount())
                .param("vat", vatTotal.amount())
                .param("cost", costTotal.amount())
                .param("r", why)
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        for (C c : calcs) {
            jdbc.sql("""
                    INSERT INTO sales_return_line (return_id, sale_line_id, product_id, batch_id, qty, price, amount, vat_rate, vat_amount, cost)
                    VALUES (:r, :sl, :p, :b, :q, :price, :a, :vr, :va, :c)""")
                    .param("r", qmId)
                    .param("sl", c.l().id())
                    .param("p", c.l().productId())
                    .param("b", c.l().batchId())
                    .param("q", c.qty())
                    .param("price", c.l().price())
                    .param("a", c.amount().amount())
                    .param("vr", c.l().vatRate())
                    .param("va", c.vat().amount())
                    .param("c", c.l().cost())
                    .update();
        }
        jdbc.sql("""
                INSERT INTO sales_return_pending (order_id, sale_id, return_id, batch_id, product_id, warehouse_id, qty)
                SELECT :o, :s, :r, batch_id, product_id, :w, sum(qty) FROM sales_return_line WHERE return_id = :r GROUP BY batch_id, product_id""")
                .param("o", orderId)
                .param("s", sale.id())
                .param("r", qmId)
                .param("w", sale.warehouseId())
                .update();
        parties.record(new PartyLedger.DocRef(RETURN_DOC_TYPE, qmId, number), sale.branchId(), sale.customerId(), PartyLedger.Side.CUSTOMER,
                new Money(total.amount().negate()), null, "Qisman yetkazildi (" + sale.number() + "): " + why,
                new PartyLedger.DocRef(DOC_TYPE, sale.id(), sale.number()));
        jdbc.sql("""
                UPDATE sales_order SET status = 'DELIVERED', status_changed_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id AND status = 'IN_TRANSIT'""")
                .param("id", orderId)
                .update();
        Money net = new Money(sale.total()).minus(total);
        audit.record(AuditEntry.of("order.partial", "sales_order", orderId)
                .change(Map.of("status", "IN_TRANSIT"), Map.of("status", "DELIVERED", "return", number, "returnTotal", total.toString(),
                        "net", net.toString()))
                .withReason(why));
        return new uz.medix.sales.OrderDispatch.PartialResult(number, total.toString(), net.toString());
    }
}
