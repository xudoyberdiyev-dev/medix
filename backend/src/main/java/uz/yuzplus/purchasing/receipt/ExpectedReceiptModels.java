package uz.yuzplus.purchasing.receipt;

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

/**
 * KK (kutilayotgan kirim, yuk xati) API shakllari (O15). Pul — satr; narx/summa (tannarx) faqat narx ko'rish huquqi bilan
 * ({@link ReceiptController#pricesVisible}), aks holda null.
 */
final class ExpectedReceiptModels {

    private ExpectedReceiptModels() {}

    static final int MAX_LINES = 500;
    static final int MAX_QTY = 10_000_000;

    /** Qoralama → Yo'lda → Qisman qabul qilindi → Qabul qilindi; Qoralama / Yo'lda (hech narsa qabul qilinmagan) → Bekor qilingan. */
    enum KkStatus { DRAFT, IN_TRANSIT, PARTIAL, RECEIVED, CANCELLED }

    /** To'lov: qarzga (qarz KK tasdig'ida yoziladi), oldindan to'langan, naqd (qarz — kirim o'tkazilganda, odatdagidek). */
    enum PaymentKind { CREDIT, PREPAID, CASH }

    /** YB faylidan bitta qator (ustunlar moslangan, matn). */
    record KkImportRow(
            @Min(1) int row,
            @Size(max = 500) String name,
            @Size(max = 100) String barcode,
            @Size(max = 100) String ikpu,
            @Size(max = 100) String code,
            @Size(max = 300) String manufacturer,
            @Size(max = 50) String qty,
            @Size(max = 50) String price,
            @Size(max = 30) String vat,
            @Size(max = 100) String batch,
            @Size(max = 50) String expiry) {}

    record KkImportRequest(@NotEmpty(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid @NotNull KkImportRow> rows) {}

    /**
     * Yuklangan qator: topilgan mahsulot ({@code matchBy}: BARCODE, IKPU, CODE, MEMORY, NAME, NONE; {@code confident=false} — taxmin),
     * o'qilgan qiymatlar va muammolar (product, productGuess, qty, price, vat, expiry). Narx — faqat narx ko'rish huquqi bilan.
     */
    record KkImportLine(int row, @Schema(nullable = true) String fileName, @Schema(nullable = true) Long productId,
            @Schema(nullable = true) String productCode, @Schema(nullable = true) String productName, String matchBy, boolean confident,
            @Schema(nullable = true) Integer qty, @Schema(nullable = true) String price, @Schema(nullable = true) Integer vatRate,
            @Schema(nullable = true) String batchNumber, @Schema(nullable = true) LocalDate expiryDate, List<String> problems) {}

    record ExpectedReceiptLineRequest(
            @NotNull(message = "{validation.required}") Long productId,
            @NotNull(message = "{validation.required}") @Min(1) @Max(MAX_QTY) Integer qty,
            @Schema(nullable = true, description = "Narx (satr, 2 xona) — narx ko'rish huquqisiz e'tiborsiz qoldiriladi") @Size(max = 24) String price,
            @Schema(nullable = true, description = "QQS stavkasi, %") @Min(0) @Max(100) Integer vatRate,
            @Schema(nullable = true) @Size(max = 64) String batchNumber,
            @Schema(nullable = true) LocalDate expiryDate) {}

    record ExpectedReceiptRequest(
            @NotNull(message = "{validation.required}") Long warehouseId,
            @NotNull(message = "{validation.required}") Long supplierId,
            @NotBlank(message = "{validation.required}") @Size(max = 64) String waybillNumber,
            @NotNull(message = "{validation.required}") LocalDate waybillDate,
            @Schema(nullable = true) @Size(max = 64) String invoiceNumber,
            @Schema(nullable = true) LocalDate invoiceDate,
            @Schema(nullable = true) @Size(max = 100) String contract,
            @NotNull(message = "{validation.required}") PaymentKind paymentKind,
            @Schema(nullable = true) LocalDate expectedDate,
            @Schema(nullable = true, description = "To'lov kuni (qarzga); bo'sh — hisob-faktura (yo'q bo'lsa yuk xati) sanasi + YB sharti") LocalDate dueDate,
            @Schema(nullable = true) @Size(max = 500) String note,
            @NotEmpty(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid @NotNull ExpectedReceiptLineRequest> lines) {}

    record KkReceiveLineRequest(
            @NotNull(message = "{validation.required}") Long expectedLineId,
            @NotNull(message = "{validation.required}") @Min(1) @Max(MAX_QTY) Integer qty,
            @NotBlank(message = "{validation.required}") @Size(max = 60) String batchNumber,
            @Schema(nullable = true) LocalDate producedOn,
            @NotNull(message = "{validation.required}") LocalDate expiryDate,
            @NotNull(message = "{validation.required}") Long zoneId) {}

    /** «Qabul qilish»: KK dan kirim qoralamasi (narxlar KK dan; ombor sanaydi va kirim odatdagidek qabul qilinadi / o'tkaziladi). */
    record KkReceiveRequest(
            @NotEmpty(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid @NotNull KkReceiveLineRequest> lines) {}

    record KkReceiveResult(long receiptId, String receiptNumber) {}

    /** Yakuniy qabul: qolgan kelmagan soni hisobdan chiqariladi («qarzga» KK — qarz kamayadi), holat «Qabul qilindi». */
    record KkCloseRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record ExpectedReceiptCancelRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record ExpectedReceiptSummary(long id, String number, long branchId, long warehouseId, String warehouse, long supplierId,
            String supplier, String waybillNumber, LocalDate waybillDate, @Schema(nullable = true) String invoiceNumber,
            @Schema(nullable = true) LocalDate invoiceDate, PaymentKind paymentKind, @Schema(nullable = true) LocalDate expectedDate,
            @Schema(nullable = true) LocalDate dueDate, KkStatus status, int lines, long qty, long receivedQty,
            @Schema(nullable = true, description = "Summa — faqat narx ko'rish huquqi bilan") String totalAmount,
            @Schema(nullable = true, description = "Yozilgan qarz — faqat narx ko'rish huquqi bilan") String debtAmount,
            @Schema(description = "Kutilgan sana o'tgan, tovar hali to'liq kelmagan") boolean late, String createdBy, Instant createdAt) {}

    record ExpectedReceiptPage(List<ExpectedReceiptSummary> items, long total, int page, int size) {}

    record ExpectedReceiptLine(long id, int lineNo, long productId, String productCode, String productName, int qty,
            @Schema(nullable = true) String price, @Schema(nullable = true) String amount, @Schema(nullable = true) Integer vatRate,
            @Schema(nullable = true) String batchNumber, @Schema(nullable = true) LocalDate expiryDate, int receivedQty, int writtenOffQty,
            @Schema(description = "Hali kutilmoqda: soni − qabul qilingan − hisobdan chiqarilgan") int remainingQty) {}

    record ExpectedReceiptFile(long id, String fileName, String contentType, int sizeBytes, String createdBy, Instant createdAt) {}

    record KkLinkedReceipt(long id, String number, String status, LocalDate receiptDate) {}

    record ExpectedReceiptDetail(long id, String number, long branchId, long warehouseId, String warehouse, long supplierId,
            String supplier, String waybillNumber, LocalDate waybillDate, @Schema(nullable = true) String invoiceNumber,
            @Schema(nullable = true) LocalDate invoiceDate, @Schema(nullable = true) String contract, PaymentKind paymentKind,
            @Schema(nullable = true) LocalDate expectedDate, @Schema(nullable = true) LocalDate dueDate, boolean dueManual,
            @Schema(nullable = true) String note, KkStatus status, boolean late,
            @Schema(nullable = true) String totalAmount, @Schema(nullable = true) String debtAmount,
            @Schema(nullable = true, description = "Qarzning to'lanmagan qismi (KK hujjati bo'yicha)") String debtOpen,
            String createdBy, Instant createdAt, @Schema(nullable = true) String approvedBy, @Schema(nullable = true) Instant approvedAt,
            @Schema(nullable = true) String cancelledBy, @Schema(nullable = true) Instant cancelledAt,
            @Schema(nullable = true) String cancelReason, long qty, long receivedQty, List<ExpectedReceiptLine> lines,
            List<ExpectedReceiptFile> files, List<KkLinkedReceipt> receipts) {}

    record InTransitDoc(long id, String number, String supplier, @Schema(nullable = true) LocalDate expectedDate, boolean late,
            int remainingQty) {}

    /** Mahsulotning yo'ldagi (KK Yo'lda / Qisman) qolgan soni — sotuvga olinmaydi, faqat ma'lumot. */
    record InTransitRow(long productId, String productCode, String productName, long qty, @Schema(nullable = true) LocalDate nearestDate, List<InTransitDoc> docs) {}

    record FileData(String fileName, String contentType, byte[] data) {}
}
