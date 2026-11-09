package uz.medix.finance.debt;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** Akt sverka hujjatlari (recon.view — koʻrish, recon.create — tuzish va holat). */
@RestController
@Tag(name = "reconciliations", description = "Akt sverka hujjatlari (AS-…)")
class ReconActController {

    private final ReconActs acts;
    private final CurrentActor currentActor;

    ReconActController(ReconActs acts, CurrentActor currentActor) {
        this.acts = acts;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping("/api/reconciliations")
    @PreAuthorize("hasAuthority('recon.view')")
    @Operation(summary = "Akt sverkalar roʻyxati", description = "Filial tanlanmasa — xodim koʻradigan barcha filiallar.")
    ReconActs.ReconList list(@RequestParam(required = false) Long branchId) {
        return acts.list(actor(), branchId);
    }

    @GetMapping("/api/reconciliations/{id}")
    @PreAuthorize("hasAuthority('recon.view')")
    @Operation(summary = "Akt sverka varagʻi (sarlavha + qarz jurnalidan qatorlar)")
    ReconActs.ReconDetail get(@PathVariable long id) {
        return acts.get(actor(), id);
    }

    @PostMapping("/api/reconciliations")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('recon.create')")
    @Operation(summary = "Akt sverka tuzish (AS-…)")
    ReconActs.ReconDetail create(@Valid @RequestBody ReconActs.ReconCreateRequest r) {
        Actor a = actor();
        return acts.get(a, acts.create(a, r));
    }

    @PostMapping("/api/reconciliations/{id}/status")
    @PreAuthorize("hasAuthority('recon.create')")
    @Operation(summary = "Holat: Yuborildi / Imzolandi / Farq bor (kontragent qoldigʻi + izoh)")
    ReconActs.ReconDetail status(@PathVariable long id, @Valid @RequestBody ReconActs.ReconStatusRequest r) {
        Actor a = actor();
        acts.setStatus(a, id, r);
        return acts.get(a, id);
    }
}
