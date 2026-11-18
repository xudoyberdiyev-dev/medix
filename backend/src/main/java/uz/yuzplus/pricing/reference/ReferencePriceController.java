package uz.yuzplus.pricing.reference;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
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
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import uz.yuzplus.pricing.reference.ReferenceModels.CompareDetail;
import uz.yuzplus.pricing.reference.ReferenceModels.CompareRequest;
import uz.yuzplus.pricing.reference.ReferenceModels.CompareSummary;
import uz.yuzplus.pricing.reference.ReferenceModels.LineStatus;
import uz.yuzplus.pricing.reference.ReferenceModels.MatchRequest;
import uz.yuzplus.pricing.reference.ReferenceModels.ReceiptRefWarning;
import uz.yuzplus.pricing.reference.ReferenceModels.RefFile;
import uz.yuzplus.pricing.reference.ReferenceModels.RefProfile;
import uz.yuzplus.pricing.reference.ReferenceModels.RefProfileRequest;
import uz.yuzplus.shared.error.YuzplusException;
import uz.yuzplus.shared.security.Actor;
import uz.yuzplus.shared.security.CurrentActor;

/** Referent narxlar (O14): faylni o'qish, solishtirish, tarix, qo'lda moslash, Excel, kirim ogohlantirishi. */
@RestController
@RequestMapping("/api/reference-prices")
@Tag(name = "pricing", description = "Narxlar")
class ReferencePriceController {

    private static final String VIEW = "hasAuthority('prices.reference')";

    private final ReferencePrices service;
    private final ReferencePriceExcel excel;
    private final CurrentActor currentActor;

    ReferencePriceController(ReferencePrices service, ReferencePriceExcel excel, CurrentActor currentActor) {
        this.service = service;
        this.excel = excel;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> YuzplusException.unauthorized("auth.unauthorized"));
    }

    /** Kirim narxi (tannarx) — faqat tannarx ruxsati bilan. */
    static boolean costVisible(Authentication auth) {
        return auth.getAuthorities().stream().anyMatch(a -> "prices.cost".equals(a.getAuthority()) || "special.cost".equals(a.getAuthority()));
    }

    @PostMapping(path = "/read", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(VIEW)
    @Operation(summary = "Referent narxlar faylini o'qish", description = ".xlsx/.xls/.csv — varaqlar va katakchalar. Hech narsa yozilmaydi.")
    RefFile read(@RequestPart("file") MultipartFile file) throws IOException {
        try (InputStream in = file.getInputStream()) {
            return ReferenceSheetReader.read(file.getOriginalFilename(), file.getSize(), in);
        }
    }

    @GetMapping("/profile")
    @PreAuthorize(VIEW)
    @Operation(summary = "Saqlangan ustunlar moslashi", description = "Profil bo'lmasa — 204.")
    ResponseEntity<RefProfile> profile() {
        return service.profile().map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/profile")
    @PreAuthorize(VIEW)
    @Operation(summary = "Ustunlar moslashini saqlash", description = "Keyingi faylda avtomatik qo'llanadi.")
    RefProfile saveProfile(@Valid @RequestBody RefProfileRequest request) {
        return service.saveProfile(actor(), request);
    }

    @PostMapping("/compare")
    @PreAuthorize(VIEW)
    @Operation(summary = "Solishtirish", description = "Moslangan qatorlar → mahsulotni topish, bizning narx bilan solishtirish; natija tarixga yoziladi.")
    CompareDetail compare(@Valid @RequestBody CompareRequest request, Authentication auth) {
        return service.compare(actor(), request, costVisible(auth));
    }

    @GetMapping
    @PreAuthorize(VIEW)
    @Operation(summary = "Solishtirishlar tarixi", description = "Oxirgi 200 ta; tannarx ruxsatisiz — faqat sotuv narxi bilan solishtirishlar.")
    List<CompareSummary> history(@RequestParam(required = false) Long branchId, Authentication auth) {
        return service.history(actor(), branchId, costVisible(auth));
    }

    @GetMapping("/{id}")
    @PreAuthorize(VIEW)
    @Operation(summary = "Solishtirish natijasi")
    CompareDetail detail(@PathVariable long id, Authentication auth) {
        return service.detail(actor(), id, costVisible(auth)).orElseThrow(() -> YuzplusException.notFound("error.notFound"));
    }

    @PutMapping("/{id}/lines/{rowNo}/match")
    @PreAuthorize(VIEW)
    @Operation(summary = "Qatorni qo'lda mahsulotga moslash", description = "Moslik eslab qolinadi — keyingi faylda avtomatik.")
    CompareDetail match(@PathVariable long id, @PathVariable int rowNo, @Valid @RequestBody MatchRequest request, Authentication auth) {
        return service.match(actor(), id, rowNo, request.productId(), costVisible(auth));
    }

    @GetMapping("/{id}/export")
    @PreAuthorize(VIEW)
    @Operation(summary = "Natijani Excel'ga", description = "status bo'sh — hammasi; NOT_FOUND — topilmadi va narxi yo'qlar.")
    void export(@PathVariable long id, @RequestParam(required = false) LineStatus status, Authentication auth, HttpServletResponse response)
            throws IOException {
        CompareDetail d = service.detail(actor(), id, costVisible(auth)).orElseThrow(() -> YuzplusException.notFound("error.notFound"));
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"referent-narx-" + id + ".xlsx\"");
        excel.write(d, status, response.getOutputStream());
    }

    @GetMapping("/receipt/{receiptId}")
    @PreAuthorize("hasAuthority('receipt.view')")
    @Operation(summary = "Kirim: referent narxdan qimmat mahsulotlar", description = "Oxirgi solishtirishdagi referent narx bilan; bloklamaydi.")
    ResponseEntity<List<ReceiptRefWarning>> receiptWarnings(@PathVariable long receiptId, Authentication auth) {
        // Kirim kartochkasidagi narx ko'rinishi bilan bir xil: tannarx ruxsati yoki qabul qilmaydigan (Xarid) xodim
        boolean receiptPrices = costVisible(auth) || auth.getAuthorities().stream().noneMatch(a -> "receipt.accept".equals(a.getAuthority()));
        if (!receiptPrices) {
            return ResponseEntity.ok(List.of());
        }
        return ResponseEntity.ok(service.receiptWarnings(actor(), receiptId));
    }
}
