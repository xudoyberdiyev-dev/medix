package uz.medix.inventory.transfer;

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
import uz.medix.inventory.ZoneType;

/** ZK (zona ko'chirishi) API shakllari. Tannarx yo'q — ko'chirish tannarxni o'zgartirmaydi. */
final class ZoneTransferModels {

    private ZoneTransferModels() {}

    static final int MAX_LINES = 500;
    static final int MAX_QTY = 10_000_000;

    enum Status { DRAFT, PENDING, POSTED, REJECTED, CANCELLED }

    record ZoneTransferLineRequest(
            @NotNull(message = "{validation.required}") Long batchId,
            @NotNull(message = "{validation.required}") @Min(1) @Max(MAX_QTY) Integer qty) {}

    record ZoneTransferRequest(
            @NotNull(message = "{validation.required}") Long fromZoneId,
            @NotNull(message = "{validation.required}") Long toZoneId,
            @Size(max = 500) String note,
            @NotEmpty(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid @NotNull ZoneTransferLineRequest> lines) {}

    record ZoneTransferRejectRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record ZoneRef(long id, String name, ZoneType type) {}

    record ZoneTransferSummary(long id, String number, long branchId, long warehouseId, String warehouse, ZoneRef from, ZoneRef to,
            Status status, boolean needsApproval, int lines, long qty, String createdBy, Instant createdAt,
            @Schema(nullable = true) Instant postedAt) {}

    record ZoneTransferPage(List<ZoneTransferSummary> items, long total, int page, int size) {}

    record ZoneTransferLine(long id, int lineNo, long batchId, String batchNumber, LocalDate expiryDate, long productId,
            String productCode, String productName, int qty) {}

    record ZoneTransferDetail(long id, String number, long branchId, long warehouseId, String warehouse, ZoneRef from, ZoneRef to,
            Status status, boolean needsApproval, @Schema(nullable = true) String note, String createdBy, Instant createdAt,
            @Schema(nullable = true) String postedBy, @Schema(nullable = true) Instant postedAt,
            @Schema(nullable = true) String rejectedBy, @Schema(nullable = true) Instant rejectedAt,
            @Schema(nullable = true) String rejectReason, @Schema(nullable = true) String cancelledBy,
            @Schema(nullable = true) Instant cancelledAt, long totalQty, List<ZoneTransferLine> lines) {}

    /** Zonadagi partiya: qoldiq, faol zahira va ko'chirish mumkin bo'lgan bo'sh miqdor. */
    record ZoneStockRow(long batchId, String batchNumber, LocalDate expiryDate, long productId, String productCode, String productName,
            int qty, int reserved, int free) {}
}
