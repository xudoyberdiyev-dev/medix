package uz.medix.reporting.sales;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.math.RoundingMode;
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
 * Mahsulotlar savdosi va yalpi foyda (SPEC 8, prototip «gp»): sotuv qatorlari (SV) − qaytarish qatorlari (QM) — mahsulot, kategoriya yoki
 * ishlab chiqaruvchi bo'yicha; dona va summa (QQS bilan). Savdo hisoboti bilan bir manba (bekor qilingan sotuv kirmaydi). Tannarx, yalpi
 * foyda (QQSsiz) va rentabellik faqat prices.cost bilan (API javobida ham yo'q). Faqat reports.own — o'zi kiritgan buyurtmalar.
 * Kategoriya va ishlab chiqaruvchi bo'yicha filtr ixtiyoriy.
 */
@Service
class ProductSalesReport {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    static final int MAX_ROWS = 5000;

    /** Guruhlash ifodalari — faqat shu konstantalar SQL'ga qo'shiladi. */
    public enum GroupBy {
        PRODUCT("p.id::text", "p.name", "p.code"),
        CATEGORY("coalesce(p.category_id::text, '')", "coalesce(cat.name, '')", "NULL"),
        MANUFACTURER("coalesce(p.manufacturer_id::text, '')", "coalesce(mf.name, '')", "NULL");

        final String key;
        final String name;
        final String code;

        GroupBy(String key, String name, String code) {
            this.key = key;
            this.name = name;
            this.code = code;
        }
    }

    public record ProductSalesRow(String key, @Schema(description = "Bo'sh — kategoriya / ishlab chiqaruvchi ko'rsatilmagan") String name,
            @Schema(nullable = true, description = "Mahsulot kodi (faqat PRODUCT)") String code, int qtySold, int qtyReturned, int qtyNet,
            String sales, String returns, String net, @Schema(nullable = true) String cost,
            @Schema(nullable = true, description = "Yalpi foyda: sof savdo QQSsiz − tannarx") String profit,
            @Schema(nullable = true, description = "Rentabellik, %: yalpi foyda / sof savdo QQSsiz × 100 (1 xona)") String margin) {}

    public record ProductSalesView(LocalDate from, LocalDate to, @Schema(nullable = true) Long branchId,
            @Schema(nullable = true) Long customerId, @Schema(nullable = true) Long categoryId,
            @Schema(nullable = true) Long manufacturerId, GroupBy groupBy, boolean mineOnly, boolean costVisible, List<ProductSalesRow> rows,
            ProductSalesRow total, boolean truncated) {}

    private record Raw(String k, String name, String code, int qs, int qr, BigDecimal sales, BigDecimal returns, BigDecimal vat,
            BigDecimal cost) {}

    private final JdbcClient jdbc;
    private final Clock clock;

    ProductSalesReport(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ProductSalesView report(Actor actor, Long requestedBranch, LocalDate from, LocalDate to, GroupBy groupBy, Long customerId,
            Long categoryId, Long manufacturerId, boolean fullScope, boolean canSeeCost) {
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
        GroupBy g = groupBy == null ? GroupBy.PRODUCT : groupBy;
        Long mine = fullScope ? null : actor.employeeId();

        List<Raw> raw = jdbc.sql("""
                WITH x AS (
                    SELECT l.product_id, l.qty AS qs, 0 AS qr, l.amount AS sales, 0 AS returns, l.vat_amount AS vat, l.cost * l.qty AS cost
                    FROM sale_line l JOIN sale s ON s.id = l.sale_id JOIN sales_order o ON o.id = s.order_id
                    WHERE s.status = 'POSTED' AND s.sale_date BETWEEN :f AND :t
                      AND (CAST(:b AS BIGINT) IS NULL OR s.branch_id = :b) AND (CAST(:e AS BIGINT) IS NULL OR o.created_by = :e)
                      AND (CAST(:c AS BIGINT) IS NULL OR s.customer_id = :c)
                    UNION ALL
                    SELECT l.product_id, 0, l.qty, 0, l.amount, -l.vat_amount, -(l.cost * l.qty)
                    FROM sales_return_line l JOIN sales_return r ON r.id = l.return_id JOIN sales_order o ON o.id = r.order_id
                    WHERE r.cancelled_at IS NULL AND r.return_date BETWEEN :f AND :t
                      AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b) AND (CAST(:e AS BIGINT) IS NULL OR o.created_by = :e)
                      AND (CAST(:c AS BIGINT) IS NULL OR r.customer_id = :c)
                )
                SELECT %s AS k, %s AS name, %s AS code, sum(x.qs) AS qs, sum(x.qr) AS qr, sum(x.sales) AS sales, sum(x.returns) AS returns,
                       sum(x.vat) AS vat, sum(x.cost) AS cost
                FROM x JOIN product p ON p.id = x.product_id
                LEFT JOIN category cat ON cat.id = p.category_id
                LEFT JOIN manufacturer mf ON mf.id = p.manufacturer_id
                WHERE (CAST(:cat AS BIGINT) IS NULL OR p.category_id = :cat) AND (CAST(:mf AS BIGINT) IS NULL OR p.manufacturer_id = :mf)
                GROUP BY 1, 2, 3 ORDER BY sum(x.sales) - sum(x.returns) DESC, 2 LIMIT :lim""".formatted(g.key, g.name, g.code))
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("b", branchId).param("e", mine).param("c", customerId)
                .param("cat", categoryId).param("mf", manufacturerId).param("lim", MAX_ROWS + 1)
                .query((rs, n) -> new Raw(rs.getString("k"), rs.getString("name"), rs.getString("code"), rs.getInt("qs"), rs.getInt("qr"),
                        rs.getBigDecimal("sales"), rs.getBigDecimal("returns"), rs.getBigDecimal("vat"), rs.getBigDecimal("cost")))
                .list();
        boolean truncated = raw.size() > MAX_ROWS;
        List<Raw> shown = truncated ? raw.subList(0, MAX_ROWS) : raw;

        Money sales = Money.ZERO;
        Money returns = Money.ZERO;
        Money vat = Money.ZERO;
        Money cost = Money.ZERO;
        int qs = 0;
        int qr = 0;
        for (Raw r : shown) {
            sales = sales.plus(m(r.sales()));
            returns = returns.plus(m(r.returns()));
            vat = vat.plus(m(r.vat()));
            cost = cost.plus(m(r.cost()));
            qs += r.qs();
            qr += r.qr();
        }
        List<ProductSalesRow> rows = shown.stream()
                .map(r -> row(r.k(), r.name(), r.code(), r.qs(), r.qr(), m(r.sales()), m(r.returns()), m(r.vat()), m(r.cost()), canSeeCost))
                .toList();
        ProductSalesRow total = row("", "Jami", null, qs, qr, sales, returns, vat, cost, canSeeCost);
        return new ProductSalesView(f, t, branchId, customerId, categoryId, manufacturerId, g, mine != null, canSeeCost, rows, total,
                truncated);
    }

    static ProductSalesRow row(String k, String name, String code, int qs, int qr, Money sales, Money returns, Money vat, Money cost,
            boolean canSeeCost) {
        Money net = sales.minus(returns);
        if (!canSeeCost) {
            return new ProductSalesRow(k, name, code, qs, qr, qs - qr, sales.toString(), returns.toString(), net.toString(), null, null, null);
        }
        Money base = net.minus(vat);
        Money profit = base.minus(cost);
        String margin = base.amount().signum() == 0 ? null
                : profit.amount().multiply(BigDecimal.valueOf(100)).divide(base.amount(), 1, RoundingMode.HALF_UP).toPlainString();
        return new ProductSalesRow(k, name, code, qs, qr, qs - qr, sales.toString(), returns.toString(), net.toString(), cost.toString(),
                profit.toString(), margin);
    }

    private static Money m(BigDecimal v) {
        return new Money(v == null ? BigDecimal.ZERO : v);
    }
}
