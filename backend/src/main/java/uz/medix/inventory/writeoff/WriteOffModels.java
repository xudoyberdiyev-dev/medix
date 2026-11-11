package uz.medix.inventory.writeoff;

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

/** HC (hisobdan chiqarish) API shakllari. Pul — satr; tannarx faqat prices.cost ruxsati bilan (aks holda null). */
final class WriteOffModels {

    private WriteOffModels() {}

    static final int MAX_LINES = 500;
    static final int MAX_QTY = 10_000_000;

    enum Status { PENDING, POSTED, REJECTED }

    /** Sabab: muddati o'tgan, shikastlangan, kamomad, boshqa (izoh majburiy). */
    enum Reason { EXPIRED, DAMAGED, SHORTAGE, OTHER }

    record WriteOffLineRequest(
            @NotNull(message = "{validation.required}") Long batchId,
            @NotNull(message = "{validation.required}") @Min(1) @Max(MAX_QTY) Integer qty) {}

    record WriteOffRequest(
            @NotNull(message = "{validation.required}") Long zoneId,
            @NotNull(message = "{validation.required}") Reason reason,
            @Size(max = 64) String actNo,
            @Size(max = 500) String commission,
            @Size(max = 500) String note,
            @NotEmpty(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid @NotNull WriteOffLineRequest> lines) {}

    record WriteOffRejectRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record ZoneRef(long id, String name, ZoneType type) {}

    record WriteOffSummary(long id, String number, long branchId, long warehouseId, String warehouse, ZoneRef zone, Reason reason,
            Status status, boolean needsDirector, int lines, long qty,
            @Schema(nullable = true, description = "Tannarx summasi — faqat prices.cost") String totalCost, String createdBy,
            Instant createdAt, @Schema(nullable = true) Instant postedAt,
            @Schema(nullable = true, description = "Kim tasdiqladi (o'tkazgan)") String postedBy) {}

    record WriteOffPage(List<WriteOffSummary> items, long total, int page, int size) {}

    record WriteOffLine(long id, int lineNo, long batchId, String batchNumber, LocalDate expiryDate, long productId, String productCode,
            String productName, int qty, @Schema(nullable = true) String cost, @Schema(nullable = true) String amount) {}

    record WriteOffDetail(long id, String number, long branchId, long warehouseId, String warehouse, ZoneRef zone, Reason reason,
            @Schema(nullable = true) String actNo, @Schema(nullable = true) String commission, @Schema(nullable = true) String note,
            Status status, boolean needsDirector, @Schema(nullable = true) String totalCost, String createdBy, Instant createdAt,
            @Schema(nullable = true) String postedBy, @Schema(nullable = true) Instant postedAt,
            @Schema(nullable = true) String rejectedBy, @Schema(nullable = true) Instant rejectedAt,
            @Schema(nullable = true) String rejectReason,
            @Schema(nullable = true, description = "OK / FS kamomadidan bo'lsa — OK yoki FS raqami (qoldiq harakati yo'q)") String sourceTransfer,
            long totalQty, List<WriteOffLine> lines) {

        /** Tannarxsiz nusxa (prices.cost ruxsati yo'q xodimlar uchun). */
        WriteOffDetail withoutCost() {
            return new WriteOffDetail(id, number, branchId, warehouseId, warehouse, zone, reason, actNo, commission, note, status, needsDirector,
                    null, createdBy, createdAt, postedBy, postedAt, rejectedBy, rejectedAt, rejectReason, sourceTransfer, totalQty,
                    lines.stream().map(l -> new WriteOffLine(l.id(), l.lineNo(), l.batchId(), l.batchNumber(), l.expiryDate(), l.productId(),
                            l.productCode(), l.productName(), l.qty(), null, null)).toList());
        }
    }

    enum ShortageKind { WRITE_OFF, RETURN }

    record ShortageResolveRequest(@NotNull(message = "{validation.required}") ShortageKind kind, @Size(max = 500) String note) {}

    record ShortageResolution(ShortageKind kind, int qty, @Schema(nullable = true) Long writeOffId,
            @Schema(nullable = true) String writeOffNumber, @Schema(nullable = true) Status writeOffStatus, @Schema(nullable = true) String note,
            String resolvedBy, Instant resolvedAt) {}

    /** OK kamomadi: ochiqmi (hal qilinmagan yoki HC rad etilgan), hal qilish tarixi (eng yangisi birinchi). */
    record ShortageInfo(long transferId, String number, int shortageQty, boolean open, List<ShortageResolution> history) {}

    /** Zonadagi partiya: qoldiq, faol zahira, hisobdan chiqarish mumkin bo'lgan bo'sh miqdor; muddati o'tganmi. Tannarxsiz. */
    record WriteOffStockRow(long batchId, String batchNumber, LocalDate expiryDate, boolean expired, long productId, String productCode,
            String productName, int qty, int reserved, int free) {}
}
