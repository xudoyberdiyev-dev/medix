package uz.medix.reporting.sales;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * Savdo hisoboti (SPEC 6, 8): sof savdo = o'tkazilgan sotuv (bekor qilingan — yetkazilmagan — kirmaydi) − qaytarishlar (QM), QQS bilan;
 * bosh sahifa kartasi va «Operatorlar» bloki bilan bir manba. Guruhlash: mijoz, operator, filial, kun, hudud; qator darajasida — mahsulot, kategoriya, ishlab chiqaruvchi (dona bilan). Tannarx va yalpi foyda faqat
 * prices.cost ruxsati borlarga (API javobida ham yo'q). Faqat reports.own bo'lsa — o'zi kiritgan buyurtmalar.
 */
@Service
class SalesReport {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    static final int MAX_ROWS = 5000;

    /** Guruhlash: kalit va nom ifodalari — faqat shu konstantalar SQL'ga qo'shiladi. */
    public enum GroupBy {
        CUSTOMER("x.customer_id::text", "c.name", "JOIN counterparty c ON c.id = x.customer_id", "net DESC, name", false),
        OPERATOR("x.created_by::text", "e.full_name", "JOIN employee e ON e.id = x.created_by", "net DESC, name", false),
        BRANCH("x.branch_id::text", "b.name", "JOIN branch b ON b.id = x.branch_id", "net DESC, name", false),
        DAY("x.d::text", "to_char(x.d, 'DD.MM.YYYY')", "", "k", false),
        REGION("coalesce(c.region_id::text, '0')", "coalesce(rg.name, '—')",
                "JOIN counterparty c ON c.id = x.customer_id LEFT JOIN region rg ON rg.id = c.region_id", "net DESC, name", false),
        PRODUCT("x.product_id::text", "p.name || ' (' || p.code || ')'", "JOIN product p ON p.id = x.product_id", "net DESC, name", true),
        CATEGORY("coalesce(p.category_id::text, '0')", "coalesce(cat.name, '—')",
                "JOIN product p ON p.id = x.product_id LEFT JOIN category cat ON cat.id = p.category_id", "net DESC, name", true),
        MANUFACTURER("coalesce(p.manufacturer_id::text, '0')", "coalesce(mf.name, '—')",
                "JOIN product p ON p.id = x.product_id LEFT JOIN manufacturer mf ON mf.id = p.manufacturer_id", "net DESC, name", true);

        final String key;
        final String name;
        final String join;
        final String order;
        /** Qator darajasida (sale_line / sales_return_line) — mahsulot bo'yicha guruhlar; dona ham hisoblanadi. */
        final boolean lines;

        GroupBy(String key, String name, String join, String order, boolean lines) {
            this.key = key;
            this.name = name;
            this.join = join;
            this.order = order;
            this.lines = lines;
        }
    }

    public record SalesRow(String key, String name, int orders,
            @Schema(nullable = true, description = "Sof dona (sotilgan − qaytgan) — faqat mahsulot/kategoriya/ishlab chiqaruvchi guruhida") Integer qty,
            String sales, String returns, String net,
            @Schema(nullable = true) String cost, @Schema(nullable = true, description = "Yalpi foyda: sof savdo QQSsiz − tannarx") String profit) {}

    public record SalesReportView(LocalDate from, LocalDate to, @Schema(nullable = true) Long branchId, GroupBy groupBy, boolean mineOnly,
            boolean costVisible, List<SalesRow> rows, SalesRow total, boolean truncated) {}

    private record Raw(String k, String name, int orders, Integer qty, BigDecimal sales, BigDecimal returns, BigDecimal vat, BigDecimal cost) {}

    /** Hujjat sarlavhalari: sotuv (bekor qilinmagan) va qaytarish (QM). */
    private static final String HEADERS_CTE = """
            SELECT s.branch_id, s.customer_id, o.created_by, s.sale_date AS d, s.order_id, 0 AS qty, s.total AS sales, 0 AS returns,
                   s.vat_total AS vat, s.cost_total AS cost
            FROM sale s JOIN sales_order o ON o.id = s.order_id
            WHERE s.status = 'POSTED' AND s.sale_date BETWEEN :f AND :t
              AND (CAST(:b AS BIGINT) IS NULL OR s.branch_id = :b) AND (CAST(:e AS BIGINT) IS NULL OR o.created_by = :e)
            UNION ALL
            SELECT r.branch_id, r.customer_id, o.created_by, r.return_date, NULL, 0, 0, r.total, -r.vat_total, -r.cost_total
            FROM sales_return r JOIN sales_order o ON o.id = r.order_id
            WHERE r.return_date BETWEEN :f AND :t
              AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b) AND (CAST(:e AS BIGINT) IS NULL OR o.created_by = :e)""";

    /** Qatorlar: sarlavha summalari qatorlar yig'indisiga teng (tannarx — birlik tannarxi × dona). */
    private static final String LINES_CTE = """
            SELECT s.branch_id, s.customer_id, o.created_by, s.sale_date AS d, s.order_id, sl.product_id, sl.qty, sl.amount AS sales,
                   0 AS returns, sl.vat_amount AS vat, sl.cost * sl.qty AS cost
            FROM sale_line sl JOIN sale s ON s.id = sl.sale_id JOIN sales_order o ON o.id = s.order_id
            WHERE s.status = 'POSTED' AND s.sale_date BETWEEN :f AND :t
              AND (CAST(:b AS BIGINT) IS NULL OR s.branch_id = :b) AND (CAST(:e AS BIGINT) IS NULL OR o.created_by = :e)
            UNION ALL
            SELECT r.branch_id, r.customer_id, o.created_by, r.return_date, NULL, rl.product_id, -rl.qty, 0, rl.amount, -rl.vat_amount,
                   -(rl.cost * rl.qty)
            FROM sales_return_line rl JOIN sales_return r ON r.id = rl.return_id JOIN sales_order o ON o.id = r.order_id
            WHERE r.return_date BETWEEN :f AND :t
              AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b) AND (CAST(:e AS BIGINT) IS NULL OR o.created_by = :e)""";

    private final JdbcClient jdbc;
    private final Clock clock;

    SalesReport(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /**
     * @param fullScope reports.all yoki reports.view — aks holda (faqat reports.own) o'z buyurtmalari
     */
    @Transactional(readOnly = true)
    public SalesReportView report(Actor actor, Long requestedBranch, LocalDate from, LocalDate to, GroupBy groupBy, boolean fullScope,
            boolean canSeeCost) {
        Long branchId = requestedBranch == null && !actor.allBranches() ? actor.branchId() : requestedBranch;
        if (branchId == null ? !actor.allBranches() : !actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
        LocalDate t = to == null ? today : to;
        LocalDate f = from == null ? t.withDayOfMonth(1) : from;
        if (f.isAfter(t)) {
            throw MedixException.badRequest("home.periodInvalid");
        }
        if (f.plusDays(366).isBefore(t)) {
            throw MedixException.badRequest("home.periodTooLong");
        }
        GroupBy g = groupBy == null ? GroupBy.CUSTOMER : groupBy;
        Long mine = fullScope ? null : actor.employeeId();

        String cte = g.lines ? LINES_CTE : HEADERS_CTE;
        List<Raw> raw = jdbc.sql("""
                WITH x AS (%s)
                SELECT %s AS k, %s AS name, count(DISTINCT x.order_id) AS orders, sum(x.qty) AS qty, sum(x.sales) AS sales,
                       sum(x.returns) AS returns, sum(x.vat) AS vat, sum(x.cost) AS cost, sum(x.sales) - sum(x.returns) AS net
                FROM x %s
                GROUP BY 1, 2 ORDER BY %s LIMIT :lim""".formatted(cte, g.key, g.name, g.join, g.order))
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("b", branchId).param("e", mine)
                .param("lim", MAX_ROWS + 1)
                .query((rs, n) -> new Raw(rs.getString("k"), rs.getString("name"), rs.getInt("orders"),
                        g.lines ? Integer.valueOf(rs.getInt("qty")) : null, rs.getBigDecimal("sales"),
                        rs.getBigDecimal("returns"), rs.getBigDecimal("vat"), rs.getBigDecimal("cost")))
                .list();
        boolean truncated = raw.size() > MAX_ROWS;
        List<Raw> shown = truncated ? raw.subList(0, MAX_ROWS) : raw;

        // Jami — barcha qatorlar bo'yicha (kesilgan bo'lsa ham to'liq): alohida so'rovsiz, raw bo'yicha
        Money sales = Money.ZERO;
        Money returns = Money.ZERO;
        Money vat = Money.ZERO;
        Money cost = Money.ZERO;
        int orders = 0;
        int qty = 0;
        for (Raw r : raw) {
            qty += r.qty() == null ? 0 : r.qty();
            sales = sales.plus(m(r.sales()));
            returns = returns.plus(m(r.returns()));
            vat = vat.plus(m(r.vat()));
            cost = cost.plus(m(r.cost()));
            orders += r.orders();
        }
        if (g.lines) {
            // Bitta buyurtma bir necha mahsulot guruhida bo'ladi — jami buyurtmalar alohida (takrorsiz) sanaladi
            orders = jdbc.sql("WITH x AS (%s) SELECT count(DISTINCT x.order_id) FROM x".formatted(HEADERS_CTE))
                    .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("b", branchId).param("e", mine)
                    .query(Integer.class).single();
        }
        List<SalesRow> rows = shown.stream().map(r -> row(r.k(), r.name(), r.orders(), r.qty(), m(r.sales()), m(r.returns()), m(r.vat()), m(r.cost()),
                canSeeCost))
                .toList();
        // Kun bo'yicha guruhlashda bitta buyurtma bir necha kunda bo'lmaydi (sotuv bir marta) — jami buyurtmalar yig'indisi to'g'ri;
        // boshqa guruhlarda ham buyurtma bitta mijoz/operator/filialga tegishli.
        SalesRow total = row("", "Jami", orders, g.lines ? Integer.valueOf(qty) : null, sales, returns, vat, cost, canSeeCost);
        return new SalesReportView(f, t, branchId, g, mine != null, canSeeCost, rows, total, truncated);
    }

    /** Yalpi foyda = sof savdo QQSsiz − tannarx (tannarx QQSsiz). */
    private static SalesRow row(String k, String name, int orders, Integer qty, Money sales, Money returns, Money vat, Money cost, boolean canSeeCost) {
        Money net = sales.minus(returns);
        return new SalesRow(k, name, orders, qty, sales.toString(), returns.toString(), net.toString(), canSeeCost ? cost.toString() : null,
                canSeeCost ? net.minus(vat).minus(cost).toString() : null);
    }

    private static Money m(BigDecimal v) {
        return new Money(v == null ? BigDecimal.ZERO : v);
    }
}
