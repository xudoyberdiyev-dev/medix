package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import uz.medix.sales.order.MarkingModels.MarkCode;
import uz.medix.sales.order.MarkingModels.MarkCodePage;
import uz.medix.sales.order.MarkingModels.MarkImportResult;
import uz.medix.sales.order.MarkingModels.MarkImportRow;
import uz.medix.sales.order.MarkingModels.MarkKind;
import uz.medix.sales.order.MarkingModels.MarkQueueItem;
import uz.medix.sales.order.MarkingModels.MarkWork;
import uz.medix.sales.order.MarkingModels.ScanRequest;
import uz.medix.sales.order.MarkingModels.ScanResult;
import uz.medix.sales.order.OrderModels.OrderReasonRequest;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.gs1.Gs1Code;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;
import uz.medix.shared.text.Texts;

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
    private final Texts texts;

    MarkingController(OrderMarking marking, MarkScanErrors scanErrors, CurrentActor currentActor, Texts texts) {
        this.marking = marking;
        this.scanErrors = scanErrors;
        this.currentActor = currentActor;
        this.texts = texts;
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
    @Operation(summary = "Markirovkani yakunlash",
            description = "Barcha kodlar skanerlangan va markirovkasiz qatorlar tasdiqlangan bo'lsa → «Hisobdan o'tkazilmoqda». "
                    + "O10a: kodlar bo'lsa — avval tekshiruv fayli (verify-export) yuklab olinadi va verified=true («Saplayn'da tekshirildi»).")
    MarkWork finish(@PathVariable long id, @RequestBody(required = false) MarkingModels.FinishRequest r) {
        marking.finish(actor(), id, r != null && r.verified());
        return marking.get(actor(), id);
    }

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    /**
     * O10a «Excel'ga chiqarish»: Saplayn'da tekshirish uchun buyurtma kodlari .xlsx — to'liq skanerlangan kod (kripto-qismi bilan,
     * GS ajratgichi «&lt;GS&gt;» ko'rinishida), qavsli kod, GTIN, seriya, mahsulot, partiya, yaroqlilik, Q/D, buyurtma, mijoz, STIR.
     * Yuklab olish qayd etiladi — shundan keyin yakunlash mumkin.
     */
    @GetMapping("/orders/{id}/verify-export")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Saplayn tekshiruvi uchun kodlar .xlsx")
    void verifyExport(@PathVariable long id, HttpServletResponse response) throws IOException {
        List<OrderMarking.VerifyRow> rows = marking.verifyExport(actor(), id);
        String name = "saplayn-" + rows.getFirst().orderNumber().replaceAll("[^A-Za-z0-9-]", "");
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + name + ".xlsx\"");
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Kodlar");
            CellStyle header = wb.createCellStyle();
            Font font = wb.createFont();
            font.setBold(true);
            header.setFont(font);
            List<String> titles = List.of("Toʻliq kod (GS = <GS>)", "Kod (qavsli)", "GTIN", "Seriya", "Mahsulot", "Partiya", "Yaroqlilik",
                    "Q/D", "Buyurtma №", "Mijoz", "STIR");
            Row h = sheet.createRow(0);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(header);
            }
            int r = 1;
            for (OrderMarking.VerifyRow v : rows) {
                Row row = sheet.createRow(r++);
                int i = 0;
                row.createCell(i++).setCellValue(Gs1Code.visibleGs(v.scanned()));
                row.createCell(i++).setCellValue(v.code());
                row.createCell(i++).setCellValue(v.gtin());
                row.createCell(i++).setCellValue(v.serial());
                row.createCell(i++).setCellValue(v.product());
                row.createCell(i++).setCellValue(nz(v.batch()));
                row.createCell(i++).setCellValue(v.expiry() == null ? "" : DATE.format(v.expiry()));
                row.createCell(i++).setCellValue(v.kind() == MarkKind.BOX ? "Q" : "D");
                row.createCell(i++).setCellValue(v.orderNumber());
                row.createCell(i++).setCellValue(v.customer());
                row.createCell(i).setCellValue(v.tin());
            }
            int[] widths = {70, 60, 16, 20, 40, 14, 12, 5, 16, 30, 15};
            for (int i = 0; i < titles.size(); i++) {
                sheet.setColumnWidth(i, widths[i] * 256);
            }
            sheet.createFreezePane(0, 1);
            wb.write(response.getOutputStream());
        }
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

    @PostMapping(path = "/orders/{id}/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Kodlarni Excel/CSV fayldan yuklash",
            description = "Har kod qo'lda skanerlash bilan bir xil tekshiriladi (format, takror, GTIN, partiya, tur, qator to'lgani). "
                    + "apply=false — oldindan ko'rish (hech narsa saqlanmaydi); apply=true — mos kelganlari qabul qilinadi.")
    MarkImportResult importCodes(@PathVariable long id, @RequestPart("file") MultipartFile file,
            @RequestParam(defaultValue = "false") boolean apply) throws IOException {
        Actor a = actor();
        List<MarkingImport.FileCode> codes;
        try (var in = file.getInputStream()) {
            codes = MarkingImport.read(file.getOriginalFilename(), in);
        }
        if (codes.isEmpty()) {
            throw MedixException.badRequest("marking.import.empty");
        }
        List<OrderMarking.ImportOutcome> out = marking.importCodes(a, id, codes.stream().map(MarkingImport.FileCode::code).toList(), apply);
        Locale locale = Texts.requestLocale();
        List<MarkImportRow> rows = new ArrayList<>();
        for (int i = 0; i < out.size(); i++) {
            OrderMarking.ImportOutcome o = out.get(i);
            rows.add(new MarkImportRow(codes.get(i).row(), o.code(), o.ok(), o.productName(), o.errorCode(),
                    o.ok() ? null : texts.getIn(locale, o.errorCode(), o.errorArgs())));
        }
        int ok = (int) out.stream().filter(OrderMarking.ImportOutcome::ok).count();
        return new MarkImportResult(apply, out.size(), ok, out.size() - ok, rows, apply ? marking.get(a, id) : null);
    }

    @GetMapping("/import-template")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Kodlar faylining namunasi (.xlsx)")
    void importTemplate(HttpServletResponse response) throws IOException {
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"markirovka-kodlari-namuna.xlsx\"");
        MarkingImport.template(response.getOutputStream());
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
            case RETURNED -> "Qaytarilgan";
        };
    }
}
