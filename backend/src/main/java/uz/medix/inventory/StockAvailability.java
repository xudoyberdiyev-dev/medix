package uz.medix.inventory;

import java.sql.Date;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sotuvga mavjud qoldiq — inventory modulining ochiq API'si (SPEC 6-6): faqat sotuvga ochiq zonalar, muddati o'tmagan va
 * mijozning minimal yaroqlilik talabiga mos partiyalar; faol zahira ({@link StockReservations}) ayriladi.
 */
@Service
public class StockAvailability {

    /** Mavjud miqdor va eng yaqin yaroqlilik sanasi. */
    public record Available(int qty, LocalDate nearestExpiry) {}

    private final JdbcClient jdbc;

    StockAvailability(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public Map<Long, Available> available(long warehouseId, Collection<Long> productIds, LocalDate minExpiry) {
        Map<Long, Available> m = new HashMap<>();
        if (productIds.isEmpty()) {
            return m;
        }
        jdbc.sql("""
                SELECT s.product_id, sum(s.qty - coalesce(r.qty, 0)) AS qty, min(b.expiry_date) AS nearest
                FROM stock_balance s JOIN batch b ON b.id = s.batch_id JOIN zone z ON z.id = s.zone_id
                LEFT JOIN (SELECT zone_id, batch_id, sum(qty) AS qty FROM stock_reservation WHERE status = 'ACTIVE' GROUP BY zone_id, batch_id) r
                       ON r.zone_id = s.zone_id AND r.batch_id = s.batch_id
                WHERE s.warehouse_id = :w AND s.qty > coalesce(r.qty, 0) AND z.sellable AND z.active AND b.expiry_date >= :min
                  AND s.product_id IN (:ids)
                GROUP BY s.product_id""")
                .param("w", warehouseId)
                .param("min", Date.valueOf(minExpiry))
                .param("ids", productIds)
                .query((rs, n) -> m.put(rs.getLong("product_id"), new Available(rs.getInt("qty"), rs.getDate("nearest").toLocalDate())))
                .list();
        return m;
    }
}
