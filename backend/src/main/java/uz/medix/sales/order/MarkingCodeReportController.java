package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.LocalDate;
import java.time.ZoneId;
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
import uz.medix.sales.order.MarkingCodeReport.CodeFilter;
import uz.medix.sales.order.MarkingCodeReport.ReportCode;
import uz.medix.sales.order.MarkingCodeReport.ReportCodePage;
import uz.medix.sales.order.MarkingModels.MarkStatus;
import uz.medix.sales.order.OrderModels.CodesOwner;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.gs1.Gs1Code;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** O10g «Markirovka kodlari» hisoboti (Hisobotlar): ro'yxat va .xlsx. */
@RestController
@Tag(name = "reports", description = "Hisobotlar")
class MarkingCodeReportController {

    static final int MAX_EXPORT_ROWS = 50_000;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm").withZone(ZoneId.of("Asia/Tashkent"));

    private final MarkingCodeReport report;
    private final CurrentActor currentActor;

    MarkingCodeReportController(MarkingCodeReport report, CurrentActor currentActor) {
        this.report = report;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping("/api/reports/marking-codes")
    @PreAuthorize("hasAnyAuthority('marking.view', 'zcodes.view', 'invoices.view')")
    @Operation(summary = "Markirovka kodlari hisoboti", description = "Davr — skanerlangan sana (standart: oy boshidan bugungacha); mijoz, mahsulot, "
            + "egasi (mijoz / zaxira), holat, qidiruv. Olib tashlangan kodlar — faqat status=REMOVED bilan.")
    ReportCodePage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) Long productId,
            @RequestParam(required = false) CodesOwner owner,
            @RequestParam(required = false) MarkStatus status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return report.report(actor(), new CodeFilter(branchId, from, to, customerId, productId, owner, status, q), Math.max(page, 0),
                Math.clamp(size, 1, 200));
    }

    @GetMapping("/api/reports/marking-codes/export")
    @PreAuthorize("hasAnyAuthority('marking.view', 'zcodes.view', 'invoices.view')")
    @Operation(summary = "Markirovka kodlari hisoboti .xlsx")
    void export(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) Long productId,
            @RequestParam(required = false) CodesOwner owner,
            @RequestParam(required = false) MarkStatus status,
            @RequestParam(required = false) String q,
            HttpServletResponse response) throws IOException {
        ReportCodePage data = report.report(actor(), new CodeFilter(branchId, from, to, customerId, productId, owner, status, q), 0,
                MAX_EXPORT_ROWS);
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"markirovka-kodlari-" + data.from() + "-" + data.to() + ".xlsx\"");
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Markirovka kodlari");
            CellStyle header = wb.createCellStyle();
            Font font = wb.createFont();
            font.setBold(true);
            header.setFont(font);
            sheet.createRow(0).createCell(0).setCellValue("Markirovka kodlari: " + DATE.format(data.from()) + " – " + DATE.format(data.to())
                    + " · jami " + data.total());
            List<String> titles = List.of("Toʻliq kod (GS = <GS>)", "GTIN", "Seriya", "Mahsulot", "Partiya", "Yaroqlilik", "Q/D", "Buyurtma",
                    "Mijoz", "Filial", "Egasi", "Holat", "Zaxira holati", "Skanerlangan");
            Row h = sheet.createRow(2);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(header);
            }
            int r = 3;
            for (ReportCode z : data.items()) {
                Row row = sheet.createRow(r++);
                int i = 0;
                row.createCell(i++).setCellValue(Gs1Code.visibleGs(z.scanned()));
                row.createCell(i++).setCellValue(z.gtin());
                row.createCell(i++).setCellValue(z.serial());
                row.createCell(i++).setCellValue(z.productName());
                row.createCell(i++).setCellValue(z.batch() == null ? "" : z.batch());
                row.createCell(i++).setCellValue(z.expiryDate() == null ? "" : DATE.format(z.expiryDate()));
                row.createCell(i++).setCellValue(z.kind() == MarkingModels.MarkKind.BOX ? "Q" : "D");
                row.createCell(i++).setCellValue(z.orderNumber());
                row.createCell(i++).setCellValue(z.customer());
                row.createCell(i++).setCellValue(z.branch());
                row.createCell(i++).setCellValue(z.owner() == CodesOwner.CUSTOMER ? "Mijoz nomiga" : "Zaxira kodlarga");
                row.createCell(i++).setCellValue(switch (z.status()) {
                    case ACTIVE -> "Buyurtmada";
                    case REMOVED -> "Olib tashlangan";
                    case RELEASED -> "Boʻshatilgan";
                    case SOLD -> "Sotilgan";
                    case RETURNED -> "Qaytarilgan";
                });
                row.createCell(i++).setCellValue(z.reserveStatus() == null ? "" : switch (z.reserveStatus()) {
                    case IN_RESERVE -> "Zaxirada";
                    case USED -> "Ishlatildi";
                    case WRITTEN_OFF -> "Hisobdan chiqarildi";
                });
                row.createCell(i).setCellValue(TIME.format(z.scannedAt()));
            }
            int[] widths = {70, 16, 20, 40, 14, 12, 5, 16, 30, 16, 16, 16, 18, 18};
            for (int i = 0; i < titles.size(); i++) {
                sheet.setColumnWidth(i, widths[i] * 256);
            }
            sheet.createFreezePane(0, 3);
            wb.write(response.getOutputStream());
        }
    }
}
