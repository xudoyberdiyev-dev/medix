package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** O10c «Zaxira kodlar» modellari. */
final class ReserveCodeModels {

    private ReserveCodeModels() {}

    /** Zaxirada / Ishlatildi / Hisobdan chiqarildi. */
    enum ReserveStatus { IN_RESERVE, USED, WRITTEN_OFF }

    record ReserveCode(
            long id,
            ReserveStatus status,
            @Schema(description = "To'liq skanerlangan kod (kripto-qismi bilan)") String scanned,
            @Schema(description = "Qavsli kod") String code,
            String gtin,
            String serial,
            long productId,
            String productName,
            String batch,
            @Schema(nullable = true) LocalDate expiryDate,
            MarkingModels.MarkKind kind,
            long orderId,
            String orderNumber,
            String customer,
            String branch,
            @Schema(description = "Zaxiraga tushgan payt (yetkazilgan)") Instant createdAt,
            @Schema(nullable = true) Instant changedAt,
            @Schema(nullable = true) String changedBy,
            @Schema(nullable = true) String note) {}

    record ReserveCodePage(List<ReserveCode> items, long total, int page, int size,
            @Schema(description = "Holat bo'yicha sonlar (boshqa filtrlar bilan)") long inReserve, long used, long writtenOff) {}

    record ReserveCodeFilter(Long branchId, Long productId, ReserveStatus status, LocalDate from, LocalDate to, String q) {}

    record ReserveCloseRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String note) {}
}
