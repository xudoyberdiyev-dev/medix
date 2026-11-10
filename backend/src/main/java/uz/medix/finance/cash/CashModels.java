package uz.medix.finance.cash;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

final class CashModels {

    private CashModels() {}

    enum Direction { IN, OUT }

    enum OpStatus { PENDING, POSTED, REJECTED, CANCELLED }

    enum OpSource { MANUAL, CLOSE }

    enum TransferStatus { POSTED, CANCELLED }

    // ===== KO / BO =====

    record CashOpRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotNull(message = "{validation.required}") Long accountId,
            @NotNull(message = "{validation.required}") Direction direction,
            @NotNull(message = "{validation.required}") Long itemId,
            @NotBlank(message = "{validation.required}") @Size(max = 24) @Schema(description = "Summa, masalan «250000.00»") String amount,
            @Schema(nullable = true, description = "Bo'sh bo'lsa — bugun") LocalDate opDate,
            @Schema(nullable = true, description = "Kimdan / kimga (ixtiyoriy)") @Size(max = 200) String party,
            @Schema(nullable = true) @Size(max = 500) String note,
            @Schema(nullable = true, description = "Asos hujjat № (ixtiyoriy)") @Size(max = 40) String baseNo) {}

    record ReasonRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record CashOp(long id, String number, String docType, long branchId, long accountId, String account, String accountKind, LocalDate opDate,
            Direction direction, long itemId, String item, String amount, @Schema(nullable = true) String party, @Schema(nullable = true) String note,
            @Schema(nullable = true) String baseNo, OpSource source, OpStatus status, String createdBy, Instant createdAt, @Schema(nullable = true) String approvedBy,
            @Schema(nullable = true) Instant approvedAt, @Schema(nullable = true) String cancelledBy, @Schema(nullable = true) Instant cancelledAt,
            @Schema(nullable = true) String cancelReason, long version) {}

    // ===== IO =====

    record TransferRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotNull(message = "{validation.required}") Long fromAccountId,
            @NotNull(message = "{validation.required}") Long toAccountId,
            @NotBlank(message = "{validation.required}") @Size(max = 24) String amount,
            @Schema(nullable = true, description = "Bo'sh bo'lsa — bugun") LocalDate transferDate,
            @Schema(nullable = true) @Size(max = 500) String note) {}

    record Transfer(long id, String number, long branchId, long fromAccountId, String fromAccount, long toAccountId, String toAccount,
            LocalDate transferDate, String amount, @Schema(nullable = true) String note, TransferStatus status, String createdBy, Instant createdAt,
            @Schema(nullable = true) String cancelledBy, @Schema(nullable = true) Instant cancelledAt, @Schema(nullable = true) String cancelReason) {}

    // ===== Hisob jurnali =====

    record Move(long id, Instant occurredAt, LocalDate moveDate, String amount, String docType, long docId, String docNumber,
            @Schema(nullable = true) String employee, @Schema(nullable = true) String note) {}

    record Statement(long accountId, String account, LocalDate from, LocalDate to, String opening, String income, String expense, String closing,
            @Schema(nullable = true) LocalDate closedThrough, List<Move> moves) {}

    // ===== Kunni yopish =====

    record Denomination(@NotNull(message = "{validation.required}") @Min(1) Integer nominal,
            @NotNull(message = "{validation.required}") @Min(0) Integer count) {}

    record CloseRequest(
            @NotNull(message = "{validation.required}") Long accountId,
            @Schema(nullable = true, description = "Bo'sh bo'lsa — bugun") LocalDate closeDate,
            @NotNull(message = "{validation.required}") @Size(max = 20) List<@Valid Denomination> denominations,
            @Schema(nullable = true, description = "Tiyin va mayda pul summasi, masalan «350.50»") @Size(max = 24) String coins,
            @Schema(nullable = true, description = "Farq bo'lsa majburiy") @Size(max = 500) String note,
            @Schema(nullable = true, description = "Farq bo'lsa majburiy") @Size(max = 6) String pin,
            @Schema(nullable = true, description = "Farqni tasdiqlovchi (cash.closeDiff); bo'sh bo'lsa — yopayotgan xodimning o'zi") Long approverId) {}

    /** Farqni PIN bilan tasdiqlay oladigan xodim (cash.closeDiff, kassa filiali doirasida). */
    record CloseApprover(long id, String name, String role, boolean ownBranch) {}

    record ClosePreview(long accountId, String account, LocalDate closeDate, @Schema(nullable = true) LocalDate lastClosed, String expected,
            String income, String expense, int pendingOps, List<Integer> nominals) {}

    record DayClose(long id, long accountId, String account, LocalDate closeDate, String expected, String counted, String diff,
            List<Denomination> denominations, @Schema(nullable = true) String note, @Schema(nullable = true) String correctionNumber,
            String closedBy, Instant closedAt, @Schema(nullable = true) String approvedBy) {}
}
