package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import uz.medix.sales.order.InvoiceTaskModels.FileData;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceFileKind;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceSentRequest;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceTask;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceTaskDetail;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceTaskFilter;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceTaskPage;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceTaskStatus;
import uz.medix.sales.order.InvoiceTaskModels.UploadedFile;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.gs1.Gs1Code;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** O10d «Fakturalar»: buxgalter faktura navbati (HF PDF, kodlar .xlsx, e-faktura/TTN fayllari, «Yuborildi»). */
@RestController
@RequestMapping("/api/invoice-tasks")
@Tag(name = "invoice-tasks", description = "Buxgalter faktura navbati")
class InvoiceTaskController {

    private final InvoiceTasks tasks;
    private final OrderInvoicePdf invoicePdf;
    private final OrderInvoiceExcel invoiceExcel;
    private final CurrentActor currentActor;

    InvoiceTaskController(InvoiceTasks tasks, OrderInvoicePdf invoicePdf, OrderInvoiceExcel invoiceExcel, CurrentActor currentActor) {
        this.tasks = tasks;
        this.invoicePdf = invoicePdf;
        this.invoiceExcel = invoiceExcel;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('invoices.view')")
    @Operation(summary = "Faktura navbati", description = "Filtrlar: filial (barcha filiallar doirasida), holat, davr (navbatga tushgan sana), qidiruv "
            + "(buyurtma, mijoz, STIR, HF, e-faktura №). Kutilayotganlar — eng uzoq kutayotgani birinchi.")
    InvoiceTaskPage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) InvoiceTaskStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return tasks.list(actor(), new InvoiceTaskFilter(branchId, status, from, to, q), Math.max(page, 0), Math.clamp(size, 1, 200));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('invoices.view')")
    @Operation(summary = "Faktura vazifasi")
    InvoiceTask get(@PathVariable long id) {
        return tasks.get(actor(), id);
    }

    @GetMapping("/by-order/{orderId}")
    @PreAuthorize("hasAnyAuthority('invoices.view', 'orders.view')")
    @Operation(summary = "Buyurtmaning faktura vazifasi va fayllari", description = "Buyurtma kartochkasi «Hujjatlar». Vazifa bo'lmasa — 404.")
    InvoiceTaskDetail byOrder(@PathVariable long orderId) {
        return tasks.byOrder(actor(), orderId).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @PostMapping(value = "/{id}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('invoices.send')")
    @Operation(summary = "E-faktura / TTN faylini yuklash", description = "PDF, JPG, PNG; ≤ 10 MB. Faqat «Yuborilishi kerak» holatida.")
    UploadedFile upload(@PathVariable long id, @RequestParam InvoiceFileKind kind, @RequestParam("file") MultipartFile file) throws IOException {
        if (file.getSize() > InvoiceTasks.MAX_FILE_BYTES) {
            throw MedixException.badRequest("invoiceTask.fileSize");
        }
        return new UploadedFile(tasks.upload(actor(), id, kind, file.getOriginalFilename(), file.getContentType(), file.getBytes()));
    }

    @PostMapping("/{id}/sent")
    @PreAuthorize("hasAuthority('invoices.send')")
    @Operation(summary = "«Yuborildi» deb belgilash", description = "E-faktura raqami va sanasi; e-faktura va TTN fayllari oldin yuklangan bo'lishi shart.")
    InvoiceTask sent(@PathVariable long id, @Valid @RequestBody InvoiceSentRequest r) {
        tasks.markSent(actor(), id, r.efakturaNumber(), r.efakturaDate());
        return tasks.get(actor(), id);
    }

    @GetMapping("/files/{fileId}")
    @PreAuthorize("hasAnyAuthority('invoices.view', 'orders.view')")
    @Operation(summary = "Yuklangan faylni yuklab olish")
    ResponseEntity<byte[]> file(@PathVariable long fileId) {
        FileData f = tasks.file(actor(), fileId);
        String encoded = URLEncoder.encode(f.fileName(), StandardCharsets.UTF_8).replace("+", "%20");
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(f.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encoded)
                .body(f.data());
    }

    @GetMapping(value = "/{id}/invoice/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize("hasAuthority('invoices.view')")
    @Operation(summary = "Hisob-faktura — PDF", description = "Sotuv hali o'tkazilmagan bo'lsa — 404.")
    ResponseEntity<byte[]> invoicePdf(@PathVariable long id) {
        InvoiceTask t = tasks.get(actor(), id);
        return invoicePdf.render(actor(), t.orderId()).response();
    }

    @GetMapping("/{id}/invoice/xlsx")
    @PreAuthorize("hasAuthority('invoices.view')")
    @Operation(summary = "Hisob-faktura — Excel (.xlsx)", description = "PDF bilan bir xil ustunlar (O11). Sotuv bo'lmasa — 404.")
    void invoiceXlsx(@PathVariable long id, HttpServletResponse response) throws IOException {
        InvoiceTask t = tasks.get(actor(), id);
        java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
        String number = invoiceExcel.write(actor(), t.orderId(), buf);
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + number + ".xlsx\"");
        buf.writeTo(response.getOutputStream());
    }

    /** Kodlar .xlsx — 1C ga yuklash formati: to'liq kod (GS = &lt;GS&gt;), GTIN, mahsulot, Q/D, soni. */
    @GetMapping("/{id}/codes")
    @PreAuthorize("hasAuthority('invoices.view')")
    @Operation(summary = "Kodlar .xlsx (1C uchun)")
    void codes(@PathVariable long id, HttpServletResponse response) throws IOException {
        InvoiceTask t = tasks.get(actor(), id);
        List<InvoiceTasks.CodeRow> rows = tasks.codes(actor(), id);
        String name = "kodlar-" + t.orderNumber().replaceAll("[^A-Za-z0-9-]", "");
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + name + ".xlsx\"");
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Kodlar");
            CellStyle header = wb.createCellStyle();
            Font font = wb.createFont();
            font.setBold(true);
            header.setFont(font);
            List<String> titles = List.of("Toʻliq kod (GS = <GS>)", "GTIN", "Mahsulot", "Q/D", "Soni");
            Row h = sheet.createRow(0);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(header);
            }
            int r = 1;
            for (InvoiceTasks.CodeRow c : rows) {
                Row row = sheet.createRow(r++);
                row.createCell(0).setCellValue(Gs1Code.visibleGs(c.scanned()));
                row.createCell(1).setCellValue(c.gtin());
                row.createCell(2).setCellValue(c.product());
                row.createCell(3).setCellValue(c.kind() == MarkingModels.MarkKind.BOX ? "Q" : "D");
                row.createCell(4).setCellValue(1);
            }
            int[] widths = {70, 16, 40, 5, 8};
            for (int i = 0; i < titles.size(); i++) {
                sheet.setColumnWidth(i, widths[i] * 256);
            }
            sheet.createFreezePane(0, 1);
            wb.write(response.getOutputStream());
        }
    }
}
