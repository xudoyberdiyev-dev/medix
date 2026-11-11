package uz.medix.purchasing.receipt;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import uz.medix.inventory.ZoneType;

/** KR (kirim) API shakllari. Pul — satr. Narx/summa — faqat ko'rish huquqi borlarga (Ombor mudiri narxni ko'rmaydi, SPEC 5.1-2). */
final class ReceiptModels {

    private ReceiptModels() {}

    static final int MAX_LINES = 2_000;
    static final int MAX_QTY = 10_000_000;
    static final String MONEY = "^\\d{1,16}(\\.\\d{1,2})?$";

    enum ReceiptStatus { DRAFT, ACCEPTED, POSTED, CANCELLED }

    enum PaymentType { CASH, TRANSFER, ONLINE }

    enum DiscountKind { SUM, PERCENT }

    /** Qabuldagi farq sababi: kam keldi, ortiqcha keldi, shikastlangan. */
    enum DiffReason { SHORT, EXCESS, DAMAGED }

    /** Farq bo'lsa o'tkazishdagi qaror: qarz haqiqiy soni bo'yicha yoki hujjat bo'yicha. */
    enum Resolution { ACTUAL, DOCUMENT }

    record ReceiptLineRequest(
            @NotNull(message = "{validation.required}") Long productId,
            @NotBlank(message = "{validation.required}") @Size(max = 60) String batchNumber,
            @Schema(nullable = true) LocalDate producedOn,
            @NotNull(message = "{validation.required}") LocalDate expiryDate,
            @NotNull(message = "{validation.required}") Long zoneId,
            @NotNull(message = "{validation.required}") @Min(1) @Max(MAX_QTY) Integer qty,
            @Min(0) @Max(MAX_QTY) int bonusQty,
            @Schema(nullable = true, description = "Faktura narxi (1 dona, QQS bilan). Ombor mudiri kiritmaydi.")
                    @Pattern(regexp = MONEY, message = "{validation.money}") String price) {}

    /** {@code fromBonus} — ixtiyoriy (eski mijozlar yubormaydi): {@code null} = yo'q. */
    record ReceiptRequest(
            @NotNull(message = "{validation.required}") Long warehouseId,
            @NotNull(message = "{validation.required}") Long supplierId,
            @NotNull(message = "{validation.required}") LocalDate receiptDate,
            @Schema(nullable = true) @Size(max = 64) String invoiceNumber,
            @Schema(nullable = true) LocalDate invoiceDate,
            @NotNull(message = "{validation.required}") PaymentType paymentType,
            @Schema(nullable = true, description = "Bo'sh — kirim sanasi + YB sharti (filial)") LocalDate dueDate,
            @Schema(nullable = true, description = "«Kim nomiga» xodim") Long ownerId,
            boolean prepaid,
            @Schema(nullable = true, description = "YB bonus balansi hisobidan: qarz yo'q, tannarx 0") Boolean fromBonus,
            @Schema(nullable = true) DiscountKind discountKind,
            @Schema(nullable = true) @Pattern(regexp = MONEY, message = "{validation.money}") String discountValue,
            @Schema(nullable = true) LocalDate discountDate,
            @Schema(nullable = true) @Size(max = 500) String note,
            @NotNull(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid ReceiptLineRequest> lines,
            @Schema(nullable = true, description = "Hisob-faktura raqami (yuk xatidan alohida)") @Size(max = 64) String facturaNumber) {}

    record AcceptLine(
            @NotNull(message = "{validation.required}") Long lineId,
            @NotNull(message = "{validation.required}") @Min(0) @Max(MAX_QTY) Integer receivedQty,
            @Min(0) @Max(MAX_QTY) int damagedQty,
            @Schema(nullable = true, description = "Farq bo'lsa majburiy") DiffReason diffReason,
            @Schema(nullable = true, description = "Zonani Ombor mudiri o'zgartirishi mumkin") Long zoneId) {}

    record AcceptRequest(@NotEmpty(message = "{receipt.noLines}") List<@Valid AcceptLine> lines) {}

    record PostRequest(@Schema(nullable = true, description = "Farq bo'lsa majburiy") Resolution resolution) {}

    record ReceiptCancelRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record ReceiptLine(
            long id,
            int lineNo,
            long productId,
            String productCode,
            String productName,
            @Schema(nullable = true, description = "Ishlab chiqaruvchi (prototip: mahsulot ostida)") String manufacturer,
            boolean controlled,
            boolean marked,
            @Schema(description = "QQS stavkasi, %") String vatRate,
            String batchNumber,
            @Schema(nullable = true) LocalDate producedOn,
            LocalDate expiryDate,
            long zoneId,
            String zone,
            ZoneType zoneType,
            int qty,
            int bonusQty,
            @Schema(nullable = true, description = "Faqat narxni ko'rish huquqi bilan") String price,
            @Schema(nullable = true) Integer receivedQty,
            @Schema(nullable = true) Integer damagedQty,
            @Schema(nullable = true) DiffReason diffReason,
            @Schema(nullable = true) String batch,
            @Schema(nullable = true) String bonusBatch) {}

    /** Ro'yxat saralashi (prototip `Receipts`: raqam, sana, summa, to'lov muddati). */
    enum ReceiptSort { CREATED, NUMBER, DATE, AMOUNT, DUE }

    /** Ro'yxat filtrlari: yorliq (holat), yetkazib beruvchilar, omborlar, sana, qidiruv (raqam / yuk xati / YB / kim nomiga). */
    record ReceiptFilter(
            Long branchId,
            ReceiptStatus status,
            List<Long> supplierIds,
            List<Long> warehouseIds,
            LocalDate from,
            LocalDate to,
            String q,
            ReceiptSort sort,
            boolean desc) {

        ReceiptFilter {
            supplierIds = supplierIds == null ? List.of() : List.copyOf(supplierIds);
            warehouseIds = warehouseIds == null ? List.of() : List.copyOf(warehouseIds);
            sort = sort == null ? ReceiptSort.CREATED : sort;
        }
    }

    record ReceiptSummary(
            long id,
            String number,
            long branchId,
            String warehouse,
            long supplierId,
            String supplier,
            LocalDate receiptDate,
            @Schema(nullable = true) String invoiceNumber,
            ReceiptStatus status,
            int lines,
            long totalQty,
            @Schema(nullable = true) String amount,
            @Schema(nullable = true) LocalDate dueDate,
            boolean prepaid,
            String createdBy,
            Instant createdAt,
            PaymentType paymentType,
            @Schema(nullable = true) String owner,
            boolean fromBonus,
            @Schema(description = "Bonus tovar (bepul) — dona") long bonusQty,
            @Schema(nullable = true, description = "Chegirma (bonus) summasi — faqat narx ko'rish huquqi bilan") String bonusAmount,
            @Schema(nullable = true) LocalDate bonusDate,
            @Schema(description = "BNS hujjati bor — bonus balansga tushgan") boolean bonusConfirmed,
            @Schema(nullable = true) String cancelReason,
            @Schema(description = "O'tkazilgan va qarzi to'liq to'langan (to'lov kuni kulrang)") boolean paid) {}

    /** Hujjat tarixi (audit): kim, qachon, nima qildi. */
    record ReceiptHistoryEvent(Instant at, @Schema(nullable = true) String employee, String action, @Schema(nullable = true) String reason) {}

    /** Yorliq soni (holat = null — «Hammasi»); holat filtrisiz, boshqa filtrlar bilan. */
    record ReceiptStatusCount(@Schema(nullable = true) ReceiptStatus status, long count) {}

    /** Filtr varianti soni bilan (yetkazib beruvchi, ombor). */
    record ReceiptFacet(long id, String name, long count) {}

    /**
     * Ro'yxat ustidagi kartalar (filial doirasida, filtrlarsiz): qoralamalar (3 kundan eskilari), qabul qilingan — o'tkazilmagan,
     * kutilayotgan bonuslar (o'tkazilgan, chegirmali, BNS hali yo'q), shu oy bonus tovar (dona).
     */
    record ReceiptKpi(
            long drafts,
            long oldDrafts,
            long accepted,
            @Schema(nullable = true) String expectedBonus,
            long expectedBonusDocs,
            long bonusGoodsMonth) {}

    record ReceiptPage(
            List<ReceiptSummary> items,
            long total,
            int page,
            int size,
            List<ReceiptStatusCount> statuses,
            List<ReceiptFacet> suppliers,
            List<ReceiptFacet> warehouses,
            ReceiptKpi kpi) {}

    record ReceiptDetail(
            long id,
            String number,
            long branchId,
            long warehouseId,
            String warehouse,
            long supplierId,
            String supplier,
            LocalDate receiptDate,
            @Schema(nullable = true) String invoiceNumber,
            @Schema(nullable = true) LocalDate invoiceDate,
            PaymentType paymentType,
            @Schema(nullable = true) LocalDate dueDate,
            boolean dueManual,
            @Schema(nullable = true) Long ownerId,
            @Schema(nullable = true) String owner,
            boolean prepaid,
            boolean fromBonus,
            @Schema(nullable = true) DiscountKind discountKind,
            @Schema(nullable = true) String discountValue,
            @Schema(nullable = true) LocalDate discountDate,
            @Schema(nullable = true) String note,
            ReceiptStatus status,
            @Schema(nullable = true) Resolution resolution,
            boolean pricesVisible,
            @Schema(description = "Qatorlarda narx kiritilgan: narxni ko'rmaydigan xodim qoralamani tahrirlay olmaydi, faqat qabul qiladi") boolean hasPrices,
            @Schema(nullable = true, description = "Hujjat bo'yicha summa (narx × soni)") String amount,
            @Schema(nullable = true, description = "Haqiqiy soni bo'yicha summa (qabuldan keyin)") String actualAmount,
            @Schema(nullable = true, description = "Yozilgan qarz (o'tkazilgandan keyin)") String debtAmount,
            @Schema(nullable = true, description = "Hujjat bo'yicha to'lanmagan qoldiq (yozilgan qarz − to'lovlar)") String openAmount,
            @Schema(nullable = true, description = "YB saldo shu filialda: musbat — qarz, manfiy — avans") String supplierBalance,
            @Schema(nullable = true, description = "YB bonus balansi shu filialda") String bonusBalance,
            @Schema(nullable = true, description = "Tasdiqlangan bonus (BNS) raqami") String bonusNumber,
            @Schema(nullable = true) String bonusAmount,
            @Schema(nullable = true) Instant bonusConfirmedAt,
            @Schema(nullable = true, description = "«Bonus berilmadi» sababi (bonus yopilgan)") String bonusDeclineReason,
            long totalQty,
            long totalBonusQty,
            @Schema(description = "Qabulda farq bor") boolean hasDiff,
            String createdBy,
            Instant createdAt,
            @Schema(nullable = true) String acceptedBy,
            @Schema(nullable = true) Instant acceptedAt,
            @Schema(nullable = true) String postedBy,
            @Schema(nullable = true) Instant postedAt,
            @Schema(nullable = true) String cancelledBy,
            @Schema(nullable = true) Instant cancelledAt,
            @Schema(nullable = true) String cancelReason,
            List<ReceiptLine> lines,
            @Schema(nullable = true, description = "Hisob-faktura raqami") String facturaNumber) {}
}
