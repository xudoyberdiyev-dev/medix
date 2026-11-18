package uz.yuzplus.pricing.reference;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Referent narx bilan solishtirish (O14) — API modellari. Pul — satr (2 xona). */
public final class ReferenceModels {

    private ReferenceModels() {}

    static final int MAX_ROWS = 5000;

    /** Nima bilan solishtiriladi: kirim narxi (tannarx ruxsati bilan) yoki tanlangan narx turidagi sotuv narxi. */
    public enum CompareMode { PURCHASE, SALE }

    /** Qator natijasi: bizniki qimmat / arzon / ruxsat etilgan farq ichida / bazada topilmadi / topildi, lekin narxi yo'q. */
    public enum LineStatus { DEARER, CHEAPER, MATCH, NOT_FOUND, NO_PRICE }

    /** Mahsulot qanday topildi. NAME — nom o'xshashligi, MEMORY — avval qo'lda moslangan, MANUAL — shu faylda qo'lda. */
    public enum MatchBy { BARCODE, IKPU, CODE, MEMORY, NAME, MANUAL, NONE }

    public record RefSheet(String name, List<List<String>> rows) {}

    public record RefFile(String fileName, long size, List<RefSheet> sheets) {}

    /** Brauzerda moslangan qator: kalitlar — name, barcode, ikpu, code, manufacturer, price, unit. */
    public record RefRowInput(int row, @NotNull Map<String, String> values) {}

    public record CompareRequest(
            @NotBlank @Size(max = 255) String fileName,
            @NotNull CompareMode mode,
            @Schema(nullable = true, description = "Filial; bo'sh — xodimning filiali (kirim tanlansa — kirim filiali)") Long branchId,
            @Schema(nullable = true, description = "SALE uchun majburiy") Long priceTypeId,
            @Schema(nullable = true, description = "PURCHASE: tanlangan kirim; bo'sh — har mahsulotning oxirgi o'tkazilgan kirim narxi") Long receiptId,
            @NotNull @Size(min = 1, max = MAX_ROWS) List<@Valid RefRowInput> rows) {}

    public record CompareSummary(long id, Instant createdAt, String fileName, String createdBy, long branchId, String branch,
            CompareMode mode, @Schema(nullable = true) Long priceTypeId, @Schema(nullable = true) String priceType,
            @Schema(nullable = true) Long receiptId, @Schema(nullable = true) String receiptNumber, String tolerancePct,
            int dearer, int cheaper, int matched, int notFound) {}

    public record CompareLine(int rowNo, String name, @Schema(nullable = true) String barcode, @Schema(nullable = true) String ikpu,
            @Schema(nullable = true) String manufacturer, @Schema(nullable = true) String unit, String refPrice,
            @Schema(nullable = true) Long productId, @Schema(nullable = true) String productCode,
            @Schema(nullable = true) String productName, @Schema(nullable = true) String productMaker, MatchBy matchBy,
            boolean confident, @Schema(nullable = true) String ourPrice, @Schema(nullable = true) String diff,
            @Schema(nullable = true) String diffPct, @Schema(nullable = true) String source, LineStatus status) {}

    /** Natija; {@code skippedRows} — o'qib bo'lmagan qatorlar (nomi yoki narxi yo'q/noto'g'ri), faqat yuklash javobida. */
    public record CompareDetail(CompareSummary summary, List<CompareLine> lines, List<Integer> skippedRows) {}

    public record MatchRequest(@NotNull Long productId) {}

    /** Ustunlarni moslash profili: maydon → fayldagi sarlavha (import ustasi kabi). */
    public record RefProfile(String name, Map<String, String> mapping) {}

    public record RefProfileRequest(@NotNull @Size(min = 1, max = 120) String name, @NotNull Map<String, String> mapping) {}

    public record ReceiptRefWarning(long productId, String productName, String receiptPrice, String refPrice, String diffPct,
            long compareId) {}
}
