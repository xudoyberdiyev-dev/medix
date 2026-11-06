package uz.medix.purchasing.receipt;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.purchasing.receipt.SupplierReturnModels.ReturnStockRow;
import uz.medix.purchasing.receipt.SupplierReturnModels.Status;
import uz.medix.purchasing.receipt.SupplierReturnModels.SupplierReturnDetail;
import uz.medix.purchasing.receipt.SupplierReturnModels.SupplierReturnPage;
import uz.medix.purchasing.receipt.SupplierReturnModels.SupplierReturnRejectRequest;
import uz.medix.purchasing.receipt.SupplierReturnModels.SupplierReturnRequest;
import uz.medix.purchasing.receipt.SupplierReturnModels.SupplierReturnSummary;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * QY — yetkazib beruvchiga qaytarish. Ruxsatlar (T12): ko'rish — qy.view, yaratish — qy.create, tasdiqlash / rad etish — qy.approve.
 * Summa (kirim narxi) faqat prices.cost bilan. Filial doirasi serverda.
 */
@RestController
@RequestMapping("/api/supplier-returns")
@Tag(name = "supplier-return", description = "YB ga qaytarish (QY)")
class SupplierReturnController {

    private static final String VIEW = "hasAnyAuthority('qy.view', 'qy.create', 'qy.approve')";

    private final SupplierReturns returns;
    private final SupplierReturnPdf pdf;
    private final CurrentActor currentActor;

    SupplierReturnController(SupplierReturns returns, SupplierReturnPdf pdf, CurrentActor currentActor) {
        this.returns = returns;
        this.pdf = pdf;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private static boolean has(Authentication auth, String permission) {
        return auth.getAuthorities().stream().anyMatch(a -> permission.equals(a.getAuthority()));
    }

    private SupplierReturnDetail detail(long id, Authentication auth) {
        SupplierReturnDetail d = returns.find(id, actor()).orElseThrow(() -> MedixException.notFound("error.notFound"));
        return has(auth, "prices.cost") ? d : d.withoutAmount();
    }

    @GetMapping
    @PreAuthorize(VIEW)
    @Operation(summary = "QY hujjatlari", description = "Summa — faqat prices.cost.")
    SupplierReturnPage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long supplierId,
            @RequestParam(required = false) Long receiptId,
            @RequestParam(required = false) Status status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            Authentication auth) {
        SupplierReturnPage p = returns.list(actor(), branchId, supplierId, receiptId, status, Math.max(page, 0), Math.clamp(size, 1, 200));
        if (has(auth, "prices.cost")) {
            return p;
        }
        return new SupplierReturnPage(p.items().stream().map(SupplierReturnSummary::withoutAmount).toList(), p.total(), p.page(), p.size());
    }

    @GetMapping("/{id}")
    @PreAuthorize(VIEW)
    @Operation(summary = "QY hujjati")
    SupplierReturnDetail get(@PathVariable long id, Authentication auth) {
        return detail(id, auth);
    }

    @GetMapping(value = "/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize(VIEW)
    @Operation(summary = "QY yuk xati — PDF (chop etish)", description = "Narx va summa ustunlari — faqat prices.cost.")
    ResponseEntity<byte[]> pdf(@PathVariable long id, Authentication auth) {
        SupplierReturnPdf.Rendered r = pdf.render(actor(), id, has(auth, "prices.cost"));
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(r.number() + ".pdf").build().toString())
                .body(r.body());
    }

    @GetMapping("/receipt-stock")
    @PreAuthorize("hasAuthority('qy.create')")
    @Operation(summary = "Kirim partiyalarining qoldig'i",
            description = "Filialdagi zonalar bo'yicha: qoldiq, faol zahira, bo'sh miqdor, bonusmi; narx — faqat prices.cost.")
    List<ReturnStockRow> receiptStock(@RequestParam long receiptId, Authentication auth) {
        List<ReturnStockRow> rows = returns.receiptStock(actor(), receiptId);
        return has(auth, "prices.cost") ? rows : rows.stream().map(ReturnStockRow::withoutPrice).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('qy.create')")
    @Operation(summary = "YB ga qaytarish",
            description = "«Tasdiqda» holatida yaratiladi; yaratuvchida qy.approve bo'lsa darhol o'tkaziladi (tovar chiqadi, YB qarzi kamayadi).")
    SupplierReturnDetail create(@Valid @RequestBody SupplierReturnRequest r, Authentication auth) {
        return detail(returns.create(actor(), r, has(auth, "qy.approve")), auth);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('qy.approve')")
    @Operation(summary = "Tasdiqlash va o'tkazish", description = "Tovar zonadan chiqadi, YB qarzi (yoki bonus balans) kirim narxida tuzatiladi.")
    SupplierReturnDetail approve(@PathVariable long id, Authentication auth) {
        returns.approve(actor(), id);
        return detail(id, auth);
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('qy.approve')")
    @Operation(summary = "Rad etish", description = "Tovar joyida qoladi.")
    SupplierReturnDetail reject(@PathVariable long id, @Valid @RequestBody SupplierReturnRejectRequest r, Authentication auth) {
        returns.reject(actor(), id, r.reason());
        return detail(id, auth);
    }
}
