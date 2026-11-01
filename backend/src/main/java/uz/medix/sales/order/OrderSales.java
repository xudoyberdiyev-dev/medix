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
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final StockLedger stock;
    private final PartyLedger parties;
    private final DocumentSequenceService numbers;
    private final AuditLog audit;
    private final Clock clock;

    OrderSales(JdbcClient jdbc, StockLedger stock, PartyLedger parties, DocumentSequenceService numbers, AuditLog audit, Clock clock) {
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
}
