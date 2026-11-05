package uz.medix.finance.cash;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/** Kassir paneli (SPEC 8): ko'rish — cash.view. Filial doirasi serverda. */
@RestController
@Tag(name = "cash-panel", description = "Kassir paneli")
class CashPanelController {

    private final CashPanel panel;
    private final CurrentActor currentActor;

    CashPanelController(CashPanel panel, CurrentActor currentActor) {
        this.panel = panel;
        this.currentActor = currentActor;
    }

    @GetMapping("/api/cash-panel")
    @PreAuthorize("hasAuthority('cash.view')")
    @Operation(summary = "Kassir paneli: qoldiqlar, kirim/chiqim, xarajat moddalari, kutilayotganlar, hisoblar, dinamika, oxirgi operatsiyalar")
    CashPanel.Panel get(@RequestParam long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long accountId) {
        return panel.panel(currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized")), branchId, from, to,
                accountId);
    }
}
