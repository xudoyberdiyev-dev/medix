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
import uz.medix.finance.payment.PaymentModels.OpenDocs;
import uz.medix.finance.payment.PaymentModels.PaymentCancelRequest;
import uz.medix.finance.payment.PaymentModels.PaymentPostRequest;
import uz.medix.finance.payment.PaymentModels.SupplierPaymentDetail;
import uz.medix.finance.payment.PaymentModels.SupplierPaymentRequest;
import uz.medix.finance.payment.PaymentModels.SupplierPaymentStatus;
import uz.medix.finance.payment.PaymentModels.SupplierPaymentSummary;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Yetkazib beruvchiga to'lov (YT). Ruxsatlar (T12): ko'rish — payments.view; qoralama va tasdiqqa yuborish — payments.yt;
 * tasdiqlash / qaytarish — payments.ytApprove; tasdiqsiz o'tkazish — payments.ytDirect; bekor qilish — payments.cancel.
 */
@RestController
@RequestMapping("/api/payments/supplier")
@Tag(name = "supplier-payments", description = "Yetkazib beruvchiga to'lovlar (YT)")
class SupplierPaymentController {

    private final SupplierPayments payments;
    private final CurrentActor currentActor;

    SupplierPaymentController(SupplierPayments payments, CurrentActor currentActor) {
        this.payments = payments;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('payments.view')")
    @Operation(summary = "YT ro'yxati")
    List<SupplierPaymentSummary> listSupplierPayments(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) SupplierPaymentStatus status, @RequestParam(required = false) Long supplierId) {
        return payments.list(actor(), branchId, status, supplierId);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('payments.view')")
    @Operation(summary = "YT kartochkasi")
    SupplierPaymentDetail getSupplierPayment(@PathVariable long id) {
        return payments.find(actor(), id);
    }

    @GetMapping("/{id}/history")
    @PreAuthorize("hasAuthority('payments.view')")
    @Operation(summary = "YT tarixi", description = "Audit jurnalidan: yaratildi, tahrirlandi, yuborildi, tasdiqlandi, qaytarildi, bekor qilindi.")
    List<PaymentModels.PaymentHistoryEvent> supplierPaymentHistory(@PathVariable long id) {
        payments.find(actor(), id);
        return payments.history(id);
    }

    @GetMapping("/open-docs")
    @PreAuthorize("hasAuthority('payments.view')")
    @Operation(summary = "YB oldidagi ochiq qarzlar (eng eskisi birinchi) va avans")
    OpenDocs supplierOpenDocs(@RequestParam long branchId, @RequestParam long supplierId) {
        return payments.openDocs(actor(), branchId, supplierId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('payments.yt')")
    @Operation(summary = "YT qoralamasi")
    SupplierPaymentDetail createSupplierPayment(@Valid @RequestBody SupplierPaymentRequest r) {
        Actor a = actor();
        return payments.find(a, payments.create(a, r));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('payments.yt')")
    @Operation(summary = "YT qoralamasini o'zgartirish")
    SupplierPaymentDetail updateSupplierPayment(@PathVariable long id, @Valid @RequestBody SupplierPaymentRequest r) {
        Actor a = actor();
        payments.update(a, id, r);
        return payments.find(a, id);
    }

    @PostMapping("/{id}/send")
    @PreAuthorize("hasAuthority('payments.yt')")
    @Operation(summary = "Tasdiqqa yuborish")
    SupplierPaymentDetail sendSupplierPayment(@PathVariable long id) {
        Actor a = actor();
        payments.send(a, id);
        return payments.find(a, id);
    }

    @PostMapping("/{id}/return")
    @PreAuthorize("hasAuthority('payments.ytApprove')")
    @Operation(summary = "Qoralamaga qaytarish (sabab bilan)")
    SupplierPaymentDetail returnSupplierPayment(@PathVariable long id, @Valid @RequestBody PaymentCancelRequest r) {
        Actor a = actor();
        payments.returnToDraft(a, id, r.reason());
        return payments.find(a, id);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('payments.ytApprove')")
    @Operation(summary = "Tasdiqlash va o'tkazish", description = "Pul hisobdan chiqadi; summa eng eski kirim qarzidan (yoki qo'lda) taqsimlanadi.")
    SupplierPaymentDetail approveSupplierPayment(@PathVariable long id, @Valid @RequestBody PaymentPostRequest r) {
        Actor a = actor();
        payments.post(a, id, r.allocations(), SupplierPaymentStatus.PENDING);
        return payments.find(a, id);
    }

    @PostMapping("/{id}/post")
    @PreAuthorize("hasAuthority('payments.ytDirect')")
    @Operation(summary = "Tasdiqsiz o'tkazish")
    SupplierPaymentDetail postSupplierPayment(@PathVariable long id, @Valid @RequestBody PaymentPostRequest r) {
        Actor a = actor();
        payments.post(a, id, r.allocations(), SupplierPaymentStatus.DRAFT);
        return payments.find(a, id);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('payments.cancel')")
    @Operation(summary = "YT ni bekor qilish", description = "O'tkazilgan bo'lsa: qarz va hisob qoldig'i teskari yoziladi.")
    SupplierPaymentDetail cancelSupplierPayment(@PathVariable long id, @Valid @RequestBody PaymentCancelRequest r) {
        Actor a = actor();
        payments.cancel(a, id, r.reason());
        return payments.find(a, id);
    }
}
