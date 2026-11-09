package uz.medix.reporting.home;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.DebtSummaries;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * Filial rahbari bosh sahifasi (prototip `Home.dc.html`, «branch» varianti; SPEC 8): tasdiq kutayotgan hujjatlar (faqat
 * foydalanuvchi tasdiqlay oladiganlari), ko'rsatkichlar (savdo QQSsiz, yalpi foyda — faqat prices.cost bilan, mijozlar qarzi, pul),
 * bugungi reyslar va pul hisoblari. Bugungi oqim va «Diqqat talab qiladi» — {@code /api/home/director} dan.
 */
@Service
class BranchHome {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    /**
     * Tasdiq kutayotgan hujjat. type: ORDER, NO (narx o'zgarishi), YT (YB ga to'lov), KO/BO (kassa/bank chiqimi), ZK, HC, QY, IN.
     * page — «Tasdiqlash» sahifasidagi hujjat (buyurtma — limit, NO) yoki boshqa hujjat.
     */
    record PendingApproval(String type, long id, String number, String createdBy, @Schema(nullable = true) String amount, long waitMinutes, String href,
            boolean page) {}

    /** Ko'rsatkichlar. Savdo va yalpi foyda — QQSsiz, qaytarishlar ayirilgan; *Prev — oldingi teng davr. */
    record BranchKpi(String sales, int salesDocs, String salesPrev, @Schema(nullable = true) String profit, @Schema(nullable = true) String profitPrev,
            @Schema(nullable = true, description = "Marja, % (bir kasr)") String margin, String debt, String overdue, String money, String cash,
            String bank) {}

    record HomeTrip(long id, String number, String driver, String vehicle, int orders, String status) {}

    /** Pul hisobi; kassa uchun bugungi kun yopilganmi (closedAt). */
    record HomeAccount(long id, String name, String kind, String balance, @Schema(nullable = true) OffsetDateTime closedAt) {}

    record BranchHomeView(LocalDate from, LocalDate to, LocalDate today, long branchId, String branchName, List<PendingApproval> approvals, BranchKpi kpi,
            List<HomeTrip> trips, List<HomeAccount> accounts) {}

    private final JdbcClient jdbc;
    private final DebtSummaries debts;
    private final Clock clock;

    BranchHome(JdbcClient jdbc, DebtSummaries debts, Clock clock) {
        this.jdbc = jdbc;
        this.debts = debts;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    BranchHomeView home(Actor actor, Set<String> perms, Long requestedBranch, LocalDate from, LocalDate to) {
        Long branchId = requestedBranch != null ? requestedBranch : actor.branchId();
        if (branchId == null || !actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
        LocalDate t = to == null ? today : to;
        LocalDate f = from == null ? t : from;
        if (f.isAfter(t)) {
            throw MedixException.badRequest("home.periodInvalid");
        }
        if (f.plusDays(366).isBefore(t)) {
            throw MedixException.badRequest("home.periodTooLong");
        }
        String branchName = jdbc.sql("SELECT name FROM branch WHERE id = :b").param("b", branchId).query(String.class).single();
        return new BranchHomeView(f, t, today, branchId, branchName, approvals(perms, branchId), kpi(actor, perms, branchId, f, t),
                trips(branchId, today), accounts(branchId, today));
    }

    private record Raw(String type, long id, String number, String createdBy, BigDecimal amount, Timestamp since) {}

    List<PendingApproval> approvals(Set<String> perms, long branchId) {
        List<Raw> raw = new ArrayList<>();
        boolean br = perms.contains("approvals.branch");
        boolean dir = perms.contains("approvals.director");
        if (br || dir) {
            raw.addAll(query("""
                    SELECT 'ORDER' AS type, o.id, o.number, e.full_name AS created_by, o.total AS amount, o.status_changed_at AS since
                    FROM sales_order o JOIN employee e ON e.id = o.created_by
                    WHERE o.status = 'PENDING_APPROVAL' AND o.branch_id = :b
                      AND ((o.approval_level = 'BRANCH' AND :br) OR (o.approval_level = 'DIRECTOR' AND :dir))""", branchId, br, dir));
        }
        if (perms.contains("prices.below")) {
            raw.addAll(query("""
                    SELECT 'NO' AS type, p.id, p.number, e.full_name AS created_by, CAST(NULL AS NUMERIC) AS amount,
                           coalesce(p.submitted_at, p.created_at) AS since
                    FROM price_change p JOIN employee e ON e.id = p.created_by
                    WHERE p.status = 'PENDING_APPROVAL' AND p.branch_id = :b""", branchId, br, dir));
        }
        if (perms.contains("payments.ytApprove")) {
            raw.addAll(query("""
                    SELECT 'YT' AS type, p.id, p.number, e.full_name AS created_by, p.amount, p.created_at AS since
                    FROM supplier_payment p JOIN employee e ON e.id = p.created_by
                    WHERE p.status = 'PENDING' AND p.branch_id = :b""", branchId, br, dir));
        }
        if (perms.contains("cash.approve")) {
            raw.addAll(query("""
                    SELECT c.doc_type AS type, c.id, c.number, e.full_name AS created_by, c.amount, c.created_at AS since
                    FROM cash_op c JOIN employee e ON e.id = c.created_by
                    WHERE c.status = 'PENDING' AND c.branch_id = :b""", branchId, br, dir));
        }
        if (perms.contains("transfer.quar")) {
            raw.addAll(query("""
                    SELECT 'ZK' AS type, z.id, z.number, e.full_name AS created_by, CAST(NULL AS NUMERIC) AS amount, z.created_at AS since
                    FROM zone_transfer z JOIN employee e ON e.id = z.created_by
                    WHERE z.status = 'PENDING' AND z.branch_id = :b""", branchId, br, dir));
        }
        if (perms.contains("hc.approve") || perms.contains("hc.director")) {
            boolean hcDir = perms.contains("hc.director");
            raw.addAll(query("""
                    SELECT 'HC' AS type, w.id, w.number, e.full_name AS created_by, CAST(NULL AS NUMERIC) AS amount, w.created_at AS since
                    FROM write_off w JOIN employee e ON e.id = w.created_by
                    WHERE w.status = 'PENDING' AND w.branch_id = :b AND (NOT w.needs_director OR :dir)""", branchId, br, hcDir));
        }
        if (perms.contains("qy.approve")) {
            raw.addAll(query("""
                    SELECT 'QY' AS type, r.id, r.number, e.full_name AS created_by, r.total_amount AS amount, r.created_at AS since
                    FROM supplier_return r JOIN employee e ON e.id = r.created_by
                    WHERE r.status = 'PENDING' AND r.branch_id = :b""", branchId, br, dir));
        }
        if (perms.contains("inventory.approve")) {
            raw.addAll(query("""
                    SELECT 'IN' AS type, i.id, i.number, e.full_name AS created_by, CAST(NULL AS NUMERIC) AS amount,
                           coalesce(i.submitted_at, i.created_at) AS since
                    FROM inventory_count i JOIN employee e ON e.id = i.created_by
                    WHERE i.status = 'CHECK' AND i.branch_id = :b""", branchId, br, dir));
        }
        Instant now = clock.instant();
        return raw.stream()
                .sorted(Comparator.comparing(Raw::since))
                .map(r -> new PendingApproval(r.type(), r.id(), r.number(), r.createdBy(), r.amount() == null ? null : DirectorHome.m(r.amount()).toString(),
                        Math.max(0, Duration.between(r.since().toInstant(), now).toMinutes()), href(r.type(), r.id()),
                        "ORDER".equals(r.type()) || "NO".equals(r.type())))
                .toList();
    }

    private List<Raw> query(String sql, long branchId, boolean br, boolean dir) {
        return jdbc.sql(sql).param("b", branchId).param("br", br).param("dir", dir).query(Raw.class).list();
    }

    static String href(String type, long id) {
        return switch (type) {
            case "ORDER" -> "/approvals?open=" + id;
            case "NO" -> "/prices?tab=documents&open=" + id;
            case "YT" -> "/payments?tab=yt";
            case "ZK" -> "/zone-transfers?open=" + id;
            case "HC" -> "/write-offs?open=" + id;
            case "QY" -> "/supplier-returns?open=" + id;
            case "IN" -> "/inventory-counts?open=" + id;
            default -> "/cash?tab=ops";
        };
    }

    private record SalesRaw(BigDecimal net, BigDecimal cost, int docs) {}

    private SalesRaw sales(long branchId, LocalDate f, LocalDate t) {
        return jdbc.sql("""
                SELECT coalesce(sum(net), 0) AS net, coalesce(sum(cost), 0) AS cost, coalesce(sum(docs), 0) AS docs FROM (
                    SELECT s.total - s.vat_total AS net, s.cost_total AS cost, 1 AS docs FROM sale s
                    WHERE s.status = 'POSTED' AND s.sale_date BETWEEN :f AND :t AND s.branch_id = :b
                    UNION ALL
                    SELECT -(r.total - r.vat_total), -r.cost_total, 0 FROM sales_return r
                    WHERE r.return_date BETWEEN :f AND :t AND r.branch_id = :b
                ) x""")
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("b", branchId)
                .query(SalesRaw.class).single();
    }

    private BranchKpi kpi(Actor actor, Set<String> perms, long branchId, LocalDate f, LocalDate t) {
        boolean cost = perms.contains("prices.cost");
        long days = ChronoUnit.DAYS.between(f, t) + 1;
        SalesRaw cur = sales(branchId, f, t);
        SalesRaw prev = sales(branchId, f.minusDays(days), f.minusDays(1));
        Money net = DirectorHome.m(cur.net());
        Money profit = net.minus(DirectorHome.m(cur.cost()));
        Money prevNet = DirectorHome.m(prev.net());
        String margin = net.isPositive()
                ? profit.amount().multiply(BigDecimal.valueOf(100)).divide(net.amount(), 1, RoundingMode.HALF_UP).toPlainString()
                : null;
        DebtSummaries.Summary c = debts.summary(actor, Side.CUSTOMER, branchId, 0);
        record Bal(BigDecimal cash, BigDecimal bank) {}
        Bal bal = jdbc.sql("""
                SELECT coalesce(sum(balance) FILTER (WHERE kind = 'CASH'), 0) AS cash,
                       coalesce(sum(balance) FILTER (WHERE kind <> 'CASH'), 0) AS bank
                FROM money_account WHERE active AND branch_id = :b""")
                .param("b", branchId).query(Bal.class).single();
        Money cash = DirectorHome.m(bal.cash());
        Money bank = DirectorHome.m(bal.bank());
        return new BranchKpi(net.toString(), cur.docs(), prevNet.toString(), cost ? profit.toString() : null,
                cost ? prevNet.minus(DirectorHome.m(prev.cost())).toString() : null, cost ? margin : null, c.debt(), c.overdue(),
                cash.plus(bank).toString(), cash.toString(), bank.toString());
    }

    private List<HomeTrip> trips(long branchId, LocalDate today) {
        return jdbc.sql("""
                SELECT t.id, t.number, e.full_name AS driver, v.plate_number AS vehicle,
                       (SELECT count(*) FROM trip_stop s WHERE s.trip_id = t.id AND s.active) AS orders, t.status
                FROM trip t JOIN employee e ON e.id = t.driver_id JOIN vehicle v ON v.id = t.vehicle_id
                WHERE t.branch_id = :b AND (t.trip_date = :d OR t.status IN ('PLANNED', 'IN_TRANSIT', 'RETURN_WAIT')) AND t.status <> 'CANCELLED'
                ORDER BY CASE t.status WHEN 'DONE' THEN 1 ELSE 0 END, t.number""")
                .param("b", branchId).param("d", Date.valueOf(today))
                .query((rs, n) -> new HomeTrip(rs.getLong("id"), rs.getString("number"), rs.getString("driver"), rs.getString("vehicle"),
                        rs.getInt("orders"), rs.getString("status")))
                .list();
    }

    private List<HomeAccount> accounts(long branchId, LocalDate today) {
        return jdbc.sql("""
                SELECT a.id, a.name, a.kind, a.balance, c.closed_at
                FROM money_account a LEFT JOIN cash_day_close c ON c.account_id = a.id AND c.close_date = :d
                WHERE a.active AND a.branch_id = :b
                ORDER BY CASE a.kind WHEN 'CASH' THEN 0 WHEN 'BANK' THEN 1 ELSE 2 END, a.name""")
                .param("b", branchId).param("d", Date.valueOf(today))
                .query((rs, n) -> {
                    Timestamp closed = rs.getTimestamp("closed_at");
                    return new HomeAccount(rs.getLong("id"), rs.getString("name"), rs.getString("kind"),
                            DirectorHome.m(rs.getBigDecimal("balance")).toString(),
                            closed == null ? null : closed.toInstant().atZone(TASHKENT).toOffsetDateTime());
                })
                .list();
    }
}
