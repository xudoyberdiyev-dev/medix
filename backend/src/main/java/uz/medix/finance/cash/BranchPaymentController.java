package uz.medix.finance.cash;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.finance.cash.BranchPayments.BranchPayment;
import uz.medix.finance.cash.BranchPayments.BranchPaymentRequest;
import uz.medix.finance.cash.BranchPayments.PayeeAccount;
import uz.medix.finance.cash.CashModels.ReasonRequest;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** Filiallar o'rtasida hisob-kitob (FS qarzini to'lash): ko'rish — cash.view/bank.view, to'lash — cash.io, bekor qilish — cash.cancel. */
@RestController
@RequestMapping("/api/branch-payments")
@Tag(name = "cash", description = "Kassa va bank")
class BranchPaymentController {

    private static final String VIEW = "hasAnyAuthority('cash.view', 'bank.view')";

    private final BranchPayments payments;
    private final CurrentActor currentActor;

    BranchPaymentController(BranchPayments payments, CurrentActor currentActor) {
        this.payments = payments;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @PreAuthorize(VIEW)
    @Operation(summary = "Filiallararo to'lovlar", description = "Filial to'lovchi yoki oluvchi bo'lganlari.")
    List<BranchPayment> list(@RequestParam(required = false) Long branchId) {
        return payments.list(actor(), branchId);
    }

    @GetMapping("/payee-accounts")
    @PreAuthorize("hasAuthority('cash.io')")
    @Operation(summary = "Oluvchi filial hisoblari", description = "Faqat nom va tur — qoldiq ko'rsatilmaydi.")
    List<PayeeAccount> payeeAccounts(@RequestParam long payerBranchId, @RequestParam long payeeBranchId) {
        return payments.payeeAccounts(actor(), payerBranchId, payeeBranchId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('cash.io')")
    @Operation(summary = "Filialga to'lov",
            description = "Darhol o'tkaziladi: to'lovchi hisobidan chiqim, oluvchi hisobiga kirim, filiallararo qarz kamayadi. Qarzdan oshmaydi.")
    BranchPayment create(@Valid @RequestBody BranchPaymentRequest r) {
        Actor a = actor();
        return payments.find(a, payments.create(a, r)).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('cash.cancel')")
    @Operation(summary = "Filiallararo to'lovni bekor qilish", description = "Teskari: pul qaytadi, qarz tiklanadi.")
    BranchPayment cancel(@PathVariable long id, @Valid @RequestBody ReasonRequest r) {
        Actor a = actor();
        payments.cancel(a, id, r.reason());
        return payments.find(a, id).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }
}
