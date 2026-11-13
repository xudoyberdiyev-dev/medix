package uz.medix.reporting.workers;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** O10f «Buxgalter natijasi»: faktura navbati bo'yicha (ko'radi — `invoices.view`), .xlsx eksport. */
@RestController
@Tag(name = "reports", description = "Hisobotlar")
class AccountantReportController {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private final AccountantReport report;
    private final CurrentActor currentActor;

    AccountantReportController(AccountantReport report, CurrentActor currentActor) {
        this.report = report;
        this.currentActor = currentActor;
    }

    private AccountantReport.AccountantReportView build(Long branchId, LocalDate from, LocalDate to) {
        Actor actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        return report.report(actor, branchId, from, to);
    }

    @GetMapping("/api/reports/accountants")
    @PreAuthorize("hasAuthority('invoices.view')")
    @Operation(summary = "Buxgalter natijasi", description = "Yuborilgan fakturalar, o'rtacha vaqt «Yuklanmoqda → Yuborildi», 1 kundan kechikkanlar; "
            + "hozir navbatda. Davr — yuborilgan sana (standart: oy boshidan bugungacha).")
    AccountantReport.AccountantReportView accountants(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return build(branchId, from, to);
    }

    @GetMapping("/api/reports/accountants/export")
    @PreAuthorize("hasAuthority('invoices.view')")
    @Operation(summary = "Buxgalter natijasi .xlsx")
    void export(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to, HttpServletResponse response)
            throws IOException {
        AccountantReport.AccountantReportView r = build(branchId, from, to);
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"buxgalter-natijasi-" + r.from() + "-" + r.to() + ".xlsx\"");
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Buxgalterlar");
            CellStyle bold = wb.createCellStyle();
            Font font = wb.createFont();
            font.setBold(true);
            bold.setFont(font);
            sheet.createRow(0).createCell(0).setCellValue("Buxgalter natijasi: " + DATE.format(r.from()) + " – " + DATE.format(r.to())
                    + " · hozir navbatda: " + r.queue() + " (1 kundan koʻp: " + r.queueLate() + ")");
            List<String> titles = List.of("Buxgalter", "Yuborilgan fakturalar", "Oʻrtacha vaqt, daq", "1 kundan kechikkan");
            Row h = sheet.createRow(2);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(bold);
            }
            int n = 3;
            for (AccountantReport.AccountantRow row : r.rows()) {
                write(sheet.createRow(n++), row, null);
            }
            write(sheet.createRow(n), r.total(), bold);
            sheet.setColumnWidth(0, 36 * 256);
            for (int i = 1; i < titles.size(); i++) {
                sheet.setColumnWidth(i, 20 * 256);
            }
            sheet.createFreezePane(0, 3);
            wb.write(response.getOutputStream());
        }
    }

    private static void write(Row x, AccountantReport.AccountantRow r, CellStyle style) {
        Cell name = x.createCell(0);
        name.setCellValue(r.name());
        if (style != null) {
            name.setCellStyle(style);
        }
        int[] values = {r.sent(), r.avgMinutes(), r.late()};
        for (int i = 0; i < values.length; i++) {
            Cell c = x.createCell(i + 1);
            c.setCellValue(values[i]);
            if (style != null) {
                c.setCellStyle(style);
            }
        }
    }
}
