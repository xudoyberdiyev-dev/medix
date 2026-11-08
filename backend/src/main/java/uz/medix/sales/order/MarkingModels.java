package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Markirovkachi paneli (SPEC 5.4): navbat, faol ish, skanerlash natijasi, kodlar jurnali. */
final class MarkingModels {

    private MarkingModels() {}

    /** Qadoq turi: Q — quti, D — dona (GS1 AI 91). */
    enum MarkKind { BOX, UNIT }

    enum MarkStatus { ACTIVE, REMOVED, RELEASED, SOLD }

    record MarkQueueItem(
            long id,
            String number,
            String customer,
            @Schema(description = "Markirovkali qatorlar soni") int lines,
            @Schema(description = "Skanerlanadigan kodlar soni") long totalQty,
            @Schema(description = "Markirovkasiz (tasdiqlanadigan) qatorlar soni (E1)") int unmarkedLines,
            @Schema(nullable = true) Integer markMinutes,
            @Schema(nullable = true) String marker,
            @Schema(nullable = true) Long markerId,
            @Schema(nullable = true) Instant markStartedAt,
            @Schema(nullable = true, description = "Berilgan vaqt tugash payti") Instant deadline,
            Instant statusChangedAt) {}

    record MarkBatch(long batchId, String batch, LocalDate expiryDate, int qty, int scanned) {}

    record MarkLine(
            long lineId,
            int lineNo,
            String productCode,
            String productName,
            MarkKind kind,
            int qty,
            int scanned,
            List<MarkBatch> batches) {}

    /** Markirovkasiz qator — Markirovkachi «Tasdiqlash» bilan o'tkazadi (E1). */
    record UnmarkedLine(
            long lineId,
            int lineNo,
            String productCode,
            String productName,
            String unit,
            int qty,
            boolean confirmed) {}

    record ConfirmRequest(@NotEmpty(message = "{validation.required}") @Size(max = 1000) List<Long> lineIds) {}

    record MarkCode(
            long id,
            long orderId,
            String orderNumber,
            long lineId,
            String productName,
            String code,
            String gtin,
            String serial,
            String batch,
            MarkKind kind,
            MarkStatus status,
            String scannedBy,
            Instant scannedAt,
            @Schema(nullable = true) String closeReason) {}

    record MarkWork(
            long id,
            String number,
            String customer,
            String status,
            @Schema(nullable = true) Integer markMinutes,
            @Schema(nullable = true) String marker,
            @Schema(nullable = true) Long markerId,
            @Schema(nullable = true) Instant markStartedAt,
            @Schema(nullable = true) Instant deadline,
            @Schema(description = "Markirovkali qatorlar (skanerlanadi)") List<MarkLine> lines,
            @Schema(description = "Markirovkasiz qatorlar (tasdiqlanadi, E1)") List<UnmarkedLine> unmarkedLines,
            @Schema(description = "Faol (olib tashlanmagan) kodlar") List<MarkCode> codes,
            @Schema(description = "Skanerlangan quti / kerak") int boxesScanned,
            int boxesNeeded,
            int unitsScanned,
            int unitsNeeded,
            @Schema(description = "Barcha kodlar skanerlangan va markirovkasiz qatorlar tasdiqlangan — yakunlash mumkin") boolean complete,
            @Schema(description = "Buyurtmada markirovkali qator yo'q — «Markirovkasiz — tasdiqlash»") boolean unmarkedOnly) {}

    record ScanRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String code) {}

    record ScanResult(MarkCode accepted, MarkWork work) {}

    record MarkCodePage(List<MarkCode> items, long total, int page, int size) {}
}
