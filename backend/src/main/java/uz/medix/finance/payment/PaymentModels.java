package uz.medix.finance.payment;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

final class PaymentModels {

    private PaymentModels() {}

    enum PaymentStatus { DRAFT, POSTED, CANCELLED }

    enum PaymentSource { MANUAL, DRIVER }

    record PaymentRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotNull(message = "{validation.required}") Long customerId,
            @NotNull(message = "{validation.required}") Long accountId,
            @Schema(nullable = true, description = "Bo'sh bo'lsa — bugun") LocalDate paymentDate,
            @NotBlank(message = "{validation.required}") @Size(max = 24) @Schema(description = "Summa, masalan «250000.00»") String amount,
            @Schema(nullable = true) @Size(max = 500) String note) {}

    record PaymentAllocationRequest(
            @NotBlank(message = "{validation.required}") @Size(max = 8) String docType,
            @NotNull(message = "{validation.required}") Long docId,
            @NotBlank(message = "{validation.required}") @Size(max = 24) String amount) {}

    record PaymentPostRequest(
            @Schema(nullable = true, description = "Bo'sh — avtomatik (eng eski qarzdan); berilsa — qo'lda taqsimot, ortig'i avans")
            @Size(max = 500) List<@Valid PaymentAllocationRequest> allocations) {}

    record PaymentCancelRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record PaymentAllocation(String docType, long docId, String docNumber, String amount) {}

    record OpenDocView(String docType, long docId, String docNumber, LocalDate date, @Schema(nullable = true) LocalDate dueDate, String open,
            @Schema(description = "Muddati o'tgan kunlar (0 — o'tmagan)") int overdueDays) {}

    record OpenDocs(String debt, @Schema(description = "Taqsimlanmagan to'lovlar (avans)") String advance, List<OpenDocView> docs) {}

    record PaymentSummary(long id, String number, long branchId, long customerId, String customer, long accountId, String account,
            String accountKind, LocalDate paymentDate, String amount, PaymentStatus status, PaymentSource source, String createdBy,
            Instant createdAt) {}

    record PaymentDetail(long id, String number, long branchId, long customerId, String customer, @Schema(nullable = true) String customerTin,
            long accountId, String account, String accountKind, LocalDate paymentDate, String amount, @Schema(nullable = true) String advance,
            PaymentStatus status, PaymentSource source, @Schema(nullable = true) String sourceRef, @Schema(nullable = true) String note,
            String createdBy, Instant createdAt, @Schema(nullable = true) String postedBy, @Schema(nullable = true) Instant postedAt,
            @Schema(nullable = true) String cancelledBy, @Schema(nullable = true) Instant cancelledAt,
            @Schema(nullable = true) String cancelReason, long version, List<PaymentAllocation> allocations) {}
}
