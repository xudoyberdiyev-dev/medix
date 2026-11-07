package uz.medix.reporting.sales;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.LocalDate;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** Qaytarishlar hisoboti (QM, SPEC 8): reports.all / reports.view — filial doirasida; faqat reports.own — o'z buyurtmalari. */
@RestController
@Tag(name = "reports", description = "Hisobotlar")
class ReturnsReportController {

    private final ReturnsReport report;
    private final CurrentActor currentActor;

    ReturnsReportController(ReturnsReport report, CurrentActor currentActor) {
        this.report = report;
        this.currentActor = currentActor;
    }

    private static boolean has(Authentication auth, String key) {
        return auth.getAuthorities().stream().anyMatch(a -> key.equals(a.getAuthority()));
    }

    private ReturnsReport.ReturnsView build(Long branchId, LocalDate from, LocalDate to, ReturnsReport.GroupBy groupBy, Long customerId,
            Long productId, Authentication auth) {
        Actor actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        boolean full = has(auth, "reports.all") || has(auth, "reports.view");
        return report.report(actor, branchId, from, to, groupBy, customerId, productId, full);
    }

    @GetMapping("/api/reports/returns")
    @PreAuthorize("hasAnyAuthority('reports.all', 'reports.view', 'reports.own')")
    @Operation(summary = "Qaytarishlar (QM): sabab / mijoz / mahsulot / kun bo'yicha hujjatlar, dona, summa va qaytarish ulushi")
    ReturnsReport.ReturnsView returns(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) ReturnsReport.GroupBy groupBy, @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) Long productId, Authentication auth) {
        return build(branchId, from, to, groupBy, customerId, productId, auth);
    }

    @GetMapping("/api/reports/returns/export")
    @PreAuthorize("hasAnyAuthority('reports.all', 'reports.view', 'reports.own')")
    @Operation(summary = "Qaytarishlar .xlsx")
    void returnsExport(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) ReturnsReport.GroupBy groupBy, @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) Long productId, Authentication auth, HttpServletResponse response) throws IOException {
        ReturnsReport.ReturnsView r = build(branchId, from, to, groupBy, customerId, productId, auth);
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"qaytarishlar-" + r.from() + "-" + r.to() + ".xlsx\"");
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Qaytarishlar");
            CellStyle bold = wb.createCellStyle();
            Font font = wb.createFont();
            font.setBold(true);
            bold.setFont(font);
            CellStyle right = wb.createCellStyle();
            right.setAlignment(HorizontalAlignment.RIGHT);
            CellStyle boldRight = wb.createCellStyle();
            boldRight.setFont(font);
            boldRight.setAlignment(HorizontalAlignment.RIGHT);

            String first = switch (r.groupBy()) {
                case REASON -> "Sabab";
                case CUSTOMER -> "Mijoz";
                case PRODUCT -> "Mahsulot";
                case DAY -> "Kun";
            };
            String code = r.groupBy() == ReturnsReport.GroupBy.CUSTOMER ? "STIR" : "Kod";
            List<String> titles = List.of(first, code, "QM hujjatlari", "Qaytdi, dona", "Qaytarish (QQS bilan)", "Sotuv (QQS bilan)",
                    "Qaytarish ulushi, %");
            Row period = sheet.createRow(0);
            period.createCell(0).setCellValue("Qaytarishlar: " + format(r.from()) + " – " + format(r.to())
                    + (r.mineOnly() ? " · oʻz buyurtmalarim" : ""));
            Row h = sheet.createRow(2);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(bold);
            }
            int n = 3;
            for (ReturnsReport.ReturnsRow row : r.rows()) {
                write(sheet.createRow(n++), row, null, right);
            }
            write(sheet.createRow(n), r.total(), bold, boldRight);
            int[] widths = {44, 14, 14, 14, 22, 22, 18};
            for (int i = 0; i < titles.size(); i++) {
                sheet.setColumnWidth(i, widths[i] * 256);
            }
            sheet.createFreezePane(0, 3);
            wb.write(response.getOutputStream());
        }
    }

    private static String format(LocalDate d) {
        return "%02d.%02d.%d".formatted(d.getDayOfMonth(), d.getMonthValue(), d.getYear());
    }

    /** Pul matn sifatida (1.250.000,00): float/double ishlatilmaydi (CLAUDE.md). */
    private static void write(Row x, ReturnsReport.ReturnsRow r, CellStyle text, CellStyle money) {
        Cell name = x.createCell(0);
        name.setCellValue(r.name().isEmpty() ? "—" : r.name());
        if (text != null) {
            name.setCellStyle(text);
        }
        x.createCell(1).setCellValue(r.code() == null ? "" : r.code());
        x.createCell(2).setCellValue(r.documents());
        x.createCell(3).setCellValue(r.qty());
        Cell a = x.createCell(4);
        a.setCellValue(Money.of(r.amount()).format());
        a.setCellStyle(money);
        Cell s = x.createCell(5);
        s.setCellValue(r.sales() == null ? "—" : Money.of(r.sales()).format());
        s.setCellStyle(money);
        Cell rate = x.createCell(6);
        rate.setCellValue(r.rate() == null ? "—" : r.rate().replace('.', ','));
        rate.setCellStyle(money);
    }
}
