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
            @Schema(nullable = true) @Size(max = 500) String note,
            @Schema(nullable = true, description = "To'lov topshiriqnomasi № (bank)") @Size(max = 30) String payOrderNo,
            @Schema(nullable = true, description = "Bank sanasi") LocalDate bankDate,
            @Schema(nullable = true, description = "Terminal cheki raqami") @Size(max = 30) String checkNo) {}

    /** Bank / terminal rekvizitlari (bo'sh satr — null). */
    record BankRefs(String payOrderNo, LocalDate bankDate, String checkNo) {
        static final BankRefs NONE = new BankRefs(null, null, null);

        static BankRefs of(String payOrderNo, LocalDate bankDate, String checkNo) {
            return new BankRefs(blank(payOrderNo), bankDate, blank(checkNo));
        }

        private static String blank(String s) {
            return s == null || s.isBlank() ? null : s.strip();
        }
    }

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
            @Schema(description = "Muddati o'tgan kunlar (0 — o'tmagan)") int overdueDays,
            @Schema(description = "Hujjat summasi") String total,
            @Schema(description = "Qaytarishlar (QM/QY) bilan kamaygan summa") String returned,
            @Schema(description = "Avval to'langan (MT/YT/AH taqsimotlari)") String paid,
            @Schema(nullable = true, description = "Tashqi raqam — YB yuk xati / hisob-faktura raqami (kirimda)") String extNo) {}

    record LastPayment(long id, String number, LocalDate date, String amount) {}

    record DocPaymentLine(long paymentId, String number, LocalDate date, String account, String amount) {}

    record DocPayment(String total, String settled, String open, @Schema(nullable = true) LocalDate dueDate,
            @Schema(description = "Muddati o'tgan kunlar (0 — o'tmagan yoki yopilgan)") int overdueDays,
            @Schema(description = "Shu hujjatga taqsimlangan o'tkazilgan MT lar") List<DocPaymentLine> payments) {}

    record OpenDocs(String debt, @Schema(description = "Taqsimlanmagan to'lovlar (avans)") String advance, List<OpenDocView> docs,
            @Schema(nullable = true, description = "Shu filialdagi oxirgi o'tkazilgan to'lov") LastPayment lastPayment) {}

    record PaymentSummary(long id, String number, long branchId, long customerId, String customer, long accountId, String account,
            String accountKind, LocalDate paymentDate, String amount, PaymentStatus status, PaymentSource source, String createdBy,
            Instant createdAt) {}

    record PaymentDetail(long id, String number, long branchId, long customerId, String customer, @Schema(nullable = true) String customerTin,
            long accountId, String account, String accountKind, LocalDate paymentDate, String amount, @Schema(nullable = true) String advance,
            PaymentStatus status, PaymentSource source, @Schema(nullable = true) String sourceRef, @Schema(nullable = true) String note,
            String createdBy, Instant createdAt, @Schema(nullable = true) String postedBy, @Schema(nullable = true) Instant postedAt,
            @Schema(nullable = true) String cancelledBy, @Schema(nullable = true) Instant cancelledAt,
            @Schema(nullable = true) String cancelReason, long version, List<PaymentAllocation> allocations,
            @Schema(nullable = true) String payOrderNo, @Schema(nullable = true) LocalDate bankDate, @Schema(nullable = true) String checkNo) {}

    // ===== YT =====

    enum SupplierPaymentStatus { DRAFT, PENDING, POSTED, CANCELLED }

    record SupplierPaymentRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotNull(message = "{validation.required}") Long supplierId,
            @NotNull(message = "{validation.required}") Long accountId,
            @Schema(nullable = true, description = "Bo'sh bo'lsa — bugun") LocalDate paymentDate,
            @NotBlank(message = "{validation.required}") @Size(max = 24) @Schema(description = "Summa, masalan «250000.00»") String amount,
            @Schema(nullable = true) @Size(max = 500) String note,
            @Schema(nullable = true, description = "To'lov topshiriqnomasi № (bank)") @Size(max = 30) String payOrderNo,
            @Schema(nullable = true, description = "Bank sanasi") LocalDate bankDate,
            @Schema(nullable = true, description = "Terminal cheki raqami") @Size(max = 30) String checkNo) {}

    record SupplierPaymentSummary(long id, String number, long branchId, long supplierId, String supplier, long accountId, String account,
            String accountKind, LocalDate paymentDate, String amount, SupplierPaymentStatus status, String createdBy, Instant createdAt) {}

    record SupplierPaymentDetail(long id, String number, long branchId, long supplierId, String supplier, @Schema(nullable = true) String supplierTin,
            long accountId, String account, String accountKind, String accountBalance, LocalDate paymentDate, String amount,
            @Schema(nullable = true) String advance, SupplierPaymentStatus status, @Schema(nullable = true) String note, String createdBy,
            Instant createdAt, @Schema(nullable = true) String sentBy, @Schema(nullable = true) Instant sentAt,
            @Schema(nullable = true) String returnedReason, @Schema(nullable = true) String postedBy, @Schema(nullable = true) Instant postedAt,
            @Schema(nullable = true) String cancelledBy, @Schema(nullable = true) Instant cancelledAt,
            @Schema(nullable = true) String cancelReason, long version, List<PaymentAllocation> allocations,
            @Schema(nullable = true) String payOrderNo, @Schema(nullable = true) LocalDate bankDate, @Schema(nullable = true) String checkNo) {}
}
