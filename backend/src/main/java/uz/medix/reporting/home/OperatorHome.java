package uz.medix.reporting.home;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.reporting.home.DirectorHome.Amount;
import uz.medix.reporting.home.DirectorHome.ByPayment;
import uz.medix.reporting.home.DirectorHome.CountAmount;
import uz.medix.reporting.home.DirectorHome.StatusCell;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/**
 * Operator bosh sahifasi (SPEC 2, 8): faqat o'zi kiritgan buyurtmalar — sof savdo (Direktor sahifasidagi «Operatorlar» bloki bilan bir
 * manba: o'tkazilgan sotuv − qaytarishlar), buyurtma holatlari, «Diqqat talab qiladi» (qoralamalar, tasdiq kutayotganlar, rad etilganlar,
 * kechikkanlar) va eng katta mijozlari.
 */
@Service
class OperatorHome {

    private static final int TOP = 5;
    static final int REJECTED_DAYS = 7;

    record CustomerRow(long id, String name, String sales, int orders) {}

    record OperatorAttention(CountAmount drafts, CountAmount pendingApproval, CountAmount rejected, int rejectedDays, CountAmount stale) {}

    record OperatorHomeView(LocalDate from, LocalDate to, LocalDate today, ByPayment sales, CountAmount ordersCreated, int staleDays,
            List<StatusCell> orderStatuses, OperatorAttention attention, List<CustomerRow> topCustomers) {}

    private final JdbcClient jdbc;
    private final DirectorHome director;
    private final Clock clock;

    OperatorHome(JdbcClient jdbc, DirectorHome director, Clock clock) {
        this.jdbc = jdbc;
        this.director = director;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    OperatorHomeView home(Actor actor, LocalDate from, LocalDate to) {
        LocalDate today = director.today();
        LocalDate t = to == null ? today : to;
        LocalDate f = from == null ? t : from;
        if (f.isAfter(t)) {
            throw MedixException.badRequest("home.periodInvalid");
        }
        if (f.plusDays(366).isBefore(t)) {
            throw MedixException.badRequest("home.periodTooLong");
        }
        long me = actor.employeeId();

        List<Amount> sales = jdbc.sql("""
                SELECT 0 AS branch_id, kind, sum(amount) AS amount FROM (
                    SELECT o.payment_type AS kind, s.total AS amount
                    FROM sale s JOIN sales_order o ON o.id = s.order_id
                    WHERE s.status = 'POSTED' AND s.sale_date BETWEEN :f AND :t AND o.created_by = :e
                    UNION ALL
                    SELECT o.payment_type, -r.total
                    FROM sales_return r JOIN sales_order o ON o.id = r.order_id
                    WHERE r.return_date BETWEEN :f AND :t AND o.created_by = :e
                ) x GROUP BY kind""")
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("e", me)
                .query(Amount.class).list();

        CountAmount created = countAmount("""
                SELECT count(*) AS cnt, sum(total) AS amt FROM sales_order
                WHERE created_by = :e AND order_date BETWEEN :f AND :t AND status NOT IN ('DRAFT', 'CANCELLED')""", me, f, t);

        List<StatusCell> statuses = director.statuses(null, me, f, t, today);
        int staleCount = 0;
        BigDecimal staleAmount = BigDecimal.ZERO;
        for (StatusCell c : statuses) {
            staleCount += c.staleCount();
            staleAmount = staleAmount.add(new BigDecimal(c.staleAmount()));
        }

        CountAmount drafts = countAmount("SELECT count(*) AS cnt, sum(total) AS amt FROM sales_order WHERE created_by = :e AND status = 'DRAFT'",
                me, f, t);
        CountAmount pending = countAmount(
                "SELECT count(*) AS cnt, sum(total) AS amt FROM sales_order WHERE created_by = :e AND status = 'PENDING_APPROVAL'", me, f, t);
        CountAmount rejected = jdbc.sql("""
                SELECT count(*) AS cnt, sum(total) AS amt FROM sales_order
                WHERE created_by = :e AND status = 'REJECTED' AND decided_at >= :since""")
                .param("e", me)
                .param("since", Timestamp.from(clock.instant().minus(Duration.ofDays(REJECTED_DAYS))))
                .query((rs, n) -> new CountAmount(rs.getInt("cnt"), DirectorHome.m(rs.getBigDecimal("amt")).toString()))
                .single();

        List<CustomerRow> top = jdbc.sql("""
                SELECT c.id, c.name, sum(x.amount) AS amount, count(DISTINCT x.order_id) AS orders FROM (
                    SELECT s.customer_id AS cust, s.order_id, s.total AS amount
                    FROM sale s JOIN sales_order o ON o.id = s.order_id
                    WHERE s.status = 'POSTED' AND s.sale_date BETWEEN :f AND :t AND o.created_by = :e
                    UNION ALL
                    SELECT o.customer_id, NULL, -r.total
                    FROM sales_return r JOIN sales_order o ON o.id = r.order_id
                    WHERE r.return_date BETWEEN :f AND :t AND o.created_by = :e
                ) x JOIN counterparty c ON c.id = x.cust
                GROUP BY c.id, c.name ORDER BY amount DESC, c.name LIMIT :top""")
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("e", me).param("top", TOP)
                .query((rs, n) -> new CustomerRow(rs.getLong("id"), rs.getString("name"), DirectorHome.m(rs.getBigDecimal("amount")).toString(),
                        rs.getInt("orders")))
                .list();

        return new OperatorHomeView(f, t, today, DirectorHome.byPayment(sales), created, DirectorHome.STALE_DAYS, statuses,
                new OperatorAttention(drafts, pending, rejected, REJECTED_DAYS, new CountAmount(staleCount, DirectorHome.m(staleAmount).toString())),
                top);
    }

    private CountAmount countAmount(String sql, long me, LocalDate f, LocalDate t) {
        var spec = jdbc.sql(sql).param("e", me);
        if (sql.contains(":f")) {
            spec = spec.param("f", Date.valueOf(f)).param("t", Date.valueOf(t));
        }
        return spec.query((rs, n) -> new CountAmount(rs.getInt("cnt"), DirectorHome.m(rs.getBigDecimal("amt")).toString())).single();
    }
}
