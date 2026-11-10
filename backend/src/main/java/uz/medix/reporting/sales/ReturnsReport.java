package uz.medix.reporting.sales;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * Qaytarishlar hisoboti (QM, SPEC 8): sabab, mijoz, mahsulot yoki kun bo'yicha — QM hujjatlari soni, dona va summa (QQS bilan). Mijoz va
 * mahsulot kesimida qaytarish ulushi: qaytarish / shu davrdagi sotuv (bekor qilingan sotuv kirmaydi). Savdo hisoboti bilan bir manba.
 * Tannarx ko'rsatilmaydi (qaytgan tovar omborga kiradi). Faqat reports.own — o'zi kiritgan buyurtmalar. Sabab — haydovchi yozgan matn:
 * katta-kichik harf va chetdagi bo'shliqlarsiz guruhlanadi.
 */
@Service
class ReturnsReport {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    static final int MAX_ROWS = 5000;

    /** Guruhlash ifodalari — faqat shu konstantalar SQL'ga qo'shiladi; {@code sales} — ulush uchun sotuv kaliti (yo'q bo'lsa NULL). */
    public enum GroupBy {
        REASON("lower(btrim(x.reason))", "btrim(x.reason)", "NULL::text", null),
        CUSTOMER("x.customer_id::text", "c.name", "c.tin", "s.customer_id::text"),
        PRODUCT("x.product_id::text", "p.name", "p.code", "l.product_id::text"),
        DAY("x.return_date::text", "to_char(x.return_date, 'DD.MM.YYYY')", "NULL::text", null);

        final String key;
        final String name;
        final String code;
        final String sales;

        GroupBy(String key, String name, String code, String sales) {
            this.key = key;
            this.name = name;
            this.code = code;
            this.sales = sales;
        }
    }

    public record ReturnsRow(String key, String name,
            @Schema(nullable = true, description = "Mahsulot kodi yoki mijoz STIR (REASON va DAY da yo'q)") String code, int documents, int qty,
            String amount, @Schema(nullable = true, description = "Shu davrdagi sotuv (QQS bilan) — faqat CUSTOMER, PRODUCT va jami") String sales,
            @Schema(nullable = true, description = "Qaytarish ulushi, %: qaytarish / sotuv × 100 (1 xona)") String rate) {}

    public record ReturnsView(LocalDate from, LocalDate to, @Schema(nullable = true) Long branchId, @Schema(nullable = true) Long customerId,
            @Schema(nullable = true) Long productId, GroupBy groupBy, boolean mineOnly, List<ReturnsRow> rows, ReturnsRow total,
            boolean truncated) {}

    private record Raw(String k, String name, String code, int docs, int qty, BigDecimal amount) {}

    private final JdbcClient jdbc;
    private final Clock clock;

    ReturnsReport(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ReturnsView report(Actor actor, Long requestedBranch, LocalDate from, LocalDate to, GroupBy groupBy, Long customerId,
            Long productId, boolean fullScope) {
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
        GroupBy g = groupBy == null ? GroupBy.REASON : groupBy;
        Long mine = fullScope ? null : actor.employeeId();

        List<Raw> raw = jdbc.sql("""
                WITH x AS (
                    SELECT r.id AS rid, r.return_date, r.reason, r.customer_id, l.product_id, l.qty, l.amount
                    FROM sales_return_line l JOIN sales_return r ON r.id = l.return_id JOIN sales_order o ON o.id = r.order_id
                    WHERE r.cancelled_at IS NULL AND r.return_date BETWEEN :f AND :t
                      AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b) AND (CAST(:e AS BIGINT) IS NULL OR o.created_by = :e)
                      AND (CAST(:c AS BIGINT) IS NULL OR r.customer_id = :c) AND (CAST(:p AS BIGINT) IS NULL OR l.product_id = :p)
                )
                SELECT %s AS k, min(%s) AS name, min(%s) AS code, count(DISTINCT x.rid) AS docs, sum(x.qty) AS qty, sum(x.amount) AS amount
                FROM x JOIN product p ON p.id = x.product_id JOIN counterparty c ON c.id = x.customer_id
                GROUP BY 1 ORDER BY %s LIMIT :lim""".formatted(g.key, g.name, g.code, g == GroupBy.DAY ? "1 DESC" : "sum(x.amount) DESC, 2"))
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("b", branchId).param("e", mine).param("c", customerId)
                .param("p", productId).param("lim", MAX_ROWS + 1)
                .query((rs, n) -> new Raw(rs.getString("k"), rs.getString("name"), rs.getString("code"), rs.getInt("docs"), rs.getInt("qty"),
                        rs.getBigDecimal("amount")))
                .list();
        boolean truncated = raw.size() > MAX_ROWS;
        List<Raw> shown = truncated ? raw.subList(0, MAX_ROWS) : raw;

        // Ulush uchun sotuv: guruh kaliti bo'yicha (CUSTOMER, PRODUCT) va jami — o'sha doira va filtrlar bilan
        Map<String, Money> sales = new HashMap<>();
        Money salesTotal = Money.ZERO;
        for (var s : jdbc.sql("""
                SELECT %s AS k, sum(l.amount) AS amount
                FROM sale_line l JOIN sale s ON s.id = l.sale_id JOIN sales_order o ON o.id = s.order_id
                WHERE s.status = 'POSTED' AND s.sale_date BETWEEN :f AND :t
                  AND (CAST(:b AS BIGINT) IS NULL OR s.branch_id = :b) AND (CAST(:e AS BIGINT) IS NULL OR o.created_by = :e)
                  AND (CAST(:c AS BIGINT) IS NULL OR s.customer_id = :c) AND (CAST(:p AS BIGINT) IS NULL OR l.product_id = :p)
                %s""".formatted(g.sales == null ? "''" : g.sales, g.sales == null ? "" : "GROUP BY 1"))
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("b", branchId).param("e", mine).param("c", customerId)
                .param("p", productId)
                .query((rs, n) -> Map.entry(rs.getString("k"), m(rs.getBigDecimal("amount"))))
                .list()) {
            sales.put(s.getKey(), s.getValue());
            salesTotal = salesTotal.plus(s.getValue());
        }

        Money amount = Money.ZERO;
        int qty = 0;
        for (Raw r : shown) {
            amount = amount.plus(m(r.amount()));
            qty += r.qty();
        }
        int docs = documents(f, t, branchId, mine, customerId, productId);
        List<ReturnsRow> rows = shown.stream()
                .map(r -> row(r.k(), r.name() == null ? "" : r.name(), r.code(), r.docs(), r.qty(), m(r.amount()),
                        g.sales == null ? null : sales.getOrDefault(r.k(), Money.ZERO)))
                .toList();
        ReturnsRow total = row("", "Jami", null, docs, qty, amount, salesTotal);
        return new ReturnsView(f, t, branchId, customerId, productId, g, mine != null, rows, total, truncated);
    }

    /** Jami hujjatlar soni — guruhlar yig'indisi emas (bir QM bir necha mahsulot qatorida bo'lishi mumkin). */
    private int documents(LocalDate f, LocalDate t, Long branchId, Long mine, Long customerId, Long productId) {
        return jdbc.sql("""
                SELECT count(DISTINCT r.id) FROM sales_return_line l JOIN sales_return r ON r.id = l.return_id
                JOIN sales_order o ON o.id = r.order_id
                WHERE r.cancelled_at IS NULL AND r.return_date BETWEEN :f AND :t
                  AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b) AND (CAST(:e AS BIGINT) IS NULL OR o.created_by = :e)
                  AND (CAST(:c AS BIGINT) IS NULL OR r.customer_id = :c) AND (CAST(:p AS BIGINT) IS NULL OR l.product_id = :p)""")
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("b", branchId).param("e", mine).param("c", customerId)
                .param("p", productId)
                .query(Integer.class).single();
    }

    static ReturnsRow row(String k, String name, String code, int docs, int qty, Money amount, Money sales) {
        if (sales == null) {
            return new ReturnsRow(k, name, code, docs, qty, amount.toString(), null, null);
        }
        String rate = sales.amount().signum() == 0 ? null
                : amount.amount().multiply(BigDecimal.valueOf(100)).divide(sales.amount(), 1, RoundingMode.HALF_UP).toPlainString();
        return new ReturnsRow(k, name, code, docs, qty, amount.toString(), sales.toString(), rate);
    }

    private static Money m(BigDecimal v) {
        return new Money(v == null ? BigDecimal.ZERO : v);
    }
}
