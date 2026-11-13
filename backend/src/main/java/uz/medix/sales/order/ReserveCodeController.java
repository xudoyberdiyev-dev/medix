package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.sales.order.ReserveCodeModels.ReserveCloseRequest;
import uz.medix.sales.order.ReserveCodeModels.ReserveCode;
import uz.medix.sales.order.ReserveCodeModels.ReserveCodeFilter;
import uz.medix.sales.order.ReserveCodeModels.ReserveCodePage;
import uz.medix.sales.order.ReserveCodeModels.ReserveStatus;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.gs1.Gs1Code;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** O10c «Zaxira kodlar» (Ombor guruhi): ro'yxat, Excel, «Ishlatildi» / «Hisobdan chiqarish». */
@RestController
@RequestMapping("/api/reserve-codes")
@Tag(name = "reserve-codes", description = "Zaxira markirovka kodlari")
class ReserveCodeController {

    static final int MAX_EXPORT_ROWS = 20_000;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm").withZone(ZoneId.of("Asia/Tashkent"));

    private final ReserveCodes codes;
    private final CurrentActor currentActor;

    ReserveCodeController(ReserveCodes codes, CurrentActor currentActor) {
        this.codes = codes;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('zcodes.view')")
    @Operation(summary = "Zaxira kodlar", description = "Filtrlar: filial (barcha filiallar doirasida), mahsulot, holat, davr (zaxiraga tushgan sana), qidiruv.")
    ReserveCodePage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long productId,
            @RequestParam(required = false) ReserveStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return codes.list(actor(), new ReserveCodeFilter(branchId, productId, status, from, to, q), Math.max(page, 0), Math.clamp(size, 1, 200));
    }

    @PostMapping("/{id}/use")
    @PreAuthorize("hasAuthority('zcodes.edit')")
    @Operation(summary = "Ishlatildi deb belgilash")
    void use(@PathVariable long id, @Valid @RequestBody ReserveCloseRequest r) {
        codes.close(actor(), id, ReserveStatus.USED, r.note());
    }

    @PostMapping("/{id}/write-off")
    @PreAuthorize("hasAuthority('zcodes.edit')")
    @Operation(summary = "Hisobdan chiqarish")
    void writeOff(@PathVariable long id, @Valid @RequestBody ReserveCloseRequest r) {
        codes.close(actor(), id, ReserveStatus.WRITTEN_OFF, r.note());
    }

    @GetMapping("/export")
    @PreAuthorize("hasAuthority('zcodes.view')")
    @Operation(summary = "Zaxira kodlar .xlsx")
    void export(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long productId,
            @RequestParam(required = false) ReserveStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String q,
            HttpServletResponse response) throws IOException {
        ReserveCodePage data = codes.list(actor(), new ReserveCodeFilter(branchId, productId, status, from, to, q), 0, MAX_EXPORT_ROWS);
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"zaxira-kodlar.xlsx\"");
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Zaxira kodlar");
            CellStyle header = wb.createCellStyle();
            Font font = wb.createFont();
            font.setBold(true);
            header.setFont(font);
            List<String> titles = List.of("Toʻliq kod (GS = <GS>)", "GTIN", "Seriya", "Mahsulot", "Partiya", "Yaroqlilik", "Q/D", "Buyurtma",
                    "Mijoz", "Filial", "Zaxiraga tushgan", "Holat", "Oʻzgartirdi", "Izoh");
            Row h = sheet.createRow(0);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(header);
            }
            int r = 1;
            for (ReserveCode z : data.items()) {
                Row row = sheet.createRow(r++);
                int i = 0;
                row.createCell(i++).setCellValue(Gs1Code.visibleGs(z.scanned()));
                row.createCell(i++).setCellValue(z.gtin());
                row.createCell(i++).setCellValue(z.serial());
                row.createCell(i++).setCellValue(z.productName());
                row.createCell(i++).setCellValue(z.batch());
                row.createCell(i++).setCellValue(z.expiryDate() == null ? "" : DATE.format(z.expiryDate()));
                row.createCell(i++).setCellValue(z.kind() == MarkingModels.MarkKind.BOX ? "Q" : "D");
                row.createCell(i++).setCellValue(z.orderNumber());
                row.createCell(i++).setCellValue(z.customer());
                row.createCell(i++).setCellValue(z.branch());
                row.createCell(i++).setCellValue(TIME.format(z.createdAt()));
                row.createCell(i++).setCellValue(switch (z.status()) {
                    case IN_RESERVE -> "Zaxirada";
                    case USED -> "Ishlatildi";
                    case WRITTEN_OFF -> "Hisobdan chiqarildi";
                });
                row.createCell(i++).setCellValue(z.changedBy() == null ? "" : z.changedBy());
                row.createCell(i).setCellValue(z.note() == null ? "" : z.note());
            }
            int[] widths = {70, 16, 20, 40, 14, 12, 5, 16, 30, 16, 18, 18, 24, 30};
            for (int i = 0; i < titles.size(); i++) {
                sheet.setColumnWidth(i, widths[i] * 256);
            }
            sheet.createFreezePane(0, 1);
            wb.write(response.getOutputStream());
        }
    }
}
