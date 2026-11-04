package uz.medix.finance.cash;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.finance.cash.CashModels.CashOp;
import uz.medix.finance.cash.CashModels.CashOpRequest;
import uz.medix.finance.cash.CashModels.CloseRequest;
import uz.medix.finance.cash.CashModels.ClosePreview;
import uz.medix.finance.cash.CashModels.DayClose;
import uz.medix.finance.cash.CashModels.OpStatus;
import uz.medix.finance.cash.CashModels.ReasonRequest;
import uz.medix.finance.cash.CashModels.Statement;
import uz.medix.finance.cash.CashModels.Transfer;
import uz.medix.finance.cash.CashModels.TransferRequest;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Kassa va bank (SPEC 5.5). Ruxsatlar (T12): ko'rish — cash.view yoki bank.view; KO/BO va IO — cash.io; 2 000 000 dan katta kassa
 * chiqimini tasdiqlash / rad etish — cash.approve; bekor qilish — cash.cancel; kunni yopish — cash.close, farq bilan — cash.closeDiff.
 */
@RestController
@Tag(name = "cash", description = "Kassa/bank operatsiyalari (KO/BO), o'tkazmalar (IO), ko'chirma, kunni yopish")
class CashController {

    private static final String VIEW = "hasAnyAuthority('cash.view', 'bank.view')";

    private final CashOps ops;
    private final Transfers transfers;
    private final DayCloses closes;
    private final CurrentActor currentActor;

    CashController(CashOps ops, Transfers transfers, DayCloses closes, CurrentActor currentActor) {
        this.ops = ops;
        this.transfers = transfers;
        this.closes = closes;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    // ===== KO / BO =====

    @GetMapping("/api/cash-ops")
    @PreAuthorize(VIEW)
    @Operation(summary = "KO/BO ro'yxati")
    List<CashOp> listOps(@RequestParam(required = false) Long branchId, @RequestParam(required = false) Long accountId,
            @RequestParam(required = false) OpStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ops.list(actor(), branchId, accountId, status, from, to);
    }

    @GetMapping("/api/cash-ops/{id}")
    @PreAuthorize(VIEW)
    @Operation(summary = "KO/BO kartochkasi")
    CashOp getOp(@PathVariable long id) {
        return ops.find(actor(), id);
    }

    @PostMapping("/api/cash-ops")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('cash.io')")
    @Operation(summary = "Kirim yoki chiqim (KO/BO)", description = "Kassadan 2 000 000 so'mdan katta chiqim «Tasdiqlashda» turadi, qolgani darhol o'tkaziladi.")
    CashOp createOp(@Valid @RequestBody CashOpRequest r) {
        Actor a = actor();
        return ops.find(a, ops.create(a, r));
    }

    @PostMapping("/api/cash-ops/{id}/approve")
    @PreAuthorize("hasAuthority('cash.approve')")
    @Operation(summary = "Chiqimni tasdiqlash (o'tkaziladi)")
    CashOp approveOp(@PathVariable long id) {
        Actor a = actor();
        ops.approve(a, id);
        return ops.find(a, id);
    }

    @PostMapping("/api/cash-ops/{id}/reject")
    @PreAuthorize("hasAuthority('cash.approve')")
    @Operation(summary = "Chiqimni rad etish")
    CashOp rejectOp(@PathVariable long id, @Valid @RequestBody ReasonRequest r) {
        Actor a = actor();
        ops.reject(a, id, r.reason());
        return ops.find(a, id);
    }

    @PostMapping("/api/cash-ops/{id}/cancel")
    @PreAuthorize("hasAuthority('cash.cancel')")
    @Operation(summary = "Bekor qilish", description = "Hisob qoldig'i bugungi sana bilan teskari yoziladi.")
    CashOp cancelOp(@PathVariable long id, @Valid @RequestBody ReasonRequest r) {
        Actor a = actor();
        ops.cancel(a, id, r.reason());
        return ops.find(a, id);
    }

    // ===== IO =====

    @GetMapping("/api/money-transfers")
    @PreAuthorize(VIEW)
    @Operation(summary = "Hisoblar orasida o'tkazmalar (IO)")
    List<Transfer> listTransfers(@RequestParam(required = false) Long branchId) {
        return transfers.list(actor(), branchId);
    }

    @PostMapping("/api/money-transfers")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('cash.io')")
    @Operation(summary = "O'tkazma (IO)", description = "Darhol o'tkaziladi: bir hisobdan chiqim, ikkinchisiga kirim.")
    Transfer createTransfer(@Valid @RequestBody TransferRequest r) {
        Actor a = actor();
        return transfers.find(a, transfers.create(a, r));
    }

    @PostMapping("/api/money-transfers/{id}/cancel")
    @PreAuthorize("hasAuthority('cash.cancel')")
    @Operation(summary = "O'tkazmani bekor qilish")
    Transfer cancelTransfer(@PathVariable long id, @Valid @RequestBody ReasonRequest r) {
        Actor a = actor();
        transfers.cancel(a, id, r.reason());
        return transfers.find(a, id);
    }

    // ===== Ko'chirma =====

    @GetMapping("/api/money-accounts/{id}/statement")
    @PreAuthorize(VIEW)
    @Operation(summary = "Hisob ko'chirmasi", description = "Davr boshi + kirim − chiqim = davr oxiri; harakatlar hujjat bilan.")
    Statement statement(@PathVariable long id, @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return closes.statement(actor(), id, from, to);
    }

    // ===== Kunni yopish =====

    @GetMapping("/api/cash-close/preview")
    @PreAuthorize("hasAuthority('cash.close')")
    @Operation(summary = "Kunni yopish oldidan: kutilgan qoldiq, kun aylanmasi, tasdiq kutayotganlar")
    ClosePreview preview(@RequestParam long accountId, @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return closes.preview(actor(), accountId, date);
    }

    @GetMapping("/api/cash-close")
    @PreAuthorize("hasAuthority('cash.view')")
    @Operation(summary = "Yopilgan kunlar")
    List<DayClose> listCloses(@RequestParam long branchId, @RequestParam(required = false) Long accountId) {
        return closes.list(actor(), branchId, accountId);
    }

    @PostMapping("/api/cash-close")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('cash.close')")
    @Operation(summary = "Kunni yopish", description = "Kupyuralar sanog'i. Farq bo'lsa — cash.closeDiff ruxsati, izoh va PIN; farq tuzatuvchi KO bilan yoziladi.")
    DayClose close(@Valid @RequestBody CloseRequest r, Authentication auth) {
        Actor a = actor();
        boolean mayDiff = auth.getAuthorities().stream().anyMatch(g -> "cash.closeDiff".equals(g.getAuthority()));
        return closes.find(a, closes.close(a, r, mayDiff));
    }
}
