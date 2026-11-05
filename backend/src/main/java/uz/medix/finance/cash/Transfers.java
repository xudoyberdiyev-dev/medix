package uz.medix.finance.cash;

import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.CashierGuard;
import uz.medix.finance.MoneyLedger;
import uz.medix.finance.account.Accounts;
import uz.medix.finance.cash.CashModels.Transfer;
import uz.medix.finance.cash.CashModels.TransferRequest;
import uz.medix.finance.cash.CashModels.TransferStatus;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * IO — bir filial hisoblari orasida o'tkazma (SPEC 5.5), jumladan «Terminal → bank» va «kassa → bank». Darhol o'tkaziladi: bitta
 * tranzaksiyada chiqim va kirim. Hisoblar id tartibida qulflanadi (deadlock bo'lmaydi). Bekor qilish — bugungi sana bilan teskari.
 */
@Service
class Transfers {

    private final JdbcClient jdbc;
    private final MoneyLedger money;
    private final Accounts accounts;
    private final CashierGuard cashiers;
    private final DocumentSequenceService numbers;
    private final AuditLog audit;
    private final CashOps ops;

    Transfers(JdbcClient jdbc, MoneyLedger money, Accounts accounts, CashierGuard cashiers, DocumentSequenceService numbers, AuditLog audit, CashOps ops) {
        this.jdbc = jdbc;
        this.money = money;
        this.accounts = accounts;
        this.cashiers = cashiers;
        this.numbers = numbers;
        this.audit = audit;
        this.ops = ops;
    }

    @Transactional
    long create(Actor actor, TransferRequest r) {
        if (!actor.canAccessBranch(r.branchId())) {
            throw MedixException.notFound("error.notFound");
        }
        if (r.fromAccountId().equals(r.toAccountId())) {
            throw MedixException.badRequest("transfer.sameAccount");
        }
        Accounts.Account from = accounts.find(r.fromAccountId())
                .filter(a -> a.branchId() == r.branchId() && a.active())
                .orElseThrow(() -> MedixException.badRequest("payment.accountUnknown"));
        cashiers.check(from.id());
        Accounts.Account to = accounts.find(r.toAccountId())
                .filter(a -> a.branchId() == r.branchId() && a.active())
                .orElseThrow(() -> MedixException.badRequest("payment.accountUnknown"));
        Money amount = CashOps.parseAmount(r.amount(), "payment.amountInvalid");
        LocalDate date = r.transferDate() == null ? ops.today() : r.transferDate();
        if (date.isAfter(ops.today())) {
            throw MedixException.badRequest("payment.dateFuture");
        }
        String branchCode = jdbc.sql("SELECT code FROM branch WHERE id = :b").param("b", r.branchId()).query(String.class).single();
        String number = numbers.next(DocumentPrefix.IO, branchCode).toString();
        long id = jdbc.sql("""
                INSERT INTO money_transfer (number, branch_id, from_account_id, to_account_id, transfer_date, amount, note, created_by)
                VALUES (:n, :b, :f, :t, :d, :amt, :note, :by) RETURNING id""")
                .param("n", number)
                .param("b", r.branchId())
                .param("f", from.id())
                .param("t", to.id())
                .param("d", Date.valueOf(date))
                .param("amt", amount.amount())
                .param("note", CashOps.blank(r.note()))
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        MoneyLedger.DocRef ref = new MoneyLedger.DocRef("IO", id, number);
        move(from.id(), to.id(), date, amount, ref, "→ " + to.name(), "← " + from.name());
        audit.record(AuditEntry.of("cash.transfer.create", "money_transfer", id)
                .change(null, Map.of("number", number, "from", from.code(), "to", to.code(), "amount", amount.toString())));
        return id;
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
    void cancel(Actor actor, long id, String reason) {
        record H(String number, long branchId, long from, long to, Money amount, TransferStatus status) {}
        H h = jdbc.sql("SELECT number, branch_id, from_account_id, to_account_id, amount, status FROM money_transfer WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new H(rs.getString("number"), rs.getLong("branch_id"), rs.getLong("from_account_id"), rs.getLong("to_account_id"),
                        new Money(rs.getBigDecimal("amount")), TransferStatus.valueOf(rs.getString("status"))))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (h.status() == TransferStatus.CANCELLED) {
            throw MedixException.conflict("cash.alreadyCancelled");
        }
        String why = reason.strip();
        // Teskari: pul qabul qilgan hisobdan chiqadi (yetmasa — bekor qilinmaydi)
        move(h.to(), h.from(), ops.today(), h.amount(), new MoneyLedger.DocRef("IO", id, h.number()), "Bekor: " + why, "Bekor: " + why);
        jdbc.sql("""
                UPDATE money_transfer SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r, version = version + 1
                WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", why)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("cash.transfer.cancel", "money_transfer", id).change(Map.of("status", "POSTED"), Map.of("status", "CANCELLED"))
                .withReason(why));
    }

    private static final String SELECT = """
            SELECT t.id, t.number, t.branch_id, t.from_account_id, fa.name AS from_account, t.to_account_id, ta.name AS to_account, t.transfer_date,
                   t.amount, t.note, t.status, cb.full_name AS created_by, t.created_at, xb.full_name AS cancelled_by, t.cancelled_at, t.cancel_reason
            FROM money_transfer t JOIN money_account fa ON fa.id = t.from_account_id JOIN money_account ta ON ta.id = t.to_account_id
            JOIN employee cb ON cb.id = t.created_by LEFT JOIN employee xb ON xb.id = t.cancelled_by""";

    private static Transfer map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Transfer(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("from_account_id"),
                rs.getString("from_account"), rs.getLong("to_account_id"), rs.getString("to_account"), rs.getDate("transfer_date").toLocalDate(),
                new Money(rs.getBigDecimal("amount")).toString(), rs.getString("note"), TransferStatus.valueOf(rs.getString("status")),
                rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(), rs.getString("cancelled_by"),
                rs.getTimestamp("cancelled_at") == null ? null : rs.getTimestamp("cancelled_at").toInstant(), rs.getString("cancel_reason"));
    }

    @Transactional(readOnly = true)
    List<Transfer> list(Actor actor, Long branchId) {
        return jdbc.sql(SELECT + " WHERE (CAST(:b AS BIGINT) IS NULL OR t.branch_id = :b) ORDER BY t.transfer_date DESC, t.id DESC LIMIT 300")
                .param("b", branchId)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id")) ? map(rs) : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .toList();
    }

    @Transactional(readOnly = true)
    Transfer find(Actor actor, long id) {
        return jdbc.sql(SELECT + " WHERE t.id = :id")
                .param("id", id)
                .query((rs, n) -> map(rs))
                .optional()
                .filter(t -> actor.canAccessBranch(t.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }
}
