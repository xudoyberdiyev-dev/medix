package uz.medix.finance.debt;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.DebtSummaries;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/** {@link DebtSummaries} — «Mijozlar qarzi» / «YB qarzi» hisobotining o'zidan (bitta manba). */
@Service
class DebtSummariesService implements DebtSummaries {

    private final Debts debts;
    private final JdbcClient jdbc;

    DebtSummariesService(Debts debts, JdbcClient jdbc) {
        this.debts = debts;
        this.jdbc = jdbc;
    }

    @Override
    @Transactional(readOnly = true)
    public Summary summary(Actor actor, Side side, Long branchId, int top) {
        Debts.DebtReport r = debts.report(actor, side, branchId);
        Debts.Buckets t = r.totals();
        List<Top> rows = r.rows().stream()
                .filter(x -> Money.of(x.buckets().debt()).isPositive())
                .sorted(Comparator.comparing((Debts.DebtRow x) -> Money.of(x.buckets().debt())).reversed())
                .limit(Math.max(0, top))
                .map(x -> new Top(x.counterpartyId(), x.name(), x.buckets().debt(), x.buckets().overdue(), x.maxOverdueDays()))
                .toList();
        return new Summary(t.debt(), t.advance(), t.overdue(), t.d1to30(), t.d31to60(), t.d61to90(), t.d90plus(), rows);
    }

    @Override
    @Transactional(readOnly = true)
    public DueSoon due(Actor actor, Side side, Long branchId, LocalDate today) {
        if (branchId == null ? !actor.allBranches() : !actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        // Ochiq hujjatlar (qarz > 0: kirim — YB, sotuv — mijoz) to'lov kuni bo'yicha; Debts.report dagi own/app qoidasi bilan bir xil
        record Row(BigDecimal overdue, BigDecimal today, BigDecimal soon) {}
        Row row = jdbc.sql("""
                WITH own AS (SELECT branch_id, counterparty_id, doc_type, doc_id, min(due_date) AS due, sum(amount) AS amt
                             FROM party_ledger WHERE side = :side AND applies_doc_type IS NULL AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)
                             GROUP BY branch_id, counterparty_id, doc_type, doc_id),
                     app AS (SELECT branch_id, counterparty_id, applies_doc_type AS t, applies_doc_id AS i, sum(amount) AS amt
                             FROM party_ledger WHERE side = :side AND applies_doc_type IS NOT NULL
                                                 AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)
                             GROUP BY branch_id, counterparty_id, applies_doc_type, applies_doc_id),
                     open AS (SELECT own.due, own.amt + coalesce(app.amt, 0) AS open
                              FROM own LEFT JOIN app ON app.branch_id = own.branch_id AND app.counterparty_id = own.counterparty_id
                                                    AND app.t = own.doc_type AND app.i = own.doc_id)
                SELECT sum(open) FILTER (WHERE due < :d) AS overdue,
                       sum(open) FILTER (WHERE due = :d) AS today,
                       sum(open) FILTER (WHERE due > :d AND due <= :d3) AS soon
                FROM open WHERE open > 0 AND due IS NOT NULL""")
                .param("b", branchId)
                .param("side", side.name())
                .param("d", Date.valueOf(today))
                .param("d3", Date.valueOf(today.plusDays(3)))
                .query(Row.class)
                .single();
        return new DueSoon(money(row.overdue()), money(row.today()), money(row.soon()));
    }

    private static String money(BigDecimal v) {
        return new Money(v == null ? BigDecimal.ZERO : v).toString();
    }
}
