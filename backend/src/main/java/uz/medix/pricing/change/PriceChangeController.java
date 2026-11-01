package uz.medix.pricing.change;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
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
import uz.medix.pricing.change.PriceChangeModels.MarkupLine;
import uz.medix.pricing.change.PriceChangeModels.MarkupRequest;
import uz.medix.pricing.change.PriceChangeModels.PinRequest;
import uz.medix.pricing.change.PriceChangeModels.PriceChangeDetail;
import uz.medix.pricing.change.PriceChangeModels.PriceChangePage;
import uz.medix.pricing.change.PriceChangeModels.PriceChangeRequest;
import uz.medix.pricing.change.PriceChangeModels.PricePage;
import uz.medix.pricing.change.PriceChangeModels.ReasonRequest;
import uz.medix.pricing.change.PriceChangeModels.Status;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Narxlar va NO hujjatlari. Narx o'rnatish — Direktor, Bosh administrator, Xarid, Filial rahbari (o'z filiali);
 * Direktor tasdig'i (tannarxdan past narx) — faqat Direktor, PIN bilan. Ruxsatlar matritsasi (1.3) kelguncha rol bo'yicha.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "pricing", description = "Narxlar")
class PriceChangeController {

    private static final String SET_PRICES = "hasAnyRole('DIRECTOR', 'ADMIN', 'PURCHASER', 'BRANCH_MANAGER')";

    private final PriceChanges changes;
    private final CurrentActor currentActor;

    PriceChangeController(PriceChanges changes, CurrentActor currentActor) {
        this.changes = changes;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private PriceChangeDetail detail(long id) {
        return changes.find(id, actor()).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @GetMapping("/prices")
    @Operation(summary = "Amaldagi narxlar (mahsulot × narx turi)", description = "Filial va sana bo'yicha; sana berilmasa — bugun.")
    PricePage prices(
            @RequestParam long branchId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long manufacturerId,
            @RequestParam(required = false) LocalDate at,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        if (!actor().canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        return changes.prices(branchId, q, manufacturerId, at == null ? changes.today() : at, Math.max(page, 0), Math.clamp(size, 1, 200));
    }

    @GetMapping("/price-changes")
    @Operation(summary = "NO hujjatlari")
    PriceChangePage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Status status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return changes.list(actor(), branchId, status, Math.max(page, 0), Math.clamp(size, 1, 200));
    }

    @GetMapping("/price-changes/{id}")
    @Operation(summary = "NO hujjati")
    PriceChangeDetail get(@PathVariable long id) {
        return detail(id);
    }

    @PostMapping("/price-changes")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(SET_PRICES)
    @Operation(summary = "NO qoralamasi", description = "Raqam darhol beriladi (NO-TSH-000001).")
    PriceChangeDetail create(@Valid @RequestBody PriceChangeRequest r) {
        return detail(changes.create(actor(), r));
    }

    @PutMapping("/price-changes/{id}")
    @PreAuthorize(SET_PRICES)
    @Operation(summary = "Qoralamani tahrirlash")
    PriceChangeDetail update(@PathVariable long id, @Valid @RequestBody PriceChangeRequest r) {
        changes.update(actor(), id, r);
        return detail(id);
    }

    @PostMapping("/price-changes/{id}/submit")
    @PreAuthorize(SET_PRICES)
    @Operation(summary = "O'tkazish", description = "Tannarxdan past narx bo'lsa — Direktor tasdig'iga, aks holda darhol kuchga kiradi.")
    PriceChangeDetail submit(@PathVariable long id, Authentication auth) {
        boolean director = auth.getAuthorities().stream().anyMatch(a -> "ROLE_DIRECTOR".equals(a.getAuthority()));
        changes.submit(actor(), id, director);
        return detail(id);
    }

    @PostMapping("/price-changes/{id}/approve")
    @PreAuthorize("hasRole('DIRECTOR')")
    @Operation(summary = "Direktor tasdig'i (PIN)")
    PriceChangeDetail approve(@PathVariable long id, @Valid @RequestBody PinRequest r) {
        changes.approve(actor(), id, r.pin());
        return detail(id);
    }

    @PostMapping("/price-changes/{id}/reject")
    @PreAuthorize("hasRole('DIRECTOR')")
    @Operation(summary = "Rad etish")
    PriceChangeDetail reject(@PathVariable long id, @Valid @RequestBody ReasonRequest r) {
        changes.reject(actor(), id, r.reason());
        return detail(id);
    }

    @PostMapping("/price-changes/{id}/cancel")
    @PreAuthorize(SET_PRICES)
    @Operation(summary = "Bekor qilish", description = "Faqat qoralama yoki tasdiq kutayotgan hujjat.")
    PriceChangeDetail cancel(@PathVariable long id, @Valid @RequestBody ReasonRequest r) {
        changes.cancel(actor(), id, r.reason());
        return detail(id);
    }

    @PostMapping("/price-changes/markup")
    @PreAuthorize(SET_PRICES)
    @Operation(summary = "Ommaviy ustama hisoblash", description = "Hech narsa yozilmaydi; natija NO qatorlariga qo'yiladi.")
    List<MarkupLine> markup(@Valid @RequestBody MarkupRequest r) {
        return changes.markup(actor(), r);
    }
}
