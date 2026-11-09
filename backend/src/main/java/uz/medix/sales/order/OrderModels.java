package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
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
            @NotNull(message = "{validation.required}") @Min(1) @Max(MAX_QTY) Integer qty,
            @Schema(nullable = true, description = "Chegirma, % (0–99.99); null — mijozning standart chegirmasi")
            @DecimalMin("0") @DecimalMax("99.99") @Digits(integer = 2, fraction = 2) BigDecimal discountPct) {

        OrderLineRequest(Long productId, Integer qty) {
            this(productId, qty, null);
        }
    }

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

    /** «Yig'ishga qaytarish»: sabab va qatorlar (bo'sh yoki yo'q — butun buyurtma, SPEC 188). */
    record ReturnToPickRequest(
            @NotBlank(message = "{validation.required}") @Size(max = 300) String reason,
            @Schema(nullable = true, description = "Qaytariladigan qatorlar; bo'sh — butun buyurtma") @Size(max = 500) List<Long> lineIds) {}

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
            @Schema(nullable = true, description = "Hozirgi narx (qoralamada), chegirmadan keyin") String currentPrice,
            @Schema(description = "Chegirma, %") String discountPct,
            @Schema(nullable = true, description = "Narx turidagi narx (chegirmasiz)") String listPrice,
            @Schema(nullable = true) String amount,
            @Schema(nullable = true, description = "Summa ichidagi QQS") String vatAmount,
            @Schema(nullable = true) String priceType,
            @Schema(description = "Sotuvga mavjud qoldiq") int available,
            @Schema(nullable = true) LocalDate nearestExpiry,
            @Schema(nullable = true) Integer minQty,
            @Schema(nullable = true) Integer maxQty,
            boolean controlled,
            boolean marked,
            @Schema(description = "FEFO zahira (Navbatda va keyin)") List<ReservedBatch> reserved,
            @Schema(nullable = true, description = "Yig'ilgan (yig'ishga qaytarilgani ayirilgan); yig'ish boshlanmagan — null") Integer picked,
            @Schema(nullable = true, description = "Jo'natilgan (o'tkazilgan sotuv bo'yicha); sotuv yo'q — null") Integer shipped) {

        OrderLine withReserved(List<ReservedBatch> r) {
            return new OrderLine(id, lineNo, productId, productCode, productName, manufacturer, qty, price, currentPrice, discountPct, listPrice, amount, vatAmount, priceType,
                    available, nearestExpiry, minQty, maxQty, controlled, marked, r, picked, shipped);
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
            PaymentType paymentType,
            OrderStatus status,
            @Schema(nullable = true) ApprovalLevel approvalLevel,
            int lines,
            String total,
            String createdBy,
            Instant createdAt,
            Instant statusChangedAt,
            @Schema(description = "«Hozir kimda» (SPEC 5.2)") String holder,
            @Schema(nullable = true, description = "Mijoz hududi") String region,
            @Schema(nullable = true, description = "Yig'ishga berilgan vaqt, daqiqa (null — «Vaqt kutilmoqda»)") Integer pickMinutes,
            @Schema(nullable = true) Instant pickStartedAt,
            @Schema(nullable = true) Instant pickFinishedAt,
            @Schema(nullable = true, description = "Ochiq (qoralama / tasdiqlashda) buyurtma mijozining kredit ogohlantirishi") CreditFlag credit) {}

    /**
     * Ro'yxatdagi ⚠ belgisi (prototip Orders: issue): mijoz bloklangan, limitdan oshgan summa (shu buyurtma bilan), muddati o'tgan qarz.
     */
    record CreditFlag(boolean blocked, @Schema(nullable = true) String overLimit, @Schema(nullable = true) String overdue, int overdueDays) {}

    /** Filtr varianti: id, nomi va shu filial doirasidagi buyurtmalar soni. */
    record FilterOption(long id, String name, long count) {}

    record OrderFacets(List<FilterOption> customers, List<FilterOption> operators, List<FilterOption> regions) {}

    /** Holat yorlig'i: soni va summasi — boshqa filtrlar (holatdan tashqari) bo'yicha. */
    record StatusCount(@Schema(nullable = true, description = "null — «Hammasi»") OrderStatus status, long count, String total) {}

    record OrderPage(List<OrderSummary> items, long total, int page, int size,
            @Schema(description = "Holat yorliqlari («Hammasi» + har holat): soni va summasi") List<StatusCount> statuses,
            @Schema(description = "Filtr variantlari: mijozlar, operatorlar, hududlar (soni bilan)") OrderFacets facets) {}

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
            @Schema(description = "Summa (chegirmasiz)") String grossTotal,
            @Schema(description = "Chegirma summasi") String discountTotal,
            @Schema(description = "Jami ichidagi QQS (qatorlar bo'yicha, narx QQS bilan)") String vatTotal,
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
            @Schema(nullable = true, description = "Joylar soni (quti)") Integer places,
            OrderDocuments documents,
            @Schema(description = "«Hozir kimda»: buyurtma qaysi xodim yoki bosqichda (SPEC 5.2)") String holder,
            List<OrderLine> lines,
            @Schema(description = "Qator bo'yicha «Yig'ishga qaytarish»dan keyin qayta yig'iladigan qatorlar; bo'sh — barcha qatorlar (SPEC 188)")
            List<Long> repickLineIds) {}

    /** Buyurtmadan yozilgan hujjatlar (SPEC 7). */
    record OrderDocuments(
            @Schema(nullable = true) String waybillNumber,
            @Schema(nullable = true) String saleNumber,
            @Schema(nullable = true) String invoiceNumber,
            @Schema(nullable = true, description = "POSTED yoki CANCELLED") String saleStatus,
            @Schema(nullable = true) String saleTotal,
            @Schema(nullable = true) String returnNumber,
            @Schema(nullable = true) String returnTotal,
            @Schema(nullable = true) String tripNumber,
            @Schema(nullable = true) String driver,
            @Schema(nullable = true) String vehicle,
            @Schema(nullable = true, description = "Sotuv hujjati (SV) id — to'lov holati uchun") Long saleId) {}

    /** Oldingi buyurtmalar (takrorlash uchun). */
    record PreviousOrder(long id, String number, LocalDate orderDate, int lines, String total,
            @Schema(description = "Birinchi 3 ta mahsulot nomi (qator tartibida)") List<String> products) {}

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

    /** Katalog filtri varianti (prototip `ProductPicker`: Ishlab chiqaruvchi / Kategoriya / Davlat) — qidiruv natijasidagi soni bilan. */
    record CatalogFacet(long id, String name, long count) {}

    /** «Belgilar» filtri: markirovkali / nazoratdagi / retseptli mahsulotlar soni. */
    record CatalogFlagCounts(long marked, long controlled, long prescription) {}

    record CatalogFacets(List<CatalogFacet> manufacturers, List<CatalogFacet> categories, List<CatalogFacet> countries, CatalogFlagCounts flags) {}

    /** «Belgilar» filtri qiymatlari (bir nechtasi — «yoki»). */
    enum CatalogFlag { MARKED, CONTROLLED, PRESCRIPTION }

    /** Katalog filtrlari (bo'sh ro'yxat — filtr yo'q). */
    record CatalogFilter(List<Long> manufacturerIds, List<Long> categoryIds, List<Long> countryIds, List<CatalogFlag> flags) {
        static final CatalogFilter NONE = new CatalogFilter(List.of(), List.of(), List.of(), List.of());
    }

    record CatalogPage(List<CatalogRow> items, long total, int page, int size, CatalogFacets facets) {}

    record TimeRequest(
            @NotNull(message = "{validation.required}") @Min(1) @Max(600) Integer pickMinutes,
            @Schema(nullable = true) @Min(1) @Max(600) Integer markMinutes) {}

    /** Partiya tasdig'i: batchId bo'sh — «Ha, shundan oldim» (FEFO zahira); to'ldirilgan — «Boshqa partiyadan oldim». */
    record PickLineConfirm(@NotNull(message = "{validation.required}") Long lineId, @Schema(nullable = true) Long batchId) {}

    /** «Boshqa partiyadan oldim» tanlovi: partiya, muddat, bo'sh qoldiq (shu qator zahirasi bilan), FEFO zahirasidagi miqdor. */
    record PickBatch(long batchId, String number, java.time.LocalDate expiryDate, boolean bonus, int free, int reserved) {}

    record PickFinishRequest(@Schema(nullable = true) List<@Valid PickLineConfirm> lines) {}

    /** «Bugun yakunlanganlar» (Yig'uvchi, SPEC 5.4): o'zi bugun yig'ib bo'lgan buyurtmalar; vaqtida — berilgan daqiqa ichida. */
    record PickDoneItem(long id, String number, String customer, OrderStatus status, int lines, long totalQty, Instant startedAt,
            Instant finishedAt, @Schema(nullable = true) Integer minutes, boolean onTime) {}

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
            Instant queuedAt,
            @Schema(nullable = true, description = "Mijozning amaldagi shartnomasi (shu filial; SPEC 213)") String contract,
            @Schema(nullable = true, description = "Hisob-faktura raqami — sotuv hujjatlashtirilgan bo'lsa") String invoice) {}

    /** Hisob-faktura (chop etish uchun, SPEC 300): summalar QQS bilan; tannarxsiz. */
    record InvoiceDoc(
            String invoiceNumber,
            String saleNumber,
            String orderNumber,
            long branchId,
            @Schema(description = "POSTED yoki CANCELLED") String status,
            LocalDate saleDate,
            @Schema(nullable = true) LocalDate dueDate,
            String customer,
            @Schema(nullable = true) String customerTin,
            @Schema(nullable = true) String address,
            PaymentType paymentType,
            String warehouse,
            @Schema(nullable = true, description = "Sotuv sanasida amaldagi shartnoma") String contract,
            String total,
            String vatTotal,
            @Schema(description = "QQSsiz qiymat") String netTotal,
            List<InvoiceLine> lines) {}

    record InvoiceLine(
            String productCode,
            String productName,
            @Schema(nullable = true) String manufacturer,
            String batch,
            LocalDate expiryDate,
            int qty,
            @Schema(description = "Narx QQS bilan") String price,
            String amount,
            @Schema(description = "QQS stavkasi, %") String vatRate,
            String vatAmount,
            @Schema(description = "QQSsiz qiymat") String netAmount) {}

    record CheckRequest(
            @NotNull(message = "{validation.required}") @Size(min = 1, max = MAX_LINES) List<Long> checkedLines,
            @NotNull(message = "{validation.required}") @Min(1) @Max(10_000) Integer places) {}

    /** Buyurtma tarixi (audit): kim, qachon, nima qildi. */
    record OrderHistoryEvent(Instant at, @Schema(nullable = true) String employee, String action, @Schema(nullable = true) String reason) {}
}
