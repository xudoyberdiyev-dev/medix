package uz.medix.finance.cash;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.account.Accounts;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * Kassir paneli (SPEC 8): davr va hisob bo'yicha — qoldiqlar (Naqd / Terminal / Bank), kirim, chiqim, xarajatlar moddalar bo'yicha,
 * kutilayotgan pullar (tasdiqlanmagan MT), hisoblar jadvali (davr boshi + kirim − chiqim = davr oxiri), kunlik dinamika, oxirgi
 * operatsiyalar. Hammasi pul jurnalidan; hisoblar orasidagi o'tkazma (IO) kirim/chiqimga kirmaydi, faqat jadvalda ko'rinadi.
 */
@Service
class CashPanel {

    record KindTotals(String cash, String terminal, String bank, String total) {}

    record AccountTurnover(long id, String name, Accounts.Kind kind, String code, String opening, String income, String expense, String closing,
            @Schema(nullable = true) String cashierName) {}

    record ItemTotal(String item, String amount) {}

    record DayPoint(LocalDate date, String income, String expense) {}

    record RecentMove(long id, Instant occurredAt, String account, String docType, String docNumber, String amount,
            @Schema(nullable = true) String employee, @Schema(nullable = true) String note) {}

    record Panel(LocalDate from, LocalDate to, KindTotals balances, String income, String expense, List<ItemTotal> expenses,
            String expensesTotal, int draftPayments, String draftPaymentsAmount, int pendingOps, String pendingOpsAmount,
            List<AccountTurnover> accounts, List<DayPoint> days, List<RecentMove> recent) {}

    private final JdbcClient jdbc;
    private final Accounts accounts;
    private final CashOps ops;

    CashPanel(JdbcClient jdbc, Accounts accounts, CashOps ops) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.ops = ops;
    }

    private static Money m(BigDecimal v) {
        return new Money(v == null ? BigDecimal.ZERO : v);
    }

    @Transactional
    Panel panel(Actor actor, long branchId, LocalDate from, LocalDate to, Long accountId) {
        LocalDate t = to == null ? ops.today() : to;
        LocalDate f = from == null ? t : from;
        if (f.isAfter(t)) {
            throw MedixException.badRequest("cash.periodInvalid");
        }
        if (f.plusDays(366).isBefore(t)) {
            throw MedixException.badRequest("cash.periodTooLong");
        }
        List<Accounts.Account> all = accounts.list(actor, branchId); // filial doirasi shu yerda tekshiriladi
        if (accountId != null && all.stream().noneMatch(a -> a.id() == accountId)) {
            throw MedixException.notFound("error.notFound");
        }
        List<Accounts.Account> scope = accountId == null ? all : all.stream().filter(a -> a.id() == accountId).toList();
        List<Long> ids = scope.stream().map(Accounts.Account::id).toList();
        Money cash = Money.ZERO;
        Money terminal = Money.ZERO;
        Money bank = Money.ZERO;
        for (Accounts.Account a : scope) {
            Money b = Money.of(a.balance());
            switch (a.kind()) {
                case CASH -> cash = cash.plus(b);
                case TERMINAL -> terminal = terminal.plus(b);
                case BANK -> bank = bank.plus(b);
            }
        }
        KindTotals balances = new KindTotals(cash.toString(), terminal.toString(), bank.toString(), cash.plus(terminal).plus(bank).toString());
        if (ids.isEmpty()) {
            return new Panel(f, t, balances, "0.00", "0.00", List.of(), "0.00", 0, "0.00", 0, "0.00", List.of(), List.of(), List.of());
        }

        // Hisoblar jadvali: davr boshi + kirim − chiqim = davr oxiri (IO ham — hisob qoldig'i uchun)
        record Turn(long accountId, BigDecimal opening, BigDecimal income, BigDecimal expense) {}
        Map<Long, Turn> turns = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT account_id,
                       sum(amount) FILTER (WHERE move_date < :f) AS opening,
                       sum(amount) FILTER (WHERE move_date BETWEEN :f AND :t AND amount > 0) AS income,
                       -sum(amount) FILTER (WHERE move_date BETWEEN :f AND :t AND amount < 0) AS expense
                FROM money_move WHERE account_id IN (:ids) AND move_date <= :t GROUP BY account_id""")
                .param("ids", ids).param("f", Date.valueOf(f)).param("t", Date.valueOf(t))
                .query(Turn.class).list().forEach(x -> turns.put(x.accountId(), x));
        List<AccountTurnover> table = new ArrayList<>();
        for (Accounts.Account a : scope) {
            Turn x = turns.get(a.id());
            Money o = x == null ? Money.ZERO : m(x.opening());
            Money in = x == null ? Money.ZERO : m(x.income());
            Money out = x == null ? Money.ZERO : m(x.expense());
            table.add(new AccountTurnover(a.id(), a.name(), a.kind(), a.code(), o.toString(), in.toString(), out.toString(),
                    o.plus(in).minus(out).toString(), a.cashierName()));
        }

        // Kirim / chiqim (IO siz) va kunlik dinamika
        record Day(Date moveDate, BigDecimal income, BigDecimal expense) {}
        List<Day> dayRows = jdbc.sql("""
                SELECT move_date, sum(amount) FILTER (WHERE amount > 0) AS income, -sum(amount) FILTER (WHERE amount < 0) AS expense
                FROM money_move WHERE account_id IN (:ids) AND move_date BETWEEN :f AND :t AND doc_type <> 'IO'
                GROUP BY move_date ORDER BY move_date""")
                .param("ids", ids).param("f", Date.valueOf(f)).param("t", Date.valueOf(t))
                .query(Day.class).list();
        Map<LocalDate, Day> byDay = new LinkedHashMap<>();
        dayRows.forEach(d -> byDay.put(d.moveDate().toLocalDate(), d));
        Money income = Money.ZERO;
        Money expense = Money.ZERO;
        List<DayPoint> days = new ArrayList<>();
        for (LocalDate d = f; !d.isAfter(t); d = d.plusDays(1)) {
            Day x = byDay.get(d);
            Money in = x == null ? Money.ZERO : m(x.income());
            Money out = x == null ? Money.ZERO : m(x.expense());
            income = income.plus(in);
            expense = expense.plus(out);
            days.add(new DayPoint(d, in.toString(), out.toString()));
        }

        // Xarajatlar moddalar bo'yicha (o'tkazilgan KO/BO chiqimlari)
        List<ItemTotal> items = jdbc.sql("""
                SELECT i.name AS item, sum(o.amount) AS amount FROM cash_op o JOIN expense_item i ON i.id = o.expense_item_id
                WHERE o.account_id IN (:ids) AND o.status = 'POSTED' AND o.direction = 'OUT' AND o.op_date BETWEEN :f AND :t
                GROUP BY i.name ORDER BY sum(o.amount) DESC, i.name""")
                .param("ids", ids).param("f", Date.valueOf(f)).param("t", Date.valueOf(t))
                .query((rs, n) -> new ItemTotal(rs.getString("item"), m(rs.getBigDecimal("amount")).toString()))
                .list();
        Money itemsTotal = items.stream().map(i -> Money.of(i.amount())).reduce(Money.ZERO, Money::plus);

        // Kutilayotgan: tasdiqlanmagan (qoralama) MT va tasdiq kutayotgan kassa chiqimlari
        record Cnt(int cnt, BigDecimal amount) {}
        Cnt drafts = jdbc.sql("SELECT count(*)::int AS cnt, sum(amount) AS amount FROM customer_payment WHERE account_id IN (:ids) AND status = 'DRAFT'")
                .param("ids", ids).query(Cnt.class).single();
        Cnt pending = jdbc.sql("SELECT count(*)::int AS cnt, sum(amount) AS amount FROM cash_op WHERE account_id IN (:ids) AND status = 'PENDING'")
                .param("ids", ids).query(Cnt.class).single();

        List<RecentMove> recent = jdbc.sql("""
                SELECT m.id, m.occurred_at, a.name AS account, m.doc_type, m.doc_number, m.amount, e.full_name AS employee, m.note
                FROM money_move m JOIN money_account a ON a.id = m.account_id LEFT JOIN employee e ON e.id = m.employee_id
                WHERE m.account_id IN (:ids) ORDER BY m.occurred_at DESC, m.id DESC LIMIT 10""")
                .param("ids", ids)
                .query((rs, n) -> new RecentMove(rs.getLong("id"), rs.getTimestamp("occurred_at").toInstant(), rs.getString("account"),
                        rs.getString("doc_type"), rs.getString("doc_number"), m(rs.getBigDecimal("amount")).toString(), rs.getString("employee"),
                        rs.getString("note")))
                .list();

        return new Panel(f, t, balances, income.toString(), expense.toString(), items, itemsTotal.toString(), drafts.cnt(),
                m(drafts.amount()).toString(), pending.cnt(), m(pending.amount()).toString(), table, days, recent);
    }
}
