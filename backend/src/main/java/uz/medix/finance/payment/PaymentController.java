package uz.medix.finance.payment;

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
import uz.medix.finance.payment.PaymentModels.CancelRequest;
import uz.medix.finance.payment.PaymentModels.OpenDocs;
import uz.medix.finance.payment.PaymentModels.PaymentDetail;
import uz.medix.finance.payment.PaymentModels.PaymentRequest;
import uz.medix.finance.payment.PaymentModels.PaymentStatus;
import uz.medix.finance.payment.PaymentModels.PaymentSummary;
import uz.medix.finance.payment.PaymentModels.PostRequest;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** Mijozdan to'lov (MT). Ruxsatlar (T12): ko'rish — payments.view, yaratish/o'tkazish — payments.mt, bekor qilish — payments.cancel. */
@RestController
@RequestMapping("/api/payments/customer")
@Tag(name = "payments", description = "Mijozdan to'lovlar (MT)")
class PaymentController {

    private final Payments payments;
    private final CurrentActor currentActor;

    PaymentController(Payments payments, CurrentActor currentActor) {
        this.payments = payments;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('payments.view')")
    @Operation(summary = "MT ro'yxati")
    List<PaymentSummary> list(@RequestParam(required = false) Long branchId, @RequestParam(required = false) PaymentStatus status,
            @RequestParam(required = false) Long customerId) {
        return payments.list(actor(), branchId, status, customerId);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('payments.view')")
    @Operation(summary = "MT kartochkasi (taqsimot bilan)")
    PaymentDetail get(@PathVariable long id) {
        return payments.find(actor(), id);
    }

    @GetMapping("/open-docs")
    @PreAuthorize("hasAuthority('payments.view')")
    @Operation(summary = "Mijozning ochiq qarzlari (eng eskisi birinchi) va avansi")
    OpenDocs openDocs(@RequestParam long branchId, @RequestParam long customerId) {
        return payments.openDocs(actor(), branchId, customerId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('payments.mt')")
    @Operation(summary = "MT qoralamasi")
    PaymentDetail create(@Valid @RequestBody PaymentRequest r) {
        Actor a = actor();
        return payments.find(a, payments.create(a, r));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('payments.mt')")
    @Operation(summary = "Qoralamani o'zgartirish")
    PaymentDetail update(@PathVariable long id, @Valid @RequestBody PaymentRequest r) {
        Actor a = actor();
        payments.update(a, id, r);
        return payments.find(a, id);
    }

    @PostMapping("/{id}/post")
    @PreAuthorize("hasAuthority('payments.mt')")
    @Operation(summary = "O'tkazish", description = "Taqsimot: avtomatik (eng eski qarzdan) yoki qo'lda; ortig'i avans. Pul hisobga tushadi.")
    PaymentDetail post(@PathVariable long id, @Valid @RequestBody PostRequest r) {
        Actor a = actor();
        payments.post(a, id, r.allocations());
        return payments.find(a, id);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('payments.cancel')")
    @Operation(summary = "Bekor qilish", description = "O'tkazilgan bo'lsa: qarz va hisob qoldig'i teskari yoziladi.")
    PaymentDetail cancel(@PathVariable long id, @Valid @RequestBody CancelRequest r) {
        Actor a = actor();
        payments.cancel(a, id, r.reason());
        return payments.find(a, id);
    }
}
