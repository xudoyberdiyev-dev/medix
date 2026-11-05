package uz.medix.finance.cash;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.sql.Date;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.account.Accounts;
import uz.medix.finance.cash.CashModels.Move;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * Bank ko'chirmasi bilan solishtirish (SPEC 5.5): bank hisobi uchun ko'chirma sanasidagi bank qoldig'i MEDIX jurnalidagi qoldiq bilan
 * solishtiriladi, bank tasdiqlagan harakatlar belgilanadi. Farq bo'lsa — izoh majburiy. Solishtirishlar ketma-ket (har biri oldingisidan
 * keyingi sana), faqat qo'shiladi. V1 — qo'lda (bank fayli importi — namuna kelgach).
 */
@Service
class BankReconciliations {

    record ReconPreview(long accountId, String account, LocalDate date, String medixBalance, @Schema(nullable = true) LocalDate lastDate,
            @Schema(nullable = true) String lastBankBalance, List<Move> unmatched, String unmatchedTotal) {}

    record ReconRequest(@NotNull(message = "{validation.required}") Long accountId,
            @NotNull(message = "{validation.required}") LocalDate statementDate,
            @NotBlank(message = "{validation.required}") String bankBalance,
            @Schema(nullable = true, description = "Bank ko'chirmasida bor harakatlar (money_move id)") List<Long> moveIds,
            @Schema(nullable = true) @Size(max = 500) String note) {}

    record Reconciliation(long id, long accountId, String account, LocalDate statementDate, String bankBalance, String medixBalance,
            String difference, int moves, @Schema(nullable = true) String note, String createdBy, Instant createdAt) {}

    private final JdbcClient jdbc;
    private final Accounts accounts;
    private final CashOps ops;
    private final AuditLog audit;

    BankReconciliations(JdbcClient jdbc, Accounts accounts, CashOps ops, AuditLog audit) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.ops = ops;
        this.audit = audit;
    }

    private Accounts.Account bank(Actor actor, long accountId) {
        Accounts.Account acc = accounts.find(accountId)
                .filter(a -> actor.canAccessBranch(a.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (acc.kind() != Accounts.Kind.BANK) {
            throw MedixException.badRequest("bankRecon.onlyBank");
        }
        return acc;
    }

    private Money balanceThrough(long accountId, LocalDate d) {
        return new Money(jdbc.sql("SELECT coalesce(sum(amount), 0) FROM money_move WHERE account_id = :a AND move_date <= :d")
                .param("a", accountId)
                .param("d", Date.valueOf(d))
                .query(java.math.BigDecimal.class)
                .single());
    }

    private record Last(LocalDate date, Money bankBalance) {}

    private Optional<Last> last(long accountId) {
        return jdbc.sql("SELECT statement_date, bank_balance FROM bank_reconciliation WHERE account_id = :a ORDER BY statement_date DESC LIMIT 1")
                .param("a", accountId)
                .query((rs, n) -> new Last(rs.getDate("statement_date").toLocalDate(), new Money(rs.getBigDecimal("bank_balance"))))
                .optional();
    }

    private List<Move> unmatched(long accountId, LocalDate d) {
        return jdbc.sql("""
                SELECT m.id, m.occurred_at, m.move_date, m.amount, m.doc_type, m.doc_id, m.doc_number, e.full_name AS employee, m.note
                FROM money_move m LEFT JOIN employee e ON e.id = m.employee_id
                WHERE m.account_id = :a AND m.move_date <= :d
                  AND NOT EXISTS (SELECT 1 FROM bank_reconciliation_move r WHERE r.move_id = m.id)
                ORDER BY m.move_date, m.id LIMIT 2000""")
                .param("a", accountId)
                .param("d", Date.valueOf(d))
                .query((rs, n) -> new Move(rs.getLong("id"), rs.getTimestamp("occurred_at").toInstant(), rs.getDate("move_date").toLocalDate(),
                        new Money(rs.getBigDecimal("amount")).toString(), rs.getString("doc_type"), rs.getLong("doc_id"), rs.getString("doc_number"),
                        rs.getString("employee"), rs.getString("note")))
                .list();
    }

    @Transactional(readOnly = true)
    ReconPreview preview(Actor actor, long accountId, LocalDate date) {
        Accounts.Account acc = bank(actor, accountId);
        LocalDate d = date == null ? ops.today() : date;
        List<Move> moves = unmatched(accountId, d);
        Money total = moves.stream().map(m -> Money.of(m.amount())).reduce(Money.ZERO, Money::plus);
        Optional<Last> l = last(accountId);
        return new ReconPreview(accountId, acc.name(), d, balanceThrough(accountId, d).toString(), l.map(Last::date).orElse(null),
                l.map(x -> x.bankBalance().toString()).orElse(null), moves, total.toString());
    }

    @Transactional
    long create(Actor actor, ReconRequest r) {
        Accounts.Account acc = bank(actor, r.accountId());
        // Hisob qulflanadi: solishtirish paytida harakat va boshqa solishtirish ketma-ket
        jdbc.sql("SELECT id FROM money_account WHERE id = :a FOR NO KEY UPDATE").param("a", acc.id()).query(Long.class).single();
        LocalDate d = r.statementDate();
        if (d.isAfter(ops.today())) {
            throw MedixException.badRequest("payment.dateFuture");
        }
        Optional<Last> l = last(acc.id());
        if (l.isPresent() && !d.isAfter(l.get().date())) {
            throw MedixException.conflict("bankRecon.dateNotAfterLast", l.get().date().format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy")));
        }
        Money bankBalance;
        try {
            bankBalance = Money.of(r.bankBalance().strip());
        } catch (RuntimeException e) {
            throw MedixException.badRequest("bankRecon.balanceInvalid");
        }
        if (bankBalance.isNegative()) {
            throw MedixException.badRequest("bankRecon.balanceInvalid");
        }
        Set<Long> open = new HashSet<>(unmatched(acc.id(), d).stream().map(Move::id).toList());
        List<Long> ids = r.moveIds() == null ? List.of() : r.moveIds().stream().distinct().toList();
        if (!open.containsAll(ids)) {
            throw MedixException.badRequest("bankRecon.moveUnknown");
        }
        Money medix = balanceThrough(acc.id(), d);
        String note = r.note() == null || r.note().isBlank() ? null : r.note().strip();
        if (bankBalance.compareTo(medix) != 0 && note == null) {
            throw MedixException.badRequest("bankRecon.noteRequired", bankBalance.minus(medix).format());
        }
        long id = jdbc.sql("""
                INSERT INTO bank_reconciliation (account_id, statement_date, bank_balance, medix_balance, note, created_by)
                VALUES (:a, :d, :bb, :mb, :n, :by) RETURNING id""")
                .param("a", acc.id())
                .param("d", Date.valueOf(d))
                .param("bb", bankBalance.amount())
                .param("mb", medix.amount())
                .param("n", note)
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        for (Long m : ids) {
            jdbc.sql("INSERT INTO bank_reconciliation_move (reconciliation_id, move_id) VALUES (:r, :m)").param("r", id).param("m", m).update();
        }
        audit.record(AuditEntry.of("bank.reconcile", "money_account", acc.id())
                .change(null, Map.of("date", d.toString(), "bank", bankBalance.toString(), "medix", medix.toString(), "moves", ids.size())));
        return id;
    }

    private static final String SELECT = """
            SELECT b.id, b.account_id, a.name AS account, b.statement_date, b.bank_balance, b.medix_balance, b.note, e.full_name AS created_by,
                   b.created_at, (SELECT count(*) FROM bank_reconciliation_move m WHERE m.reconciliation_id = b.id)::int AS moves
            FROM bank_reconciliation b JOIN money_account a ON a.id = b.account_id JOIN employee e ON e.id = b.created_by""";

    private static Reconciliation map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        Money bank = new Money(rs.getBigDecimal("bank_balance"));
        Money medix = new Money(rs.getBigDecimal("medix_balance"));
        return new Reconciliation(rs.getLong("id"), rs.getLong("account_id"), rs.getString("account"), rs.getDate("statement_date").toLocalDate(),
                bank.toString(), medix.toString(), bank.minus(medix).toString(), rs.getInt("moves"), rs.getString("note"), rs.getString("created_by"),
                rs.getTimestamp("created_at").toInstant());
    }

    @Transactional(readOnly = true)
    Reconciliation find(long id) {
        return jdbc.sql(SELECT + " WHERE b.id = :id").param("id", id).query(BankReconciliations::map).single();
    }

    @Transactional(readOnly = true)
    List<Reconciliation> list(Actor actor, long accountId) {
        bank(actor, accountId);
        return jdbc.sql(SELECT + " WHERE b.account_id = :a ORDER BY b.statement_date DESC LIMIT 200").param("a", accountId)
                .query(BankReconciliations::map).list();
    }
}
