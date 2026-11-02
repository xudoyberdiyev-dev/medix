package uz.medix.delivery.trip;

import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import uz.medix.sales.OrderCancelled;
import uz.medix.sales.SalesReturnAccepted;

/**
 * Bekor qilingan buyurtma reysdan chiqariladi; reysda buyurtma qolmasa — reys bekor bo'ladi (SPEC 5.2, T12 §5). Qaytgan tovar
 * to'liq qabul qilinsa va naqd pul bo'lmasa — «Qaytish kutilmoqda» reys «Yakunlangan»ga o'tadi (5.2 reys holatlari).
 */
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

    @EventListener
    void on(SalesReturnAccepted e) {
        jdbc.sql("""
                SELECT t.id FROM trip_stop s JOIN trip t ON t.id = s.trip_id
                WHERE s.order_id = :o AND s.active AND t.status = 'RETURN_WAIT' FOR UPDATE OF t""")
                .param("o", e.orderId())
                .query(Long.class)
                .optional()
                .ifPresent(this::closeIfSettled);
    }

    /** Naqd pul (Kassirga topshirish — 9-bosqich) bo'lmasa va barcha qaytgan tovar qabul qilingan bo'lsa — «Yakunlangan». */
    void closeIfSettled(long tripId) {
        boolean open = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM trip_stop s JOIN sales_return_pending r ON r.order_id = s.order_id
                               WHERE s.trip_id = :t AND s.active AND r.received_at IS NULL)
                    OR EXISTS (SELECT 1 FROM trip_stop s WHERE s.trip_id = :t AND s.active AND coalesce(s.cash_collected, 0) > 0)""")
                .param("t", tripId)
                .query(Boolean.class)
                .single();
        if (!open) {
            jdbc.sql("UPDATE trip SET status = 'DONE', updated_at = now(), version = version + 1 WHERE id = :t AND status = 'RETURN_WAIT'")
                    .param("t", tripId)
                    .update();
        }
    }
}
