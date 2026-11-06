package uz.medix.reporting.suppliers;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * Ta'minotchi xodim tovari («Kim nomiga» — kirim egasi) va Ta'minotchi korxona tovari (SPEC 3, 6, 8), tannarxda: davrda olib keldi
 * (kirim), sotildi (sotuv − qaytarish), boshqa chiqim (hisobdan o'tkazish va h.k.), hozir qoldi. Bosh sahifa blokidagi bilan bir manba,
 * lekin to'liq ro'yxat. Aktiv — davrda kirim qilgan; Passiv — davrda kirim yo'q, qoldig'i bor.
 */
@Service
class SupplierGoodsReport {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    static final int MAX_ROWS = 2000;

    public enum Kind {
        /** receipt.owner_id → employee */
        STAFF("owner_id", "JOIN employee p ON p.id = x.party", "p.full_name"),
        /** receipt.supplier_id → counterparty */
        COMPANY("supplier_id", "JOIN counterparty p ON p.id = x.party", "p.name");

        final String column;
        final String join;
        final String name;

        Kind(String column, String join, String name) {
            this.column = column;
            this.join = join;
            this.name = name;
        }
    }

    public record SupplierGoodsRow(long id, String name, @Schema(description = "Davrda kirim qilgan — Aktiv, aks holda Passiv") boolean active,
            String brought, String sold, @Schema(description = "Boshqa chiqim: hisobdan o'tkazish va h.k.") String other, String left) {}

    public record SupplierGoodsView(Kind kind, LocalDate from, LocalDate to, @Schema(nullable = true) Long branchId,
            List<SupplierGoodsRow> rows, SupplierGoodsRow total, boolean truncated) {}

    private record Raw(long id, String name, BigDecimal brought, BigDecimal sold, BigDecimal other, BigDecimal remain) {}

    private final JdbcClient jdbc;
    private final Clock clock;

    SupplierGoodsReport(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public SupplierGoodsView report(Actor actor, Kind kind, Long requestedBranch, LocalDate from, LocalDate to) {
        Long branchId = requestedBranch == null && !actor.allBranches() ? actor.branchId() : requestedBranch;
        if (branchId == null ? !actor.allBranches() : !actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
        LocalDate t = to == null ? today : to;
        LocalDate f = from == null ? t.withDayOfMonth(1) : from;
        if (f.isAfter(t)) {
            throw MedixException.badRequest("home.periodInvalid");
        }
        if (f.plusDays(366).isBefore(t)) {
            throw MedixException.badRequest("home.periodTooLong");
        }
        List<Raw> raw = jdbc.sql("""
                WITH src AS (SELECT b.id AS batch_id, b.cost, r.%1$s AS party
                             FROM batch b JOIN receipt_line l ON l.id = b.source_id JOIN receipt r ON r.id = l.receipt_id
                             WHERE b.source_type = 'KR' AND r.%1$s IS NOT NULL AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b)),
                     mv AS (SELECT m.batch_id,
                                   sum(m.qty) FILTER (WHERE m.doc_type = 'KR') AS brought,
                                   -sum(m.qty) FILTER (WHERE m.doc_type IN ('SV', 'QM')) AS sold,
                                   -sum(m.qty) FILTER (WHERE m.doc_type NOT IN ('KR', 'SV', 'QM')) AS other
                            FROM stock_move m JOIN src ON src.batch_id = m.batch_id
                            WHERE CAST(m.occurred_at AT TIME ZONE 'Asia/Tashkent' AS DATE) BETWEEN :f AND :t
                            GROUP BY m.batch_id),
                     bal AS (SELECT sb.batch_id, sum(sb.qty) AS qty FROM stock_balance sb JOIN src ON src.batch_id = sb.batch_id GROUP BY sb.batch_id),
                     x AS (SELECT src.party, sum(coalesce(mv.brought, 0) * src.cost) AS brought, sum(coalesce(mv.sold, 0) * src.cost) AS sold,
                                  sum(coalesce(mv.other, 0) * src.cost) AS other, sum(coalesce(bal.qty, 0) * src.cost) AS remain
                           FROM src LEFT JOIN mv ON mv.batch_id = src.batch_id LEFT JOIN bal ON bal.batch_id = src.batch_id
                           GROUP BY src.party)
                SELECT x.party AS id, %2$s AS name, x.brought, x.sold, x.other, x.remain
                FROM x %3$s
                WHERE x.brought <> 0 OR x.sold <> 0 OR x.other <> 0 OR x.remain <> 0
                ORDER BY x.brought DESC, x.remain DESC, name
                LIMIT :lim""".formatted(kind.column, kind.name, kind.join))
                .param("b", branchId).param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("lim", MAX_ROWS + 1)
                .query((rs, n) -> new Raw(rs.getLong("id"), rs.getString("name"), rs.getBigDecimal("brought"), rs.getBigDecimal("sold"),
                        rs.getBigDecimal("other"), rs.getBigDecimal("remain")))
                .list();
        boolean truncated = raw.size() > MAX_ROWS;
        List<Raw> shown = truncated ? raw.subList(0, MAX_ROWS) : raw;
        Money brought = Money.ZERO;
        Money sold = Money.ZERO;
        Money other = Money.ZERO;
        Money left = Money.ZERO;
        for (Raw r : raw) {
            brought = brought.plus(m(r.brought()));
            sold = sold.plus(m(r.sold()));
            other = other.plus(m(r.other()));
            left = left.plus(m(r.remain()));
        }
        List<SupplierGoodsRow> rows = shown.stream()
                .map(r -> new SupplierGoodsRow(r.id(), r.name(), m(r.brought()).isPositive(), m(r.brought()).toString(), m(r.sold()).toString(),
                        m(r.other()).toString(), m(r.remain()).toString()))
                .toList();
        SupplierGoodsRow total = new SupplierGoodsRow(0, "Jami", brought.isPositive(), brought.toString(), sold.toString(), other.toString(),
                left.toString());
        return new SupplierGoodsView(kind, f, t, branchId, rows, total, truncated);
    }

    private static Money m(BigDecimal v) {
        return new Money(v == null ? BigDecimal.ZERO : v);
    }
}
