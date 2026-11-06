package uz.medix.inventory.writeoff;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.inventory.writeoff.WriteOffModels.Reason;
import uz.medix.inventory.writeoff.WriteOffModels.Status;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffDetail;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffLine;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.security.Actor;

/** HC dalolatnomasi — server PDF (Thymeleaf → OpenHTMLtoPDF). Tannarx ustunlari faqat prices.cost bilan. */
@Service
class WriteOffPdf {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    static final Map<Status, String> STATUS = Map.of(Status.PENDING, "Tasdiqda", Status.POSTED, "Oʻtkazildi", Status.REJECTED, "Rad etildi");
    static final Map<Reason, String> REASON = Map.of(Reason.EXPIRED, "Muddati oʻtgan", Reason.DAMAGED, "Shikastlangan", Reason.SHORTAGE,
            "Kamomad", Reason.OTHER, "Boshqa");

    private final WriteOffs writeOffs;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;

    WriteOffPdf(WriteOffs writeOffs, PdfRenderer pdf, JdbcClient jdbc) {
        this.writeOffs = writeOffs;
        this.pdf = pdf;
        this.jdbc = jdbc;
    }

    record Rendered(String number, byte[] body) {}

    @Transactional(readOnly = true)
    Rendered render(Actor actor, long id, boolean withCost) {
        WriteOffDetail found = writeOffs.find(id, actor).orElseThrow(() -> MedixException.notFound("error.notFound"));
        WriteOffDetail d = withCost ? found : found.withoutCost();
        Map<String, Object> branch = jdbc.sql("SELECT name, legal_name FROM branch WHERE id = :b").param("b", d.branchId()).query().singleRow();
        List<Map<String, Object>> rows = d.lines().stream().map(WriteOffPdf::row).toList();
        Map<String, Object> doc = new HashMap<>();
        doc.put("number", d.number());
        doc.put("actNo", d.actNo());
        doc.put("warehouse", d.warehouse());
        doc.put("zone", d.zone().name());
        doc.put("sourceTransfer", d.sourceTransfer());
        doc.put("createdBy", d.createdBy());
        doc.put("postedBy", d.postedBy());
        doc.put("note", d.note());
        doc.put("commission", d.commission());
        Map<String, Object> vars = new HashMap<>();
        vars.put("doc", doc);
        vars.put("lines", rows);
        vars.put("withCost", withCost);
        vars.put("status", STATUS.get(d.status()));
        vars.put("reason", REASON.get(d.reason()));
        vars.put("date", LocalDate.ofInstant(d.postedAt() != null ? d.postedAt() : d.createdAt(), TASHKENT).format(DATE));
        vars.put("totalQty", String.valueOf(d.totalQty()));
        vars.put("total", d.totalCost() == null ? "" : Money.of(d.totalCost()).format());
        vars.put("branchName", branch.get("name"));
        vars.put("legalName", branch.get("legal_name"));
        return new Rendered(d.number(), pdf.render("write-off", vars));
    }

    private static Map<String, Object> row(WriteOffLine l) {
        return Map.of("code", l.productCode(), "name", l.productName(), "batch", l.batchNumber(), "expiry", l.expiryDate().format(DATE), "qty",
                String.valueOf(l.qty()), "cost", l.cost() == null ? "" : Money.of(l.cost()).format(), "amount",
                l.amount() == null ? "" : Money.of(l.amount()).format());
    }
}
