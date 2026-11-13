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
import uz.medix.sales.order.OrderModels.InvoiceParty;
import uz.medix.shared.money.Money;
import uz.medix.shared.money.MoneyWords;
import uz.medix.shared.security.Actor;

/**
 * Hisob-faktura (HF) chop etish shakli uchun (SPEC 300, O11 — rasmiy shakl): sotuvchi va xaridor rekvizitlari (STIR, QQS reg. kodi, hisob
 * raqami, bank, MFO), shartnoma raqami va sanasi, qatorlar — MXIK, oʻlchov birligi va kodi, partiya, muddat, narx (QQS bilan), QQS stavkasi
 * va summasi, QQSsiz qiymat, markirovka kodlari soni; jami soʻz bilan. Tannarx yuborilmaydi.
 */
@Service
class OrderInvoices {

    private final JdbcClient jdbc;

    OrderInvoices(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private record Head(long saleId, long orderId, String invoiceNumber, String saleNumber, String orderNumber, long branchId, String status,
            Date saleDate, Date dueDate, String customer, String customerLegal, String customerTin, String customerAddress, String customerPhone,
            String customerBank, String customerAccount, String customerMfo, String customerVat, String address, String paymentType,
            String warehouse, BigDecimal total, BigDecimal vatTotal, String contract, Date contractDate, String sellerName, String sellerTin,
            String sellerAddress, String sellerPhone, String sellerVat, String sellerBank, String sellerAccount, String sellerMfo,
            String tripNumber, String vehicle, String driver) {}

    private record Row(String productCode, String productName, String manufacturer, String batch, Date expiryDate, int qty, BigDecimal price,
            BigDecimal amount, BigDecimal vatRate, BigDecimal vatAmount, String ikpu, String unit, String unitCode, int marks) {}

    @Transactional(readOnly = true)
    Optional<InvoiceDoc> find(Actor actor, long orderId) {
        Optional<Head> head = jdbc.sql("""
                SELECT s.id AS sale_id, o.id AS order_id, s.invoice_number, s.number AS sale_number, o.number AS order_number, s.branch_id,
                       s.status, s.sale_date, s.due_date, c.name AS customer, c.legal_name AS customer_legal, c.tin AS customer_tin,
                       c.address AS customer_address, c.phone AS customer_phone, c.bank_name AS customer_bank,
                       c.bank_account AS customer_account, c.bank_mfo AS customer_mfo, c.vat_code AS customer_vat, o.address, o.payment_type,
                       w.name AS warehouse, s.total, s.vat_total, k.number AS contract, k.signed_on AS contract_date,
                       coalesce(br.legal_name, br.name) AS seller_name, br.tin AS seller_tin, coalesce(br.address, br.actual_address) AS seller_address,
                       br.phone AS seller_phone, br.vat_cert_no AS seller_vat, ba.bank_name AS seller_bank, ba.account AS seller_account,
                       ba.mfo AS seller_mfo, tr.number AS trip_number, tr.plate_number AS vehicle, tr.driver
                FROM sale s JOIN sales_order o ON o.id = s.order_id JOIN counterparty c ON c.id = s.customer_id
                JOIN warehouse w ON w.id = s.warehouse_id JOIN branch br ON br.id = s.branch_id
                LEFT JOIN LATERAL (SELECT kk.number, kk.signed_on FROM counterparty_contract kk
                        WHERE kk.counterparty_id = s.customer_id AND kk.branch_id = s.branch_id
                          AND (kk.signed_on IS NULL OR kk.signed_on <= s.sale_date) AND (kk.valid_until IS NULL OR kk.valid_until >= s.sale_date)
                        ORDER BY kk.signed_on DESC NULLS LAST, kk.id DESC LIMIT 1) k ON true
                LEFT JOIN LATERAL (SELECT b.bank_name, b.account, b.mfo FROM branch_bank_account b WHERE b.branch_id = s.branch_id
                        ORDER BY b.is_main DESC, b.sort_order, b.id LIMIT 1) ba ON true
                LEFT JOIN LATERAL (SELECT t.number, v.plate_number, d.full_name AS driver FROM trip_stop ts JOIN trip t ON t.id = ts.trip_id
                        JOIN vehicle v ON v.id = t.vehicle_id JOIN employee d ON d.id = t.driver_id
                        WHERE ts.order_id = o.id AND t.status <> 'CANCELLED' ORDER BY t.id DESC LIMIT 1) tr ON true
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
                       sl.amount, sl.vat_rate, sl.vat_amount, p.ikpu, coalesce(u.short_name, u.name) AS unit, u.code AS unit_code,
                       (SELECT count(*) FROM sales_order_mark mk WHERE mk.line_id = sl.order_line_id AND mk.batch_id = sl.batch_id
                          AND mk.status IN ('ACTIVE', 'SOLD'))::int AS marks
                FROM sale_line sl JOIN product p ON p.id = sl.product_id JOIN batch b ON b.id = sl.batch_id
                JOIN sales_order_line ol ON ol.id = sl.order_line_id
                LEFT JOIN manufacturer m ON m.id = p.manufacturer_id
                LEFT JOIN unit u ON u.id = p.unit_id
                WHERE sl.sale_id = :s ORDER BY ol.line_no, b.expiry_date, sl.id""")
                .param("s", h.saleId())
                .query(Row.class)
                .list()
                .stream()
                .map(r -> new InvoiceLine(r.productCode(), r.productName(), r.manufacturer(), r.batch(), local(r.expiryDate()), r.qty(),
                        new Money(r.price()).toString(), new Money(r.amount()).toString(), r.vatRate().stripTrailingZeros().toPlainString(),
                        new Money(r.vatAmount()).toString(), new Money(r.amount().subtract(r.vatAmount())).toString(), r.ikpu(), r.unit(),
                        r.unitCode(), r.marks()))
                .toList();
        Money total = new Money(h.total());
        Money vat = new Money(h.vatTotal());
        InvoiceParty seller = new InvoiceParty(h.sellerName(), h.sellerAddress(), h.sellerTin(), h.sellerVat(), h.sellerAccount(),
                h.sellerBank(), h.sellerMfo(), h.sellerPhone());
        InvoiceParty buyer = new InvoiceParty(h.customerLegal() == null || h.customerLegal().isBlank() ? h.customer() : h.customerLegal(),
                h.customerAddress(), h.customerTin(), h.customerVat(), h.customerAccount(), h.customerBank(), h.customerMfo(),
                h.customerPhone());
        long marks = lines.stream().mapToLong(InvoiceLine::markCount).sum();
        int missingIkpu = (int) lines.stream().filter(l -> l.ikpu() == null || l.ikpu().isBlank()).count();
        String words = MoneyWords.of(total);
        words = words.isEmpty() ? words : Character.toUpperCase(words.charAt(0)) + words.substring(1);
        return Optional.of(new InvoiceDoc(h.invoiceNumber(), h.saleNumber(), h.orderNumber(), h.branchId(), h.status(), local(h.saleDate()),
                local(h.dueDate()), h.customer(), h.customerTin(), h.address(), OrderModels.PaymentType.valueOf(h.paymentType()), h.warehouse(),
                h.contract(), total.toString(), vat.toString(), new Money(h.total().subtract(h.vatTotal())).toString(), lines,
                local(h.contractDate()), seller, buyer, words, marks, missingIkpu, h.tripNumber(), h.vehicle(), h.driver()));
    }

    private static LocalDate local(Date d) {
        return d == null ? null : d.toLocalDate();
    }
}
