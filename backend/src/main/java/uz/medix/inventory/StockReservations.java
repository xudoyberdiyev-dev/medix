package uz.medix.inventory;

import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.error.MedixException;

/**
 * Zahira (FEFO, SPEC 6-7) — inventory modulining ochiq API'si. Har qator uchun muddati eng yaqin partiyalardan, sotuvga ochiq
 * zonalardan, faol zahiralarni hisobga olgan holda ajratiladi. Qoldiq satrlari (zona, partiya) tartibida {@code FOR UPDATE} bilan
 * qulflanadi — parallel buyurtmalar bir dona tovarni ikki marta zahiralamaydi. Chaqiruvchi tranzaksiyasiga qo'shiladi.
 */
@Service
public class StockReservations {

    /** Zahira so'rovi: hujjat qatori, mahsulot va miqdor. */
    public record Request(long lineId, long productId, int qty, String productName) {}

    /** Ajratilgan zahira: qator, partiya, zona, miqdor. */
    public record Allocation(long lineId, long batchId, String batchNumber, LocalDate expiry, long zoneId, String zone, int qty) {}

    private final JdbcClient jdbc;

    StockReservations(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private record Candidate(long zoneId, String zone, long batchId, String batchNumber, Date expiryDate, int qty, int reserved) {}

    @Transactional(propagation = Propagation.REQUIRED)
    public List<Allocation> reserve(String docType, long docId, String docNumber, long warehouseId, LocalDate minExpiry,
            List<Request> requests) {
        List<Allocation> out = new ArrayList<>();
        List<Request> sorted = new ArrayList<>(requests);
        sorted.sort(Comparator.comparingLong(Request::productId));
        for (Request r : sorted) {
            // Qulf: shu mahsulotning ombordagi barcha qoldiq satrlari, barqaror tartibda (deadlock bo'lmasin).
            jdbc.sql("SELECT 1 FROM stock_balance WHERE warehouse_id = :w AND product_id = :p ORDER BY zone_id, batch_id FOR UPDATE")
                    .param("w", warehouseId)
                    .param("p", r.productId())
                    .query((rs, n) -> 1)
                    .list();
            List<Candidate> candidates = jdbc.sql("""
                    SELECT s.zone_id, z.name AS zone, s.batch_id, b.number AS batch_number, b.expiry_date, s.qty,
                           coalesce((SELECT sum(x.qty) FROM stock_reservation x
                                     WHERE x.zone_id = s.zone_id AND x.batch_id = s.batch_id AND x.status = 'ACTIVE'), 0) AS reserved
                    FROM stock_balance s JOIN batch b ON b.id = s.batch_id JOIN zone z ON z.id = s.zone_id
                    WHERE s.warehouse_id = :w AND s.product_id = :p AND s.qty > 0 AND z.sellable AND z.active AND b.expiry_date >= :min
                    ORDER BY b.expiry_date, b.id, s.zone_id""")
                    .param("w", warehouseId)
                    .param("p", r.productId())
                    .param("min", Date.valueOf(minExpiry))
                    .query(Candidate.class)
                    .list();
            int left = r.qty();
            int free = 0;
            for (Candidate c : candidates) {
                free += Math.max(0, c.qty() - c.reserved());
            }
            if (free < left) {
                throw MedixException.conflict("stock.reserveInsufficient", r.productName(), String.valueOf(free), String.valueOf(left));
            }
            for (Candidate c : candidates) {
                if (left == 0) {
                    break;
                }
                int take = Math.min(left, c.qty() - c.reserved());
                if (take <= 0) {
                    continue;
                }
                jdbc.sql("""
                        INSERT INTO stock_reservation (doc_type, doc_id, doc_line_id, doc_number, zone_id, batch_id, product_id, warehouse_id, qty)
                        VALUES (:t, :d, :l, :n, :z, :b, :p, :w, :q)""")
                        .param("t", docType)
                        .param("d", docId)
                        .param("l", r.lineId())
                        .param("n", docNumber)
                        .param("z", c.zoneId())
                        .param("b", c.batchId())
                        .param("p", r.productId())
                        .param("w", warehouseId)
                        .param("q", take)
                        .update();
                out.add(new Allocation(r.lineId(), c.batchId(), c.batchNumber(), c.expiryDate().toLocalDate(), c.zoneId(), c.zone(), take));
                left -= take;
            }
        }
        return out;
    }

    /** Hujjatning faol zahirasini bo'shatish (bekor qilish). Qaytaradi — bo'shagan satrlar soni. */
    @Transactional(propagation = Propagation.REQUIRED)
    public int release(String docType, long docId) {
        return jdbc.sql("UPDATE stock_reservation SET status = 'RELEASED', closed_at = now() WHERE doc_type = :t AND doc_id = :d AND status = 'ACTIVE'")
                .param("t", docType)
                .param("d", docId)
                .update();
    }

    /** Hujjatning faol zahirasi (qator bo'yicha ko'rsatish uchun). */
    @Transactional(readOnly = true)
    public List<Allocation> active(String docType, long docId) {
        return jdbc.sql("""
                SELECT x.doc_line_id, x.batch_id, b.number, b.expiry_date, x.zone_id, z.name AS zone, x.qty
                FROM stock_reservation x JOIN batch b ON b.id = x.batch_id JOIN zone z ON z.id = x.zone_id
                WHERE x.doc_type = :t AND x.doc_id = :d AND x.status = 'ACTIVE' ORDER BY x.doc_line_id, b.expiry_date, x.id""")
                .param("t", docType)
                .param("d", docId)
                .query((rs, n) -> new Allocation(rs.getLong("doc_line_id"), rs.getLong("batch_id"), rs.getString("number"),
                        rs.getDate("expiry_date").toLocalDate(), rs.getLong("zone_id"), rs.getString("zone"), rs.getInt("qty")))
                .list();
    }
}
