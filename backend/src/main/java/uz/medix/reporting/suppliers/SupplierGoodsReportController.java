package uz.medix.reporting.suppliers;

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
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** Ta'minotchi xodim / korxona tovari: tannarxda, shuning uchun reports.all yoki reports.view VA prices.cost. .xlsx eksport. */
@RestController
@Tag(name = "reports", description = "Hisobotlar")
class SupplierGoodsReportController {

    private static final String ACCESS = "hasAnyAuthority('reports.all', 'reports.view') and hasAuthority('prices.cost')";

    private final SupplierGoodsReport report;
    private final CurrentActor currentActor;

    SupplierGoodsReportController(SupplierGoodsReport report, CurrentActor currentActor) {
        this.report = report;
        this.currentActor = currentActor;
    }

    private SupplierGoodsReport.SupplierGoodsView build(SupplierGoodsReport.Kind kind, Long branchId, LocalDate from, LocalDate to) {
        Actor actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        return report.report(actor, kind, branchId, from, to);
    }

    @GetMapping("/api/reports/supplier-goods")
    @PreAuthorize(ACCESS)
    @Operation(summary = "Ta'minotchi xodim (STAFF — «Kim nomiga») yoki korxona (COMPANY) tovari, tannarxda: olib keldi, sotildi, boshqa, qoldi; Aktiv / Passiv")
    SupplierGoodsReport.SupplierGoodsView supplierGoods(@RequestParam SupplierGoodsReport.Kind kind,
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return build(kind, branchId, from, to);
    }

    @GetMapping("/api/reports/supplier-goods/export")
    @PreAuthorize(ACCESS)
    @Operation(summary = "Ta'minotchi xodim / korxona tovari .xlsx")
    void supplierGoodsExport(@RequestParam SupplierGoodsReport.Kind kind, @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to, HttpServletResponse response)
            throws IOException {
        SupplierGoodsReport.SupplierGoodsView r = build(kind, branchId, from, to);
        boolean staff = kind == SupplierGoodsReport.Kind.STAFF;
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"taminotchi-" + (staff ? "xodim" : "korxona") + "-tovari-"
                + r.from() + "-" + r.to() + ".xlsx\"");
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet(staff ? "Taʼminotchi xodim" : "Taʼminotchi korxona");
            CellStyle bold = wb.createCellStyle();
            Font font = wb.createFont();
            font.setBold(true);
            bold.setFont(font);
            CellStyle right = wb.createCellStyle();
            right.setAlignment(HorizontalAlignment.RIGHT);
            CellStyle boldRight = wb.createCellStyle();
            boldRight.setFont(font);
            boldRight.setAlignment(HorizontalAlignment.RIGHT);
            List<String> titles = List.of(staff ? "Xodim (kim nomiga)" : "Taʼminotchi", "Holat", "Olib keldi", "Sotildi", "Boshqa", "Qoldi");
            sheet.createRow(0).createCell(0).setCellValue((staff ? "Taʼminotchi xodim tovari" : "Taʼminotchi korxona tovari")
                    + " (tannarxda): " + format(r.from()) + " – " + format(r.to()));
            Row h = sheet.createRow(2);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(bold);
            }
            int n = 3;
            for (SupplierGoodsReport.SupplierGoodsRow row : r.rows()) {
                write(sheet.createRow(n++), row, row.active() ? "Aktiv" : "Passiv", null, right);
            }
            write(sheet.createRow(n), r.total(), "", bold, boldRight);
            int[] widths = {36, 10, 18, 18, 16, 18};
            for (int i = 0; i < widths.length; i++) {
                sheet.setColumnWidth(i, widths[i] * 256);
            }
            sheet.createFreezePane(0, 3);
            wb.write(response.getOutputStream());
        }
    }

    private static void write(Row x, SupplierGoodsReport.SupplierGoodsRow r, String state, CellStyle text, CellStyle money) {
        Cell name = x.createCell(0);
        name.setCellValue(r.name());
        if (text != null) {
            name.setCellStyle(text);
        }
        x.createCell(1).setCellValue(state);
        List<String> values = List.of(r.brought(), r.sold(), r.other(), r.left());
        for (int i = 0; i < values.size(); i++) {
            Cell c = x.createCell(2 + i);
            c.setCellValue(Money.of(values.get(i)).format());
            c.setCellStyle(money);
        }
    }

    private static String format(LocalDate d) {
        return "%02d.%02d.%d".formatted(d.getDayOfMonth(), d.getMonthValue(), d.getYear());
    }
}
