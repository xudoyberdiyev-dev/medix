package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** O10d buxgalter faktura navbati modellari. */
final class InvoiceTaskModels {

    private InvoiceTaskModels() {}

    /** «Faktura yuborilishi kerak» / «Yuborildi». */
    enum InvoiceTaskStatus { PENDING, SENT }

    /** E-faktura fayli / imzolangan TTN. */
    enum InvoiceFileKind { EFAKTURA, TTN }

    record InvoiceTask(
            long id,
            InvoiceTaskStatus status,
            long orderId,
            String orderNumber,
            OrderModels.OrderStatus orderStatus,
            OrderModels.PaymentType paymentType,
            OrderModels.CodesOwner codesOwner,
            @Schema(nullable = true, description = "Hisob-faktura raqami (sotuv o'tkazilgach)") String invoiceNumber,
            long customerId,
            String customer,
            @Schema(nullable = true) String customerTin,
            String branch,
            @Schema(description = "Summa (sotuv bo'lsa — sotuvdan, aks holda buyurtmadan)") String total,
            @Schema(nullable = true, description = "QQS (sotuv o'tkazilgach)") String vat,
            @Schema(description = "Faol / sotilgan markirovka kodlari soni") int codes,
            @Schema(description = "Navbatga tushgan payt («Yuklanmoqda»)") Instant openedAt,
            @Schema(nullable = true) Instant sentAt,
            @Schema(nullable = true) String sentBy,
            @Schema(nullable = true) String efakturaNumber,
            @Schema(nullable = true) LocalDate efakturaDate,
            boolean hasEfakturaFile,
            boolean hasTtnFile) {}

    record InvoiceTaskPage(List<InvoiceTask> items, long total, int page, int size,
            @Schema(description = "Holat bo'yicha sonlar (boshqa filtrlar bilan)") long pending, long sent) {}

    record InvoiceTaskFilter(Long branchId, InvoiceTaskStatus status, LocalDate from, LocalDate to, String q) {}

    record InvoiceFile(long id, InvoiceFileKind kind, String fileName, String contentType, int sizeBytes, String createdBy, Instant createdAt) {}

    @Schema(description = "Buyurtma kartochkasi «Hujjatlar»: faktura vazifasi va fayllari")
    record InvoiceTaskDetail(InvoiceTask task, List<InvoiceFile> files) {}

    record InvoiceSentRequest(
            @NotBlank(message = "{validation.required}") @Size(max = 60) String efakturaNumber,
            @NotNull(message = "{validation.required}") LocalDate efakturaDate) {}

    record UploadedFile(long id) {}

    /** Fayl yuklab olish uchun. */
    record FileData(String fileName, String contentType, byte[] data) {}
}
