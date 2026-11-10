package uz.medix.reporting.home;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.PartyLedger;
import uz.medix.inventory.StockAvailability;
import uz.medix.reporting.home.DirectorHome.Amount;
import uz.medix.reporting.home.DirectorHome.ByPayment;
import uz.medix.reporting.home.DirectorHome.CountAmount;
import uz.medix.reporting.home.DirectorHome.StatusCell;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.text.SearchText;

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

    /** Oxirgi 10 ta buyurtma (prototip «Oxirgi 10 ta buyurtma»). */
    record RecentOrder(long id, String number, String customer, String total, String status) {}

    /**
     * «E'tibor bering» (prototip): REJECTED — so'nggi 7 kunda rad etilgan (sabab bilan); PENDING — tasdiq kutmoqda (daraja, kim tasdiqlaydi,
     * kutish); LOW_STOCK — bugungi qoralamadagi mahsulot omborda yetmaydi (mavjud / so'ralgan).
     */
    record OperatorNote(String kind, long orderId, String number, @Schema(nullable = true) String reason, @Schema(nullable = true) String level,
            @Schema(nullable = true) String approver, @Schema(nullable = true) String amount, long waitMinutes, @Schema(nullable = true) String product,
            int available, int requested) {}

    record OperatorHomeView(LocalDate from, LocalDate to, LocalDate today, ByPayment sales, CountAmount ordersCreated, int staleDays,
            List<StatusCell> orderStatuses, OperatorAttention attention, List<CustomerRow> topCustomers, List<RecentOrder> recent,
            List<OperatorNote> notes) {}

    private final JdbcClient jdbc;
    private final DirectorHome director;
    private final StockAvailability availability;
    private final PartyLedger parties;
    private final Clock clock;

    OperatorHome(JdbcClient jdbc, DirectorHome director, StockAvailability availability, PartyLedger parties, Clock clock) {
        this.jdbc = jdbc;
        this.director = director;
        this.availability = availability;
        this.parties = parties;
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
                    WHERE r.cancelled_at IS NULL AND r.return_date BETWEEN :f AND :t AND o.created_by = :e
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
                    WHERE r.cancelled_at IS NULL AND r.return_date BETWEEN :f AND :t AND o.created_by = :e
                ) x JOIN counterparty c ON c.id = x.cust
                GROUP BY c.id, c.name ORDER BY amount DESC, c.name LIMIT :top""")
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("e", me).param("top", TOP)
                .query((rs, n) -> new CustomerRow(rs.getLong("id"), rs.getString("name"), DirectorHome.m(rs.getBigDecimal("amount")).toString(),
                        rs.getInt("orders")))
                .list();

        return new OperatorHomeView(f, t, today, DirectorHome.byPayment(sales), created, director.staleDays(), statuses,
                new OperatorAttention(drafts, pending, rejected, REJECTED_DAYS, new CountAmount(staleCount, DirectorHome.m(staleAmount).toString())),
                top, recent(me), notes(me, today));
    }

    /** «Mijoz holati» (prototip): bloklangan / litsenziya muddati o'tgan, qarz / kredit limiti va muddati o'tgan qarz — o'z filialida. */
    record CustomerStatus(long id, String name, String tin, boolean blocked, boolean licenseExpired, String debt,
            @Schema(nullable = true, description = "Kredit limiti; null — belgilanmagan") String limit, String overdue) {}

    @Transactional(readOnly = true)
    List<CustomerStatus> customers(Actor actor, String q) {
        Long b = actor.branchId();
        String nq = SearchText.normalize(q);
        if (b == null || nq.length() < 2) {
            return List.of();
        }
        StringBuilder where = new StringBuilder(" WHERE c.is_customer AND c.active AND (c.tin = :exact OR (true");
        Map<String, Object> params = new HashMap<>();
        String[] parts = nq.split(" ");
        for (int i = 0; i < parts.length && i < 8; i++) {
            where.append(" AND c.search_text LIKE :w").append(i).append(" ESCAPE '\\'");
            params.put("w" + i, "%" + SearchText.likeEscape(parts[i]) + "%");
        }
        where.append("))");
        params.put("exact", q.strip());
        params.put("b", b);
        params.put("d", Date.valueOf(director.today()));
        record Row(long id, String name, String tin, boolean blocked, boolean licenseExpired, BigDecimal creditLimit) {}
        List<Row> rows = jdbc.sql("""
                SELECT c.id, c.name, c.tin, c.blocked,
                       (EXISTS (SELECT 1 FROM counterparty_license l WHERE l.counterparty_id = c.id)
                        AND NOT EXISTS (SELECT 1 FROM counterparty_license l WHERE l.counterparty_id = c.id
                                        AND (l.valid_until IS NULL OR l.valid_until >= :d))) AS license_expired,
                       t.credit_limit
                FROM counterparty c LEFT JOIN counterparty_branch_terms t ON t.counterparty_id = c.id AND t.branch_id = :b""" + where
                + " ORDER BY c.name LIMIT 3")
                .params(params).query(Row.class).list();
        LocalDate today = director.today();
        return rows.stream().map(r -> {
            PartyLedger.CreditState cs = parties.creditState(b, r.id(), PartyLedger.Side.CUSTOMER, today);
            return new CustomerStatus(r.id(), r.name(), r.tin(), r.blocked(), r.licenseExpired(), cs.debt().toString(),
                    r.creditLimit() == null ? null : DirectorHome.m(r.creditLimit()).toString(), cs.overdue().toString());
        }).toList();
    }

    private List<RecentOrder> recent(long me) {
        return jdbc.sql("""
                SELECT o.id, coalesce(o.number, '—') AS number, c.name AS customer, o.total, o.status
                FROM sales_order o JOIN counterparty c ON c.id = o.customer_id
                WHERE o.created_by = :e ORDER BY o.created_at DESC, o.id DESC LIMIT 10""")
                .param("e", me)
                .query((rs, n) -> new RecentOrder(rs.getLong("id"), rs.getString("number"), rs.getString("customer"),
                        DirectorHome.m(rs.getBigDecimal("total")).toString(), rs.getString("status")))
                .list();
    }

    List<OperatorNote> notes(long me, LocalDate today) {
        List<OperatorNote> out = new ArrayList<>();
        java.time.Instant now = clock.instant();
        out.addAll(jdbc.sql("""
                SELECT o.id, coalesce(o.number, '—') AS number, o.decision_reason FROM sales_order o
                WHERE o.created_by = :e AND o.status = 'REJECTED' AND o.decided_at >= :since ORDER BY o.decided_at DESC""")
                .param("e", me).param("since", Timestamp.from(now.minus(Duration.ofDays(REJECTED_DAYS))))
                .query((rs, n) -> new OperatorNote("REJECTED", rs.getLong("id"), rs.getString("number"), rs.getString("decision_reason"), null, null,
                        null, 0, null, 0, 0))
                .list());
        // Tasdiq kutayotganlar: kim tasdiqlaydi — filial rahbari (filialning faol rahbari) yoki direktor
        out.addAll(jdbc.sql("""
                SELECT o.id, coalesce(o.number, '—') AS number, o.approval_level, o.total, o.status_changed_at,
                       (SELECT e.full_name FROM employee e JOIN role r ON r.id = e.role_id
                        WHERE e.status = 'ACTIVE' AND r.code = CASE o.approval_level WHEN 'DIRECTOR' THEN 'DIRECTOR' ELSE 'BRANCH_MANAGER' END
                          AND (o.approval_level = 'DIRECTOR' OR e.branch_id = o.branch_id)
                        ORDER BY e.id LIMIT 1) AS approver
                FROM sales_order o WHERE o.created_by = :e AND o.status = 'PENDING_APPROVAL' ORDER BY o.status_changed_at""")
                .param("e", me)
                .query((rs, n) -> new OperatorNote("PENDING", rs.getLong("id"), rs.getString("number"), null, rs.getString("approval_level"),
                        rs.getString("approver"), DirectorHome.m(rs.getBigDecimal("total")).toString(),
                        Math.max(0, Duration.between(rs.getTimestamp("status_changed_at").toInstant(), now).toMinutes()), null, 0, 0))
                .list());
        // Bugungi qoralamalar: omborda yetmaydigan mahsulotlar (sotuvga ochiq zonalar, zahiradan tashqari)
        record Line(long orderId, String number, long warehouseId, long productId, String product, int qty) {}
        List<Line> lines = jdbc.sql("""
                SELECT o.id AS order_id, coalesce(o.number, '—') AS number, o.warehouse_id, l.product_id, p.name AS product, sum(l.qty) AS qty
                FROM sales_order o JOIN sales_order_line l ON l.order_id = o.id JOIN product p ON p.id = l.product_id
                WHERE o.created_by = :e AND o.status = 'DRAFT' AND o.order_date = :d
                GROUP BY o.id, o.number, o.warehouse_id, l.product_id, p.name""")
                .param("e", me).param("d", Date.valueOf(today))
                .query(Line.class).list();
        java.util.Set<Long> seen = new java.util.HashSet<>();
        for (Line l : lines) {
            Map<Long, StockAvailability.Available> a = availability.available(l.warehouseId(), List.of(l.productId()), today);
            int have = a.containsKey(l.productId()) ? a.get(l.productId()).qty() : 0;
            if (have < l.qty() && seen.add(l.productId())) {
                out.add(new OperatorNote("LOW_STOCK", l.orderId(), l.number(), null, null, null, null, 0, l.product(), have, l.qty()));
            }
        }
        return out;
    }

    private CountAmount countAmount(String sql, long me, LocalDate f, LocalDate t) {
        var spec = jdbc.sql(sql).param("e", me);
        if (sql.contains(":f")) {
            spec = spec.param("f", Date.valueOf(f)).param("t", Date.valueOf(t));
        }
        return spec.query((rs, n) -> new CountAmount(rs.getInt("cnt"), DirectorHome.m(rs.getBigDecimal("amt")).toString())).single();
    }
}
