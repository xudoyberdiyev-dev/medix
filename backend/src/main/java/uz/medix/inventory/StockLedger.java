package uz.medix.inventory;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.CurrentActor;

/**
 * Ombor jurnali — inventory modulining ochiq API'si (SPEC 11: «Jurnal»). Har hujjat o'tkazilganda harakatlar BITTA tranzaksiyada
 * yoziladi: jurnal (stock_move) + qoldiq (stock_balance). Qoldiq satrlari (zona, partiya) tartibida {@code FOR UPDATE} bilan
 * qulflanadi — parallel hujjatlar o'zaro bloklanmaydi (deadlock yo'q) va qoldiq hech qachon manfiy bo'lmaydi.
 * Chaqiruvchi hujjat tranzaksiyasiga qo'shiladi (REQUIRED): xato bo'lsa butun hujjat qaytariladi.
 */
@Service
public class StockLedger {

    /** Hujjat: turi (KR, SV, ZK, BQ, ...), id va raqami (BY-TSH-000355). */
    public record DocRef(String type, long id, String number) {
        public DocRef {
            Objects.requireNonNull(type);
            Objects.requireNonNull(number);
        }
    }

    /** Harakat: zona va partiya bo'yicha miqdor (musbat — kirdi, manfiy — chiqdi). */
    public record Move(long zoneId, long batchId, int qty, String note) {
        public Move {
            if (qty == 0) {
                throw new IllegalArgumentException("qty 0 bo'lmaydi");
            }
        }

        public static Move in(long zoneId, long batchId, int qty) {
            return new Move(zoneId, batchId, Math.abs(qty), null);
        }

        public static Move out(long zoneId, long batchId, int qty) {
            return new Move(zoneId, batchId, -Math.abs(qty), null);
        }
    }

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;

    StockLedger(JdbcClient jdbc, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
    }

    /** Yangi partiya (kirim qatori yoki boshlang'ich qoldiq). Bonus partiya — tannarx 0, raqamiga «-B» qo'shiladi. */
    @Transactional(propagation = Propagation.REQUIRED)
    public long createBatch(long productId, String number, LocalDate producedOn, LocalDate expiry, Money cost, boolean bonus,
            String sourceType, Long sourceId) {
        String n = number.strip();
        if (bonus && !n.endsWith("-B")) {
            n = n + "-B";
        }
        return jdbc.sql("""
                INSERT INTO batch (product_id, number, produced_on, expiry_date, cost, bonus, source_type, source_id)
                VALUES (:p, :n, :prod, :exp, :cost, :bonus, :st, :sid) RETURNING id""")
                .param("p", productId)
                .param("n", n)
                .param("prod", producedOn == null ? null : java.sql.Date.valueOf(producedOn))
                .param("exp", java.sql.Date.valueOf(expiry))
                .param("cost", bonus ? Money.ZERO.amount() : cost.amount())
                .param("bonus", bonus)
                .param("st", sourceType)
                .param("sid", sourceId)
                .query(Long.class)
                .single();
    }

    private record ZoneInfo(long warehouseId, long branchId) {}

    private record BatchInfo(long productId, String productName, String number) {}

    @Transactional(propagation = Propagation.REQUIRED)
    public void post(DocRef doc, List<Move> moves) {
        if (moves.isEmpty()) {
            return;
        }
        Long employee = currentActor.current().map(a -> a.employeeId()).orElse(null);
        // Bir xil (zona, partiya) qatorlari jamlanadi; qulflash tartibi barqaror — deadlock bo'lmasin.
        Map<String, long[]> totals = new LinkedHashMap<>();
        for (Move m : moves) {
            totals.computeIfAbsent(m.zoneId() + ":" + m.batchId(), k -> new long[] {m.zoneId(), m.batchId(), 0})[2] += m.qty();
        }
        List<long[]> ordered = new ArrayList<>(totals.values());
        ordered.sort(Comparator.<long[]>comparingLong(a -> a[0]).thenComparingLong(a -> a[1]));
        Map<Long, ZoneInfo> zones = new LinkedHashMap<>();
        Map<Long, BatchInfo> batches = new LinkedHashMap<>();
        for (long[] t : ordered) {
            long zoneId = t[0];
            long batchId = t[1];
            ZoneInfo z = zones.computeIfAbsent(zoneId, this::zone);
            BatchInfo b = batches.computeIfAbsent(batchId, this::batch);
            jdbc.sql("""
                    INSERT INTO stock_balance (zone_id, batch_id, product_id, warehouse_id, branch_id, qty)
                    VALUES (:z, :b, :p, :w, :br, 0) ON CONFLICT (zone_id, batch_id) DO NOTHING""")
                    .param("z", zoneId)
                    .param("b", batchId)
                    .param("p", b.productId())
                    .param("w", z.warehouseId())
                    .param("br", z.branchId())
                    .update();
            int current = jdbc.sql("SELECT qty FROM stock_balance WHERE zone_id = :z AND batch_id = :b FOR UPDATE")
                    .param("z", zoneId)
                    .param("b", batchId)
                    .query(Integer.class)
                    .single();
            long next = current + t[2];
            if (next < 0) {
                throw MedixException.conflict("stock.insufficient", b.productName(), b.number(), String.valueOf(current), String.valueOf(-t[2]));
            }
            if (next > Integer.MAX_VALUE) {
                throw MedixException.badRequest("stock.tooLarge");
            }
            jdbc.sql("UPDATE stock_balance SET qty = :q, updated_at = now() WHERE zone_id = :z AND batch_id = :b")
                    .param("q", (int) next)
                    .param("z", zoneId)
                    .param("b", batchId)
                    .update();
        }
        for (Move m : moves) {
            ZoneInfo z = zones.get(m.zoneId());
            BatchInfo b = batches.get(m.batchId());
            jdbc.sql("""
                    INSERT INTO stock_move (branch_id, warehouse_id, zone_id, product_id, batch_id, qty, doc_type, doc_id, doc_number,
                                            employee_id, note)
                    VALUES (:br, :w, :z, :p, :b, :q, :dt, :di, :dn, :e, :note)""")
                    .param("br", z.branchId())
                    .param("w", z.warehouseId())
                    .param("z", m.zoneId())
                    .param("p", b.productId())
                    .param("b", m.batchId())
                    .param("q", m.qty())
                    .param("dt", doc.type())
                    .param("di", doc.id())
                    .param("dn", doc.number())
                    .param("e", employee)
                    .param("note", m.note())
                    .update();
        }
    }

    /** Joriy qoldiq (zona × partiya). */
    @Transactional(readOnly = true)
    public int balance(long zoneId, long batchId) {
        return jdbc.sql("SELECT coalesce(max(qty), 0) FROM stock_balance WHERE zone_id = :z AND batch_id = :b")
                .param("z", zoneId)
                .param("b", batchId)
                .query(Integer.class)
                .single();
    }

    private ZoneInfo zone(long zoneId) {
        return jdbc.sql("SELECT z.warehouse_id, w.branch_id FROM zone z JOIN warehouse w ON w.id = z.warehouse_id WHERE z.id = :z")
                .param("z", zoneId)
                .query((rs, n) -> new ZoneInfo(rs.getLong("warehouse_id"), rs.getLong("branch_id")))
                .optional()
                .orElseThrow(() -> MedixException.badRequest("stock.zoneUnknown"));
    }

    private BatchInfo batch(long batchId) {
        return jdbc.sql("SELECT b.product_id, p.name, b.number FROM batch b JOIN product p ON p.id = b.product_id WHERE b.id = :b")
                .param("b", batchId)
                .query((rs, n) -> new BatchInfo(rs.getLong("product_id"), rs.getString("name"), rs.getString("number")))
                .optional()
                .orElseThrow(() -> MedixException.badRequest("stock.batchUnknown"));
    }
}
