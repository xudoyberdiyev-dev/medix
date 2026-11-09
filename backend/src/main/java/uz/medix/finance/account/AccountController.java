package uz.medix.finance.account;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
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
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** Pul hisoblari: ko'rish — kassa, bank yoki to'lovlar ruxsati; yangi hisob — Sozlamalar (Direktor / Admin). */
@RestController
@RequestMapping("/api/money-accounts")
@Tag(name = "money-accounts", description = "Kassa, Terminal va bank hisoblari")
class AccountController {

    private final Accounts accounts;
    private final CurrentActor currentActor;

    AccountController(Accounts accounts, CurrentActor currentActor) {
        this.accounts = accounts;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('cash.view', 'bank.view', 'payments.view')")
    @Operation(summary = "Filial hisoblari (qoldiq bilan)")
    List<Accounts.Account> list(@RequestParam long branchId) {
        return accounts.list(actor(), branchId);
    }

    @GetMapping("/all")
    @PreAuthorize("hasAnyAuthority('cash.view', 'bank.view', 'payments.view')")
    @Operation(summary = "Barcha ochiq filiallar hisoblari (qoldiq bilan)",
            description = "Kassa sahifasi filial tanlanmaganda (prototip Cash): chaqiruvchiga ochiq filiallarning barcha hisoblari.")
    List<Accounts.Account> listAll() {
        return accounts.listAll(actor());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('settings.view')")
    @Operation(summary = "Yangi hisob (kassa, Terminal yoki bank)")
    Accounts.Account create(@Valid @RequestBody Accounts.AccountRequest r) {
        Actor a = actor();
        long id = accounts.create(a, r);
        return accounts.find(id).orElseThrow();
    }

    @GetMapping("/cashier-options")
    @PreAuthorize("hasAnyAuthority('settings.view', 'cash.approve')")
    @Operation(summary = "Kassaga biriktirish mumkin boʻlgan xodimlar (cash.io ruxsatli)")
    List<Accounts.CashierOption> cashierOptions(@RequestParam long branchId) {
        return accounts.cashierOptions(actor(), branchId);
    }

    @PutMapping("/{id}/cashier")
    @PreAuthorize("hasAnyAuthority('settings.view', 'cash.approve')")
    @Operation(summary = "Kassaga kassir biriktirish (null — olib tashlash). Kassir amallarni faqat oʻz kassasida bajaradi")
    Accounts.Account assignCashier(@PathVariable long id, @RequestBody Accounts.CashierRequest r) {
        accounts.assignCashier(actor(), id, r.cashierId());
        return accounts.find(id).orElseThrow();
    }
}
