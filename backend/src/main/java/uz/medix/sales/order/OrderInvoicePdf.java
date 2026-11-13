package uz.medix.sales.order;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.order.OrderModels.InvoiceDoc;
import uz.medix.sales.order.OrderModels.InvoiceLine;
import uz.medix.sales.order.OrderModels.InvoiceParty;
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

    static final int MAX_BULK = 50;

    private final OrderInvoices invoices;
    private final PdfRenderer pdf;
    private final PrintSettings print;

    OrderInvoicePdf(OrderInvoices invoices, PdfRenderer pdf, PrintSettings print) {
        this.invoices = invoices;
        this.pdf = pdf;
        this.print = print;
    }

    @Transactional(readOnly = true)
    PdfDocument render(Actor actor, long orderId) {
        InvoiceDoc d = invoices.find(actor, orderId).orElseThrow(() -> MedixException.notFound("error.notFound"));
        return new PdfDocument(d.invoiceNumber(), pdf.render("invoice", Map.of("title", d.invoiceNumber(), "docs", List.of(vars(actor, d)))));
    }

    /** Ommaviy chop etish (O11): bir nechta buyurtma HF — bitta PDF, har biri yangi sahifadan; sotuvi yoʻqlari oʻtkazib yuboriladi. */
    @Transactional(readOnly = true)
    PdfDocument renderMany(Actor actor, List<Long> orderIds) {
        List<Long> unique = orderIds == null ? List.of() : orderIds.stream().distinct().toList();
        if (unique.isEmpty() || unique.size() > MAX_BULK) {
            throw MedixException.badRequest("order.invoiceBulkSize", MAX_BULK);
        }
        List<InvoiceDoc> found = unique.stream().map(id -> invoices.find(actor, id)).flatMap(java.util.Optional::stream).toList();
        if (found.isEmpty()) {
            throw MedixException.notFound("error.notFound");
        }
        List<Map<String, Object>> docs = found.stream().map(d -> vars(actor, d)).toList();
        String name = found.size() == 1 ? found.getFirst().invoiceNumber() : "HF-" + found.size();
        return new PdfDocument(name, pdf.render("invoice", Map.of("title", name, "docs", docs)));
    }

    /** Shablon oʻzgaruvchilari (O11 rasmiy shakl); takroriy chop etish shu yerda qayd etiladi. */
    Map<String, Object> vars(Actor actor, InvoiceDoc d) {
        Map<String, Object> vars = new HashMap<>();
        vars.put("number", d.invoiceNumber());
        vars.put("saleNumber", d.saleNumber());
        vars.put("orderNumber", d.orderNumber());
        vars.put("date", PdfFormat.date(d.saleDate()));
        vars.put("printedAt", PdfFormat.dateTime(java.time.Instant.now()));
        vars.put("cancelled", "CANCELLED".equals(d.status()));
        vars.put("contract", d.contract());
        vars.put("contractDate", d.contractDate() == null ? null : PdfFormat.date(d.contractDate()));
        vars.put("seller", party(d.seller()));
        vars.put("buyer", party(d.buyer()));
        vars.put("warehouse", d.warehouse());
        vars.put("address", PdfFormat.orDash(d.address()));
        vars.put("payment", PAYMENT.get(d.paymentType()));
        vars.put("dueDate", d.dueDate() == null ? PdfFormat.DASH : PdfFormat.date(d.dueDate()));
        vars.put("lines", d.lines().stream().map(OrderInvoicePdf::row).toList());
        vars.put("totalQty", PdfFormat.qty(d.lines().stream().mapToLong(InvoiceLine::qty).sum()));
        vars.put("net", PdfFormat.money(d.netTotal()));
        vars.put("vat", PdfFormat.money(d.vatTotal()));
        vars.put("total", PdfFormat.money(d.total()));
        vars.put("totalInWords", d.totalInWords());
        vars.put("marks", d.markCount() > 0 ? PdfFormat.qty(d.markCount()) : PdfFormat.DASH);
        vars.put("marksNote", d.markCount() > 0
                ? "Markirovka kodlari roʻyxati — ilova (Excel, " + PdfFormat.qty(d.markCount()) + " ta kod)."
                : null);
        PrintSettings.Signers signers = print.signers(d.branchId());
        vars.put("head", signers.head());
        vars.put("accountant", signers.accountant());
        vars.put("handedBy", d.driver() == null ? null : d.driver() + " (haydovchi)");
        vars.put("tripInfo", d.tripNumber() == null ? null
                : "Reys " + d.tripNumber() + " · Mashina " + PdfFormat.orDash(d.vehicle()) + " · Haydovchi " + PdfFormat.orDash(d.driver()));
        vars.put("reprint", print.registerPrint("HF", d.invoiceNumber(), actor.employeeId()));
        return vars;
    }

    private static Map<String, Object> party(InvoiceParty p) {
        Map<String, Object> m = new HashMap<>();
        m.put("name", p.name());
        m.put("address", PdfFormat.orDash(p.address()));
        m.put("tin", PdfFormat.orDash(p.tin()));
        m.put("vatCode", PdfFormat.orDash(p.vatCode()));
        m.put("bankAccount", PdfFormat.orDash(p.bankAccount()));
        m.put("bank", PdfFormat.orDash(List.of(str(p.bankName()), p.mfo() == null ? "" : "MFO " + p.mfo()).stream()
                .filter(x -> !x.isBlank()).collect(Collectors.joining(", "))));
        m.put("phone", PdfFormat.orDash(p.phone()));
        return m;
    }

    private static Map<String, Object> row(InvoiceLine l) {
        Map<String, Object> m = new HashMap<>();
        m.put("code", l.productCode());
        m.put("name", l.productName());
        m.put("manufacturer", l.manufacturer());
        m.put("ikpu", PdfFormat.orDash(l.ikpu()));
        m.put("unit", PdfFormat.orDash(l.unit()));
        m.put("unitCode", l.unitCode());
        m.put("batch", l.batch() + " · " + PdfFormat.date(l.expiryDate()));
        m.put("qty", PdfFormat.qty(l.qty()));
        m.put("price", PdfFormat.money(l.price()));
        m.put("net", PdfFormat.money(l.netAmount()));
        m.put("vatRate", l.vatRate() + "%");
        m.put("vat", PdfFormat.money(l.vatAmount()));
        m.put("amount", PdfFormat.money(l.amount()));
        m.put("marks", l.markCount() > 0 ? PdfFormat.qty(l.markCount()) : PdfFormat.DASH);
        return m;
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }
}
