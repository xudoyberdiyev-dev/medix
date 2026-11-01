package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Buyurtma (BY) API shakllari. Pul — satr. */
final class OrderModels {

    private OrderModels() {}

    static final int MAX_LINES = 500;
    static final int MAX_QTY = 1_000_000;

    enum OrderStatus { DRAFT, PENDING_APPROVAL, QUEUED, PICKING, MARKING, CHECKING, DOCUMENTING, LOADING, IN_TRANSIT, DELIVERED,
        UNDELIVERED, REJECTED, CANCELLED }

    enum DeliveryType { DELIVERY, PICKUP }

    enum PaymentType { CASH, TRANSFER, ONLINE }

    /** Tasdiq darajasi (SPEC 6): limit ≤ 20% — Filial rahbari; > 20% yoki muddati o'tgan qarz 30+ kun — Direktor. */
    enum ApprovalLevel { BRANCH, DIRECTOR }

    /** Muammo darajasi: ERROR — yuborilmaydi; APPROVAL — tasdiqqa ketadi; WARNING — faqat ogohlantirish. */
    enum IssueLevel { ERROR, APPROVAL, WARNING }

    record OrderLineRequest(
            @NotNull(message = "{validation.required}") Long productId,
            @NotNull(message = "{validation.required}") @Min(1) @Max(MAX_QTY) Integer qty) {}

    record OrderRequest(
            @NotNull(message = "{validation.required}") Long warehouseId,
            @NotNull(message = "{validation.required}") Long customerId,
            @NotNull(message = "{validation.required}") DeliveryType deliveryType,
            @Schema(nullable = true) LocalDate deliveryDate,
            @Schema(nullable = true) @Size(max = 500) String address,
            @NotNull(message = "{validation.required}") PaymentType paymentType,
            @Schema(nullable = true) @Size(max = 500) String note,
            @NotNull(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid OrderLineRequest> lines) {}

    record OrderReasonRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    /** «N ta muammo» paneli: qator (yoki sarlavha — null) va aniq matn. */
    record OrderIssue(IssueLevel level, String code, String message, @Schema(nullable = true) Integer lineNo) {}

    /** Mijoz qatori (SPEC 5.3): narx turi, qarz, muddati o'tgan qarz, limit va qolgan limit. */
    record CustomerCredit(
            @Schema(nullable = true) String priceType,
            String debt,
            String overdue,
            int overdueDays,
            @Schema(nullable = true) String creditLimit,
            @Schema(nullable = true) String limitLeft,
            @Schema(nullable = true) Integer paymentDays,
            @Schema(nullable = true) Integer minShelfLifeDays,
            boolean blocked,
            @Schema(nullable = true, description = "Nazoratdagi preparatlar litsenziyasi amal qiladi") Boolean controlledLicense) {}

    record OrderLine(
            long id,
            int lineNo,
            long productId,
            String productCode,
            String productName,
            @Schema(nullable = true) String manufacturer,
            int qty,
            @Schema(nullable = true, description = "Muzlatilgan yoki oxirgi saqlangan narx") String price,
            @Schema(nullable = true, description = "Hozirgi narx (qoralamada)") String currentPrice,
            @Schema(nullable = true) String amount,
            @Schema(nullable = true) String priceType,
            @Schema(description = "Sotuvga mavjud qoldiq") int available,
            @Schema(nullable = true) LocalDate nearestExpiry,
            @Schema(nullable = true) Integer minQty,
            @Schema(nullable = true) Integer maxQty,
            boolean controlled,
            boolean marked,
            @Schema(description = "FEFO zahira (Navbatda va keyin)") List<ReservedBatch> reserved) {

        OrderLine withReserved(List<ReservedBatch> r) {
            return new OrderLine(id, lineNo, productId, productCode, productName, manufacturer, qty, price, currentPrice, amount, priceType,
                    available, nearestExpiry, minQty, maxQty, controlled, marked, r);
        }
    }

    record ReservedBatch(String batch, LocalDate expiryDate, String zone, int qty) {}

    record OrderSummary(
            long id,
            String number,
            long branchId,
            String warehouse,
            long customerId,
            String customer,
            LocalDate orderDate,
            DeliveryType deliveryType,
            @Schema(nullable = true) LocalDate deliveryDate,
            OrderStatus status,
            @Schema(nullable = true) ApprovalLevel approvalLevel,
            int lines,
            String total,
            String createdBy,
            Instant createdAt,
            Instant statusChangedAt) {}

    record OrderPage(List<OrderSummary> items, long total, int page, int size) {}

    record OrderDetail(
            long id,
            String number,
            long branchId,
            long warehouseId,
            String warehouse,
            long customerId,
            String customer,
            @Schema(nullable = true) String customerTin,
            LocalDate orderDate,
            DeliveryType deliveryType,
            @Schema(nullable = true) LocalDate deliveryDate,
            @Schema(nullable = true) String address,
            PaymentType paymentType,
            @Schema(nullable = true) String note,
            OrderStatus status,
            @Schema(nullable = true) ApprovalLevel approvalLevel,
            List<String> approvalReasons,
            String total,
            @Schema(description = "Qoralamada narx o'zgargan qatorlar bor") boolean priceChanged,
            CustomerCredit credit,
            List<OrderIssue> issues,
            String createdBy,
            long createdById,
            Instant createdAt,
            @Schema(nullable = true) Instant submittedAt,
            @Schema(nullable = true) String decidedBy,
            @Schema(nullable = true) Instant decidedAt,
            @Schema(nullable = true) String decisionReason,
            @Schema(nullable = true) String cancelledBy,
            @Schema(nullable = true) Instant cancelledAt,
            @Schema(nullable = true) String cancelReason,
            @Schema(nullable = true, description = "Yig'ish uchun berilgan vaqt, daqiqa") Integer pickMinutes,
            @Schema(nullable = true) Integer markMinutes,
            @Schema(nullable = true) String picker,
            @Schema(nullable = true) Instant pickStartedAt,
            @Schema(nullable = true) Instant pickFinishedAt,
            @Schema(description = "Yig'uvchi FEFO taklif qilmagan partiyani olgan") boolean fefoDeviation,
            List<OrderLine> lines) {}

    /** Oldingi buyurtmalar (takrorlash uchun). */
    record PreviousOrder(long id, String number, LocalDate orderDate, int lines, String total) {}

    /** «Mahsulot qo'shish» katalog sahifasi qatori (SPEC 5.3): mavjud qoldiq, mijoz narxi (QQS bilan), eng yaqin muddat, min/max. */
    record CatalogRow(
            long productId,
            String code,
            String name,
            @Schema(nullable = true) String manufacturer,
            int available,
            @Schema(nullable = true) String price,
            @Schema(nullable = true) LocalDate nearestExpiry,
            @Schema(nullable = true) Integer minQty,
            @Schema(nullable = true) Integer maxQty,
            boolean controlled,
            boolean marked) {}

    record CatalogPage(List<CatalogRow> items, long total, int page, int size) {}

    record TimeRequest(
            @NotNull(message = "{validation.required}") @Min(1) @Max(600) Integer pickMinutes,
            @Schema(nullable = true) @Min(1) @Max(600) Integer markMinutes) {}

    /** Partiya tasdig'i: batchId bo'sh — «Ha, shundan oldim» (FEFO zahira); to'ldirilgan — «Boshqa partiyadan oldim». */
    record PickLineConfirm(@NotNull(message = "{validation.required}") Long lineId, @Schema(nullable = true) Long batchId) {}

    record PickFinishRequest(@Schema(nullable = true) List<@Valid PickLineConfirm> lines) {}

    /** Yig'uvchi navbati kartasi (SPEC 5.4). */
    record PickQueueItem(
            long id,
            String number,
            String customer,
            OrderStatus status,
            int lines,
            long totalQty,
            boolean marked,
            @Schema(nullable = true) Integer pickMinutes,
            @Schema(nullable = true) String picker,
            @Schema(nullable = true) Long pickerId,
            @Schema(nullable = true) Instant pickStartedAt,
            @Schema(nullable = true, description = "Berilgan vaqt tugash payti") Instant deadline,
            Instant queuedAt) {}
}
