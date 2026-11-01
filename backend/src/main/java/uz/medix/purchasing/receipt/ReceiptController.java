package uz.medix.purchasing.receipt;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
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
import uz.medix.purchasing.receipt.ReceiptModels.AcceptRequest;
import uz.medix.purchasing.receipt.ReceiptModels.PostRequest;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptCancelRequest;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptDetail;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptPage;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptRequest;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptStatus;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Kirim (KR). Ruxsatlar (T12): yaratish — receipt.create, qabul — receipt.accept, o'tkazish — receipt.post, bekor qilish —
 * receipt.cancel (qoralama / qabul qilingan), receipt.cancelPosted (o'tkazilgan). Narx va summalar Ombor mudiriga yuborilmaydi
 * (SPEC 5.1-2): ko'radi — special.cost yoki qabul qilmaydigan xodim (Xarid).
 */
@RestController
@RequestMapping("/api/receipts")
@Tag(name = "receipts", description = "Kirim")
class ReceiptController {

    private final Receipts receipts;
    private final CurrentActor currentActor;

    ReceiptController(Receipts receipts, CurrentActor currentActor) {
        this.receipts = receipts;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private static boolean has(Authentication auth, String key) {
        return auth.getAuthorities().stream().anyMatch(a -> key.equals(a.getAuthority()));
    }

    /** Narxni ko'rish: tannarx huquqi bor yoki qabul qilmaydigan (Xarid) xodim. Ombor mudiri — yo'q. */
    static boolean pricesVisible(Authentication auth) {
        return has(auth, "special.cost") || !has(auth, "receipt.accept");
    }

    private ReceiptDetail detail(long id, Authentication auth) {
        return receipts.find(id, actor(), pricesVisible(auth)).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('receipt.view')")
    @Operation(summary = "Kirimlar")
    ReceiptPage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) ReceiptStatus status,
            @RequestParam(required = false) Long supplierId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            Authentication auth) {
        return receipts.list(actor(), branchId, status, supplierId, Math.max(page, 0), Math.clamp(size, 1, 200), pricesVisible(auth));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('receipt.view')")
    @Operation(summary = "Kirim hujjati")
    ReceiptDetail get(@PathVariable long id, Authentication auth) {
        return detail(id, auth);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('receipt.create')")
    @Operation(summary = "Kirim qoralamasi", description = "Raqam darhol beriladi (KR-TSH-000001). Qoralama qoldiq va qarzga ta'sir qilmaydi.")
    ReceiptDetail create(@Valid @RequestBody ReceiptRequest r, Authentication auth) {
        return detail(receipts.create(actor(), r, pricesVisible(auth)), auth);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('receipt.create')")
    @Operation(summary = "Qoralamani tahrirlash", description = "Qatorlar to'liq almashtiriladi.")
    ReceiptDetail update(@PathVariable long id, @Valid @RequestBody ReceiptRequest r, Authentication auth) {
        receipts.update(actor(), id, r, pricesVisible(auth));
        return detail(id, auth);
    }

    @PostMapping("/{id}/accept")
    @PreAuthorize("hasAuthority('receipt.accept')")
    @Operation(summary = "Qabul qilish (sanash)", description = "Har qatorga haqiqiy soni; farq bo'lsa sababi. Tovar Qabul zonasiga tushadi.")
    ReceiptDetail accept(@PathVariable long id, @Valid @RequestBody AcceptRequest r, Authentication auth) {
        receipts.accept(actor(), id, r.lines());
        return detail(id, auth);
    }

    @PostMapping("/{id}/post")
    @PreAuthorize("hasAuthority('receipt.post')")
    @Operation(summary = "O'tkazish", description = "Saqlash zonalariga, qarz va to'lov kuni yoziladi. Farq bo'lsa — qaror majburiy.")
    ReceiptDetail post(@PathVariable long id, @Valid @RequestBody PostRequest r, Authentication auth) {
        receipts.post(actor(), id, r.resolution());
        return detail(id, auth);
    }

    @PostMapping("/{id}/bonus")
    @PreAuthorize("hasAuthority('supplierBonus.confirm')")
    @Operation(summary = "Bonus tasdiqlandi (BNS)", description = "Chegirma YB bonus balansiga qo'shiladi. Faqat o'tkazilgan kirim, bir marta.")
    ReceiptDetail confirmBonus(@PathVariable long id, Authentication auth) {
        receipts.confirmBonus(actor(), id);
        return detail(id, auth);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyAuthority('receipt.cancel', 'receipt.cancelPosted')")
    @Operation(summary = "Bekor qilish", description = "O'tkazilgan kirim — faqat receipt.cancelPosted va tovar ishlatilmagan bo'lsa.")
    ReceiptDetail cancel(@PathVariable long id, @Valid @RequestBody ReceiptCancelRequest r, Authentication auth) {
        receipts.cancel(actor(), id, r.reason(), has(auth, "receipt.cancel"), has(auth, "receipt.cancelPosted"));
        return detail(id, auth);
    }
}
