package uz.medix.catalog.refprice;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/** O14: referent narx bilan solishtirish — API shakllari. Pul — satr ({@code "12500.00"}). */
final class RefPriceModels {

    private RefPriceModels() {}

    static final int MAX_ROWS = 20_000;

    /** Fayl qatori (ustunlar brauzerda moslangan). Narx — fayldagi matn ({@code "1 250,50"} ham bo'ladi). */
    record RefRowInput(
            @Min(1) int row,
            @Schema(nullable = true) @Size(max = 500) String name,
            @Schema(nullable = true) @Size(max = 64) String barcode,
            @Schema(nullable = true) @Size(max = 32) String ikpu,
            @Schema(nullable = true) @Size(max = 32) String code,
            @Schema(nullable = true) @Size(max = 300) String manufacturer,
            @Schema(nullable = true) @Size(max = 50) String unit,
            @Schema(nullable = true) @Size(max = 40) String price) {}

    record UploadRequest(
            @NotBlank(message = "{validation.required}") @Size(max = 255) String fileName,
            @NotNull(message = "{validation.required}") @Size(min = 1, max = MAX_ROWS) List<@Valid RefRowInput> rows) {}

    record UploadResult(long id, int rows, @Schema(description = "Nom yoki narxi yaroqsiz — o'tkazib yuborilgan qatorlar") List<Integer> skipped) {}

    record RefList(long id, String fileName, int rowCount, String uploadedBy, Instant uploadedAt,
            @Schema(description = "Mahsulotga moslangan qatorlar") long matched,
            @Schema(description = "Ishonchsiz moslik — «Tekshiring»") long needsCheck) {}

    enum MatchKind { BARCODE, IKPU, CODE, NAME, ALIAS, MANUAL, NONE }

    enum CompareMode { SALE, RECEIPT }

    enum RowStatus { EXPENSIVE, CHEAP, MATCH, NOT_FOUND }

    record ProductRef(long id, String code, String name, @Schema(nullable = true) String manufacturer) {}

    record CompareRow(
            long rowId,
            int rowNo,
            String name,
            @Schema(nullable = true) String manufacturer,
            @Schema(nullable = true) String barcode,
            @Schema(nullable = true) String unit,
            @Schema(nullable = true) ProductRef product,
            MatchKind matchKind,
            boolean needsCheck,
            String refPrice,
            @Schema(nullable = true, description = "Bizning narx (kirim yoki narx turi); yo'q — null") String ourPrice,
            @Schema(nullable = true, description = "Bizning − referent") String diff,
            @Schema(nullable = true, description = "Farq, % (referentga nisbatan)") String diffPct,
            RowStatus status,
            @Schema(nullable = true, description = "Qaysi kirim (raqam) yoki narx turi") String source) {}

    record Counts(long expensive, long cheap, long match, long notFound, long needsCheck) {}

    record CompareResult(long listId, String fileName, CompareMode mode, @Schema(nullable = true) Long priceTypeId,
            @Schema(nullable = true) String priceType, @Schema(nullable = true) Long receiptId, @Schema(nullable = true) String receiptNumber,
            long branchId, String tolerancePct, Counts counts, List<CompareRow> rows) {}

    record MatchRequest(@Schema(nullable = true, description = "null — moslikni olib tashlash") Long productId) {}

    /** Kirim kartochkasi: referent narxdan qimmat qatorlar (oxirgi yuklangan fayllar bo'yicha). */
    record ReceiptWarning(long productId, String productName, String receiptPrice, String refPrice, String diffPct, long listId,
            String fileName) {}
}
