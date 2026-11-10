package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.sales.order.MarkingModels.MarkCode;
import uz.medix.sales.order.MarkingModels.MarkCodePage;
import uz.medix.sales.order.MarkingModels.MarkKind;
import uz.medix.sales.order.MarkingModels.MarkQueueItem;
import uz.medix.sales.order.MarkingModels.MarkWork;
import uz.medix.sales.order.MarkingModels.ScanRequest;
import uz.medix.sales.order.MarkingModels.ScanResult;
import uz.medix.sales.order.OrderModels.OrderReasonRequest;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** Markirovkachi paneli (SPEC 5.4). Ruxsatlar (T12): skanerlash — marking.scan; kodlar jurnali — marking.view yoki orders.queue. */
@RestController
@RequestMapping("/api/marking")
@Tag(name = "marking", description = "Markirovka")
class MarkingController {

    /** Rad etilgan kod (skaner xatosi) kalitlari — «Xato urishlar» uchun. */
    static final java.util.Set<String> WRONG_SCAN = java.util.Set.of("marking.format", "marking.batchMismatch", "marking.duplicate",
            "marking.duplicateHere", "marking.lineFull", "marking.productMismatch", "marking.expiryInvalid", "marking.gtinInvalid");

    private final OrderMarking marking;
    private final MarkScanErrors scanErrors;
    private final CurrentActor currentActor;

    MarkingController(OrderMarking marking, MarkScanErrors scanErrors, CurrentActor currentActor) {
        this.marking = marking;
        this.scanErrors = scanErrors;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping("/queue")
    @PreAuthorize("hasAnyAuthority('marking.scan', 'orders.queue')")
    @Operation(summary = "Markirovka navbati", description = "«Markirovkada» buyurtmalar; boshlanganlari — markirovkachi nomi bilan («Band: …»).")
    List<MarkQueueItem> queue() {
        return marking.queue(actor());
    }

    @GetMapping("/mine")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Mening markirovkam", description = "Faol ish bo'lmasa — 204.")
    ResponseEntity<MarkWork> mine() {
        return marking.mine(actor()).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/orders/{id}")
    @PreAuthorize("hasAnyAuthority('marking.scan', 'marking.view', 'orders.queue')")
    @Operation(summary = "Buyurtma markirovkasi", description = "Qatorlar, partiyalar, hisoblagichlar va faol kodlar.")
    MarkWork get(@PathVariable long id) {
        return marking.get(actor(), id);
    }

    @PostMapping("/orders/{id}/start")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Markirovkani boshlash", description = "Bir markirovkachida bitta faol buyurtma.")
    MarkWork start(@PathVariable long id) {
        return marking.start(actor(), id);
    }

    @PostMapping("/orders/{id}/scan")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Kodni skanerlash",
            description = "Tekshiruv tartibi: format → takror (global) → mahsulot (GTIN) → partiya → tur (quti/dona) → qator to'lganmi.")
    ScanResult scan(@PathVariable long id, @Valid @RequestBody ScanRequest r) {
        Actor a = actor();
        try {
            return marking.scan(a, id, r.code());
        } catch (MedixException e) {
            // «Xato urishlar»: faqat kodning o'zi rad etilgani (format, takror, mahsulot, partiya, tur, ortiqcha); holat/ruxsat xatolari hisoblanmaydi
            if (WRONG_SCAN.contains(e.code()) || e.code().startsWith("marking.kind")) {
                scanErrors.record(id, a.employeeId(), e.code());
            }
            throw e;
        }
    }

    @PostMapping("/orders/{id}/codes/{markId}/remove")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Kodni olib tashlash", description = "Yakunlashdan oldin, sabab bilan.")
    MarkWork remove(@PathVariable long id, @PathVariable long markId, @Valid @RequestBody OrderReasonRequest r) {
        return marking.remove(actor(), id, markId, r.reason());
    }

    @PostMapping("/orders/{id}/confirm")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Markirovkasiz qatorlarni tasdiqlash",
            description = "E1: markirovkasiz qatorlar skanerlanmaydi — Markirovkachi «Tasdiqlash» bilan o'tkazadi (bittalab yoki hammasi).")
    MarkWork confirm(@PathVariable long id, @Valid @RequestBody MarkingModels.ConfirmRequest r) {
        return marking.confirm(actor(), id, r.lineIds());
    }

    @PostMapping("/orders/{id}/finish")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Markirovkani yakunlash", description = "Barcha kodlar skanerlangan va markirovkasiz qatorlar tasdiqlangan bo'lsa → «Hisobdan o'tkazilmoqda».")
    MarkWork finish(@PathVariable long id) {
        marking.finish(actor(), id);
        return marking.get(actor(), id);
    }

    @GetMapping("/codes")
    @PreAuthorize("hasAnyAuthority('marking.view', 'orders.queue')")
    @Operation(summary = "Kodlar jurnali")
    MarkCodePage codes(
            @RequestParam(required = false) Long orderId,
            @RequestParam(defaultValue = "false") boolean mine,
            @RequestParam(defaultValue = "false") boolean today,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return marking.codes(actor(), orderId, mine, today, q, Math.max(page, 0), Math.clamp(size, 1, 200));
    }

    static final int MAX_EXPORT_ROWS = 20_000;
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss").withZone(ZoneId.of("Asia/Tashkent"));

    /**
     * Kodlar .xlsx (SPEC 5.2 №7 «kodlar .xlsx»): jurnal filtrlari bilan, odatda bitta buyurtma (orderId) — mijozga / hisobotga.
     * O'z filiali; ko'pi bilan {@value #MAX_EXPORT_ROWS} qator.
     */
    @GetMapping("/codes/export")
    @PreAuthorize("hasAuthority('marking.export')")
    @Operation(summary = "Kodlar .xlsx")
    void exportCodes(
            @RequestParam(required = false) Long orderId,
            @RequestParam(defaultValue = "false") boolean mine,
            @RequestParam(defaultValue = "false") boolean today,
            @RequestParam(required = false) String q,
            HttpServletResponse response) throws IOException {
        MarkCodePage data = marking.codes(actor(), orderId, mine, today, q, 0, MAX_EXPORT_ROWS);
        String name = orderId != null && !data.items().isEmpty() ? "kodlar-" + data.items().getFirst().orderNumber() : "kodlar";
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + name.replaceAll("[^A-Za-z0-9-]", "") + ".xlsx\"");
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Kodlar");
            CellStyle header = wb.createCellStyle();
            Font font = wb.createFont();
            font.setBold(true);
            header.setFont(font);
            List<String> titles = List.of("Buyurtma", "Mahsulot", "Kod", "GTIN", "Seriya", "Partiya", "Tur", "Holat", "Skanerladi", "Vaqt", "Sabab");
            Row h = sheet.createRow(0);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(header);
            }
            int r = 1;
            for (MarkCode m : data.items()) {
                Row row = sheet.createRow(r++);
                int i = 0;
                row.createCell(i++).setCellValue(m.orderNumber());
                row.createCell(i++).setCellValue(m.productName());
                row.createCell(i++).setCellValue(m.code());
                row.createCell(i++).setCellValue(nz(m.gtin()));
                row.createCell(i++).setCellValue(nz(m.serial()));
                row.createCell(i++).setCellValue(nz(m.batch()));
                row.createCell(i++).setCellValue(m.kind() == MarkKind.BOX ? "Quti" : "Dona");
                row.createCell(i++).setCellValue(statusLabel(m.status()));
                row.createCell(i++).setCellValue(m.scannedBy());
                row.createCell(i++).setCellValue(TIME.format(m.scannedAt()));
                row.createCell(i).setCellValue(nz(m.closeReason()));
            }
            int[] widths = {16, 40, 60, 16, 20, 14, 7, 14, 24, 20, 30};
            for (int i = 0; i < titles.size(); i++) {
                sheet.setColumnWidth(i, widths[i] * 256);
            }
            sheet.createFreezePane(0, 1);
            wb.write(response.getOutputStream());
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String statusLabel(MarkingModels.MarkStatus s) {
        return switch (s) {
            case ACTIVE -> "Faol";
            case REMOVED -> "Olib tashlangan";
            case RELEASED -> "Boʻshatilgan";
            case SOLD -> "Sotilgan";
        };
    }
}
