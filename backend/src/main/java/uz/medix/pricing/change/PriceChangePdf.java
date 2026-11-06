package uz.medix.pricing.change;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.pricing.change.PriceChangeModels.Line;
import uz.medix.pricing.change.PriceChangeModels.PriceChangeDetail;
import uz.medix.pricing.change.PriceChangeModels.Status;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.security.Actor;

/** NO hujjatining server PDF shakli (SPEC 10: Thymeleaf → OpenHTMLtoPDF). */
@Service
class PriceChangePdf {

    static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private static final Map<Status, String> STATUS = Map.of(
            Status.DRAFT, "Qoralama",
            Status.PENDING_APPROVAL, "Direktor tasdigʻida",
            Status.APPROVED, "Tasdiqlangan",
            Status.REJECTED, "Rad etilgan",
            Status.CANCELLED, "Bekor qilingan");

    /** Shablon qatori — hammasi tayyor matn. Shablonga Map ko'rinishida beriladi (OGNL record accessor'larini bilmaydi). */
    record Row(String code, String name, String batch, String priceType, String oldPrice, String newPrice, String change) {

        Map<String, Object> asMap() {
            return Map.of("code", code, "name", name, "batch", batch, "priceType", priceType, "oldPrice", oldPrice, "newPrice", newPrice,
                    "change", change);
        }
    }

    private final PriceChanges changes;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;

    PriceChangePdf(PriceChanges changes, PdfRenderer pdf, JdbcClient jdbc) {
        this.changes = changes;
        this.pdf = pdf;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    byte[] render(Actor actor, long id) {
        PriceChangeDetail d = changes.find(id, actor).orElseThrow(() -> MedixException.notFound("error.notFound"));
        Map<String, Object> branch = jdbc.sql("SELECT name, legal_name FROM branch WHERE id = :b").param("b", d.branchId()).query().singleRow();
        List<Map<String, Object>> rows = d.lines().stream().map(PriceChangePdf::row).map(Row::asMap).toList();
        Map<String, Object> doc = new HashMap<>();
        doc.put("number", d.number());
        doc.put("receiptNumber", d.receiptNumber());
        doc.put("createdBy", d.createdBy());
        doc.put("decidedBy", d.decidedBy());
        doc.put("bigChanges", d.bigChanges());
        doc.put("note", d.note());
        Map<String, Object> vars = new HashMap<>();
        vars.put("doc", doc);
        vars.put("lines", rows);
        vars.put("status", STATUS.get(d.status()));
        vars.put("effectiveFrom", d.effectiveFrom().format(DATE));
        vars.put("branchName", branch.get("name"));
        vars.put("legalName", branch.get("legal_name"));
        return pdf.render("price-change", vars);
    }

    static Row row(Line l) {
        String batch = l.batchNumber() == null ? "—"
                : l.batchNumber() + (l.expiryDate() == null ? "" : " · " + fmt(l.expiryDate()));
        String change = l.changePercent() == null ? "yangi" : (l.bigChange() ? "⚠ " : "") + l.changePercent().replace('.', ',') + " %";
        return new Row(l.productCode(), l.productName(), batch, l.priceType(),
                l.oldPrice() == null ? "—" : Money.of(l.oldPrice()).format(), Money.of(l.newPrice()).format(), change);
    }

    private static String fmt(LocalDate d) {
        return d.format(DATE);
    }
}
