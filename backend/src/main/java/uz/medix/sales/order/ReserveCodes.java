package uz.medix.sales.order;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.order.ReserveCodeModels.ReserveCode;
import uz.medix.sales.order.ReserveCodeModels.ReserveCodeFilter;
import uz.medix.sales.order.ReserveCodeModels.ReserveCodePage;
import uz.medix.sales.order.ReserveCodeModels.ReserveStatus;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/**
 * O10c «Zaxira kodlar»: «Zaxira kodlarga» egali buyurtmalar yetkazilganda tushgan markirovka kodlari.
 * Holat: Zaxirada → Ishlatildi / Hisobdan chiqarildi (izoh bilan, bir marta, audit). Filial filtri serverda.
 */
@Service
class ReserveCodes {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final AuditLog audit;

    ReserveCodes(JdbcClient jdbc, AuditLog audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    private static final String SELECT = """
            SELECT z.id, z.status, z.note, z.created_at, z.changed_at, ch.full_name AS changed_by, b.name AS branch,
                   coalesce(m.scanned_raw, m.raw) AS scanned, m.raw, m.gtin, m.serial, m.batch_no, coalesce(m.expiry_date, bt.expiry_date) AS expiry,
                   m.kind, p.id AS product_id, p.name AS product, o.id AS order_id, o.number AS order_number, c.name AS customer
            """;

    private static final String FROM = """
             FROM reserve_code z JOIN sales_order_mark m ON m.id = z.mark_id JOIN sales_order o ON o.id = m.order_id
            JOIN sales_order_line l ON l.id = m.line_id JOIN product p ON p.id = l.product_id JOIN batch bt ON bt.id = m.batch_id
            JOIN counterparty c ON c.id = o.customer_id JOIN branch b ON b.id = z.branch_id LEFT JOIN employee ch ON ch.id = z.changed_by
            """;

    @Transactional(readOnly = true)
    ReserveCodePage list(Actor actor, ReserveCodeFilter f, int page, int size) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new LinkedHashMap<>();
        if (!actor.allBranches()) {
            where.append(" AND z.branch_id = :branch");
            params.put("branch", actor.branchId());
        } else if (f.branchId() != null) {
            where.append(" AND z.branch_id = :branch");
            params.put("branch", f.branchId());
        }
        if (f.productId() != null) {
            where.append(" AND p.id = :product");
            params.put("product", f.productId());
        }
        if (f.status() != null) {
            where.append(" AND z.status = :status");
            params.put("status", f.status().name());
        }
        if (f.from() != null) {
            where.append(" AND z.created_at >= :from");
            params.put("from", Timestamp.from(f.from().atStartOfDay(TASHKENT).toInstant()));
        }
        if (f.to() != null) {
            where.append(" AND z.created_at < :to");
            params.put("to", Timestamp.from(f.to().plusDays(1).atStartOfDay(TASHKENT).toInstant()));
        }
        if (f.q() != null && !f.q().isBlank()) {
            where.append(" AND (m.gtin LIKE :q OR upper(m.serial) LIKE :q OR upper(m.batch_no) LIKE :q OR o.number LIKE :q OR upper(p.name) LIKE :q)");
            params.put("q", "%" + f.q().strip().toUpperCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        long total = jdbc.sql("SELECT count(*)" + FROM + where).params(params).query(Long.class).single();
        record Count(String status, long n) {}
        Map<String, Long> counts = new LinkedHashMap<>();
        String whereNoStatus = where.toString().replace(" AND z.status = :status", "");
        Map<String, Object> p2 = new LinkedHashMap<>(params);
        p2.remove("status");
        jdbc.sql("SELECT z.status, count(*) AS n" + FROM + whereNoStatus + " GROUP BY z.status").params(p2)
                .query((rs, n) -> new Count(rs.getString("status"), rs.getLong("n"))).list()
                .forEach(c -> counts.put(c.status(), c.n()));
        List<ReserveCode> items = jdbc.sql(SELECT + FROM + where + " ORDER BY z.created_at DESC, z.id DESC LIMIT :lim OFFSET :off")
                .params(params)
                .param("lim", size)
                .param("off", (long) page * size)
                .query((rs, n) -> new ReserveCode(rs.getLong("id"), ReserveStatus.valueOf(rs.getString("status")), rs.getString("scanned"),
                        rs.getString("raw"), rs.getString("gtin"), rs.getString("serial"), rs.getLong("product_id"), rs.getString("product"),
                        rs.getString("batch_no"), rs.getDate("expiry") == null ? null : rs.getDate("expiry").toLocalDate(),
                        "Q".equals(rs.getString("kind")) ? MarkingModels.MarkKind.BOX : MarkingModels.MarkKind.UNIT, rs.getLong("order_id"),
                        rs.getString("order_number"), rs.getString("customer"), rs.getString("branch"), instant(rs.getTimestamp("created_at")),
                        instant(rs.getTimestamp("changed_at")), rs.getString("changed_by"), rs.getString("note")))
                .list();
        return new ReserveCodePage(items, total, page, size, counts.getOrDefault("IN_RESERVE", 0L), counts.getOrDefault("USED", 0L),
                counts.getOrDefault("WRITTEN_OFF", 0L));
    }

    /** «Ishlatildi deb belgilash» / «Hisobdan chiqarish» — faqat «Zaxirada» dan, izoh bilan. */
    @Transactional
    void close(Actor actor, long id, ReserveStatus to, String note) {
        if (to == ReserveStatus.IN_RESERVE) {
            throw MedixException.badRequest("validation.failed");
        }
        record Head(long branchId, String status) {}
        Head h = jdbc.sql("SELECT branch_id, status FROM reserve_code WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("branch_id"), rs.getString("status")))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (!ReserveStatus.IN_RESERVE.name().equals(h.status())) {
            throw MedixException.conflict("zcodes.closed");
        }
        jdbc.sql("UPDATE reserve_code SET status = :s, note = :n, changed_by = :by, changed_at = now() WHERE id = :id")
                .param("s", to.name())
                .param("n", note.strip())
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of(to == ReserveStatus.USED ? "zcode.used" : "zcode.writtenOff", "reserve_code", id)
                .change(Map.of("status", ReserveStatus.IN_RESERVE.name()), Map.of("status", to.name()))
                .withReason(note.strip()));
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
