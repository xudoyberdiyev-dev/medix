package uz.medix.purchasing.receipt;

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

/** QY (YB ga qaytarish) API shakllari. Pul — satr; summa (kirim narxi) faqat prices.cost ruxsati bilan (aks holda null). */
final class SupplierReturnModels {

    private SupplierReturnModels() {}

    static final int MAX_LINES = 500;
    static final int MAX_QTY = 10_000_000;

    enum Status { PENDING, POSTED, REJECTED }

    /** Sabab: muddati yaqin, shikastlangan, sifatsiz (brak), ortiqcha, boshqa (izoh majburiy). */
    enum Reason { EXPIRING, DAMAGED, QUALITY, SURPLUS, OTHER }

    record SupplierReturnLineRequest(
            @NotNull(message = "{validation.required}") Long batchId,
            @NotNull(message = "{validation.required}") @Min(1) @Max(MAX_QTY) Integer qty) {}

    record SupplierReturnRequest(
            @NotNull(message = "{validation.required}") Long receiptId,
            @NotNull(message = "{validation.required}") Long zoneId,
            @NotNull(message = "{validation.required}") Reason reason,
            @Size(max = 500) String note,
            @NotEmpty(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid @NotNull SupplierReturnLineRequest> lines) {}

    record SupplierReturnRejectRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record ZoneRef(long id, String name, String type) {}

    record SupplierReturnSummary(long id, String number, long branchId, long warehouseId, String warehouse, ZoneRef zone, long supplierId,
            String supplier, long receiptId, String receiptNumber, Reason reason, Status status, boolean fromBonus, int lines, long qty,
            @Schema(nullable = true, description = "Summa (kirim narxida) — faqat prices.cost") String totalAmount, String createdBy,
            Instant createdAt, @Schema(nullable = true) Instant postedAt) {

        SupplierReturnSummary withoutAmount() {
            return new SupplierReturnSummary(id, number, branchId, warehouseId, warehouse, zone, supplierId, supplier, receiptId,
                    receiptNumber, reason, status, fromBonus, lines, qty, null, createdBy, createdAt, postedAt);
        }
    }

    record SupplierReturnPage(List<SupplierReturnSummary> items, long total, int page, int size) {}

    record SupplierReturnLine(long id, int lineNo, long batchId, String batchNumber, LocalDate expiryDate, long productId,
            String productCode, String productName, boolean bonus, int qty, @Schema(nullable = true) String price,
            @Schema(nullable = true) String amount) {}

    record SupplierReturnDetail(long id, String number, long branchId, long warehouseId, String warehouse, ZoneRef zone, long supplierId,
            String supplier, long receiptId, String receiptNumber, LocalDate receiptDate, Reason reason, @Schema(nullable = true) String note,
            Status status, boolean fromBonus, @Schema(nullable = true) String totalAmount, String createdBy, Instant createdAt,
            @Schema(nullable = true) String postedBy, @Schema(nullable = true) Instant postedAt,
            @Schema(nullable = true) String rejectedBy, @Schema(nullable = true) Instant rejectedAt,
            @Schema(nullable = true) String rejectReason, long totalQty, List<SupplierReturnLine> lines) {

        /** Summasiz nusxa (prices.cost ruxsati yo'q xodimlar uchun). */
        SupplierReturnDetail withoutAmount() {
            return new SupplierReturnDetail(id, number, branchId, warehouseId, warehouse, zone, supplierId, supplier, receiptId,
                    receiptNumber, receiptDate, reason, note, status, fromBonus, null, createdBy, createdAt, postedBy, postedAt, rejectedBy,
                    rejectedAt, rejectReason, totalQty,
                    lines.stream().map(l -> new SupplierReturnLine(l.id(), l.lineNo(), l.batchId(), l.batchNumber(), l.expiryDate(),
                            l.productId(), l.productCode(), l.productName(), l.bonus(), l.qty(), null, null)).toList());
        }
    }

    /** Kirim partiyasining zonadagi qoldig'i: qoldiq, faol zahira, qaytarish mumkin bo'lgan bo'sh miqdor; narx — faqat prices.cost. */
    record ReturnStockRow(ZoneRef zone, long batchId, String batchNumber, LocalDate expiryDate, long productId, String productCode,
            String productName, boolean bonus, int qty, int reserved, int free, @Schema(nullable = true) String price) {

        ReturnStockRow withoutPrice() {
            return new ReturnStockRow(zone, batchId, batchNumber, expiryDate, productId, productCode, productName, bonus, qty, reserved, free,
                    null);
        }
    }
}
