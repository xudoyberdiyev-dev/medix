package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** QM (mijozdan qaytarish) API shakllari. Pul — satr; narx — sotuv narxi (chegirma bilan). Tannarx yuborilmaydi. */
final class CustomerReturnModels {

    private CustomerReturnModels() {}

    static final int MAX_LINES = 500;
    static final int MAX_QTY = 10_000_000;

    enum Status { PENDING, POSTED, REJECTED, CANCELLED }

    /** Sabab (prototip QM_REASONS): muddati yaqin, shikastlangan, noto'g'ri yuborilgan, mijoz rad etdi, boshqa (izoh majburiy). */
    enum Reason { EXPIRING, DAMAGED, WRONG_ITEM, REFUSED, OTHER }

    record CustomerReturnLineRequest(
            @NotNull(message = "{validation.required}") Long saleLineId,
            @NotNull(message = "{validation.required}") @Min(1) @Max(MAX_QTY) Integer qty,
            @NotNull(message = "{validation.required}") Reason reason) {}

    record CustomerReturnRequest(
            @NotNull(message = "{validation.required}") Long saleId,
            @Size(max = 500) String note,
            @NotEmpty(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid @NotNull CustomerReturnLineRequest> lines) {}

    record CustomerReturnRejectRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record CustomerReturnSummary(long id, String number, long branchId, String branch, long customerId, String customer,
            @Schema(nullable = true) String region, long saleId, String saleNumber, long warehouseId, String warehouse, LocalDate returnDate,
            Status status, int lines, long qty, String total, String createdBy, Instant createdAt, @Schema(nullable = true) Instant postedAt) {}

    record CustomerReturnPage(List<CustomerReturnSummary> items, long total, int page, int size) {}

    record CustomerReturnLine(long id, int lineNo, long saleLineId, long productId, String productCode, String productName, long batchId,
            String batchNumber, LocalDate expiryDate, int qty, String price, String amount, Reason reason) {}

    record CustomerReturnDetail(long id, String number, long branchId, String branch, long customerId, String customer, long saleId,
            String saleNumber, LocalDate saleDate, long orderId, String orderNumber, long warehouseId, String warehouse,
            @Schema(nullable = true) String quarantineZone, LocalDate returnDate, Status status, @Schema(nullable = true) String note,
            String total, long totalQty, String createdBy, Instant createdAt, @Schema(nullable = true) String postedBy,
            @Schema(nullable = true) Instant postedAt, @Schema(nullable = true) String rejectedBy, @Schema(nullable = true) Instant rejectedAt,
            @Schema(nullable = true) String rejectReason, @Schema(nullable = true) String cancelledBy,
            @Schema(nullable = true) Instant cancelledAt, @Schema(nullable = true) String cancelReason,
            @Schema(description = "Qaytarish muddatidan keyin yaratilgan (O8, qm.late)") boolean late, List<CustomerReturnLine> lines) {}

    /** Mijozning qaytarish mumkin bo'lgan sotuvlari (prototip `custSales`): qaytarsa bo'ladigan qatorlar soni. */
    record ReturnableSale(long id, String number, LocalDate saleDate, String total, long warehouseId, String warehouse, int returnableLines,
            @Schema(description = "Yetkazilgan sana (Toshkent)") LocalDate deliveredOn,
            @Schema(description = "Yetkazilganidan beri kun") int daysAgo,
            @Schema(description = "Qaytarish muddati o'tgan (O8): faqat qm.late bilan") boolean late) {}

    /** Sotuv qatori: sotilgan / avval qaytarilgan (o'tkazilgan + kutilayotgan) / qoldi; narx — sotuv narxi. */
    record ReturnableLine(long saleLineId, long productId, String productCode, String productName, boolean marked, long batchId,
            String batchNumber, LocalDate expiryDate, int sold, int returned, int left, String price) {}
}
