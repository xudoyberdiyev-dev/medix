package uz.medix.sales.order;

import java.util.HashMap;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.order.CustomerReturnModels.CustomerReturnDetail;
import uz.medix.sales.order.CustomerReturnModels.CustomerReturnLine;
import uz.medix.sales.order.CustomerReturnModels.Reason;
import uz.medix.sales.order.CustomerReturnModels.Status;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.pdf.PdfDocument;
import uz.medix.shared.pdf.PdfFormat;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.pdf.PrintSettings;
import uz.medix.shared.security.Actor;

/** Mijozdan qaytarish (QM) dalolatnomasi — server PDF: sotuv asosi, qatorlar sotuv narxida, sabab, imzolar. */
@Service
class CustomerReturnPdf {

    static final Map<Status, String> STATUS = Map.of(Status.PENDING, "Ombor qabulida", Status.POSTED, "Oʻtkazildi", Status.REJECTED, "Rad etildi");
    static final Map<Reason, String> REASON = Map.of(Reason.EXPIRING, "Muddati yaqin", Reason.DAMAGED, "Shikastlangan",
            Reason.WRONG_ITEM, "Notoʻgʻri mahsulot", Reason.REFUSED, "Mijoz rad etdi", Reason.OTHER, "Boshqa");

    private final CustomerReturns returns;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;
    private final PrintSettings print;

    CustomerReturnPdf(CustomerReturns returns, PdfRenderer pdf, JdbcClient jdbc, PrintSettings print) {
        this.returns = returns;
        this.pdf = pdf;
        this.jdbc = jdbc;
        this.print = print;
    }

    @Transactional(readOnly = true)
    PdfDocument render(Actor actor, long id) {
        CustomerReturnDetail d = returns.find(id, actor).orElseThrow(() -> MedixException.notFound("error.notFound"));
        Map<String, Object> branch = jdbc.sql("SELECT legal_name, tin FROM branch WHERE id = :b").param("b", d.branchId()).query().singleRow();
        String customerTin = jdbc.sql("SELECT tin FROM counterparty WHERE id = :c").param("c", d.customerId()).query(String.class).optional().orElse(null);
        Map<String, Object> vars = new HashMap<>();
        vars.put("number", d.number());
        vars.put("date", PdfFormat.date(d.returnDate()));
        vars.put("sellerName", branch.get("legal_name"));
        vars.put("sellerTin", branch.get("tin"));
        vars.put("branch", d.branch());
        vars.put("customer", d.customer());
        vars.put("customerTin", PdfFormat.orDash(customerTin));
        vars.put("saleNumber", d.saleNumber());
        vars.put("saleDate", PdfFormat.date(d.saleDate()));
        vars.put("orderNumber", d.orderNumber());
        vars.put("warehouse", d.warehouse());
        vars.put("zone", PdfFormat.orDash(d.quarantineZone()));
        vars.put("status", STATUS.get(d.status()));
        vars.put("createdBy", d.createdBy());
        vars.put("postedBy", d.postedBy());
        vars.put("note", d.note());
        vars.put("lines", d.lines().stream().map(CustomerReturnPdf::row).toList());
        vars.put("totalQty", PdfFormat.qty(d.totalQty()));
        vars.put("total", PdfFormat.money(d.total()));
        vars.put("reprint", print.registerPrint("QM", d.number(), actor.employeeId()));
        return new PdfDocument(d.number(), pdf.render("customer-return", vars));
    }

    static Map<String, Object> row(CustomerReturnLine l) {
        Map<String, Object> m = new HashMap<>();
        m.put("code", l.productCode());
        m.put("name", l.productName());
        m.put("batch", l.batchNumber());
        m.put("expiry", PdfFormat.date(l.expiryDate()));
        m.put("qty", PdfFormat.qty(l.qty()));
        m.put("price", PdfFormat.money(l.price()));
        m.put("amount", PdfFormat.money(l.amount()));
        m.put("reason", REASON.get(l.reason()));
        return m;
    }
}
