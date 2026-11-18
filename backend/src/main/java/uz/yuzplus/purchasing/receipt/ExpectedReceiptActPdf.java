package uz.yuzplus.purchasing.receipt;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.yuzplus.purchasing.receipt.ExpectedReceiptModels.ExpectedReceiptDetail;
import uz.yuzplus.purchasing.receipt.ExpectedReceiptModels.ExpectedReceiptLine;
import uz.yuzplus.shared.error.YuzplusException;
import uz.yuzplus.shared.money.Money;
import uz.yuzplus.shared.pdf.PdfRenderer;
import uz.yuzplus.shared.security.Actor;

/**
 * KK «Farq dalolatnomasi» (O15) — yetkazib beruvchiga yuborish uchun: har qator bo'yicha yuk xatida, keldi (yaroqli),
 * shikastlangan, kam / ortiqcha, hisobdan chiqarilgan va hali kutilayotgan soni; narx va farq summasi — faqat narx ko'rish huquqi bilan.
 */
@Service
class ExpectedReceiptActPdf {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final ExpectedReceipts kk;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;

    ExpectedReceiptActPdf(ExpectedReceipts kk, PdfRenderer pdf, JdbcClient jdbc) {
        this.kk = kk;
        this.pdf = pdf;
        this.jdbc = jdbc;
    }

    record Rendered(String number, byte[] body) {}

    @Transactional(readOnly = true)
    Rendered render(Actor actor, long id, boolean prices) {
        ExpectedReceiptDetail d = kk.find(id, actor, prices).orElseThrow(() -> YuzplusException.notFound("error.notFound"));
        Map<String, Object> branch = jdbc.sql("SELECT name, legal_name FROM branch WHERE id = :b").param("b", d.branchId()).query().singleRow();
        String tin = jdbc.sql("SELECT tin FROM counterparty WHERE id = :s").param("s", d.supplierId()).query(String.class).optional().orElse(null);
        record Arr(long lineId, long good, long damaged) {}
        Map<Long, Arr> arrived = new HashMap<>();
        jdbc.sql("""
                SELECT rl.expected_line_id AS line_id, sum(coalesce(rl.received_qty, 0)) AS good, sum(coalesce(rl.damaged_qty, 0)) AS damaged
                FROM receipt_line rl JOIN receipt r ON r.id = rl.receipt_id
                WHERE r.expected_receipt_id = :id AND r.status = 'POSTED' AND rl.expected_line_id IS NOT NULL
                GROUP BY rl.expected_line_id""")
                .param("id", id)
                .query(Arr.class)
                .list()
                .forEach(a -> arrived.put(a.lineId(), a));
        List<Map<String, Object>> rows = new ArrayList<>();
        Money diffTotal = Money.ZERO;
        boolean anyDiff = false;
        for (ExpectedReceiptLine l : d.lines()) {
            Arr a = arrived.getOrDefault(l.id(), new Arr(l.id(), 0, 0));
            long arrivedQty = a.good() + a.damaged();
            long shortQty = l.writtenOffQty();
            long excess = Math.max(0, arrivedQty - l.qty());
            boolean diff = shortQty > 0 || excess > 0 || a.damaged() > 0;
            anyDiff |= diff;
            Money amount = Money.ZERO;
            if (l.price() != null) {
                amount = Money.of(l.price()).times(excess - shortQty - a.damaged());
                diffTotal = diffTotal.plus(amount);
            }
            Map<String, Object> r = new HashMap<>();
            r.put("code", l.productCode());
            r.put("name", l.productName());
            r.put("expected", String.valueOf(l.qty()));
            r.put("good", String.valueOf(a.good()));
            r.put("damaged", a.damaged() > 0 ? String.valueOf(a.damaged()) : "—");
            r.put("short", shortQty > 0 ? String.valueOf(shortQty) : "—");
            r.put("excess", excess > 0 ? String.valueOf(excess) : "—");
            r.put("remaining", l.remainingQty() > 0 ? String.valueOf(l.remainingQty()) : "—");
            r.put("price", l.price() == null ? "" : Money.of(l.price()).format());
            r.put("amount", l.price() == null || amount.isZero() ? "—" : amount.format());
            r.put("diff", diff);
            rows.add(r);
        }
        Map<String, Object> doc = new HashMap<>();
        doc.put("number", d.number());
        doc.put("supplier", d.supplier());
        doc.put("supplierTin", tin);
        doc.put("waybill", d.waybillNumber() + " · " + d.waybillDate().format(DATE));
        doc.put("invoice", d.invoiceNumber() == null ? null
                : d.invoiceNumber() + (d.invoiceDate() == null ? "" : " · " + d.invoiceDate().format(DATE)));
        doc.put("warehouse", d.warehouse());
        doc.put("receipts", String.join(", ", d.receipts().stream().filter(r -> "POSTED".equals(r.status()))
                .map(r -> r.number() + " (" + r.receiptDate().format(DATE) + ")").toList()));
        Map<String, Object> vars = new HashMap<>();
        vars.put("doc", doc);
        vars.put("lines", rows);
        vars.put("withAmount", prices);
        vars.put("anyDiff", anyDiff);
        vars.put("diffTotal", diffTotal.format());
        vars.put("date", LocalDate.now(TASHKENT).format(DATE));
        vars.put("branchName", branch.get("name"));
        vars.put("legalName", branch.get("legal_name"));
        return new Rendered(d.number(), pdf.render("expected-receipt-act", vars));
    }
}
