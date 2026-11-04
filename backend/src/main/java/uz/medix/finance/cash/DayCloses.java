package uz.medix.finance.cash;

import java.sql.Date;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.account.Accounts;
import uz.medix.finance.cash.CashModels.CloseRequest;
import uz.medix.finance.cash.CashModels.ClosePreview;
import uz.medix.finance.cash.CashModels.DayClose;
import uz.medix.finance.cash.CashModels.Denomination;
import uz.medix.finance.cash.CashModels.Move;
import uz.medix.finance.cash.CashModels.Statement;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.PinVerifier;

/**
 * Kunni yopish (SPEC 5.5): faqat kassalarda — kupyuralar sanog'i. Kutilgan qoldiq = shu kungacha (shu kun ham) pul jurnali yig'indisi.
 * Farq bo'lsa: ruxsat (cash.closeDiff), izoh va PIN; farq tuzatuvchi KO bilan yoziladi. Yopilgan kunga va undan oldingi kunlarga
 * shu kassada yangi harakat yozilmaydi ({@link uz.medix.finance.MoneyLedger}). Hisob jurnali (ko'chirma) ham shu yerda.
 */
@Service
class DayCloses {

    /** O'zbekiston so'mi banknota va tangalari. */
    static final List<Integer> NOMINALS = List.of(200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50);

    private final JdbcClient jdbc;
    private final Accounts accounts;
    private final CashOps ops;
    private final PinVerifier pins;
    private final AuditLog audit;

    DayCloses(JdbcClient jdbc, Accounts accounts, CashOps ops, PinVerifier pins, AuditLog audit) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.ops = ops;
        this.pins = pins;
        this.audit = audit;
    }

    private Accounts.Account account(Actor actor, long accountId) {
        return accounts.find(accountId)
                .filter(a -> actor.canAccessBranch(a.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private Optional<LocalDate> lastClosed(long accountId) {
        return jdbc.sql("SELECT close_date FROM cash_day_close WHERE account_id = :a ORDER BY close_date DESC LIMIT 1")
                .param("a", accountId)
                .query(Date.class)
                .optional()
                .map(Date::toLocalDate);
    }

    private Money sumThrough(long accountId, LocalDate date) {
        return new Money(jdbc.sql("SELECT coalesce(sum(amount), 0) FROM money_move WHERE account_id = :a AND move_date <= :d")
                .param("a", accountId)
                .param("d", Date.valueOf(date))
                .query(java.math.BigDecimal.class)
                .single());
    }

    private Money[] dayTurnover(long accountId, LocalDate from, LocalDate to) {
        record T(java.math.BigDecimal in, java.math.BigDecimal out) {}
        T t = jdbc.sql("""
                SELECT coalesce(sum(amount) FILTER (WHERE amount > 0), 0) AS inc, coalesce(-sum(amount) FILTER (WHERE amount < 0), 0) AS exp
                FROM money_move WHERE account_id = :a AND move_date BETWEEN :f AND :t""")
                .param("a", accountId)
                .param("f", Date.valueOf(from))
                .param("t", Date.valueOf(to))
                .query((rs, n) -> new T(rs.getBigDecimal("inc"), rs.getBigDecimal("exp")))
                .single();
        return new Money[] {new Money(t.in()), new Money(t.out())};
    }

    private int pendingOps(long accountId, LocalDate date) {
        return jdbc.sql("SELECT count(*) FROM cash_op WHERE account_id = :a AND status = 'PENDING' AND op_date <= :d")
                .param("a", accountId)
                .param("d", Date.valueOf(date))
                .query(Integer.class)
                .single();
    }

    // ===== Ko'chirma =====

    @Transactional(readOnly = true)
    Statement statement(Actor actor, long accountId, LocalDate from, LocalDate to) {
        Accounts.Account acc = account(actor, accountId);
        LocalDate t = to == null ? ops.today() : to;
        LocalDate f = from == null ? t : from;
        if (f.isAfter(t)) {
            throw MedixException.badRequest("cash.periodInvalid");
        }
        Money opening = sumThrough(accountId, f.minusDays(1));
        Money[] turn = dayTurnover(accountId, f, t);
        List<Move> moves = jdbc.sql("""
                SELECT m.id, m.occurred_at, m.move_date, m.amount, m.doc_type, m.doc_id, m.doc_number, e.full_name AS employee, m.note
                FROM money_move m LEFT JOIN employee e ON e.id = m.employee_id
                WHERE m.account_id = :a AND m.move_date BETWEEN :f AND :t ORDER BY m.move_date, m.id LIMIT 2000""")
                .param("a", accountId)
                .param("f", Date.valueOf(f))
                .param("t", Date.valueOf(t))
                .query((rs, n) -> new Move(rs.getLong("id"), rs.getTimestamp("occurred_at").toInstant(), rs.getDate("move_date").toLocalDate(),
                        new Money(rs.getBigDecimal("amount")).toString(), rs.getString("doc_type"), rs.getLong("doc_id"), rs.getString("doc_number"),
                        rs.getString("employee"), rs.getString("note")))
                .list();
        Money closing = opening.plus(turn[0]).minus(turn[1]);
        return new Statement(accountId, acc.name(), f, t, opening.toString(), turn[0].toString(), turn[1].toString(), closing.toString(),
                lastClosed(accountId).orElse(null), moves);
    }

    // ===== Kunni yopish =====

    @Transactional(readOnly = true)
    ClosePreview preview(Actor actor, long accountId, LocalDate date) {
        Accounts.Account acc = account(actor, accountId);
        if (acc.kind() != Accounts.Kind.CASH) {
            throw MedixException.badRequest("cashClose.onlyCash");
        }
        LocalDate d = date == null ? ops.today() : date;
        Money[] turn = dayTurnover(accountId, d, d);
        return new ClosePreview(accountId, acc.name(), d, lastClosed(accountId).orElse(null), sumThrough(accountId, d).toString(),
                turn[0].toString(), turn[1].toString(), pendingOps(accountId, d), NOMINALS);
    }

    @Transactional
    long close(Actor actor, CloseRequest r, boolean mayCloseWithDiff) {
        Accounts.Account acc = account(actor, r.accountId());
        if (acc.kind() != Accounts.Kind.CASH) {
            throw MedixException.badRequest("cashClose.onlyCash");
        }
        // Hisob qulflanadi: yopish paytida shu kassaga harakat yozilmaydi
        jdbc.sql("SELECT id FROM money_account WHERE id = :a FOR NO KEY UPDATE").param("a", acc.id()).query(Long.class).single();
        LocalDate d = r.closeDate() == null ? ops.today() : r.closeDate();
        if (d.isAfter(ops.today())) {
            throw MedixException.badRequest("payment.dateFuture");
        }
        Optional<LocalDate> last = lastClosed(acc.id());
        if (last.isPresent() && !d.isAfter(last.get())) {
            throw MedixException.conflict("cashClose.alreadyClosed", last.get().format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy")));
        }
        if (pendingOps(acc.id(), d) > 0) {
            throw MedixException.conflict("cashClose.pending");
        }
        Set<Integer> seen = new HashSet<>();
        Money counted = Money.ZERO;
        StringBuilder json = new StringBuilder("[");
        for (Denomination den : r.denominations()) {
            if (!NOMINALS.contains(den.nominal()) || !seen.add(den.nominal())) {
                throw MedixException.badRequest("cashClose.nominalInvalid");
            }
            if (den.count() == 0) {
                continue;
            }
            counted = counted.plus(Money.of(den.nominal()).times(den.count()));
            json.append(json.length() > 1 ? "," : "").append("{\"nominal\":").append(den.nominal()).append(",\"count\":").append(den.count()).append('}');
        }
        json.append(']');
        String coinsRaw = CashOps.blank(r.coins());
        if (coinsRaw != null) {
            Money coins;
            try {
                coins = Money.of(coinsRaw);
            } catch (RuntimeException e) {
                throw MedixException.badRequest("cashClose.coinsInvalid");
            }
            if (coins.isNegative()) {
                throw MedixException.badRequest("cashClose.coinsInvalid");
            }
            counted = counted.plus(coins);
        }
        Money expected = sumThrough(acc.id(), d);
        Money diff = counted.minus(expected);
        String note = CashOps.blank(r.note());
        Long correction = null;
        if (!diff.isZero()) {
            if (!mayCloseWithDiff) {
                throw MedixException.forbidden("cashClose.diffForbidden", diff.format());
            }
            if (note == null) {
                throw MedixException.badRequest("cashClose.noteRequired");
            }
            if (r.pin() == null || r.pin().isBlank()) {
                throw MedixException.badRequest("cashClose.pinRequired");
            }
            pins.verify(actor.employeeId(), r.pin());
            correction = ops.correction(actor, acc, diff, d, "Kunni yopish: " + note);
        }
        long id = jdbc.sql("""
                INSERT INTO cash_day_close (account_id, close_date, expected, counted, diff, denominations, note, correction_op_id, closed_by)
                VALUES (:a, :d, :e, :c, :diff, CAST(:j AS JSONB), :note, :corr, :by) RETURNING id""")
                .param("a", acc.id())
                .param("d", Date.valueOf(d))
                .param("e", expected.amount())
                .param("c", counted.amount())
                .param("diff", diff.amount())
                .param("j", json.toString())
                .param("note", note)
                .param("corr", correction)
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        audit.record(AuditEntry.of("cash.close", "cash_day_close", id)
                .change(null, Map.of("account", acc.code(), "date", d.toString(), "expected", expected.toString(), "counted", counted.toString(),
                        "diff", diff.toString())));
        return id;
    }

    // ===== O'qish =====

    private static final String SELECT = """
            SELECT c.id, c.account_id, a.name AS account, a.branch_id, c.close_date, c.expected, c.counted, c.diff, c.note, o.number AS correction,
                   e.full_name AS closed_by, c.closed_at
            FROM cash_day_close c JOIN money_account a ON a.id = c.account_id JOIN employee e ON e.id = c.closed_by
            LEFT JOIN cash_op o ON o.id = c.correction_op_id""";

    private List<Denomination> denominations(long id) {
        return jdbc.sql("""
                SELECT (e->>'nominal')::int AS nominal, (e->>'count')::int AS cnt
                FROM cash_day_close c, jsonb_array_elements(c.denominations) e WHERE c.id = :id ORDER BY 1 DESC""")
                .param("id", id)
                .query((rs, n) -> new Denomination(rs.getInt("nominal"), rs.getInt("cnt")))
                .list();
    }

    /** Kupyuralar alohida so'rov bilan — asosiy ResultSet yopilgandan keyin. */
    private DayClose map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new DayClose(rs.getLong("id"), rs.getLong("account_id"), rs.getString("account"), rs.getDate("close_date").toLocalDate(),
                new Money(rs.getBigDecimal("expected")).toString(), new Money(rs.getBigDecimal("counted")).toString(),
                new Money(rs.getBigDecimal("diff")).toString(), List.of(), rs.getString("note"), rs.getString("correction"),
                rs.getString("closed_by"), rs.getTimestamp("closed_at").toInstant());
    }

    private DayClose withDenominations(DayClose c) {
        return new DayClose(c.id(), c.accountId(), c.account(), c.closeDate(), c.expected(), c.counted(), c.diff(), denominations(c.id()), c.note(),
                c.correctionNumber(), c.closedBy(), c.closedAt());
    }

    @Transactional(readOnly = true)
    List<DayClose> list(Actor actor, long branchId, Long accountId) {
        if (!actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        return jdbc.sql(SELECT + " WHERE a.branch_id = :b AND (CAST(:a AS BIGINT) IS NULL OR c.account_id = :a)"
                + " ORDER BY c.close_date DESC, c.id DESC LIMIT 100")
                .param("b", branchId)
                .param("a", accountId)
                .query((rs, n) -> map(rs))
                .list()
                .stream()
                .map(this::withDenominations)
                .toList();
    }

    @Transactional(readOnly = true)
    DayClose find(Actor actor, long id) {
        return jdbc.sql(SELECT + " WHERE c.id = :id")
                .param("id", id)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id")) ? map(rs) : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .findFirst()
                .map(this::withDenominations)
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }
}
