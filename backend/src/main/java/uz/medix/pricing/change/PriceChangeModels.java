package uz.medix.pricing.change;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** NO (narx o'zgarishi) va narxlar API shakllari. Pul — satr. */
final class PriceChangeModels {

    private PriceChangeModels() {}

    enum Status { DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED }

    enum BaseKind { CURRENT_SAME_TYPE, BASE_PRICE }

    record LineRequest(
            @NotNull(message = "{validation.required}") Long productId,
            @NotNull(message = "{validation.required}") Long priceTypeId,
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^\\d{1,16}(\\.\\d{1,2})?$", message = "{validation.money}")
                    String newPrice) {}

    record PriceChangeRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotNull(message = "{validation.required}") LocalDate effectiveFrom,
            @Schema(nullable = true) @Size(max = 500) String note,
            @NotEmpty(message = "{priceChange.noLines}") @Size(max = 5000) List<@Valid LineRequest> lines) {}

    record Line(
            long id,
            long productId,
            String productCode,
            String productName,
            long priceTypeId,
            String priceType,
            @Schema(nullable = true) String oldPrice,
            String newPrice,
            @Schema(nullable = true, description = "O'zgarish, %") String changePercent,
            @Schema(description = "20% dan ko'p o'zgarish") boolean bigChange) {}

    record PriceChangeSummary(long id, String number, long branchId, Status status, LocalDate effectiveFrom, int lines,
            String createdBy, Instant createdAt, @Schema(nullable = true) Instant decidedAt) {}

    record PriceChangePage(List<PriceChangeSummary> items, long total, int page, int size) {}

    record PriceChangeDetail(
            long id,
            String number,
            long branchId,
            Status status,
            LocalDate effectiveFrom,
            @Schema(nullable = true) String note,
            String createdBy,
            Instant createdAt,
            @Schema(nullable = true) Instant submittedAt,
            @Schema(nullable = true) String decidedBy,
            @Schema(nullable = true) Instant decidedAt,
            @Schema(nullable = true) String decisionReason,
            int bigChanges,
            List<Line> lines) {}

    record ReasonRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record PinRequest(@NotBlank(message = "{validation.required}") String pin) {}

    record MarkupRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotEmpty(message = "{priceChange.noLines}") @Size(max = 5000) List<Long> productIds,
            @NotNull(message = "{validation.required}") Long priceTypeId,
            @NotNull(message = "{validation.required}") BaseKind base,
            @NotNull(message = "{validation.required}") @DecimalMin("-90") @DecimalMax("1000") BigDecimal percent,
            @Schema(description = "0, 100, 500 yoki 1000") int rounding) {}

    record MarkupLine(long productId, String productCode, String productName, @Schema(nullable = true) String basePrice,
            @Schema(nullable = true) String oldPrice, @Schema(nullable = true) String newPrice) {}

    /** «Narxlar» jadvali: mahsulot va narx turlari bo'yicha amaldagi narxlar. */
    record PriceRow(long productId, String code, String name, @Schema(nullable = true) String manufacturer,
            @Schema(description = "Narx turi id → narx") Map<String, String> prices) {}

    record PricePage(List<PriceRow> items, long total, int page, int size) {}
}
