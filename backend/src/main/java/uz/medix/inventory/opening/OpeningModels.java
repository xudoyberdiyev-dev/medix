package uz.medix.inventory.opening;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import uz.medix.inventory.ZoneType;

/** BQ (boshlang'ich qoldiq, tovar) API shakllari. Pul — satr. */
final class OpeningModels {

    private OpeningModels() {}

    static final int MAX_LINES = 20_000;
    static final int MAX_QTY = 10_000_000;

    enum Status { DRAFT, POSTED, CANCELLED }

    enum Source { MANUAL, IMPORT }

    record OpeningLineRequest(
            @NotNull(message = "{validation.required}") Long productId,
            @NotNull(message = "{validation.required}") Long zoneId,
            @NotBlank(message = "{validation.required}") @Size(max = 60) String batchNumber,
            @Schema(nullable = true) LocalDate producedOn,
            @NotNull(message = "{validation.required}") LocalDate expiryDate,
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^\\d{1,16}(\\.\\d{1,2})?$", message = "{validation.money}")
                    String cost,
            boolean bonus,
            @NotNull(message = "{validation.required}") @Min(1) @Max(MAX_QTY) Integer qty) {}

    record OpeningRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotNull(message = "{validation.required}") Long warehouseId,
            @NotNull(message = "{validation.required}") LocalDate cutoffDate,
            @Schema(nullable = true) @Size(max = 500) String note,
            @NotNull(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid OpeningLineRequest> lines) {}

    record OpeningLine(
            long id,
            int lineNo,
            long productId,
            String productCode,
            String productName,
            long zoneId,
            String zone,
            ZoneType zoneType,
            String batchNumber,
            @Schema(nullable = true) LocalDate producedOn,
            LocalDate expiryDate,
            @Schema(nullable = true, description = "Faqat special.cost ruxsati bilan") String cost,
            boolean bonus,
            int qty,
            @Schema(nullable = true, description = "O'tkazilgandan keyin yaratilgan partiya") Long batchId,
            @Schema(description = "Yaroqlilik qoldiq sanasigacha tugagan") boolean expired) {}

    record OpeningSummary(
            long id,
            String number,
            long branchId,
            long warehouseId,
            String warehouse,
            LocalDate cutoffDate,
            Status status,
            Source source,
            int lines,
            long totalQty,
            @Schema(nullable = true, description = "Faqat special.cost ruxsati bilan") String totalCost,
            String createdBy,
            Instant createdAt,
            @Schema(nullable = true) Instant postedAt) {}

    record OpeningPage(List<OpeningSummary> items, long total, int page, int size) {}

    record OpeningDetail(
            long id,
            String number,
            long branchId,
            long warehouseId,
            String warehouse,
            LocalDate cutoffDate,
            Status status,
            Source source,
            @Schema(nullable = true) String fileName,
            @Schema(nullable = true) String note,
            String createdBy,
            Instant createdAt,
            @Schema(nullable = true) String postedBy,
            @Schema(nullable = true) Instant postedAt,
            @Schema(nullable = true) String cancelledBy,
            @Schema(nullable = true) Instant cancelledAt,
            @Schema(nullable = true) String cancelReason,
            long totalQty,
            @Schema(nullable = true, description = "Faqat special.cost ruxsati bilan") String totalCost,
            int expiredLines,
            List<OpeningLine> lines) {}

    record OpeningCancelRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record OpeningImportError(int row, String message) {}

    record OpeningImportResult(boolean applied, int rows, List<OpeningImportError> errors) {}
}
