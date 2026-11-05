package uz.medix.catalog.product;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/** Mahsulot API shakllari. QQS stavkasi satr ko'rinishida ({@code "12.00"}) — float ishlatilmaydi. */
final class ProductModels {

    private ProductModels() {}

    record Ref(long id, String name) {}

    /** Jadval qatori. */
    record ProductRow(
            long id,
            String code,
            String name,
            @Schema(nullable = true) String manufacturer,
            @Schema(nullable = true) String category,
            @Schema(nullable = true) String country,
            String unit,
            boolean controlled,
            boolean marked,
            boolean prescription,
            String vatRate,
            @Schema(nullable = true) Integer minQty,
            @Schema(nullable = true) Integer maxQty,
            boolean active,
            @Schema(nullable = true) uz.medix.shared.text.SearchMatch match) {}

    record CodeChange(String oldCode, String newCode, @Schema(nullable = true) String reason, @Schema(nullable = true) String changedBy,
            Instant changedAt) {}

    record ProductDetail(
            long id,
            String code,
            String name,
            @Schema(nullable = true) String contractName,
            @Schema(nullable = true) String classifierName,
            @Schema(nullable = true) Ref manufacturer,
            @Schema(nullable = true) Ref category,
            @Schema(nullable = true) Ref country,
            Ref unit,
            @Schema(nullable = true) Ref supplyEmployee,
            @Schema(nullable = true) String ikpu,
            @Schema(nullable = true) String farmId,
            List<String> barcodes,
            boolean controlled,
            boolean marked,
            boolean prescription,
            String vatRate,
            @Schema(nullable = true) Integer minQty,
            @Schema(nullable = true) Integer maxQty,
            boolean active,
            List<CodeChange> codeHistory) {}

    record ProductRequest(
            @NotBlank(message = "{validation.required}") @Size(max = 300) String name,
            @Schema(nullable = true) @Size(max = 300) String contractName,
            @Schema(nullable = true) @Size(max = 500) String classifierName,
            @Schema(nullable = true) Long manufacturerId,
            @Schema(nullable = true) Long categoryId,
            @Schema(nullable = true) Long countryId,
            @NotNull(message = "{validation.required}") Long unitId,
            @Schema(nullable = true) Long supplyEmployeeId,
            @Schema(nullable = true) @Pattern(regexp = "^[0-9]{17}$", message = "{validation.ikpu}") String ikpu,
            @Schema(nullable = true) @Size(max = 50) String farmId,
            @Schema(nullable = true) List<@Pattern(regexp = "^[0-9A-Za-z-]{4,50}$", message = "{validation.barcode}") String> barcodes,
            boolean controlled,
            boolean marked,
            boolean prescription,
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^\\d{1,3}(\\.\\d{1,2})?$", message = "{validation.vatRate}") String vatRate,
            @Schema(nullable = true) @Min(1) @Max(1_000_000) Integer minQty,
            @Schema(nullable = true) @Min(1) @Max(1_000_000) Integer maxQty) {}

    record ChangeCodeRequest(
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[1-9][0-9]{7}$", message = "{validation.productCode}") String code,
            @NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record DeactivateRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    enum Status { ACTIVE, INACTIVE, ALL }

    enum SortField { CODE, NAME, MANUFACTURER }

    record Filter(String q, Long manufacturerId, Long categoryId, Status status, Boolean controlled, Boolean marked, SortField sort,
            boolean desc, int page, int size) {}

    record ProductPage(List<ProductRow> items, long total, int page, int size) {}
}
