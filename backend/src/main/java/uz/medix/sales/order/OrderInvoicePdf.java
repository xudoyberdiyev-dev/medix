package uz.medix.sales.order;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.order.OrderModels.InvoiceDoc;
import uz.medix.sales.order.OrderModels.InvoiceLine;
import uz.medix.sales.order.OrderModels.PaymentType;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.pdf.PdfDocument;
import uz.medix.shared.pdf.PdfFormat;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.pdf.PrintSettings;
import uz.medix.shared.security.Actor;

/** Hisob-faktura — server PDF (frontend {@code /print/invoice} bilan bir xil shakl, SPEC 300). */
@Service
class OrderInvoicePdf {

    private static final Map<PaymentType, String> PAYMENT = Map.of(
            PaymentType.TRANSFER, "Perechisleniye",
            PaymentType.CASH, "Naqd",
            PaymentType.ONLINE, "Online");

    private final OrderInvoices invoices;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;
    private final PrintSettings print;

    OrderInvoicePdf(OrderInvoices invoices, PdfRenderer pdf, JdbcClient jdbc, PrintSettings print) {
        this.invoices = invoices;
        this.pdf = pdf;
        this.jdbc = jdbc;
        this.print = print;
    }

    @Transactional(readOnly = true)
    PdfDocument render(Actor actor, long orderId) {
        InvoiceDoc d = invoices.find(actor, orderId).orElseThrow(() -> MedixException.notFound("error.notFound"));
        Map<String, Object> seller = jdbc.sql("SELECT legal_name, tin, address, phone FROM branch WHERE id = :b")
                .param("b", d.branchId()).query().singleRow();
        Map<String, Object> vars = new HashMap<>();
        vars.put("number", d.invoiceNumber());
        vars.put("saleNumber", d.saleNumber());
        vars.put("orderNumber", d.orderNumber());
        vars.put("date", PdfFormat.date(d.saleDate()));
        vars.put("cancelled", "CANCELLED".equals(d.status()));
        vars.put("sellerName", seller.get("legal_name"));
        vars.put("sellerTin", seller.get("tin"));
        vars.put("sellerContacts", PdfFormat.orDash(List.of(str(seller.get("address")), str(seller.get("phone"))).stream()
                .filter(x -> !x.isBlank()).collect(Collectors.joining(" · "))));
        vars.put("warehouse", d.warehouse());
        vars.put("customer", d.customer());
        vars.put("customerTin", PdfFormat.orDash(d.customerTin()));
        vars.put("address", PdfFormat.orDash(d.address()));
        vars.put("contract", PdfFormat.orDash(d.contract()));
        vars.put("payment", PAYMENT.get(d.paymentType()));
        vars.put("dueDate", PdfFormat.date(d.dueDate()));
        vars.put("lines", d.lines().stream().map(OrderInvoicePdf::row).toList());
        vars.put("totalQty", PdfFormat.qty(d.lines().stream().mapToLong(InvoiceLine::qty).sum()));
        vars.put("net", PdfFormat.money(d.netTotal()));
        vars.put("vat", PdfFormat.money(d.vatTotal()));
        vars.put("total", PdfFormat.money(d.total()));
        PrintSettings.Signers signers = print.signers(d.branchId());
        vars.put("head", signers.head());
        vars.put("accountant", signers.accountant());
        vars.put("reprint", print.registerPrint("HF", d.invoiceNumber(), actor.employeeId()));
        return new PdfDocument(d.invoiceNumber(), pdf.render("invoice", vars));
    }

    private static Map<String, Object> row(InvoiceLine l) {
        Map<String, Object> m = new HashMap<>();
        m.put("code", l.productCode());
        m.put("name", l.productName());
        m.put("manufacturer", l.manufacturer());
        m.put("batch", l.batch() + " · " + PdfFormat.date(l.expiryDate()));
        m.put("qty", PdfFormat.qty(l.qty()));
        m.put("price", PdfFormat.money(l.price()));
        m.put("net", PdfFormat.money(l.netAmount()));
        m.put("vat", l.vatRate() + "% · " + PdfFormat.money(l.vatAmount()));
        m.put("amount", PdfFormat.money(l.amount()));
        return m;
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }
}
