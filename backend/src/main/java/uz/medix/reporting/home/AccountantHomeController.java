package uz.medix.reporting.home;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/** Buxgalter bosh sahifasi (prototip): reports.all yoki reports.view; branchId bo'lmasa — barcha filiallar (faqat ruxsati borlarga). */
@RestController
@Tag(name = "home", description = "Bosh sahifalar")
class AccountantHomeController {

    private final AccountantHome home;
    private final CurrentActor currentActor;

    AccountantHomeController(AccountantHome home, CurrentActor currentActor) {
        this.home = home;
        this.currentActor = currentActor;
    }

    @GetMapping("/api/home/accountant")
    @PreAuthorize("hasAnyAuthority('reports.all', 'reports.view')")
    @Operation(summary = "Buxgalter bosh sahifasi: kassa/bank, qarzlar, to'lov taqvimi (14 kun), ish ro'yxati, pul filiallar bo'yicha")
    AccountantHome.AccountantHomeView get(@RequestParam(required = false) Long branchId) {
        return home.home(currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized")), branchId);
    }
}
