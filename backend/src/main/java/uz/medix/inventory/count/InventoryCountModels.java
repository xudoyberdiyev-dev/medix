package uz.medix.inventory.count;

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

/**
 * IN (inventarizatsiya) API shakllari. Pul — satr; tannarx faqat prices.cost bilan (aks holda null). «Ko'r sanoq» (blind) — sanoq
 * davomida hisob qoldig'i inventory.openCount ruxsati bo'lmagan xodimlarga yuborilmaydi.
 */
final class InventoryCountModels {

    private InventoryCountModels() {}

    static final int MAX_LINES = 500;
    static final int MAX_QTY = 10_000_000;

    enum Status { DRAFT, COUNTING, CHECK, POSTED, CANCELLED }

    record InventoryCountRequest(
            @NotNull(message = "{validation.required}") Long warehouseId,
            @Schema(nullable = true, description = "Bo'sh — butun ombor") Long zoneId,
            boolean blind,
            @Size(max = 500) String commission,
            @Size(max = 500) String note) {}

    /** Sanalgan miqdor: mavjud qator (lineId) yoki sanoqda topilgan partiya (zoneId + batchId). */
    record InventoryCountEntry(
            @Schema(nullable = true) Long lineId,
            @Schema(nullable = true) Long zoneId,
            @Schema(nullable = true) Long batchId,
            @NotNull(message = "{validation.required}") @Min(0) @Max(MAX_QTY) Integer countedQty) {}

    record InventoryCountEntries(@NotEmpty(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid @NotNull InventoryCountEntry> entries) {}

    record InventoryCancelRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record ZoneRef(long id, String name, ZoneType type) {}

    record InventoryCountSummary(long id, String number, long branchId, long warehouseId, String warehouse, @Schema(nullable = true) ZoneRef zone,
            boolean blind, Status status, boolean needsDirector, int lines, int counted, int shortageQty, int surplusQty,
            @Schema(nullable = true, description = "Faqat prices.cost") String shortageCost,
            @Schema(nullable = true, description = "Faqat prices.cost") String surplusCost,
            String createdBy, Instant createdAt, @Schema(nullable = true) Instant postedAt) {}

    record InventoryCountPage(List<InventoryCountSummary> items, long total, int page, int size) {}

    record InventoryCountLine(long id, ZoneRef zone, long batchId, String batchNumber, LocalDate expiryDate, long productId, String productCode,
            String productName, boolean controlled,
            @Schema(nullable = true, description = "Ko'r sanoqda sanoq davomida — null") Integer bookQty,
            @Schema(nullable = true) Integer countedQty,
            @Schema(nullable = true, description = "sanaldi − hisobda; sanalmagan yoki ko'r sanoqda — null") Integer diff,
            boolean added, @Schema(nullable = true) String cost, @Schema(nullable = true) String diffAmount,
            @Schema(nullable = true) String countedBy, @Schema(nullable = true) Instant countedAt) {}

    record InventoryCountDetail(long id, String number, long branchId, long warehouseId, String warehouse, @Schema(nullable = true) ZoneRef zone,
            boolean blind, boolean bookHidden, @Schema(nullable = true) String commission, @Schema(nullable = true) String note,
            Status status, boolean needsDirector, int shortageQty, int surplusQty,
            @Schema(nullable = true) String shortageCost, @Schema(nullable = true) String surplusCost,
            String createdBy, Instant createdAt, @Schema(nullable = true) String startedBy, @Schema(nullable = true) Instant startedAt,
            @Schema(nullable = true) String submittedBy, @Schema(nullable = true) Instant submittedAt,
            @Schema(nullable = true) String postedBy, @Schema(nullable = true) Instant postedAt,
            @Schema(nullable = true) String cancelledBy, @Schema(nullable = true) Instant cancelledAt,
            @Schema(nullable = true) String cancelReason, int counted, List<InventoryCountLine> lines) {

        /** Tannarxsiz va/yoki hisob qoldig'isiz nusxa. */
        InventoryCountDetail restricted(boolean cost, boolean hideBook) {
            return new InventoryCountDetail(id, number, branchId, warehouseId, warehouse, zone, blind, hideBook, commission, note, status, needsDirector,
                    shortageQty, surplusQty, cost ? shortageCost : null, cost ? surplusCost : null, createdBy, createdAt, startedBy, startedAt,
                    submittedBy, submittedAt, postedBy, postedAt, cancelledBy, cancelledAt, cancelReason, counted,
                    lines.stream().map(l -> new InventoryCountLine(l.id(), l.zone(), l.batchId(), l.batchNumber(), l.expiryDate(), l.productId(),
                            l.productCode(), l.productName(), l.controlled(), hideBook ? null : l.bookQty(), l.countedQty(),
                            hideBook ? null : l.diff(), l.added(), cost ? l.cost() : null, cost && !hideBook ? l.diffAmount() : null,
                            l.countedBy(), l.countedAt())).toList());
        }
    }

    /** Sanoqda topilgan partiya (raqami bo'yicha qidiruv). */
    record InventoryBatchHit(long batchId, String batchNumber, LocalDate expiryDate, long productId, String productCode, String productName) {}
}
