package uz.medix.finance.cash;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** Bank ko'chirmasi bilan solishtirish: ko'rish — bank.view; yozish — bank.view va kassa/naqdsiz to'lov ruxsati. */
@RestController
@Tag(name = "bank-reconciliations", description = "Bank koʻchirmasi bilan solishtirish")
class BankReconciliationController {

    private static final String VIEW = "hasAuthority('bank.view')";
    private static final String EDIT = "hasAuthority('bank.view') and hasAnyAuthority('cash.io', 'payments.noncash')";

    private final BankReconciliations recons;
    private final CurrentActor currentActor;

    BankReconciliationController(BankReconciliations recons, CurrentActor currentActor) {
        this.recons = recons;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping("/api/bank-reconciliations/preview")
    @PreAuthorize(VIEW)
    @Operation(summary = "Solishtirish oynasi: sanadagi MEDIX qoldigʻi, oxirgi solishtirish, hali belgilanmagan harakatlar")
    BankReconciliations.ReconPreview preview(@RequestParam long accountId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return recons.preview(actor(), accountId, date);
    }

    @GetMapping("/api/bank-reconciliations")
    @PreAuthorize(VIEW)
    @Operation(summary = "Hisob boʻyicha solishtirishlar tarixi")
    List<BankReconciliations.Reconciliation> list(@RequestParam long accountId) {
        return recons.list(actor(), accountId);
    }

    @PostMapping("/api/bank-reconciliations")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(EDIT)
    @Operation(summary = "Solishtirishni yozish (farq boʻlsa — izoh majburiy)")
    BankReconciliations.Reconciliation create(@Valid @RequestBody BankReconciliations.ReconRequest r) {
        return recons.find(recons.create(actor(), r));
    }
}
