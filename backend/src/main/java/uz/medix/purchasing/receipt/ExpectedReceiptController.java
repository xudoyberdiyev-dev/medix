package uz.medix.purchasing.receipt;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import uz.medix.pricing.SupplierFiles;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.KkCloseRequest;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.KkImportLine;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.KkImportRequest;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.ExpectedReceiptCancelRequest;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.ExpectedReceiptDetail;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.ExpectedReceiptPage;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.ExpectedReceiptRequest;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.FileData;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.InTransitRow;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.KkStatus;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.KkReceiveRequest;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.KkReceiveResult;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * KK — kutilayotgan kirim (yuk xati), O15. Ruxsatlar: ko'rish — kk.view, yaratish/tahrirlash — kk.create, tasdiqlash (qarz yoziladi) va
 * tasdiqlanganini bekor qilish — kk.approve. Narx/summa — kirimdagidek narx ko'rish huquqi bilan. Filial doirasi serverda.
 */
@RestController
@RequestMapping("/api/expected-receipts")
@Tag(name = "expected-receipt", description = "Kutilayotgan kirim (KK, yuk xati)")
class ExpectedReceiptController {

    private static final String VIEW = "hasAnyAuthority('kk.view', 'kk.create', 'kk.approve')";

    private final ExpectedReceipts kk;
    private final CurrentActor currentActor;
    private final ExpectedReceiptActPdf actPdf;
    private final SupplierFiles supplierFiles;
    private final ExpectedReceiptImport importer;

    ExpectedReceiptController(ExpectedReceipts kk, CurrentActor currentActor, ExpectedReceiptActPdf actPdf, SupplierFiles supplierFiles,
            ExpectedReceiptImport importer) {
        this.kk = kk;
        this.supplierFiles = supplierFiles;
        this.importer = importer;
        this.actPdf = actPdf;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private static boolean has(Authentication auth, String permission) {
        return auth.getAuthorities().stream().anyMatch(a -> permission.equals(a.getAuthority()));
    }

    private ExpectedReceiptDetail detail(long id, Authentication auth) {
        return kk.find(id, actor(), ReceiptController.pricesVisible(auth)).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @GetMapping
    @PreAuthorize(VIEW)
    @Operation(summary = "KK hujjatlari", description = "open — Yo'lda va Qisman; late — kutilgan sana o'tgan. Summa — narx ko'rish huquqi bilan.")
    ExpectedReceiptPage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long supplierId,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) KkStatus status,
            @RequestParam(defaultValue = "false") boolean open,
            @RequestParam(defaultValue = "false") boolean late,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            Authentication auth) {
        return kk.list(actor(), branchId, supplierId, warehouseId, status, open, late, q, Math.max(page, 0), Math.clamp(size, 1, 200),
                ReceiptController.pricesVisible(auth));
    }

    @GetMapping("/in-transit")
    @PreAuthorize("hasAnyAuthority('kk.view', 'stock.view', 'orders.create', 'products.view')")
    @Operation(summary = "Yo'ldagi tovar", description = "KK Yo'lda / Qisman qatorlarining qolgan soni mahsulot bo'yicha (sotuvga olinmaydi). productId — bir nechta.")
    List<InTransitRow> inTransit(
            @RequestParam(required = false) List<Long> productId,
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long warehouseId) {
        if (productId != null && productId.size() > 500) {
            throw MedixException.badRequest("error.request");
        }
        return kk.inTransit(actor(), productId, branchId, warehouseId);
    }

    @PostMapping(path = "/import-read", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority('kk.create')")
    @Operation(summary = "YB faylini o'qish (KK qatorlari uchun)", description = ".xlsx/.xls/.csv — varaqlar va katakchalar. Hech narsa yozilmaydi.")
    SupplierFiles.File importRead(@RequestParam("file") MultipartFile file) throws IOException {
        try (InputStream in = file.getInputStream()) {
            return supplierFiles.read(file.getOriginalFilename(), file.getSize(), in);
        }
    }

    @PostMapping("/import-lines")
    @PreAuthorize("hasAuthority('kk.create')")
    @Operation(summary = "YB fayli qatorlari → KK qatorlari",
            description = "Mahsulot topiladi (shtrix-kod → MXIK → kod → xotira → nom), soni/narx/QQS/partiya/yaroqlilik o'qiladi. Hech narsa yozilmaydi.")
    List<KkImportLine> importLines(@Valid @RequestBody KkImportRequest r, Authentication auth) {
        return importer.lines(r.rows(), ReceiptController.pricesVisible(auth));
    }

    @GetMapping("/{id}")
    @PreAuthorize(VIEW)
    @Operation(summary = "KK kartochkasi", description = "Qatorlar (kutilgan / qabul qilingan / qolgan), fayllar, bog'langan kirimlar, qarz holati.")
    ExpectedReceiptDetail get(@PathVariable long id, Authentication auth) {
        return detail(id, auth);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('kk.create')")
    @Operation(summary = "KK yaratish (qoralama)", description = "Qarz hali yozilmaydi — «Tasdiqlash» da.")
    ExpectedReceiptDetail create(@Valid @RequestBody ExpectedReceiptRequest r, Authentication auth) {
        return detail(kk.create(actor(), r, ReceiptController.pricesVisible(auth)), auth);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('kk.create')")
    @Operation(summary = "KK qoralamasini tahrirlash")
    ExpectedReceiptDetail update(@PathVariable long id, @Valid @RequestBody ExpectedReceiptRequest r, Authentication auth) {
        kk.update(actor(), id, r, ReceiptController.pricesVisible(auth));
        return detail(id, auth);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('kk.approve')")
    @Operation(summary = "KK tasdiqlash", description = "«Qarzga» — YB qarzi darhol yoziladi (hamma narx majburiy); holat «Yo'lda». Qoldiq o'zgarmaydi.")
    ExpectedReceiptDetail approve(@PathVariable long id, Authentication auth) {
        kk.approve(actor(), id);
        return detail(id, auth);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyAuthority('kk.create', 'kk.approve')")
    @Operation(summary = "KK bekor qilish", description = "Qoralama — kk.create; «Yo'lda» — kk.approve, hech narsa qabul qilinmagan bo'lsa (qarz teskari yoziladi).")
    ExpectedReceiptDetail cancel(@PathVariable long id, @Valid @RequestBody ExpectedReceiptCancelRequest r, Authentication auth) {
        kk.cancel(actor(), id, r.reason(), has(auth, "kk.approve"));
        return detail(id, auth);
    }

    @PostMapping("/{id}/receive")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyAuthority('kk.create', 'kk.approve')")
    @Operation(summary = "Qabul qilish — KK dan kirim qoralamasi",
            description = "Narxlar KK dan; partiya, yaroqlilik, zona — ombordan. Kirim keyin odatdagidek qabul qilinadi va o'tkaziladi; «qarzga» KK da qarz qayta yozilmaydi.")
    KkReceiveResult receive(@PathVariable long id, @Valid @RequestBody KkReceiveRequest r) {
        return kk.receive(actor(), id, r);
    }

    @PostMapping("/{id}/close")
    @PreAuthorize("hasAuthority('kk.approve')")
    @Operation(summary = "Yakuniy qabul", description = "Qisman holatida: qolgan kelmagan soni hisobdan chiqariladi («qarzga» — qarz kamayadi).")
    ExpectedReceiptDetail close(@PathVariable long id, @Valid @RequestBody KkCloseRequest r, Authentication auth) {
        kk.close(actor(), id, r.reason());
        return detail(id, auth);
    }

    @PostMapping(value = "/{id}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyAuthority('kk.create', 'kk.approve')")
    @Operation(summary = "Yuk xati faylini yuklash", description = "PDF, JPG, PNG; ≤ 10 MB.")
    ExpectedReceiptDetail upload(@PathVariable long id, @RequestParam("file") MultipartFile file, Authentication auth) throws IOException {
        if (file.getSize() > ExpectedReceipts.MAX_FILE_BYTES) {
            throw MedixException.badRequest("kk.fileSize");
        }
        kk.upload(actor(), id, file.getOriginalFilename(), file.getContentType(), file.getBytes());
        return detail(id, auth);
    }

    @GetMapping(value = "/{id}/act/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize(VIEW)
    @Operation(summary = "Farq dalolatnomasi — PDF", description = "Yetkazib beruvchiga: kam / ortiqcha / shikastlangan / kutilmoqda; summa — narx ko'rish huquqi bilan.")
    ResponseEntity<byte[]> act(@PathVariable long id, Authentication auth) {
        ExpectedReceiptActPdf.Rendered r = actPdf.render(actor(), id, ReceiptController.pricesVisible(auth));
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + r.number() + "-dalolatnoma.pdf\"")
                .body(r.body());
    }

    @GetMapping("/files/{fileId}")
    @PreAuthorize(VIEW)
    @Operation(summary = "Yuk xati faylini yuklab olish")
    ResponseEntity<byte[]> file(@PathVariable long fileId) {
        FileData f = kk.file(actor(), fileId);
        String encoded = URLEncoder.encode(f.fileName(), StandardCharsets.UTF_8).replace("+", "%20");
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(f.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encoded)
                .header("X-Content-Type-Options", "nosniff")
                .body(f.data());
    }
}
