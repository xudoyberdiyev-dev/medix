package uz.medix.delivery.trip;

import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import uz.medix.sales.OrderCancelled;

/** Bekor qilingan buyurtma reysdan chiqariladi; reysda buyurtma qolmasa — reys bekor bo'ladi (SPEC 5.2, T12 §5). */
@Component
class TripOrderListener {

    private final JdbcClient jdbc;

    TripOrderListener(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener
    void on(OrderCancelled e) {
        record Stop(long id, long tripId, int places) {}
        jdbc.sql("""
                SELECT s.id, s.trip_id, s.places FROM trip_stop s JOIN trip t ON t.id = s.trip_id
                WHERE s.order_id = :o AND s.active AND t.status = 'PLANNED' FOR UPDATE OF t, s""")
                .param("o", e.orderId())
                .query((rs, n) -> new Stop(rs.getLong("id"), rs.getLong("trip_id"), rs.getInt("places")))
                .optional()
                .ifPresent(s -> {
                    jdbc.sql("UPDATE trip_stop SET active = false WHERE id = :id").param("id", s.id()).update();
                    boolean left = jdbc.sql("SELECT EXISTS (SELECT 1 FROM trip_stop WHERE trip_id = :t AND active)")
                            .param("t", s.tripId()).query(Boolean.class).single();
                    if (left) {
                        jdbc.sql("UPDATE trip SET places = places - :p, updated_at = now(), version = version + 1 WHERE id = :t")
                                .param("p", s.places()).param("t", s.tripId()).update();
                    } else {
                        jdbc.sql("""
                                UPDATE trip SET status = 'CANCELLED', cancel_reason = :r, cancelled_at = now(), updated_at = now(),
                                       version = version + 1 WHERE id = :t""")
                                .param("r", "Barcha buyurtmalar bekor qilindi (" + e.number() + ")")
                                .param("t", s.tripId())
                                .update();
                    }
                });
    }
}
