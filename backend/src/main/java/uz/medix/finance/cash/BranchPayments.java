package uz.medix.finance.cash;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.CashierGuard;
import uz.medix.finance.MoneyLedger;
import uz.medix.finance.account.Accounts;
import uz.medix.finance.cash.CashModels.TransferStatus;
import uz.medix.inventory.BranchDebts;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * Filiallar o'rtasida hisob-kitob: qarzdor filial (FS bo'yicha) o'z hisobidan kreditor filial hisobiga to'laydi. Bitta tranzaksiyada:
 * filiallar juftligi qulflanadi (parallel to'lovlar qarzdan oshmaydi), qarzdor hisobidan chiqim, kreditor hisobiga kirim (hisoblar id
 * tartibida), filiallararo qarz kamayadi. Raqam — IO hisoblagichidan (qarzdor filial), pul jurnalida hujjat turi «FIO». Bekor qilish —
 * bugungi sana bilan teskari (kreditor hisobida pul yetmasa — bekor qilinmaydi), qarz qaytadi.
 */
@Service
class BranchPayments {

    static final String DOC_TYPE = "FIO";

    record BranchPaymentRequest(
            @NotNull(message = "{validation.required}") Long payerBranchId,
            @NotNull(message = "{validation.required}") Long payeeBranchId,
            @NotNull(message = "{validation.required}") Long fromAccountId,
            @NotNull(message = "{validation.required}") Long toAccountId,
            @NotBlank(message = "{validation.required}") @Size(max = 24) String amount,
            @Schema(nullable = true, description = "Bo'sh bo'lsa — bugun") LocalDate paymentDate,
            @Schema(nullable = true) @Size(max = 500) String note) {}

    record BranchPayment(long id, String number, long payerBranchId, String payerBranch, long payeeBranchId, String payeeBranch,
            long fromAccountId, String fromAccount, long toAccountId, String toAccount, LocalDate paymentDate, String amount,
            @Schema(nullable = true) String note, TransferStatus status, String createdBy, Instant createdAt,
            @Schema(nullable = true) String cancelledBy, @Schema(nullable = true) Instant cancelledAt,
            @Schema(nullable = true) String cancelReason) {}

    /** Kreditor filialning to'lov qabul qiladigan faol hisoblari (faqat nom — qoldiq ko'rsatilmaydi). */
    record PayeeAccount(long id, Accounts.Kind kind, String name) {}

    private final JdbcClient jdbc;
    private final MoneyLedger money;
    private final Accounts accounts;
    private final CashierGuard cashiers;
    private final BranchDebts debts;
    private final DocumentSequenceService numbers;
    private final AuditLog audit;
    private final CashOps ops;

    BranchPayments(JdbcClient jdbc, MoneyLedger money, Accounts accounts, CashierGuard cashiers, BranchDebts debts,
            DocumentSequenceService numbers, AuditLog audit, CashOps ops) {
        this.jdbc = jdbc;
        this.money = money;
        this.accounts = accounts;
        this.cashiers = cashiers;
        this.debts = debts;
        this.numbers = numbers;
        this.audit = audit;
        this.ops = ops;
    }

    @Transactional
    long create(Actor actor, BranchPaymentRequest r) {
        if (!actor.canAccessBranch(r.payerBranchId())) {
            throw MedixException.notFound("error.notFound");
        }
        if (r.payerBranchId().equals(r.payeeBranchId())) {
            throw MedixException.badRequest("branchPayment.sameBranch");
        }
        Accounts.Account from = accounts.find(r.fromAccountId())
                .filter(a -> a.branchId() == r.payerBranchId() && a.active())
                .orElseThrow(() -> MedixException.badRequest("payment.accountUnknown"));
        cashiers.check(from.id());
        Accounts.Account to = accounts.find(r.toAccountId())
                .filter(a -> a.branchId() == r.payeeBranchId() && a.active())
                .orElseThrow(() -> MedixException.badRequest("payment.accountUnknown"));
        Money amount = CashOps.parseAmount(r.amount(), "payment.amountInvalid");
        LocalDate date = r.paymentDate() == null ? ops.today() : r.paymentDate();
        if (date.isAfter(ops.today())) {
            throw MedixException.badRequest("payment.dateFuture");
        }
        debts.lockPair(r.payerBranchId(), r.payeeBranchId());
        Money debt = debts.balance(r.payerBranchId(), r.payeeBranchId());
        if (amount.compareTo(debt) > 0) {
            throw MedixException.badRequest("branchPayment.overDebt", debt.format());
        }
        String payerCode = jdbc.sql("SELECT code FROM branch WHERE id = :b").param("b", r.payerBranchId()).query(String.class).single();
        String number = numbers.next(DocumentPrefix.IO, payerCode).toString();
        long id = jdbc.sql("""
                INSERT INTO branch_payment (number, payer_branch_id, payee_branch_id, from_account_id, to_account_id, payment_date, amount,
                                            note, created_by)
                VALUES (:n, :p, :q, :f, :t, :d, :amt, :note, :by) RETURNING id""")
                .param("n", number)
                .param("p", r.payerBranchId())
                .param("q", r.payeeBranchId())
                .param("f", from.id())
                .param("t", to.id())
                .param("d", Date.valueOf(date))
                .param("amt", amount.amount())
                .param("note", CashOps.blank(r.note()))
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        MoneyLedger.DocRef ref = new MoneyLedger.DocRef(DOC_TYPE, id, number);
        move(from.id(), to.id(), date, amount, ref, "Filialga to'lov → " + to.name(), "Filialdan to'lov ← " + from.name());
        debts.post(r.payerBranchId(), r.payeeBranchId(), Money.ZERO.minus(amount), DOC_TYPE, id, number, actor.employeeId());
        audit.record(AuditEntry.of("cash.branchPayment.create", "branch_payment", id)
                .change(null, Map.of("number", number, "payer", r.payerBranchId(), "payee", r.payeeBranchId(), "from", from.code(), "to",
                        to.code(), "amount", amount.toString())), actor);
        return id;
    }

    @Transactional
    void cancel(Actor actor, long id, String reason) {
        record H(String number, long payer, long payee, long from, long to, Money amount, TransferStatus status) {}
        H h = jdbc.sql("""
                SELECT number, payer_branch_id, payee_branch_id, from_account_id, to_account_id, amount, status
                FROM branch_payment WHERE id = :id FOR UPDATE""")
                .param("id", id)
                .query((rs, n) -> new H(rs.getString("number"), rs.getLong("payer_branch_id"), rs.getLong("payee_branch_id"),
                        rs.getLong("from_account_id"), rs.getLong("to_account_id"), new Money(rs.getBigDecimal("amount")),
                        TransferStatus.valueOf(rs.getString("status"))))
                .optional()
                .filter(x -> actor.canAccessBranch(x.payer()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (h.status() == TransferStatus.CANCELLED) {
            throw MedixException.conflict("cash.alreadyCancelled");
        }
        String why = reason.strip();
        debts.lockPair(h.payer(), h.payee());
        // Teskari: pul kreditor hisobidan qaytadi (yetmasa — MoneyLedger rad etadi), qarz tiklanadi
        move(h.to(), h.from(), ops.today(), h.amount(), new MoneyLedger.DocRef(DOC_TYPE, id, h.number()), "Bekor: " + why, "Bekor: " + why);
        debts.post(h.payer(), h.payee(), h.amount(), DOC_TYPE, id, h.number(), actor.employeeId());
        jdbc.sql("""
                UPDATE branch_payment SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r,
                       version = version + 1
                WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", why)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("cash.branchPayment.cancel", "branch_payment", id)
                .change(Map.of("status", "POSTED"), Map.of("status", "CANCELLED")).withReason(why), actor);
    }

    /** Ikki hisob id tartibida qulflanadi. */
    private void move(long fromId, long toId, LocalDate date, Money amount, MoneyLedger.DocRef ref, String outNote, String inNote) {
        if (fromId < toId) {
            money.post(fromId, date, Money.ZERO.minus(amount), ref, outNote);
            money.post(toId, date, amount, ref, inNote);
        } else {
            money.post(toId, date, amount, ref, inNote);
            money.post(fromId, date, Money.ZERO.minus(amount), ref, outNote);
        }
    }

    @Transactional
    List<PayeeAccount> payeeAccounts(Actor actor, long payerBranchId, long payeeBranchId) {
        if (!actor.canAccessBranch(payerBranchId) || payerBranchId == payeeBranchId) {
            return List.of();
        }
        accounts.ensureDefaults(payeeBranchId);
        return jdbc.sql("SELECT id, kind, name FROM money_account WHERE branch_id = :b AND active ORDER BY kind, name")
                .param("b", payeeBranchId)
                .query((rs, n) -> new PayeeAccount(rs.getLong("id"), Accounts.Kind.valueOf(rs.getString("kind")), rs.getString("name")))
                .list();
    }

    private static final String SELECT = """
            SELECT t.id, t.number, t.payer_branch_id, pb.name AS payer_branch, t.payee_branch_id, qb.name AS payee_branch,
                   t.from_account_id, fa.name AS from_account, t.to_account_id, ta.name AS to_account, t.payment_date, t.amount, t.note,
                   t.status, cb.full_name AS created_by, t.created_at, xb.full_name AS cancelled_by, t.cancelled_at, t.cancel_reason
            FROM branch_payment t
            JOIN branch pb ON pb.id = t.payer_branch_id JOIN branch qb ON qb.id = t.payee_branch_id
            JOIN money_account fa ON fa.id = t.from_account_id JOIN money_account ta ON ta.id = t.to_account_id
            JOIN employee cb ON cb.id = t.created_by LEFT JOIN employee xb ON xb.id = t.cancelled_by""";

    private static BranchPayment map(ResultSet rs) throws SQLException {
        return new BranchPayment(rs.getLong("id"), rs.getString("number"), rs.getLong("payer_branch_id"), rs.getString("payer_branch"),
                rs.getLong("payee_branch_id"), rs.getString("payee_branch"), rs.getLong("from_account_id"), rs.getString("from_account"),
                rs.getLong("to_account_id"), rs.getString("to_account"), rs.getDate("payment_date").toLocalDate(),
                new Money(rs.getBigDecimal("amount")).toString(), rs.getString("note"), TransferStatus.valueOf(rs.getString("status")),
                rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(), rs.getString("cancelled_by"),
                rs.getTimestamp("cancelled_at") == null ? null : rs.getTimestamp("cancelled_at").toInstant(), rs.getString("cancel_reason"));
    }

    /** Xodim o'z filiali to'lovchi yoki oluvchi bo'lgan to'lovlarni ko'radi. */
    @Transactional(readOnly = true)
    List<BranchPayment> list(Actor actor, Long branchId) {
        return jdbc.sql(SELECT + """
                 WHERE (CAST(:b AS BIGINT) IS NULL OR t.payer_branch_id = :b OR t.payee_branch_id = :b)
                ORDER BY t.payment_date DESC, t.id DESC LIMIT 300""")
                .param("b", branchId)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("payer_branch_id")) || actor.canAccessBranch(rs.getLong("payee_branch_id"))
                        ? map(rs) : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .toList();
    }

    @Transactional(readOnly = true)
    Optional<BranchPayment> find(Actor actor, long id) {
        return jdbc.sql(SELECT + " WHERE t.id = :id")
                .param("id", id)
                .query((rs, n) -> map(rs))
                .optional()
                .filter(p -> actor.canAccessBranch(p.payerBranchId()) || actor.canAccessBranch(p.payeeBranchId()));
    }
}
