package uz.medix.reporting.home;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.DebtSummaries;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/**
 * Buxgalter bosh sahifasi (prototip `Home.dc.html`, «accountant» varianti; SPEC 8): kassa / bank jami, mijozlar qarzi, YB qarzi (7 kun
 * ichida to'lanadigani bilan), to'lov taqvimi (14 kun: kutilayotgan tushum va to'lanishi kerak — ochiq hujjatlar to'lov kuni bo'yicha),
 * ish ro'yxati va pul filiallar bo'yicha.
 */
@Service
class AccountantHome {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    static final int CALENDAR_DAYS = 14;

    record CalendarDay(LocalDate date, String incoming, String outgoing) {}

    /** Ish ro'yxati: YT tasdig'i, ko'chirma bilan solishtirilmagan bank operatsiyalari, yopilmagan kassa kunlari. */
    record AccountantWork(int ytPending, int bankUnreconciled, int cashDaysOpen) {}

    record BranchMoney(long id, String name, String cash, String bank, String total) {}

    record AccountantHomeView(LocalDate today, Long branchId, String cash, String bank, String customerDebt, String customerOverdue,
            String supplierDebt, String supplierDue7, List<CalendarDay> calendar, AccountantWork work, List<BranchMoney> money) {}

    private final JdbcClient jdbc;
    private final DebtSummaries debts;
    private final Clock clock;

    AccountantHome(JdbcClient jdbc, DebtSummaries debts, Clock clock) {
        this.jdbc = jdbc;
        this.debts = debts;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    AccountantHomeView home(Actor actor, Long branchId) {
        if (branchId == null ? !actor.allBranches() : !actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
        DebtSummaries.Summary c = debts.summary(actor, Side.CUSTOMER, branchId, 0);
        DebtSummaries.Summary s = debts.summary(actor, Side.SUPPLIER, branchId, 0);
        LocalDate last = today.plusDays(CALENDAR_DAYS - 1);

        // Ochiq hujjatlar (qoldig'i > 0) to'lov kuni bo'yicha — Debts.due bilan bir qoida
        record Due(String side, LocalDate due, BigDecimal amount) {}
        List<Due> due = jdbc.sql("""
                WITH own AS (SELECT branch_id, counterparty_id, side, doc_type, doc_id, min(due_date) AS due, sum(amount) AS amt
                             FROM party_ledger WHERE applies_doc_type IS NULL AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)
                             GROUP BY branch_id, counterparty_id, side, doc_type, doc_id),
                     app AS (SELECT branch_id, counterparty_id, side, applies_doc_type AS t, applies_doc_id AS i, sum(amount) AS amt
                             FROM party_ledger WHERE applies_doc_type IS NOT NULL AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)
                             GROUP BY branch_id, counterparty_id, side, applies_doc_type, applies_doc_id),
                     open AS (SELECT own.side, own.due, own.amt + coalesce(app.amt, 0) AS open
                              FROM own LEFT JOIN app ON app.branch_id = own.branch_id AND app.counterparty_id = own.counterparty_id
                                                    AND app.side = own.side AND app.t = own.doc_type AND app.i = own.doc_id)
                SELECT side, due, sum(open) AS amount FROM open
                WHERE open > 0 AND due BETWEEN :d AND :last GROUP BY side, due""")
                .param("b", branchId).param("d", Date.valueOf(today)).param("last", Date.valueOf(last))
                .query((rs, n) -> new Due(rs.getString("side"), rs.getDate("due").toLocalDate(), rs.getBigDecimal("amount")))
                .list();
        Map<LocalDate, BigDecimal> in = new HashMap<>();
        Map<LocalDate, BigDecimal> out = new HashMap<>();
        BigDecimal due7 = BigDecimal.ZERO;
        for (Due d : due) {
            (Side.CUSTOMER.name().equals(d.side()) ? in : out).merge(d.due(), d.amount(), BigDecimal::add);
            if (Side.SUPPLIER.name().equals(d.side()) && !d.due().isAfter(today.plusDays(7))) {
                due7 = due7.add(d.amount());
            }
        }
        List<CalendarDay> calendar = new ArrayList<>();
        for (LocalDate d = today; !d.isAfter(last); d = d.plusDays(1)) {
            calendar.add(new CalendarDay(d, DirectorHome.m(in.get(d)).toString(), DirectorHome.m(out.get(d)).toString()));
        }

        int yt = jdbc.sql("SELECT count(*) FROM supplier_payment WHERE status = 'PENDING' AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)")
                .param("b", branchId).query(Integer.class).single();
        // Bank: oxirgi solishtirish sanasidan keyingi (bugungacha) operatsiyalar
        int bank = jdbc.sql("""
                SELECT count(*) FROM money_move m JOIN money_account a ON a.id = m.account_id
                WHERE a.kind = 'BANK' AND a.active AND (CAST(:b AS BIGINT) IS NULL OR a.branch_id = :b) AND m.move_date < :d
                  AND m.move_date > coalesce((SELECT max(r.statement_date) FROM bank_reconciliation r WHERE r.account_id = a.id), DATE '1900-01-01')""")
                .param("b", branchId).param("d", Date.valueOf(today)).query(Integer.class).single();
        // Kassa: harakati bo'lgan, lekin yopilmagan o'tgan kunlar
        int cashOpen = jdbc.sql("""
                SELECT count(*) FROM (SELECT DISTINCT m.account_id, m.move_date FROM money_move m JOIN money_account a ON a.id = m.account_id
                                      WHERE a.kind = 'CASH' AND a.active AND (CAST(:b AS BIGINT) IS NULL OR a.branch_id = :b) AND m.move_date < :d) x
                WHERE NOT EXISTS (SELECT 1 FROM cash_day_close c WHERE c.account_id = x.account_id AND c.close_date = x.move_date)""")
                .param("b", branchId).param("d", Date.valueOf(today)).query(Integer.class).single();

        List<BranchMoney> money = jdbc.sql("""
                SELECT b.id, b.name,
                       coalesce(sum(a.balance) FILTER (WHERE a.kind = 'CASH'), 0) AS cash,
                       coalesce(sum(a.balance) FILTER (WHERE a.kind <> 'CASH'), 0) AS bank
                FROM branch b LEFT JOIN money_account a ON a.branch_id = b.id AND a.active
                WHERE (CAST(:b AS BIGINT) IS NULL AND b.active) OR b.id = :b
                GROUP BY b.id, b.name ORDER BY b.name""")
                .param("b", branchId)
                .query((rs, n) -> {
                    var cash = DirectorHome.m(rs.getBigDecimal("cash"));
                    var bk = DirectorHome.m(rs.getBigDecimal("bank"));
                    return new BranchMoney(rs.getLong("id"), rs.getString("name"), cash.toString(), bk.toString(), cash.plus(bk).toString());
                })
                .list();
        var cashTotal = money.stream().map(x -> DirectorHome.m(new BigDecimal(x.cash()))).reduce(DirectorHome.m(null), (a, b2) -> a.plus(b2));
        var bankTotal = money.stream().map(x -> DirectorHome.m(new BigDecimal(x.bank()))).reduce(DirectorHome.m(null), (a, b2) -> a.plus(b2));
        return new AccountantHomeView(today, branchId, cashTotal.toString(), bankTotal.toString(), c.debt(), c.overdue(), s.debt(),
                DirectorHome.m(due7).toString(), calendar, new AccountantWork(yt, bank, cashOpen), money);
    }
}
