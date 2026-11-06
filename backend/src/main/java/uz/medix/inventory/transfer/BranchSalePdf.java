package uz.medix.inventory.transfer;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.inventory.transfer.BranchSaleModels.BranchSaleDetail;
import uz.medix.inventory.transfer.BranchSaleModels.BranchSaleLine;
import uz.medix.inventory.transfer.WarehouseTransferModels.Status;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.security.Actor;

/** FS hujjati va hisob-faktura — server PDF. Narx, summa va QQS ustunlari faqat special.cost bilan. */
@Service
class BranchSalePdf {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    private static final Map<Status, String> STATUS = Map.of(Status.DRAFT, "Qoralama", Status.IN_TRANSIT, "Yoʻlda", Status.RECEIVED,
            "Qabul qilindi", Status.CANCELLED, "Bekor qilindi");

    private final BranchSales sales;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;

    BranchSalePdf(BranchSales sales, PdfRenderer pdf, JdbcClient jdbc) {
        this.sales = sales;
        this.pdf = pdf;
        this.jdbc = jdbc;
    }

    record Rendered(String number, byte[] body) {}

    @Transactional(readOnly = true)
    Rendered render(Actor actor, long id, boolean withAmount) {
        BranchSaleDetail d = sales.find(id, actor, withAmount).orElseThrow(() -> MedixException.notFound("error.notFound"));
        Map<String, Object> doc = new HashMap<>();
        doc.put("number", d.number());
        doc.put("invoiceNumber", d.invoiceNumber());
        doc.put("from", d.fromWarehouse().name() + " · " + d.fromZone().name());
        doc.put("to", d.toWarehouse().name() + (d.toZone() == null ? "" : " · " + d.toZone().name()));
        doc.put("createdBy", d.createdBy());
        doc.put("sentBy", d.sentBy());
        doc.put("receivedBy", d.receivedBy());
        doc.put("note", d.note());
        Map<String, Object> vars = new HashMap<>();
        vars.put("doc", doc);
        vars.put("seller", branch(d.seller().id()));
        vars.put("buyer", branch(d.buyer().id()));
        vars.put("lines", d.lines().stream().map(BranchSalePdf::row).toList());
        vars.put("withAmount", withAmount);
        vars.put("status", STATUS.get(d.status()));
        Instant at = d.sentAt() != null ? d.sentAt() : d.createdAt();
        vars.put("date", LocalDate.ofInstant(at, TASHKENT).format(DATE));
        vars.put("totalQty", String.valueOf(d.totalQty()));
        vars.put("total", d.total() == null ? "" : Money.of(d.total()).format());
        vars.put("vatTotal", d.vatTotal() == null ? "" : Money.of(d.vatTotal()).format());
        return new Rendered(d.number(), pdf.render("branch-sale", vars));
    }

    private Map<String, Object> branch(long id) {
        Map<String, Object> row = jdbc.sql("SELECT name, legal_name, tin FROM branch WHERE id = :b").param("b", id).query().singleRow();
        Map<String, Object> out = new HashMap<>();
        out.put("name", row.get("name"));
        out.put("legal", row.get("legal_name"));
        out.put("tin", row.get("tin"));
        return out;
    }

    private static Map<String, Object> row(BranchSaleLine l) {
        return Map.of("code", l.productCode(), "name", l.productName(), "batch", l.batchNumber(), "expiry", l.expiryDate().format(DATE),
                "qty", String.valueOf(l.qty()), "price", l.unitCost() == null ? "" : Money.of(l.unitCost()).format(),
                "amount", l.amount() == null ? "" : Money.of(l.amount()).format(),
                "vat", l.vatAmount() == null ? "" : Money.of(l.vatAmount()).format());
    }
}
