package uz.medix.reporting.expenses;

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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.CurrentActor;

/** Xarajatlar hisoboti (SPEC 8): reports.all / reports.view — filial doirasida. .xlsx eksport. */
@RestController
@Tag(name = "reports", description = "Hisobotlar")
class ExpenseReportController {

    private static final String ALLOWED = "hasAnyAuthority('reports.all', 'reports.view')";

    private final ExpenseReport report;
    private final CurrentActor currentActor;

    ExpenseReportController(ExpenseReport report, CurrentActor currentActor) {
        this.report = report;
        this.currentActor = currentActor;
    }

    private ExpenseReport.ExpenseReportView build(Long branchId, LocalDate from, LocalDate to, ExpenseReport.Direction direction,
            ExpenseReport.GroupBy groupBy) {
        return report.report(currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized")), branchId, from, to,
                direction, groupBy);
    }

    @GetMapping("/api/reports/expenses")
    @PreAuthorize(ALLOWED)
    @Operation(summary = "Xarajatlar hisoboti: o'tkazilgan KO/BO (chiqim yoki kirim) modda / filial / oy / kun bo'yicha; Naqd / Bank / Terminal")
    ExpenseReport.ExpenseReportView expenses(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) ExpenseReport.Direction direction, @RequestParam(required = false) ExpenseReport.GroupBy groupBy) {
        return build(branchId, from, to, direction, groupBy);
    }

    @GetMapping("/api/reports/expenses/export")
    @PreAuthorize(ALLOWED)
    @Operation(summary = "Xarajatlar hisoboti .xlsx")
    void expensesExport(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) ExpenseReport.Direction direction, @RequestParam(required = false) ExpenseReport.GroupBy groupBy,
            HttpServletResponse response) throws IOException {
        ExpenseReport.ExpenseReportView r = build(branchId, from, to, direction, groupBy);
        boolean out = r.direction() == ExpenseReport.Direction.OUT;
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition",
                "attachment; filename=\"" + (out ? "xarajatlar" : "kirimlar") + "-" + r.from() + "-" + r.to() + ".xlsx\"");
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet(out ? "Xarajatlar" : "Kirimlar");
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
                case ITEM -> "Modda";
                case BRANCH -> "Filial";
                case MONTH -> "Oy";
                case DAY -> "Sana";
            };
            List<String> titles = List.of(first, "Operatsiyalar", "Naqd", "Bank", "Terminal", "Jami");
            Row period = sheet.createRow(0);
            period.createCell(0).setCellValue((out ? "Xarajatlar: " : "Boshqa kirimlar: ") + format(r.from()) + " – " + format(r.to()));
            Row h = sheet.createRow(2);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(bold);
            }
            int n = 3;
            for (ExpenseReport.ExpenseRow row : r.rows()) {
                write(sheet.createRow(n++), row, null, right);
            }
            write(sheet.createRow(n), r.total(), bold, boldRight);
            int[] widths = {40, 14, 18, 18, 18, 20};
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
    private static void write(Row x, ExpenseReport.ExpenseRow r, CellStyle text, CellStyle money) {
        Cell name = x.createCell(0);
        name.setCellValue(r.name());
        if (text != null) {
            name.setCellStyle(text);
        }
        x.createCell(1).setCellValue(r.ops());
        List<String> values = List.of(r.cash(), r.transfer(), r.online(), r.total());
        for (int i = 0; i < values.size(); i++) {
            Cell c = x.createCell(2 + i);
            c.setCellValue(Money.of(values.get(i)).format());
            c.setCellStyle(money);
        }
    }
}
