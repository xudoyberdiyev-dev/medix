package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.media.Schema;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.order.OrderModels.OrderStatus;
import uz.medix.shared.security.Actor;
import uz.medix.shared.settings.SettingKey;
import uz.medix.shared.settings.SystemSettings;

/**
 * Ombor mudiri monitori (SPEC 5.4): bosqichlar ustunlari (Navbatda … Yuklanmoqda), jonli taymerlar, kechikkanlar.
 * Taymer: yig'ish va markirovkada — berilgan vaqt tugash payti; kechikish — shu paytdan o'tsa. Umumiy kechikish — buyurtma
 * shu holatda Sozlamalardagi «Buyurtma kechikishi» ({@code orderLateDays}) kundan ortiq tursa.
 */
@Service
class OrderMonitor {

    private final JdbcClient jdbc;
    private final SystemSettings settings;

    OrderMonitor(JdbcClient jdbc, SystemSettings settings) {
        this.jdbc = jdbc;
        this.settings = settings;
    }

    record MonitorCard(
            long id,
            String number,
            String customer,
            OrderStatus status,
            int lines,
            long totalQty,
            boolean marked,
            @Schema(description = "Vaqt berilganmi (Navbatda)") boolean timeGiven,
            @Schema(nullable = true, description = "Hozir kimda: yig'uvchi yoki markirovkachi") String person,
            @Schema(description = "Shu holatga o'tgan payt") Instant since,
            @Schema(nullable = true, description = "Berilgan vaqt tugash payti (yig'ish, markirovka)") Instant deadline,
            @Schema(description = "Berilgan vaqtdan o'tgan") boolean late,
            @Schema(description = "Holatda «N kundan oshgan»") boolean stale) {}

    record MonitorBoard(
            List<MonitorCard> cards,
            @Schema(description = "Berilgan vaqtdan o'tganlar") int late,
            @Schema(description = "«N kundan oshgan»lar") int stale,
            @Schema(description = "Vaqt berilmagan «Navbatda»") int waitingTime,
            int lateDays,
            Instant generatedAt) {}

    @Transactional(readOnly = true)
    MonitorBoard board(Actor actor, Long branchId) {
        Instant now = Instant.now();
        int lateDays = settings.intValue(SettingKey.orderLateDays);
        List<MonitorCard> cards = jdbc.sql("""
                SELECT o.id, o.number, c.name AS customer, o.status, o.branch_id, o.pick_minutes, o.mark_minutes, o.pick_started_at,
                       o.mark_started_at, o.status_changed_at, pk.full_name AS picker, mk.full_name AS marker,
                       (SELECT count(*) FROM sales_order_line l WHERE l.order_id = o.id) AS lines,
                       (SELECT coalesce(sum(l.qty), 0) FROM sales_order_line l WHERE l.order_id = o.id) AS total_qty,
                       EXISTS (SELECT 1 FROM sales_order_line l JOIN product p ON p.id = l.product_id WHERE l.order_id = o.id AND p.marked) AS marked
                FROM sales_order o JOIN counterparty c ON c.id = o.customer_id
                LEFT JOIN employee pk ON pk.id = o.picker_id LEFT JOIN employee mk ON mk.id = o.marker_id
                WHERE o.status IN ('QUEUED', 'PICKING', 'MARKING', 'CHECKING', 'DOCUMENTING', 'LOADING')
                  AND (CAST(:branch AS BIGINT) IS NULL OR o.branch_id = :branch)
                ORDER BY o.status_changed_at, o.id""")
                .param("branch", branchId)
                .query((rs, n) -> {
                    if (!actor.canAccessBranch(rs.getLong("branch_id"))) {
                        return null;
                    }
                    OrderStatus st = OrderStatus.valueOf(rs.getString("status"));
                    Instant since = rs.getTimestamp("status_changed_at").toInstant();
                    Integer pickMin = (Integer) rs.getObject("pick_minutes");
                    Integer markMin = (Integer) rs.getObject("mark_minutes");
                    Instant deadline = null;
                    String person = null;
                    if (st == OrderStatus.PICKING) {
                        deadline = plus(rs.getTimestamp("pick_started_at"), pickMin);
                        person = rs.getString("picker");
                    } else if (st == OrderStatus.MARKING) {
                        deadline = plus(rs.getTimestamp("mark_started_at"), markMin);
                        person = rs.getString("marker");
                    }
                    boolean late = deadline != null && now.isAfter(deadline);
                    boolean stale = Duration.between(since, now).toDays() >= lateDays;
                    return new MonitorCard(rs.getLong("id"), rs.getString("number"), rs.getString("customer"), st, rs.getInt("lines"),
                            rs.getLong("total_qty"), rs.getBoolean("marked"), pickMin != null, person, since, deadline, late, stale);
                })
                .list()
                .stream()
                .filter(Objects::nonNull)
                .toList();
        int late = (int) cards.stream().filter(MonitorCard::late).count();
        int stale = (int) cards.stream().filter(MonitorCard::stale).count();
        int waiting = (int) cards.stream().filter(c -> c.status() == OrderStatus.QUEUED && !c.timeGiven()).count();
        return new MonitorBoard(cards, late, stale, waiting, lateDays, now);
    }

    private static Instant plus(Timestamp start, Integer minutes) {
        return start == null || minutes == null ? null : start.toInstant().plusSeconds(minutes * 60L);
    }
}
