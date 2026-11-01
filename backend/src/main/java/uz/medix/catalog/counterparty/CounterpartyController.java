package uz.medix.catalog.counterparty;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.catalog.counterparty.CounterpartyModels.ContractRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.CounterpartyDetail;
import uz.medix.catalog.counterparty.CounterpartyModels.CounterpartyRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.LicenseRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.CounterpartyPage;
import uz.medix.catalog.counterparty.CounterpartyModels.ReasonRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.Role;
import uz.medix.catalog.counterparty.CounterpartyModels.Status;
import uz.medix.catalog.counterparty.CounterpartyModels.TermsRequest;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Kontragentlar (Ma'lumotnomalar → Mijozlar / Yetkazib beruvchilar). Ko'rish — har bir kirgan xodim; karta — Direktor,
 * Bosh administrator, Filial rahbari, Buxgalter, Xarid; filial shartlari (limit, narx turi) — Direktor, Bosh administrator,
 * Filial rahbari (o'z filiali). Ruxsatlar matritsasi (1.3) kelguncha rol bo'yicha.
 */
@RestController
@RequestMapping("/api/counterparties")
@Tag(name = "counterparties", description = "Kontragentlar")
class CounterpartyController {

    private static final String CARD = "hasAnyRole('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'PURCHASER')";
    private static final String TERMS = "hasAnyRole('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER')";
    private static final String BLOCK = "hasAnyRole('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT')";

    private final Counterparties counterparties;
    private final CurrentActor currentActor;

    CounterpartyController(Counterparties counterparties, CurrentActor currentActor) {
        this.counterparties = counterparties;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private CounterpartyDetail detail(long id) {
        return counterparties.find(id, actor()).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @GetMapping
    @Operation(summary = "Kontragentlar", description = "Qidiruv: nom, STIR, telefon, kontakt (lotin/kirill farqsiz).")
    CounterpartyPage list(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "ALL") Role role,
            @RequestParam(defaultValue = "ACTIVE") Status status,
            @RequestParam(required = false) Long regionId,
            @RequestParam(defaultValue = "false") boolean sortByTin,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return counterparties.search(q, role, status, regionId, sortByTin, Math.max(page, 0), Math.clamp(size, 1, 200));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Kontragent kartasi")
    CounterpartyDetail get(@PathVariable long id) {
        return detail(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CARD)
    @Operation(summary = "Kontragent qo'shish")
    CounterpartyDetail create(@Valid @RequestBody CounterpartyRequest r) {
        return detail(counterparties.create(r));
    }

    @PutMapping("/{id}")
    @PreAuthorize(CARD)
    @Operation(summary = "Kartani tahrirlash")
    CounterpartyDetail update(@PathVariable long id, @Valid @RequestBody CounterpartyRequest r) {
        counterparties.update(id, r);
        return detail(id);
    }

    @PostMapping("/{id}/block")
    @PreAuthorize(BLOCK)
    @Operation(summary = "Bloklash", description = "Bloklangan mijozga buyurtma kiritilmaydi.")
    CounterpartyDetail block(@PathVariable long id, @Valid @RequestBody ReasonRequest r) {
        counterparties.block(id, r.reason());
        return detail(id);
    }

    @PostMapping("/{id}/unblock")
    @PreAuthorize(BLOCK)
    @Operation(summary = "Blokdan chiqarish")
    CounterpartyDetail unblock(@PathVariable long id) {
        counterparties.unblock(id);
        return detail(id);
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize(CARD)
    @Operation(summary = "Nofaol qilish")
    CounterpartyDetail deactivate(@PathVariable long id, @Valid @RequestBody ReasonRequest r) {
        counterparties.setActive(id, false, r.reason());
        return detail(id);
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize(CARD)
    @Operation(summary = "Faollashtirish")
    CounterpartyDetail activate(@PathVariable long id) {
        counterparties.setActive(id, true, null);
        return detail(id);
    }

    @PostMapping("/{id}/licenses")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CARD)
    @Operation(summary = "Litsenziya qo'shish")
    CounterpartyDetail addLicense(@PathVariable long id, @Valid @RequestBody LicenseRequest r) {
        counterparties.saveLicense(id, null, r);
        return detail(id);
    }

    @PutMapping("/{id}/licenses/{licenseId}")
    @PreAuthorize(CARD)
    @Operation(summary = "Litsenziyani tahrirlash")
    CounterpartyDetail updateLicense(@PathVariable long id, @PathVariable long licenseId, @Valid @RequestBody LicenseRequest r) {
        counterparties.saveLicense(id, licenseId, r);
        return detail(id);
    }

    @PostMapping("/{id}/contracts")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CARD)
    @Operation(summary = "Shartnoma qo'shish")
    CounterpartyDetail addContract(@PathVariable long id, @Valid @RequestBody ContractRequest r) {
        counterparties.saveContract(id, null, r, actor());
        return detail(id);
    }

    @PutMapping("/{id}/contracts/{contractId}")
    @PreAuthorize(CARD)
    @Operation(summary = "Shartnomani tahrirlash")
    CounterpartyDetail updateContract(@PathVariable long id, @PathVariable long contractId, @Valid @RequestBody ContractRequest r) {
        counterparties.saveContract(id, contractId, r, actor());
        return detail(id);
    }

    @PutMapping("/{id}/terms/{branchId}")
    @PreAuthorize(TERMS)
    @Operation(summary = "Filial shartlari", description = "Limit, to'lov muddati, narx turi, minimal yaroqlilik, operator; YB shartlari.")
    CounterpartyDetail saveTerms(@PathVariable long id, @PathVariable long branchId, @Valid @RequestBody TermsRequest r) {
        if (!actor().canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        counterparties.saveTerms(id, branchId, r);
        return detail(id);
    }
}
