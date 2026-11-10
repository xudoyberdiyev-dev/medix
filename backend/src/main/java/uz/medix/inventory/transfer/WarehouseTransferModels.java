package uz.medix.inventory.transfer;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneRef;

/** OK (ombor ko'chirishi) API shakllari. Tannarx yo'q — ko'chirish tannarxni o'zgartirmaydi. */
final class WarehouseTransferModels {

    private WarehouseTransferModels() {}

    static final int MAX_LINES = 500;
    static final int MAX_QTY = 10_000_000;

    /** Qoralama → Yo'lda → Qabul qilindi; qoralamadan — Bekor qilindi. */
    enum Status { DRAFT, IN_TRANSIT, RECEIVED, CANCELLED }

    record WarehouseTransferLineRequest(
            @NotNull(message = "{validation.required}") Long batchId,
            @NotNull(message = "{validation.required}") @Min(1) @Max(MAX_QTY) Integer qty) {}

    record WarehouseTransferRequest(
            @NotNull(message = "{validation.required}") Long fromZoneId,
            @NotNull(message = "{validation.required}") Long toWarehouseId,
            @Size(max = 500) String note,
            @NotEmpty(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid @NotNull WarehouseTransferLineRequest> lines) {}

    /**
     * Qabul qatori (koʻrsatilmagan qator — toʻliq keldi): {@code receivedQty} — jismonan kelgan (shikastlangan ham); {@code damagedQty} — shundan Karantinga;
     * {@code toZoneId} — qatorning qayerga zonasi (berilmasa — hujjat zonasi); {@code reason} — farq sababi (SHORT, DAMAGED, OTHER).
     */
    record ReceiveLineRequest(
            @NotNull(message = "{validation.required}") Long lineId,
            @NotNull(message = "{validation.required}") @Min(0) @Max(MAX_QTY) Integer receivedQty,
            @Schema(nullable = true) Long toZoneId,
            @Schema(nullable = true) @Min(0) @Max(MAX_QTY) Integer damagedQty,
            @Schema(nullable = true) @Pattern(regexp = "SHORT|DAMAGED|OTHER") String reason) {}

    record ReceiveRequest(
            @NotNull(message = "{validation.required}") Long toZoneId,
            @Size(max = 500) String note,
            @Size(max = MAX_LINES) List<@Valid @NotNull ReceiveLineRequest> lines) {}

    record WarehouseRef(long id, String name) {}

    record WarehouseTransferSummary(long id, String number, long branchId, WarehouseRef fromWarehouse, ZoneRef fromZone,
            WarehouseRef toWarehouse, @Schema(nullable = true) ZoneRef toZone, Status status, int lines, long qty, int shortageQty,
            String createdBy, Instant createdAt, @Schema(nullable = true) Instant sentAt, @Schema(nullable = true) Instant receivedAt) {}

    record WarehouseTransferPage(List<WarehouseTransferSummary> items, long total, int page, int size) {}

    record WarehouseTransferLine(long id, int lineNo, long batchId, String batchNumber, LocalDate expiryDate, long productId,
            String productCode, String productName, int qty, @Schema(nullable = true) Integer receivedQty,
            @Schema(nullable = true) ZoneRef toZone, int damagedQty, @Schema(nullable = true) String reason) {}

    record WarehouseTransferDetail(long id, String number, long branchId, WarehouseRef fromWarehouse, ZoneRef fromZone,
            WarehouseRef toWarehouse, @Schema(nullable = true) ZoneRef toZone, Status status, @Schema(nullable = true) String note,
            int shortageQty, @Schema(nullable = true) String receiveNote, String createdBy, Instant createdAt,
            @Schema(nullable = true) String sentBy, @Schema(nullable = true) Instant sentAt,
            @Schema(nullable = true) String receivedBy, @Schema(nullable = true) Instant receivedAt,
            @Schema(nullable = true) String cancelledBy, @Schema(nullable = true) Instant cancelledAt, long totalQty,
            List<WarehouseTransferLine> lines) {}
}
