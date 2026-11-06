package uz.medix.reporting.home;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/** Xarid bosh sahifasi (SPEC 8): receipt.create; filial — xodimning filiali (barcha filiallarni ko'radiganlarga ixtiyoriy). */
@RestController
@Tag(name = "home", description = "Bosh sahifalar")
class PurchaserHomeController {

    private final PurchaserHome home;
    private final CurrentActor currentActor;

    PurchaserHomeController(PurchaserHome home, CurrentActor currentActor) {
        this.home = home;
        this.currentActor = currentActor;
    }

    @GetMapping("/api/home/purchaser")
    @PreAuthorize("hasAuthority('receipt.create') and hasAuthority('sdebt.view')")
    @Operation(summary = "Xarid bosh sahifasi: kutayotgan kirimlar, YB qarzi va to'lov kunlari, bonus, «O'z nomimdagi tovar»")
    PurchaserHome.PurchaserHomeView purchaserHome(@RequestParam(required = false) Long branchId) {
        return home.home(currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized")), branchId);
    }
}
