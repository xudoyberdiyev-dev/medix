package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.media.Schema;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.order.MarkingModels.MarkKind;
import uz.medix.sales.order.MarkingModels.MarkStatus;
import uz.medix.sales.order.OrderModels.CodesOwner;
import uz.medix.sales.order.ReserveCodeModels.ReserveStatus;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/**
 * O10g «Markirovka kodlari» hisoboti: davr (skanerlangan sana, Toshkent), mijoz, mahsulot, egasi (mijoz / zaxira), holat; Excel.
 * Olib tashlangan (REMOVED) kodlar faqat holat filtri bilan so'ralganda ko'rinadi. Filial filtri serverda.
 */
@Service
class MarkingCodeReport {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final Clock clock;

    MarkingCodeReport(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    record CodeFilter(Long branchId, LocalDate from, LocalDate to, Long customerId, Long productId, CodesOwner owner, MarkStatus status,
            String q) {}

    record ReportCode(
            long id,
            @Schema(description = "To'liq skanerlangan kod (kripto-qismi bilan)") String scanned,
            String gtin,
            String serial,
            long productId,
            String productName,
            @Schema(nullable = true) String batch,
            @Schema(nullable = true) LocalDate expiryDate,
            MarkKind kind,
            long orderId,
            String orderNumber,
            long customerId,
            String customer,
            String branch,
            CodesOwner owner,
            MarkStatus status,
            @Schema(nullable = true, description = "Zaxira kodi holati (zaxiraga tushgan bo'lsa)") ReserveStatus reserveStatus,
            Instant scannedAt) {}

    record ReportCodePage(List<ReportCode> items, long total, int page, int size, LocalDate from, LocalDate to,
            @Schema(description = "Egasi bo'yicha (boshqa filtrlar bilan)") long customerOwned, long reserveOwned,
            @Schema(description = "Sotilgan kodlar (boshqa filtrlar bilan)") long sold) {}

    private static final String SELECT = """
            SELECT m.id, coalesce(m.scanned_raw, m.raw) AS scanned, m.gtin, m.serial, m.batch_no, coalesce(m.expiry_date, bt.expiry_date) AS expiry,
                   m.kind, m.status, m.scanned_at, p.id AS product_id, p.name AS product, o.id AS order_id, o.number AS order_number,
                   c.id AS customer_id, c.name AS customer, b.name AS branch, z.status AS reserve_status,
            """ + CodesOwners.EFFECTIVE + " AS owner";

    private static final String FROM = """
             FROM sales_order_mark m JOIN sales_order o ON o.id = m.order_id JOIN sales_order_line l ON l.id = m.line_id
            JOIN product p ON p.id = l.product_id JOIN batch bt ON bt.id = m.batch_id JOIN counterparty c ON c.id = o.customer_id
            JOIN branch b ON b.id = o.branch_id LEFT JOIN reserve_code z ON z.mark_id = m.id
            """;

    @Transactional(readOnly = true)
    ReportCodePage report(Actor actor, CodeFilter f, int page, int size) {
        LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
        LocalDate to = f.to() == null ? today : f.to();
        LocalDate from = f.from() == null ? to.withDayOfMonth(1) : f.from();
        if (from.isAfter(to)) {
            throw MedixException.badRequest("home.periodInvalid");
        }
        if (from.plusDays(366).isBefore(to)) {
            throw MedixException.badRequest("home.periodTooLong");
        }
        StringBuilder where = new StringBuilder(" WHERE m.scanned_at >= :from AND m.scanned_at < :to");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("from", Timestamp.from(from.atStartOfDay(TASHKENT).toInstant()));
        params.put("to", Timestamp.from(to.plusDays(1).atStartOfDay(TASHKENT).toInstant()));
        if (!actor.allBranches()) {
            where.append(" AND o.branch_id = :branch");
            params.put("branch", actor.branchId());
        } else if (f.branchId() != null) {
            where.append(" AND o.branch_id = :branch");
            params.put("branch", f.branchId());
        }
        if (f.customerId() != null) {
            where.append(" AND o.customer_id = :customer");
            params.put("customer", f.customerId());
        }
        if (f.productId() != null) {
            where.append(" AND l.product_id = :product");
            params.put("product", f.productId());
        }
        if (f.q() != null && !f.q().isBlank()) {
            where.append(" AND (m.gtin LIKE :q OR upper(m.serial) LIKE :q OR o.number LIKE :q OR upper(p.name) LIKE :q OR upper(c.name) LIKE :q)");
            params.put("q", "%" + f.q().strip().toUpperCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        if (f.status() != null) {
            where.append(" AND m.status = :status");
            params.put("status", f.status().name());
        } else {
            where.append(" AND m.status <> 'REMOVED'");
        }
        record Counts(long customer, long reserve, long sold) {}
        Counts counts = jdbc.sql("SELECT count(*) FILTER (WHERE " + CodesOwners.EFFECTIVE + " = 'CUSTOMER') AS cu, count(*) FILTER (WHERE "
                        + CodesOwners.EFFECTIVE + " = 'RESERVE') AS re, count(*) FILTER (WHERE m.status = 'SOLD') AS so" + FROM + where)
                .params(params)
                .query((rs, n) -> new Counts(rs.getLong("cu"), rs.getLong("re"), rs.getLong("so")))
                .single();
        if (f.owner() != null) {
            where.append(" AND ").append(CodesOwners.EFFECTIVE).append(" = :owner");
            params.put("owner", f.owner().name());
        }
        long total = jdbc.sql("SELECT count(*)" + FROM + where).params(params).query(Long.class).single();
        List<ReportCode> items = jdbc.sql(SELECT + FROM + where + " ORDER BY m.scanned_at DESC, m.id DESC LIMIT :lim OFFSET :off")
                .params(params)
                .param("lim", size)
                .param("off", (long) page * size)
                .query((rs, n) -> new ReportCode(rs.getLong("id"), rs.getString("scanned"), rs.getString("gtin"), rs.getString("serial"),
                        rs.getLong("product_id"), rs.getString("product"), rs.getString("batch_no"),
                        rs.getDate("expiry") == null ? null : rs.getDate("expiry").toLocalDate(),
                        "Q".equals(rs.getString("kind")) ? MarkKind.BOX : MarkKind.UNIT, rs.getLong("order_id"), rs.getString("order_number"),
                        rs.getLong("customer_id"), rs.getString("customer"), rs.getString("branch"), CodesOwner.valueOf(rs.getString("owner")),
                        MarkStatus.valueOf(rs.getString("status")),
                        rs.getString("reserve_status") == null ? null : ReserveStatus.valueOf(rs.getString("reserve_status")),
                        rs.getTimestamp("scanned_at").toInstant()))
                .list();
        return new ReportCodePage(items, total, page, size, from, to, counts.customer(), counts.reserve(), counts.sold());
    }
}
