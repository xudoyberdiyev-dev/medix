package uz.medix.finance.opening;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Boshlang'ich qoldiq — pul turlari (mijozlar qarzi, YB qarzi, kassa va bank). */
final class OpeningFinanceModels {

    private OpeningFinanceModels() {}

    static final int MAX_LINES = 5_000;

    enum Kind { CUSTOMER_DEBT, SUPPLIER_DEBT, MONEY }

    enum Status { DRAFT, POSTED, CANCELLED }

    record LineRequest(
            @Schema(nullable = true, description = "Qarz turlari uchun") Long counterpartyId,
            @Schema(nullable = true, description = "Kassa va bank uchun") Long accountId,
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^-?\\d{1,16}(\\.\\d{1,2})?$", message = "{validation.money}")
                    String amount,
            @Schema(nullable = true) LocalDate dueDate,
            @Schema(nullable = true) @Size(max = 60) String docRef) {}

    record OpeningFinanceRequest(
            @NotNull(message = "{validation.required}") Kind kind,
            @NotNull(message = "{validation.required}") Long branchId,
            @NotNull(message = "{validation.required}") LocalDate cutoffDate,
            @Schema(nullable = true) @Size(max = 500) String note,
            @NotNull(message = "{validation.required}") @Size(max = MAX_LINES) List<@Valid @NotNull LineRequest> lines) {}

    record CancelRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record Line(long id, int lineNo, @Schema(nullable = true) Long counterpartyId, @Schema(nullable = true) Long accountId, String name,
            @Schema(nullable = true) String tin, String amount, @Schema(nullable = true) LocalDate dueDate, @Schema(nullable = true) String docRef) {}

    record OpeningFinanceSummary(long id, String number, Kind kind, long branchId, String branch, LocalDate cutoffDate, Status status,
            int lines, String total, String createdBy, Instant createdAt, @Schema(nullable = true) Instant postedAt) {}

    record OpeningFinanceDetail(long id, String number, Kind kind, long branchId, String branch, LocalDate cutoffDate,
            @Schema(nullable = true) String note, Status status, String total, String createdBy, Instant createdAt,
            @Schema(nullable = true) String postedBy, @Schema(nullable = true) Instant postedAt,
            @Schema(nullable = true) String cancelledBy, @Schema(nullable = true) Instant cancelledAt,
            @Schema(nullable = true) String cancelReason, long version, List<Line> lines) {}
}
