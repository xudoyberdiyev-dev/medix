package uz.yuzplus.finance.debt;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.yuzplus.finance.DebtSummaries;
import uz.yuzplus.finance.PartyLedger.Side;
import uz.yuzplus.shared.error.YuzplusException;
import uz.yuzplus.shared.money.Money;
import uz.yuzplus.shared.security.Actor;

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
        // S1: toʻliq hisobot (kontragent maʼlumoti soʻrovi bilan) oʻrniga faqat qarz yoshi; nom — faqat top-N uchun
        Map<Long, Aging.Result> by = debts.aging(actor, side, branchId, debts.today());
        Aging.Result total = by.values().stream().reduce(Aging.Result.EMPTY, Aging.Result::plus);
        Debts.Buckets t = Debts.Buckets.of(total);
        record P(long id, Debts.Buckets b, int maxOverdueDays) {}
        List<P> best = by.entrySet().stream()
                .map(e -> new P(e.getKey(), Debts.Buckets.of(e.getValue()), e.getValue().maxOverdueDays()))
                .filter(x -> Money.of(x.b().debt()).isPositive())
                // Debts.report tartibi (muddati oʻtgan, keyin qarz) ustidan barqaror saralash — avvalgi natija bilan bir xil
                .sorted(Comparator.comparing((P x) -> Money.of(x.b().debt())).reversed()
                        .thenComparing((P x) -> Money.of(x.b().overdue()), Comparator.reverseOrder()))
                .limit(Math.max(0, top))
                .toList();
        Map<Long, String> names = new LinkedHashMap<>();
        if (!best.isEmpty()) {
            jdbc.sql("SELECT id, name FROM counterparty WHERE id IN (:ids)")
                    .param("ids", best.stream().map(P::id).toList())
                    .query((rs, n) -> names.put(rs.getLong("id"), rs.getString("name")))
                    .list();
        }
        List<Top> rows = best.stream()
                .map(x -> new Top(x.id(), names.get(x.id()), x.b().debt(), x.b().overdue(), x.maxOverdueDays()))
                .toList();
        return new Summary(t.debt(), t.advance(), t.overdue(), t.d1to30(), t.d31to60(), t.d61to90(), t.d90plus(), rows);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, PartyDebt> byParty(Actor actor, Side side, Long branchId) {
        Map<Long, PartyDebt> out = new LinkedHashMap<>();
        for (Map.Entry<Long, Aging.Result> e : debts.aging(actor, side, branchId, debts.today()).entrySet()) {
            Debts.Buckets b = Debts.Buckets.of(e.getValue());
            out.put(e.getKey(), new PartyDebt(b.debt(), b.advance(), b.overdue(), b.d1to30(), b.d31to60(), b.d61to90(), b.d90plus(),
                    e.getValue().maxOverdueDays()));
        }
        return out;
    }

    @Override
    @Transactional(readOnly = true)
    public DueSoon due(Actor actor, Side side, Long branchId, LocalDate today) {
        if (branchId == null ? !actor.allBranches() : !actor.canAccessBranch(branchId)) {
            throw YuzplusException.notFound("error.notFound");
        }
        // Ochiq hujjatlar (qarz > 0: kirim — YB, sotuv — mijoz) to'lov kuni bo'yicha; Debts.report dagi own/app qoidasi bilan bir xil
        // (S1: hosila jadval party_doc_balance, V107)
        record Row(BigDecimal overdue, BigDecimal today, BigDecimal soon) {}
        Row row = jdbc.sql("""
                WITH open AS (SELECT due_date AS due, open_amount AS open FROM party_doc_balance
                              WHERE side = :side AND own_rows > 0 AND open_amount <> 0 AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b))
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

    @Override
    @Transactional(readOnly = true)
    public Optional<NextDue> nextDue(Actor actor, Side side, long branchId, long counterpartyId) {
        if (!actor.canAccessBranch(branchId)) {
            return Optional.empty();
        }
        return jdbc.sql("""
                WITH own AS (SELECT doc_type, doc_id, min(due_date) AS due, min(doc_number) AS number, sum(amount) AS amt
                             FROM party_ledger WHERE side = :side AND applies_doc_type IS NULL AND branch_id = :b AND counterparty_id = :c
                             GROUP BY doc_type, doc_id),
                     app AS (SELECT applies_doc_type AS t, applies_doc_id AS i, sum(amount) AS amt
                             FROM party_ledger WHERE side = :side AND applies_doc_type IS NOT NULL AND branch_id = :b AND counterparty_id = :c
                             GROUP BY applies_doc_type, applies_doc_id),
                     open AS (SELECT own.due, own.number, own.amt + coalesce(app.amt, 0) AS open
                              FROM own LEFT JOIN app ON app.t = own.doc_type AND app.i = own.doc_id)
                SELECT due, sum(open) AS amount, min(number) AS number
                FROM open WHERE open > 0 AND due IS NOT NULL
                GROUP BY due ORDER BY due LIMIT 1""")
                .param("side", side.name())
                .param("b", branchId)
                .param("c", counterpartyId)
                .query((rs, n) -> new NextDue(rs.getDate("due").toLocalDate(), money(rs.getBigDecimal("amount")), rs.getString("number")))
                .optional();
    }

    private static String money(BigDecimal v) {
        return new Money(v == null ? BigDecimal.ZERO : v).toString();
    }
}
