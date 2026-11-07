package uz.medix.sales.order;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.order.OrderModels.InvoiceDoc;
import uz.medix.sales.order.OrderModels.InvoiceLine;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * Hisob-faktura (HF) chop etish shakli uchun (SPEC 300): o'tkazilgan sotuv qatorlari — partiya, muddat, narx (QQS bilan), QQS stavkasi va
 * summasi, QQSsiz qiymat. Tannarx yuborilmaydi.
 */
@Service
class OrderInvoices {

    private final JdbcClient jdbc;

    OrderInvoices(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private record Head(long saleId, String invoiceNumber, String saleNumber, String orderNumber, long branchId, String status, Date saleDate,
            Date dueDate, String customer, String customerTin, String address, String paymentType, String warehouse, BigDecimal total,
            BigDecimal vatTotal, String contract) {}

    private record Row(String productCode, String productName, String manufacturer, String batch, Date expiryDate, int qty, BigDecimal price,
            BigDecimal amount, BigDecimal vatRate, BigDecimal vatAmount) {}

    @Transactional(readOnly = true)
    Optional<InvoiceDoc> find(Actor actor, long orderId) {
        Optional<Head> head = jdbc.sql("""
                SELECT s.id AS sale_id, s.invoice_number, s.number AS sale_number, o.number AS order_number, s.branch_id, s.status, s.sale_date,
                       s.due_date, c.name AS customer, c.tin AS customer_tin, o.address, o.payment_type, w.name AS warehouse, s.total, s.vat_total,
                       (SELECT k.number FROM counterparty_contract k
                        WHERE k.counterparty_id = s.customer_id AND k.branch_id = s.branch_id
                          AND (k.signed_on IS NULL OR k.signed_on <= s.sale_date) AND (k.valid_until IS NULL OR k.valid_until >= s.sale_date)
                        ORDER BY k.signed_on DESC NULLS LAST, k.id DESC LIMIT 1) AS contract
                FROM sale s JOIN sales_order o ON o.id = s.order_id JOIN counterparty c ON c.id = s.customer_id
                JOIN warehouse w ON w.id = s.warehouse_id
                WHERE s.order_id = :id""")
                .param("id", orderId)
                .query(Head.class)
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        Head h = head.get();
        List<InvoiceLine> lines = jdbc.sql("""
                SELECT p.code AS product_code, p.name AS product_name, m.name AS manufacturer, b.number AS batch, b.expiry_date, sl.qty, sl.price,
                       sl.amount, sl.vat_rate, sl.vat_amount
                FROM sale_line sl JOIN product p ON p.id = sl.product_id JOIN batch b ON b.id = sl.batch_id
                JOIN sales_order_line ol ON ol.id = sl.order_line_id
                LEFT JOIN manufacturer m ON m.id = p.manufacturer_id
                WHERE sl.sale_id = :s ORDER BY ol.line_no, b.expiry_date, sl.id""")
                .param("s", h.saleId())
                .query(Row.class)
                .list()
                .stream()
                .map(r -> new InvoiceLine(r.productCode(), r.productName(), r.manufacturer(), r.batch(), local(r.expiryDate()), r.qty(),
                        new Money(r.price()).toString(), new Money(r.amount()).toString(), r.vatRate().stripTrailingZeros().toPlainString(),
                        new Money(r.vatAmount()).toString(), new Money(r.amount().subtract(r.vatAmount())).toString()))
                .toList();
        Money total = new Money(h.total());
        Money vat = new Money(h.vatTotal());
        return Optional.of(new InvoiceDoc(h.invoiceNumber(), h.saleNumber(), h.orderNumber(), h.branchId(), h.status(), local(h.saleDate()),
                local(h.dueDate()), h.customer(), h.customerTin(), h.address(), OrderModels.PaymentType.valueOf(h.paymentType()), h.warehouse(),
                h.contract(), total.toString(), vat.toString(), new Money(h.total().subtract(h.vatTotal())).toString(), lines));
    }

    private static LocalDate local(Date d) {
        return d == null ? null : d.toLocalDate();
    }
}
