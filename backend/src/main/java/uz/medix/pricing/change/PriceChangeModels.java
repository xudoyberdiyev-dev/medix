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

    /** Ommaviy ustama asosi (SPEC 6): amaldagi narx, bazaviy narx, o'rtacha yoki oxirgi kirim narxi (partiyalar tannarxi). */
    enum BaseKind { CURRENT_SAME_TYPE, BASE_PRICE, AVG_RECEIPT, LAST_RECEIPT }

    record LineRequest(
            @NotNull(message = "{validation.required}") Long productId,
            @NotNull(message = "{validation.required}") Long priceTypeId,
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^\\d{1,16}(\\.\\d{1,2})?$", message = "{validation.money}")
                    String newPrice,
            @Schema(nullable = true, description = "«Kirim bo'yicha» rejimida — kirim partiyasi") Long batchId) {}

    record PriceChangeRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotNull(message = "{validation.required}") LocalDate effectiveFrom,
            @Schema(nullable = true) @Size(max = 500) String note,
            @NotEmpty(message = "{priceChange.noLines}") @Size(max = 5000) List<@Valid LineRequest> lines,
            @Schema(nullable = true, description = "To'ldirilsa — «Kirim bo'yicha» rejimi: narx faqat shu o'tkazilgan kirim partiyalariga")
                    Long receiptId) {}

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
            @Schema(description = "20% dan ko'p o'zgarish") boolean bigChange,
            @Schema(nullable = true) Long batchId,
            @Schema(nullable = true) String batchNumber,
            @Schema(nullable = true) LocalDate expiryDate) {}

    record PriceChangeSummary(long id, String number, long branchId, Status status, LocalDate effectiveFrom, int lines,
            String createdBy, Instant createdAt, @Schema(nullable = true) Instant decidedAt,
            @Schema(nullable = true, description = "«Kirim bo'yicha» — kirim raqami") String receiptNumber) {}

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
            List<Line> lines,
            @Schema(nullable = true) Long receiptId,
            @Schema(nullable = true) String receiptNumber) {}

    record ReasonRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record PinRequest(@NotBlank(message = "{validation.required}") String pin) {}

    record MarkupRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotEmpty(message = "{priceChange.noLines}") @Size(max = 5000) List<Long> productIds,
            @NotNull(message = "{validation.required}") Long priceTypeId,
            @NotNull(message = "{validation.required}") BaseKind base,
            @NotNull(message = "{validation.required}") @DecimalMin("-90") @DecimalMax("1000") BigDecimal percent) {}

    record MarkupLine(long productId, String productCode, String productName,
            @Schema(nullable = true, description = "Kirim narxi asosida — faqat special.cost bilan") String basePrice,
            @Schema(nullable = true) String oldPrice, @Schema(nullable = true) String newPrice) {}

    /** «Narxlar» jadvali: mahsulot va narx turlari bo'yicha amaldagi narxlar. */
    record PriceRow(long productId, String code, String name, @Schema(nullable = true) String manufacturer,
            @Schema(description = "Narx turi id → narx") Map<String, String> prices) {}

    record PricePage(List<PriceRow> items, long total, int page, int size) {}

    /** Narxlar jadvali saralash ustuni (SPEC 4 «Jadvallar standarti»). */
    enum PriceSort { CODE, NAME, MANUFACTURER }

    /** «Kirim bo'yicha» rejimi: o'tkazilgan kirim partiyasi va uning amaldagi partiya narxlari. */
    record ReceiptBatch(
            long batchId,
            long productId,
            String productCode,
            String productName,
            String batchNumber,
            LocalDate expiryDate,
            boolean bonus,
            @Schema(description = "Kirimdagi miqdor") int qty,
            @Schema(nullable = true, description = "Tannarx — faqat special.cost bilan") String cost,
            @Schema(description = "Narx turi id → partiya narxi") Map<String, String> batchPrices,
            @Schema(description = "Narx turi id → mahsulot narxi") Map<String, String> productPrices) {}

    record ReceiptBatches(long receiptId, String receiptNumber, long branchId, String supplier, LocalDate receiptDate, List<ReceiptBatch> items) {}
}
