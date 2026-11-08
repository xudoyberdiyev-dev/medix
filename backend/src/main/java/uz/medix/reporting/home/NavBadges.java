package uz.medix.reporting.home;

import io.swagger.v3.oas.annotations.media.Schema;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.security.Actor;

/**
 * Sidebar nishonlari (prototip navBadges): tasdiq kutayotgan buyurtmalar, jo'natishga tayyorlar, muddati yaqin / o'tgan partiyalar.
 * Har bir son faqat tegishli ruxsat bo'lsa hisoblanadi (bo'lmasa null); filial doirasi serverda.
 */
@Service
class NavBadges {

    static final int EXPIRY_WARN_DAYS = 90;
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    @Schema(description = "Ko'rsatkich: son va xavfli holat (qizil)")
    record Badge(int count, boolean danger) {}

    record NavBadgesView(@Schema(nullable = true) Badge orders, @Schema(nullable = true) Badge shipments,
            @Schema(nullable = true) Badge expiry,
            @Schema(nullable = true, description = "Tashkilot nomi (sidebar sarlavhasida, MEDIX ostida)") String company,
            @Schema(nullable = true, description = "Logotip versiyasi (epoch ms) — /api/company/logo?v=…; null — logotip yoʻq")
                    Long logoVersion) {}

    private record CompanyHead(String name, Long logoVersion) {}

    private final JdbcClient jdbc;
    private final Clock clock;

    NavBadges(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** branchId — tanlangan filial; ruxsat bo'lmasa yoki berilmasa: barcha filiallar (allBranches) yoki o'z filiali. */
    @Transactional(readOnly = true)
    NavBadgesView get(Actor actor, Set<String> authorities, Long branchId) {
        Long b = branchId != null && actor.canAccessBranch(branchId) ? branchId : actor.allBranches() ? null : actor.branchId();
        var head = jdbc.sql("""
                        SELECT name, CASE WHEN logo IS NOT NULL THEN (extract(epoch FROM logo_updated_at) * 1000)::bigint END AS logo_version
                        FROM company ORDER BY id LIMIT 1""")
                .query((rs, n) -> new CompanyHead(rs.getString("name"), rs.getObject("logo_version", Long.class)))
                .optional()
                .orElse(new CompanyHead(null, null));
        String company = head.name();
        if (b == null && !actor.allBranches()) {
            return new NavBadgesView(null, null, null, company, head.logoVersion());
        }
        long scope = b == null ? -1L : b;
        Badge orders = authorities.contains("orders.view") ? new Badge(count("""
                SELECT count(*) FROM sales_order WHERE status = 'PENDING_APPROVAL' AND (:b = -1 OR branch_id = :b)""", scope), false) : null;
        Badge shipments = authorities.contains("shipments.view") ? new Badge(count("""
                SELECT count(*) FROM sales_order WHERE status = 'DOCUMENTING' AND (:b = -1 OR branch_id = :b)""", scope), false) : null;
        Badge expiry = null;
        if (authorities.contains("expiry.view")) {
            LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
            record Exp(int near, int expired) {}
            Exp e = jdbc.sql("""
                    SELECT count(DISTINCT (s.batch_id, s.warehouse_id)) FILTER (WHERE bt.expiry_date <= :w) AS near,
                           count(DISTINCT (s.batch_id, s.warehouse_id)) FILTER (WHERE bt.expiry_date < :d) AS expired
                    FROM stock_balance s JOIN batch bt ON bt.id = s.batch_id
                    WHERE s.qty > 0 AND (:b = -1 OR s.branch_id = :b)""")
                    .param("b", scope)
                    .param("d", Date.valueOf(today))
                    .param("w", Date.valueOf(today.plusDays(EXPIRY_WARN_DAYS)))
                    .query(Exp.class)
                    .single();
            expiry = new Badge(e.near(), e.expired() > 0);
        }
        return new NavBadgesView(orders, shipments, expiry, company, head.logoVersion());
    }

    private int count(String sql, long scope) {
        return jdbc.sql(sql).param("b", scope).query(Integer.class).single();
    }
}
