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

    /** Jadval qatori (prototip `Products` — 25 ustun). {@code stock} — filial doirasidagi jami qoldiq; {@code price} — bazaviy sotuv narxi. */
    record ProductRow(
            long id,
            String code,
            String name,
            @Schema(nullable = true) String contractName,
            @Schema(nullable = true) String classifierName,
            @Schema(nullable = true) String manufacturer,
            @Schema(nullable = true) String category,
            @Schema(nullable = true) String country,
            @Schema(nullable = true) DosageForm dosageForm,
            @Schema(nullable = true) String dose,
            String unit,
            @Schema(nullable = true) Integer packQty,
            @Schema(nullable = true, description = "Birinchi shtrix-kod") String barcode,
            @Schema(nullable = true) String ikpu,
            @Schema(nullable = true) String farmId,
            @Schema(nullable = true) String supplyEmployee,
            boolean controlled,
            boolean marked,
            boolean prescription,
            String vatRate,
            @Schema(nullable = true) Integer minQty,
            @Schema(nullable = true) Integer maxQty,
            long stock,
            @Schema(nullable = true, description = "Bazaviy narx (QQS bilan); berilmagan bo'lsa null") String price,
            @Schema(nullable = true) String note,
            boolean active,
            @Schema(nullable = true) uz.medix.shared.text.SearchMatch match) {

        ProductRow withMatch(uz.medix.shared.text.SearchMatch m) {
            return new ProductRow(id, code, name, contractName, classifierName, manufacturer, category, country, dosageForm, dose, unit,
                    packQty, barcode, ikpu, farmId, supplyEmployee, controlled, marked, prescription, vatRate, minQty, maxQty, stock, price,
                    note, active, m);
        }
    }

    /** Dori shakli (prototip FORMKEYS). */
    enum DosageForm { TABLET, CAPSULE, AMPOULE, VIAL, SYRUP, OINTMENT, PEN, POWDER, GEL }

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
            @Schema(nullable = true) DosageForm dosageForm,
            @Schema(nullable = true) String dose,
            @Schema(nullable = true) Integer packQty,
            @Schema(nullable = true) Integer perPack,
            @Schema(nullable = true) String note,
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
            @Schema(nullable = true) @Min(1) @Max(1_000_000) Integer maxQty,
            @Schema(nullable = true) DosageForm dosageForm,
            @Schema(nullable = true) @Size(max = 50) String dose,
            @Schema(nullable = true) @Min(1) @Max(100_000) Integer packQty,
            @Schema(nullable = true) @Min(1) @Max(100_000) Integer perPack,
            @Schema(nullable = true) @Size(max = 1000) String note) {}

    /** Audit yozuvi (mahsulot bo'yicha): eski/yangi qiymat — JSON. */
    record HistoryRow(Instant at, @Schema(nullable = true) String employee, String action, @Schema(nullable = true) String oldValue,
            @Schema(nullable = true) String newValue, @Schema(nullable = true) String reason) {}

    record ChangeCodeRequest(
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[1-9][0-9]{7}$", message = "{validation.productCode}") String code,
            @NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record DeactivateRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    enum Status { ACTIVE, INACTIVE, ALL }

    enum SortField { CODE, NAME, CONTRACT_NAME, MANUFACTURER, CATEGORY, COUNTRY, VAT, MIN_QTY, MAX_QTY, STOCK, PRICE }

    /** Saqlangan ko'rinishlar (prototip yorliqlari). */
    enum View { ALL, ACTIVE, CONTROLLED, MARKED, PRESCRIPTION, INACTIVE }

    /**
     * Ro'yxat filtri. {@code status} — «Holat» filtri, {@code view} — yorliq; ro'yxat filtrlari bir nechta qiymatli («yoki»).
     * {@code ids} — tanlanganlar (eksport). {@code branchId} — qoldiq va narx filiali (null — xodim doirasi; narx — o'z filiali yoki birinchi filial).
     */
    record Filter(String q, List<Long> ids, List<Long> manufacturerIds, List<Long> categoryIds, List<Long> countryIds, List<Long> supplyEmployeeIds,
            Status status, View view, Boolean controlled, Boolean marked, Long branchId, SortField sort, boolean desc, int page, int size) {

        Filter {
            ids = ids == null ? List.of() : List.copyOf(ids);
            manufacturerIds = manufacturerIds == null ? List.of() : List.copyOf(manufacturerIds);
            categoryIds = categoryIds == null ? List.of() : List.copyOf(categoryIds);
            countryIds = countryIds == null ? List.of() : List.copyOf(countryIds);
            supplyEmployeeIds = supplyEmployeeIds == null ? List.of() : List.copyOf(supplyEmployeeIds);
            view = view == null ? View.ALL : view;
        }
    }

    record Facet(long id, String name, long count) {}

    /** Yorliqlar soni (qidiruv bo'yicha). */
    record ViewCounts(long all, long active, long controlled, long marked, long prescription, long inactive) {}

    /** Filtr variantlari soni bilan (qidiruv va yorliq bo'yicha, filtrlarning o'zisiz). */
    record Facets(List<Facet> manufacturers, List<Facet> categories, List<Facet> countries, List<Facet> supplyEmployees, long active,
            long inactive) {}

    record ProductPage(List<ProductRow> items, long total, int page, int size, @Schema(nullable = true) ViewCounts views,
            @Schema(nullable = true) Facets facets) {}
}
