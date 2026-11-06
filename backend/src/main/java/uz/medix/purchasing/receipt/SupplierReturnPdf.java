package uz.medix.purchasing.receipt;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.purchasing.receipt.SupplierReturnModels.Reason;
import uz.medix.purchasing.receipt.SupplierReturnModels.Status;
import uz.medix.purchasing.receipt.SupplierReturnModels.SupplierReturnDetail;
import uz.medix.purchasing.receipt.SupplierReturnModels.SupplierReturnLine;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.security.Actor;

/** QY yuk xati — server PDF (Thymeleaf → OpenHTMLtoPDF). Narx va summa ustunlari faqat prices.cost bilan. */
@Service
class SupplierReturnPdf {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    static final Map<Status, String> STATUS = Map.of(Status.PENDING, "Tasdiqda", Status.POSTED, "Oʻtkazildi", Status.REJECTED, "Rad etildi");
    static final Map<Reason, String> REASON = Map.of(Reason.EXPIRING, "Muddati yaqin", Reason.DAMAGED, "Shikastlangan", Reason.QUALITY,
            "Sifatsiz (brak)", Reason.SURPLUS, "Ortiqcha", Reason.OTHER, "Boshqa");

    private final SupplierReturns returns;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;

    SupplierReturnPdf(SupplierReturns returns, PdfRenderer pdf, JdbcClient jdbc) {
        this.returns = returns;
        this.pdf = pdf;
        this.jdbc = jdbc;
    }

    record Rendered(String number, byte[] body) {}

    @Transactional(readOnly = true)
    Rendered render(Actor actor, long id, boolean withAmount) {
        SupplierReturnDetail found = returns.find(id, actor).orElseThrow(() -> MedixException.notFound("error.notFound"));
        SupplierReturnDetail d = withAmount ? found : found.withoutAmount();
        Map<String, Object> branch = jdbc.sql("SELECT name, legal_name FROM branch WHERE id = :b").param("b", d.branchId()).query().singleRow();
        Map<String, Object> extra = jdbc.sql("""
                SELECT c.tin, r.invoice_number FROM counterparty c, receipt r WHERE c.id = :s AND r.id = :r""")
                .param("s", d.supplierId())
                .param("r", d.receiptId())
                .query()
                .singleRow();
        List<Map<String, Object>> rows = d.lines().stream().map(SupplierReturnPdf::row).toList();
        Map<String, Object> doc = new HashMap<>();
        doc.put("number", d.number());
        doc.put("supplier", d.supplier());
        doc.put("supplierTin", extra.get("tin"));
        doc.put("receiptNumber", d.receiptNumber());
        doc.put("receiptDate", d.receiptDate().format(DATE));
        doc.put("invoiceNumber", extra.get("invoice_number"));
        doc.put("warehouse", d.warehouse());
        doc.put("zone", d.zone().name());
        doc.put("createdBy", d.createdBy());
        doc.put("postedBy", d.postedBy());
        doc.put("note", d.note());
        Map<String, Object> vars = new HashMap<>();
        vars.put("doc", doc);
        vars.put("lines", rows);
        vars.put("withAmount", withAmount);
        vars.put("status", STATUS.get(d.status()));
        vars.put("reason", REASON.get(d.reason()));
        vars.put("date", LocalDate.ofInstant(d.postedAt() != null ? d.postedAt() : d.createdAt(), TASHKENT).format(DATE));
        vars.put("totalQty", String.valueOf(d.totalQty()));
        vars.put("total", d.totalAmount() == null ? "" : Money.of(d.totalAmount()).format());
        vars.put("branchName", branch.get("name"));
        vars.put("legalName", branch.get("legal_name"));
        return new Rendered(d.number(), pdf.render("supplier-return", vars));
    }

    private static Map<String, Object> row(SupplierReturnLine l) {
        return Map.of("code", l.productCode(), "name", l.productName(), "bonus", l.bonus(), "batch", l.batchNumber(), "expiry",
                l.expiryDate().format(DATE), "qty", String.valueOf(l.qty()), "price", l.price() == null ? "" : Money.of(l.price()).format(),
                "amount", l.amount() == null ? "" : Money.of(l.amount()).format());
    }
}
