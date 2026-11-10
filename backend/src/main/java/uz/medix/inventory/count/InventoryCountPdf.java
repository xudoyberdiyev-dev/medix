package uz.medix.inventory.count;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.inventory.count.InventoryCountModels.InventoryCountDetail;
import uz.medix.inventory.count.InventoryCountModels.InventoryCountLine;
import uz.medix.inventory.count.InventoryCountModels.Status;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.security.Actor;

/**
 * IN — sanoq varag'i (sanoqda: «Sanaldi» ustuni qo'lda to'ldirish uchun) va inventarizatsiya qaydnomasi (tekshiruv / tasdiqdan keyin:
 * farqlar). Server PDF (Thymeleaf → OpenHTMLtoPDF). Tannarx — faqat prices.cost; ko'r sanoqda hisob qoldig'i chiqarilmaydi.
 */
@Service
class InventoryCountPdf {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    static final Map<Status, String> STATUS = Map.of(Status.DRAFT, "Qoralama", Status.COUNTING, "Sanoq", Status.CHECK, "Tekshirish",
            Status.POSTED, "Tasdiqlangan", Status.CANCELLED, "Bekor qilingan");

    private final InventoryCounts counts;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;

    InventoryCountPdf(InventoryCounts counts, PdfRenderer pdf, JdbcClient jdbc) {
        this.counts = counts;
        this.pdf = pdf;
        this.jdbc = jdbc;
    }

    record Rendered(String number, byte[] body) {}

    @Transactional(readOnly = true)
    Rendered render(Actor actor, long id, boolean withCost, boolean canSeeBook) {
        InventoryCountDetail found = counts.find(id, actor).orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (found.status() == Status.DRAFT) {
            throw MedixException.conflict("inventory.wrongStatus", found.status().name());
        }
        boolean sheet = found.status() == Status.COUNTING;
        boolean hideBook = found.blind() && sheet && !canSeeBook;
        InventoryCountDetail d = found.restricted(withCost, hideBook);
        Map<String, Object> branch = jdbc.sql("SELECT name, legal_name FROM branch WHERE id = :b").param("b", d.branchId()).query().singleRow();
        List<Map<String, Object>> rows = d.lines().stream().map(l -> row(l, sheet)).toList();
        Map<String, Object> doc = new HashMap<>();
        doc.put("number", d.number());
        doc.put("warehouse", d.warehouse());
        doc.put("zone", (d.zones().isEmpty() ? "butun ombor" : String.join(", ", d.zones().stream().map(z -> z.name()).toList()))
                + (d.products().isEmpty() ? "" : " · " + d.products().size() + " ta mahsulot"));
        doc.put("createdBy", d.createdBy());
        doc.put("postedBy", d.postedBy());
        doc.put("note", d.note());
        doc.put("commission", d.commission());
        Map<String, Object> vars = new HashMap<>();
        vars.put("doc", doc);
        vars.put("lines", rows);
        vars.put("sheet", sheet);
        vars.put("showBook", !hideBook);
        vars.put("withCost", withCost && !sheet);
        vars.put("status", STATUS.get(d.status()));
        vars.put("title", sheet ? "Sanoq varagʻi" : "Inventarizatsiya qaydnomasi");
        vars.put("date", LocalDate.ofInstant(d.postedAt() != null ? d.postedAt() : d.startedAt() != null ? d.startedAt() : d.createdAt(), TASHKENT)
                .format(DATE));
        vars.put("shortageQty", String.valueOf(d.shortageQty()));
        vars.put("surplusQty", String.valueOf(d.surplusQty()));
        vars.put("shortageCost", d.shortageCost() == null ? "" : Money.of(d.shortageCost()).format());
        vars.put("surplusCost", d.surplusCost() == null ? "" : Money.of(d.surplusCost()).format());
        vars.put("branchName", branch.get("name"));
        vars.put("legalName", branch.get("legal_name"));
        return new Rendered(d.number(), pdf.render("inventory-count", vars));
    }

    private static Map<String, Object> row(InventoryCountLine l, boolean sheet) {
        Map<String, Object> m = new HashMap<>();
        m.put("zone", l.zone().name());
        m.put("code", l.productCode());
        m.put("name", l.productName());
        m.put("batch", l.batchNumber());
        m.put("expiry", l.expiryDate().format(DATE));
        m.put("book", l.bookQty() == null ? "" : String.valueOf(l.bookQty()));
        // Sanoq varag'ida «Sanaldi» bo'sh — qo'lda yoziladi
        m.put("counted", sheet || l.countedQty() == null ? "" : String.valueOf(l.countedQty()));
        m.put("diff", sheet || l.diff() == null || l.diff() == 0 ? "" : (l.diff() > 0 ? "+" : "") + l.diff());
        m.put("amount", sheet || l.diffAmount() == null || l.diff() == null || l.diff() == 0 ? "" : Money.of(l.diffAmount()).format());
        return m;
    }
}
