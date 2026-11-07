package uz.medix.inventory.transfer;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import uz.medix.inventory.transfer.WarehouseTransferModels.ReceiveRequest;
import uz.medix.inventory.transfer.WarehouseTransferModels.Status;
import uz.medix.inventory.transfer.WarehouseTransferModels.WarehouseRef;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneRef;

/**
 * FS (filiallararo savdo) API shakllari. Summalar (tannarx asosida) — faqat {@code special.cost} egalariga; qolganlarga {@code null}.
 * Holatlar va qabul so'rovi OK bilan bir xil ({@link Status}, {@link ReceiveRequest}).
 */
final class BranchSaleModels {

    private BranchSaleModels() {}

    record BranchSaleLineRequest(
            @NotNull(message = "{validation.required}") Long batchId,
            @NotNull(message = "{validation.required}") @Min(1) @Max(WarehouseTransferModels.MAX_QTY) Integer qty) {}

    record BranchSaleRequest(
            @NotNull(message = "{validation.required}") Long fromZoneId,
            @NotNull(message = "{validation.required}") Long toWarehouseId,
            @Size(max = 500) String note,
            @NotEmpty(message = "{validation.required}") @Size(max = WarehouseTransferModels.MAX_LINES)
                    List<@Valid @NotNull BranchSaleLineRequest> lines) {}

    record BranchRef(long id, String code, String name) {}

    /** Xaridor tanlashi uchun: boshqa filiallarning faol omborlari (filial doirasidan qat'i nazar — faqat nom). */
    record TargetWarehouse(long id, String name, BranchRef branch) {}

    record BranchSaleSummary(long id, String number, BranchRef seller, BranchRef buyer, WarehouseRef fromWarehouse, ZoneRef fromZone,
            WarehouseRef toWarehouse, @Schema(nullable = true) ZoneRef toZone, Status status, int lines, long qty, int shortageQty,
            @Schema(nullable = true) String invoiceNumber,
            @Schema(nullable = true, description = "Faqat special.cost ruxsati bilan") String total,
            String createdBy, Instant createdAt, @Schema(nullable = true) Instant sentAt, @Schema(nullable = true) Instant receivedAt) {}

    /** Filiallararo qarz qoldig'i: debtor creditor'ga {@code amount} qarzdor (jurnal yig'indisi, faqat noldan farqli). */
    record BranchBalance(BranchRef debtor, BranchRef creditor, String amount) {}

    record BranchSalePage(List<BranchSaleSummary> items, long total, int page, int size) {}

    record BranchSaleLine(long id, int lineNo, long batchId, String batchNumber, LocalDate expiryDate, long productId, String productCode,
            String productName, int qty, @Schema(nullable = true) Integer receivedQty,
            @Schema(nullable = true, description = "Faqat special.cost ruxsati bilan") String unitCost,
            @Schema(nullable = true, description = "Faqat special.cost ruxsati bilan") String amount,
            @Schema(nullable = true) String vatRate,
            @Schema(nullable = true, description = "Faqat special.cost ruxsati bilan") String vatAmount) {}

    record BranchSaleDetail(long id, String number, BranchRef seller, BranchRef buyer, WarehouseRef fromWarehouse, ZoneRef fromZone,
            WarehouseRef toWarehouse, @Schema(nullable = true) ZoneRef toZone, Status status, @Schema(nullable = true) String note,
            int shortageQty, @Schema(nullable = true) String receiveNote, @Schema(nullable = true) String invoiceNumber,
            @Schema(nullable = true, description = "Faqat special.cost ruxsati bilan") String total,
            @Schema(nullable = true, description = "Faqat special.cost ruxsati bilan") String vatTotal,
            String createdBy, Instant createdAt, @Schema(nullable = true) String sentBy, @Schema(nullable = true) Instant sentAt,
            @Schema(nullable = true) String receivedBy, @Schema(nullable = true) Instant receivedAt,
            @Schema(nullable = true) String cancelledBy, @Schema(nullable = true) Instant cancelledAt, long totalQty,
            List<BranchSaleLine> lines) {}
}
