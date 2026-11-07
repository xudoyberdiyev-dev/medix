package uz.medix.reporting.sales;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.LocalDate;
import java.util.ArrayList;
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

/** Mahsulotlar savdosi va yalpi foyda (SPEC 8): reports.all / reports.view — filial doirasida; faqat reports.own — o'z buyurtmalari. */
@RestController
@Tag(name = "reports", description = "Hisobotlar")
class ProductSalesReportController {

    private final ProductSalesReport report;
    private final CurrentActor currentActor;

    ProductSalesReportController(ProductSalesReport report, CurrentActor currentActor) {
        this.report = report;
        this.currentActor = currentActor;
    }

    private static boolean has(Authentication auth, String key) {
        return auth.getAuthorities().stream().anyMatch(a -> key.equals(a.getAuthority()));
    }

    private ProductSalesReport.ProductSalesView build(Long branchId, LocalDate from, LocalDate to, ProductSalesReport.GroupBy groupBy,
            Long customerId, Authentication auth) {
        Actor actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        boolean full = has(auth, "reports.all") || has(auth, "reports.view");
        return report.report(actor, branchId, from, to, groupBy, customerId, full, has(auth, "prices.cost"));
    }

    @GetMapping("/api/reports/product-sales")
    @PreAuthorize("hasAnyAuthority('reports.all', 'reports.view', 'reports.own')")
    @Operation(summary = "Mahsulotlar savdosi: dona va sof savdo mahsulot / kategoriya / ishlab chiqaruvchi bo'yicha; tannarx, yalpi foyda va "
            + "rentabellik — prices.cost")
    ProductSalesReport.ProductSalesView productSales(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) ProductSalesReport.GroupBy groupBy, @RequestParam(required = false) Long customerId,
            Authentication auth) {
        return build(branchId, from, to, groupBy, customerId, auth);
    }

    @GetMapping("/api/reports/product-sales/export")
    @PreAuthorize("hasAnyAuthority('reports.all', 'reports.view', 'reports.own')")
    @Operation(summary = "Mahsulotlar savdosi .xlsx")
    void productSalesExport(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) ProductSalesReport.GroupBy groupBy, @RequestParam(required = false) Long customerId,
            Authentication auth, HttpServletResponse response) throws IOException {
        ProductSalesReport.ProductSalesView r = build(branchId, from, to, groupBy, customerId, auth);
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"mahsulotlar-savdosi-" + r.from() + "-" + r.to() + ".xlsx\"");
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Mahsulotlar");
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
                case PRODUCT -> "Mahsulot";
                case CATEGORY -> "Kategoriya";
                case MANUFACTURER -> "Ishlab chiqaruvchi";
            };
            List<String> titles = new ArrayList<>(List.of(first, "Kod", "Sotildi, dona", "Qaytdi, dona", "Sof, dona", "Sotuv", "Qaytarish",
                    "Sof savdo (QQS bilan)"));
            if (r.costVisible()) {
                titles.addAll(List.of("Tannarx", "Yalpi foyda (QQSsiz)", "Rentabellik, %"));
            }
            Row period = sheet.createRow(0);
            period.createCell(0).setCellValue("Mahsulotlar savdosi: " + format(r.from()) + " – " + format(r.to())
                    + (r.mineOnly() ? " · oʻz buyurtmalarim" : ""));
            Row h = sheet.createRow(2);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(bold);
            }
            int n = 3;
            for (ProductSalesReport.ProductSalesRow row : r.rows()) {
                write(sheet.createRow(n++), row, r.costVisible(), null, right);
            }
            write(sheet.createRow(n), r.total(), r.costVisible(), bold, boldRight);
            int[] widths = {44, 12, 14, 14, 12, 18, 18, 22, 18, 20, 14};
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
    private static void write(Row x, ProductSalesReport.ProductSalesRow r, boolean cost, CellStyle text, CellStyle money) {
        Cell name = x.createCell(0);
        name.setCellValue(r.name().isEmpty() ? "—" : r.name());
        if (text != null) {
            name.setCellStyle(text);
        }
        x.createCell(1).setCellValue(r.code() == null ? "" : r.code());
        x.createCell(2).setCellValue(r.qtySold());
        x.createCell(3).setCellValue(r.qtyReturned());
        x.createCell(4).setCellValue(r.qtyNet());
        List<String> values = new ArrayList<>(List.of(r.sales(), r.returns(), r.net()));
        if (cost) {
            values.add(r.cost());
            values.add(r.profit());
        }
        for (int i = 0; i < values.size(); i++) {
            Cell c = x.createCell(5 + i);
            c.setCellValue(Money.of(values.get(i)).format());
            c.setCellStyle(money);
        }
        if (cost) {
            Cell c = x.createCell(5 + values.size());
            c.setCellValue(r.margin() == null ? "—" : r.margin().replace('.', ','));
            c.setCellStyle(money);
        }
    }
}
