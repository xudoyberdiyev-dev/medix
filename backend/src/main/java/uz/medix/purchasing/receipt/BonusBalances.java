package uz.medix.purchasing.receipt;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * YB bonus balansi sahifasi (SPEC 5.1, 3 «Pul → YB qarzi va bonus balans»): balans faqat jurnaldan (supplier_bonus_ledger),
 * kutilayotgan bonuslar — chegirmali o'tkazilgan, lekin hali «Bonus tasdiqlandi» (BNS) bo'lmagan kirimlar. Filial alohida.
 */
@Service
public class BonusBalances {

    static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    /** Bonus shu kundan ko'p ishlatilmasa — eslatma (SPEC 5.1). */
    public static final int IDLE_DAYS = 30;

    public record BonusRow(long supplierId, String supplier, String tin, String balance, String pending, int pendingCount,
            @Schema(nullable = true, description = "Eng yaqin kutilayotgan bonus olish sanasi") LocalDate nextBonusDate,
            @Schema(nullable = true) Instant lastMoveAt,
            @Schema(nullable = true, description = "Balans musbat va oxirgi harakatdan beri o'tgan kunlar") Integer idleDays) {}

    public record BonusSummary(String balance, String pending, int suppliers, int idle, List<BonusRow> rows) {}

    public record BonusMove(Instant at, String docType, long docId, String docNumber, String amount, String balance,
            @Schema(nullable = true) String employee, @Schema(nullable = true) String note) {}

    public record PendingBonus(long receiptId, String receiptNumber, LocalDate receiptDate, @Schema(nullable = true) LocalDate bonusDate,
            String amount, boolean overdue) {}

    public record BonusDetail(long supplierId, String supplier, String balance, List<BonusMove> moves, List<PendingBonus> pending) {}

    private final JdbcClient jdbc;

    BonusBalances(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static final String PENDING = """
            SELECT r.id, r.number, r.receipt_date, r.discount_date, r.supplier_id,
                   CASE r.discount_kind WHEN 'SUM' THEN r.discount_value ELSE round(r.debt_amount * r.discount_value / 100, 2) END AS amount
            FROM receipt r
            WHERE r.branch_id = :b AND r.status = 'POSTED' AND r.discount_kind IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM supplier_bonus s WHERE s.receipt_id = r.id)""";

    private static LocalDate today() {
        return LocalDate.now(TASHKENT);
    }

    @Transactional(readOnly = true)
    public BonusSummary list(Actor actor, long branchId, String query) {
        if (!actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        String q = query == null || query.isBlank() ? null : "%" + query.strip().toLowerCase() + "%";
        record Raw(long supplierId, String supplier, String tin, BigDecimal balance, BigDecimal pending, int pendingCount,
                java.sql.Date nextBonusDate, java.sql.Timestamp lastMoveAt) {}
        List<Raw> raw = jdbc.sql("""
                WITH led AS (SELECT supplier_id, sum(amount) AS balance, max(occurred_at) AS last_move
                             FROM supplier_bonus_ledger WHERE branch_id = :b GROUP BY supplier_id),
                     pen AS (SELECT supplier_id, sum(amount) AS pending, count(*) AS cnt, min(discount_date) AS next_date
                             FROM (""" + PENDING + """
                             ) p GROUP BY supplier_id)
                SELECT c.id AS supplier_id, c.name AS supplier, c.tin, coalesce(led.balance, 0) AS balance, coalesce(pen.pending, 0) AS pending,
                       coalesce(pen.cnt, 0)::int AS pending_count, pen.next_date AS next_bonus_date, led.last_move AS last_move_at
                FROM counterparty c LEFT JOIN led ON led.supplier_id = c.id LEFT JOIN pen ON pen.supplier_id = c.id
                WHERE (led.supplier_id IS NOT NULL OR pen.supplier_id IS NOT NULL)
                  AND (CAST(:q AS text) IS NULL OR lower(c.name) LIKE :q OR c.tin LIKE :q)
                ORDER BY coalesce(led.balance, 0) DESC, c.name""")
                .param("b", branchId)
                .param("q", q)
                .query((rs, n) -> new Raw(rs.getLong("supplier_id"), rs.getString("supplier"), rs.getString("tin"), rs.getBigDecimal("balance"),
                        rs.getBigDecimal("pending"), rs.getInt("pending_count"), rs.getDate("next_bonus_date"), rs.getTimestamp("last_move_at")))
                .list();
        Money balance = Money.ZERO;
        Money pending = Money.ZERO;
        int idle = 0;
        List<BonusRow> rows = new ArrayList<>();
        for (Raw r : raw) {
            Money b = new Money(r.balance());
            Money p = new Money(r.pending());
            balance = balance.plus(b);
            pending = pending.plus(p);
            Instant last = r.lastMoveAt() == null ? null : r.lastMoveAt().toInstant();
            Integer idleDays = idleDays(b, last);
            if (idleDays != null && idleDays >= IDLE_DAYS) {
                idle++;
            }
            rows.add(new BonusRow(r.supplierId(), r.supplier(), r.tin(), b.toString(), p.toString(), r.pendingCount(),
                    r.nextBonusDate() == null ? null : r.nextBonusDate().toLocalDate(), last, idleDays));
        }
        return new BonusSummary(balance.toString(), pending.toString(), rows.size(), idle, rows);
    }

    static Integer idleDays(Money balance, Instant lastMove) {
        if (!balance.isPositive() || lastMove == null) {
            return null;
        }
        return (int) ChronoUnit.DAYS.between(lastMove.atZone(TASHKENT).toLocalDate(), today());
    }

    @Transactional(readOnly = true)
    public BonusDetail detail(Actor actor, long branchId, long supplierId) {
        if (!actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        String supplier = jdbc.sql("SELECT name FROM counterparty WHERE id = :s AND is_supplier").param("s", supplierId).query(String.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        record M(java.sql.Timestamp at, String docType, long docId, String docNumber, BigDecimal amount, String employee, String note) {}
        List<M> raw = jdbc.sql("""
                SELECT l.occurred_at AS at, l.doc_type, l.doc_id, l.doc_number, l.amount, e.full_name AS employee, l.note
                FROM supplier_bonus_ledger l LEFT JOIN employee e ON e.id = l.employee_id
                WHERE l.branch_id = :b AND l.supplier_id = :s ORDER BY l.occurred_at, l.id""")
                .param("b", branchId)
                .param("s", supplierId)
                .query(M.class)
                .list();
        Money running = Money.ZERO;
        List<BonusMove> moves = new ArrayList<>();
        for (M m : raw) {
            running = running.plus(new Money(m.amount()));
            moves.add(new BonusMove(m.at().toInstant(), m.docType(), m.docId(), m.docNumber(), new Money(m.amount()).toString(), running.toString(),
                    m.employee(), m.note()));
        }
        LocalDate today = today();
        List<PendingBonus> pending = jdbc.sql(PENDING + " AND r.supplier_id = :s ORDER BY r.discount_date NULLS LAST, r.receipt_date, r.id")
                .param("b", branchId)
                .param("s", supplierId)
                .query((rs, n) -> {
                    LocalDate due = rs.getDate("discount_date") == null ? null : rs.getDate("discount_date").toLocalDate();
                    return new PendingBonus(rs.getLong("id"), rs.getString("number"), rs.getDate("receipt_date").toLocalDate(), due,
                            new Money(rs.getBigDecimal("amount")).toString(), due != null && due.isBefore(today));
                })
                .list();
        return new BonusDetail(supplierId, supplier, running.toString(), List.copyOf(moves), pending);
    }
}
