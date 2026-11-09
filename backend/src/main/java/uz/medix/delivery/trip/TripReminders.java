package uz.medix.delivery.trip;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.notification.Notifications;
import uz.medix.shared.money.Money;

/**
 * «Qaytish kutilmoqda»da qotib qolgan reyslar (T12-audit №23): reys yakunlanganidan {@code medix.trips.return-wait-hours}
 * soat o'tib ham qaytgan tovar qabul qilinmagan bo'lsa — Ombor mudiriga (orders.check), naqd pul topshirilmagan bo'lsa —
 * kassirga (payments.mt); ikkalasida ham haydovchiga. Har soatda tekshiriladi, bir reys bo'yicha kuniga bir marta.
 */
@Service
public class TripReminders {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final Notifications notifications;
    private final Clock clock;
    private final Duration threshold;

    TripReminders(JdbcClient jdbc, Notifications notifications, Clock clock,
            @Value("${medix.trips.return-wait-hours:4}") int returnWaitHours) {
        this.jdbc = jdbc;
        this.notifications = notifications;
        this.clock = clock;
        this.threshold = Duration.ofHours(returnWaitHours);
    }

    record Stuck(long id, String number, long branchId, long driverId, String driver, Instant finishedAt, long goods, BigDecimal cash) {}

    @Scheduled(cron = "0 20 * * * *", zone = "Asia/Tashkent")
    void hourly() {
        run(clock.instant());
    }

    /** Qaytaradi: yangi yozilgan bildirishnomalar soni. */
    @Transactional
    public int run(Instant now) {
        List<Stuck> stuck = jdbc.sql("""
                SELECT t.id, t.number, t.branch_id, t.driver_id, d.full_name AS driver, t.finished_at,
                       (SELECT count(*) FROM trip_stop s JOIN sales_return_pending r ON r.order_id = s.order_id
                        WHERE s.trip_id = t.id AND s.active AND r.received_at IS NULL) AS goods,
                       (SELECT coalesce(sum(s.cash_collected), 0) FROM trip_stop s
                        WHERE s.trip_id = t.id AND s.active AND s.cash_payment_id IS NULL AND s.cash_accept_id IS NULL) AS cash
                FROM trip t JOIN employee d ON d.id = t.driver_id
                WHERE t.status = 'RETURN_WAIT' AND t.finished_at IS NOT NULL AND t.finished_at <= :limit
                ORDER BY t.id""")
                .param("limit", java.sql.Timestamp.from(now.minus(threshold)))
                .query((rs, n) -> new Stuck(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("driver_id"),
                        rs.getString("driver"), rs.getTimestamp("finished_at").toInstant(), rs.getLong("goods"), rs.getBigDecimal("cash")))
                .list();
        String day = LocalDate.ofInstant(now, TASHKENT).toString();
        int created = 0;
        for (Stuck s : stuck) {
            long hours = Duration.between(s.finishedAt(), now).toHours();
            if (s.goods() > 0) {
                created += notifications.notify("orders.check", s.branchId(), List.of(s.driverId()), notifications.message(
                        "TRIP_RETURN_WAIT", "trip.returnGoods", "/warehouse?tab=returns", "trip-return-goods-" + s.id() + "-" + day,
                        s.number(), hours, s.driver()));
            }
            if (s.cash().signum() > 0) {
                created += notifications.notify("payments.mt", s.branchId(), List.of(s.driverId()), notifications.message(
                        "TRIP_RETURN_WAIT", "trip.returnCash", "/cash", "trip-return-cash-" + s.id() + "-" + day,
                        s.number(), hours, s.driver(), new Money(s.cash()).format()));
            }
        }
        return created;
    }
}
