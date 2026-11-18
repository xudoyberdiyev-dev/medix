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

    record ExpectedReceiptLineRequest(
            @NotNull(message = "{validation.required}") Long productId,
            @NotNull(message = "{validation.required}") @Min(1) @Max(MAX_QTY) Integer qty,
            @Schema(nullable = true, description = "Narx (satr, 2 xona) — narx ko'rish huquqisiz e'tiborsiz qoldiriladi") @Size(max = 24) String price,
            @Schema(nullable = true, description = "QQS stavkasi, %") @Min(0) @Max(100) Integer vatRate,
            @Size(max = 64) String batchNumber,
            LocalDate expiryDate) {}

    record ExpectedReceiptRequest(
            @NotNull(message = "{validation.required}") Long warehouseId,
            @NotNull(message = "{validation.required}") Long supplierId,
            @NotBlank(message = "{validation.required}") @Size(max = 64) String waybillNumber,
            @NotNull(message = "{validation.required}") LocalDate waybillDate,
            @Size(max = 64) String invoiceNumber,
            LocalDate invoiceDate,
            @Size(max = 100) String contract,
            @NotNull(message = "{validation.required}") PaymentKind paymentKind,
            LocalDate expectedDate,
            @Schema(nullable = true, description = "To'lov kuni (qarzga); bo'sh — hisob-faktura (yo'q bo'lsa yuk xati) sanasi + YB sharti") LocalDate dueDate,
            @Size(max = 500) String note,
            @NotEmpty(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid @NotNull ExpectedReceiptLineRequest> lines) {}

    record ReceiveLineRequest(
            @NotNull(message = "{validation.required}") Long expectedLineId,
            @NotNull(message = "{validation.required}") @Min(1) @Max(MAX_QTY) Integer qty,
            @NotBlank(message = "{validation.required}") @Size(max = 60) String batchNumber,
            LocalDate producedOn,
            @NotNull(message = "{validation.required}") LocalDate expiryDate,
            @NotNull(message = "{validation.required}") Long zoneId) {}

    /** «Qabul qilish»: KK dan kirim qoralamasi (narxlar KK dan; ombor sanaydi va kirim odatdagidek qabul qilinadi / o'tkaziladi). */
    record ReceiveRequest(
            @NotEmpty(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid @NotNull ReceiveLineRequest> lines) {}

    record ReceiveResult(long receiptId, String receiptNumber) {}

    /** Yakuniy qabul: qolgan kelmagan soni hisobdan chiqariladi («qarzga» KK — qarz kamayadi), holat «Qabul qilindi». */
    record CloseRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

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

    record LinkedReceipt(long id, String number, String status, LocalDate receiptDate) {}

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
            List<ExpectedReceiptFile> files, List<LinkedReceipt> receipts) {}

    record InTransitDoc(long id, String number, String supplier, @Schema(nullable = true) LocalDate expectedDate, boolean late,
            int remainingQty) {}

    /** Mahsulotning yo'ldagi (KK Yo'lda / Qisman) qolgan soni — sotuvga olinmaydi, faqat ma'lumot. */
    record InTransitRow(long productId, long qty, @Schema(nullable = true) LocalDate nearestDate, List<InTransitDoc> docs) {}

    record FileData(String fileName, String contentType, byte[] data) {}
}
