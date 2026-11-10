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
 * bosh sahifa kartasi va «Operatorlar» bloki bilan bir manba. Guruhlash: mijoz, operator, filial, kun. Tannarx va yalpi foyda faqat
 * prices.cost ruxsati borlarga (API javobida ham yo'q). Faqat reports.own bo'lsa — o'zi kiritgan buyurtmalar.
 */
@Service
class SalesReport {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    static final int MAX_ROWS = 5000;

    /** Guruhlash: kalit va nom ifodalari — faqat shu konstantalar SQL'ga qo'shiladi. */
    public enum GroupBy {
        CUSTOMER("x.customer_id::text", "c.name", "JOIN counterparty c ON c.id = x.customer_id", "net DESC, name"),
        OPERATOR("x.created_by::text", "e.full_name", "JOIN employee e ON e.id = x.created_by", "net DESC, name"),
        BRANCH("x.branch_id::text", "b.name", "JOIN branch b ON b.id = x.branch_id", "net DESC, name"),
        DAY("x.d::text", "to_char(x.d, 'DD.MM.YYYY')", "", "k"),
        /** Mijoz hududi; ko'rsatilmagan — bo'sh kalit. */
        REGION("coalesce(x.region_id::text, '')", "coalesce(rg.name, '')", "LEFT JOIN region rg ON rg.id = x.region_id", "net DESC, name"),
        /** Buyurtmaning to'lov turi: kalit va nom — CASH / TRANSFER / ONLINE (UI tarjima qiladi). */
        PAYMENT_TYPE("x.payment_type", "x.payment_type", "", "net DESC, name");

        final String key;
        final String name;
        final String join;
        final String order;

        GroupBy(String key, String name, String join, String order) {
            this.key = key;
            this.name = name;
            this.join = join;
            this.order = order;
        }
    }

    public record SalesRow(String key, String name, int orders, String sales,
            @Schema(description = "Berilgan chegirma (E7): Σ qty × (narx turidagi narx − chegirmali narx); sotuv summasi chegirmadan keyin") String discount,
            String returns, String net,
            @Schema(nullable = true) String cost, @Schema(nullable = true, description = "Yalpi foyda: sof savdo QQSsiz − tannarx") String profit) {}

    /** Filtrlar (SPEC 8, prototip: region, ptype): ixtiyoriy. */
    public enum PaymentType {
        CASH,
        TRANSFER,
        ONLINE
    }

    public record SalesReportView(LocalDate from, LocalDate to, @Schema(nullable = true) Long branchId, GroupBy groupBy, boolean mineOnly,
            @Schema(nullable = true) PaymentType paymentType, @Schema(nullable = true) Long regionId, boolean costVisible, List<SalesRow> rows, SalesRow total, boolean truncated) {}

    private record Raw(String k, String name, int orders, BigDecimal sales, BigDecimal discount, BigDecimal returns, BigDecimal vat,
            BigDecimal cost) {}

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
    public SalesReportView report(Actor actor, Long requestedBranch, LocalDate from, LocalDate to, GroupBy groupBy, PaymentType paymentType,
            Long regionId, boolean fullScope, boolean canSeeCost) {
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

        List<Raw> raw = jdbc.sql("""
                WITH x AS (
                    SELECT s.branch_id, s.customer_id, o.created_by, s.sale_date AS d, s.order_id, s.total AS sales, 0 AS returns, s.vat_total AS vat, s.cost_total AS cost,
                           o.payment_type, cp.region_id,
                           (SELECT coalesce(sum(sl.qty * greatest(coalesce(ol.list_price, sl.price) - sl.price, 0)), 0)
                            FROM sale_line sl JOIN sales_order_line ol ON ol.id = sl.order_line_id WHERE sl.sale_id = s.id) AS discount
                    FROM sale s JOIN sales_order o ON o.id = s.order_id JOIN counterparty cp ON cp.id = s.customer_id
                    WHERE s.status = 'POSTED' AND s.sale_date BETWEEN :f AND :t
                      AND (CAST(:b AS BIGINT) IS NULL OR s.branch_id = :b) AND (CAST(:e AS BIGINT) IS NULL OR o.created_by = :e)
                    UNION ALL
                    SELECT r.branch_id, r.customer_id, o.created_by, r.return_date, NULL, 0, r.total, -r.vat_total, -r.cost_total,
                           o.payment_type, cp.region_id, 0
                    FROM sales_return r JOIN sales_order o ON o.id = r.order_id JOIN counterparty cp ON cp.id = r.customer_id
                    WHERE r.cancelled_at IS NULL AND r.return_date BETWEEN :f AND :t
                      AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b) AND (CAST(:e AS BIGINT) IS NULL OR o.created_by = :e)
                )
                SELECT %s AS k, %s AS name, count(DISTINCT x.order_id) AS orders, sum(x.sales) AS sales, sum(x.discount) AS discount, sum(x.returns) AS returns,
                       sum(x.vat) AS vat, sum(x.cost) AS cost, sum(x.sales) - sum(x.returns) AS net
                FROM x %s
                WHERE (CAST(:pt AS VARCHAR) IS NULL OR x.payment_type = :pt) AND (CAST(:rg AS BIGINT) IS NULL OR x.region_id = :rg)
                GROUP BY 1, 2 ORDER BY %s LIMIT :lim""".formatted(g.key, g.name, g.join, g.order))
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("b", branchId).param("e", mine)
                .param("pt", paymentType == null ? null : paymentType.name()).param("rg", regionId)
                .param("lim", MAX_ROWS + 1)
                .query((rs, n) -> new Raw(rs.getString("k"), rs.getString("name"), rs.getInt("orders"), rs.getBigDecimal("sales"),
                        rs.getBigDecimal("discount"), rs.getBigDecimal("returns"), rs.getBigDecimal("vat"), rs.getBigDecimal("cost")))
                .list();
        boolean truncated = raw.size() > MAX_ROWS;
        List<Raw> shown = truncated ? raw.subList(0, MAX_ROWS) : raw;

        // Jami — barcha qatorlar bo'yicha (kesilgan bo'lsa ham to'liq): alohida so'rovsiz, raw bo'yicha
        Money sales = Money.ZERO;
        Money discount = Money.ZERO;
        Money returns = Money.ZERO;
        Money vat = Money.ZERO;
        Money cost = Money.ZERO;
        int orders = 0;
        for (Raw r : raw) {
            sales = sales.plus(m(r.sales()));
            discount = discount.plus(m(r.discount()));
            returns = returns.plus(m(r.returns()));
            vat = vat.plus(m(r.vat()));
            cost = cost.plus(m(r.cost()));
            orders += r.orders();
        }
        List<SalesRow> rows = shown.stream().map(r -> row(r.k(), r.name(), r.orders(), m(r.sales()), m(r.discount()), m(r.returns()), m(r.vat()), m(r.cost()),
                canSeeCost))
                .toList();
        // Kun bo'yicha guruhlashda bitta buyurtma bir necha kunda bo'lmaydi (sotuv bir marta) — jami buyurtmalar yig'indisi to'g'ri;
        // boshqa guruhlarda ham buyurtma bitta mijoz/operator/filialga tegishli.
        SalesRow total = row("", "Jami", orders, sales, discount, returns, vat, cost, canSeeCost);
        return new SalesReportView(f, t, branchId, g, mine != null, paymentType, regionId, canSeeCost, rows, total, truncated);
    }

    /** Yalpi foyda = sof savdo QQSsiz − tannarx (tannarx QQSsiz). */
    private static SalesRow row(String k, String name, int orders, Money sales, Money discount, Money returns, Money vat, Money cost, boolean canSeeCost) {
        Money net = sales.minus(returns);
        return new SalesRow(k, name, orders, sales.toString(), discount.toString(), returns.toString(), net.toString(), canSeeCost ? cost.toString() : null,
                canSeeCost ? net.minus(vat).minus(cost).toString() : null);
    }

    private static Money m(BigDecimal v) {
        return new Money(v == null ? BigDecimal.ZERO : v);
    }
}
