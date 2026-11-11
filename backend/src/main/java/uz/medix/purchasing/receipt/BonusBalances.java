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
import uz.medix.purchasing.receipt.ReceiptModels.DiscountKind;
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

    public enum BonusState { PENDING, CONFIRMED, DECLINED }

    public record BonusReceiptRow(long receiptId, String receiptNumber, LocalDate receiptDate, long branchId, String branch, long supplierId,
            String supplier, @Schema(description = "Kirim summasi (chegirma bazasi)") String receiptSum, String amount,
            @Schema(nullable = true, description = "Foizli chegirma — foiz") String percent,
            @Schema(nullable = true, description = "Bonus olish sanasi") LocalDate bonusDate,
            @Schema(nullable = true, description = "Olish sanasigacha kunlar (manfiy — kechikkan)") Integer days, BonusState state,
            @Schema(nullable = true) String bnsNumber, @Schema(nullable = true) String declineReason) {}

    public record BonusBalanceRow(long branchId, String branch, long supplierId, String supplier, String balance, String pending,
            int pendingCount, boolean idle) {}

    public record BonusReceipts(LocalDate today, List<BonusReceiptRow> rows, List<BonusBalanceRow> balances) {}

    private final JdbcClient jdbc;

    BonusBalances(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static final String PENDING = """
            SELECT r.id, r.number, r.receipt_date, r.discount_date, r.supplier_id,
                   CASE r.discount_kind WHEN 'SUM' THEN r.discount_value ELSE round(r.debt_amount * r.discount_value / 100, 2) END AS amount
            FROM receipt r
            WHERE r.branch_id = :b AND r.status = 'POSTED' AND r.discount_kind IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM supplier_bonus s WHERE s.receipt_id = r.id)
              AND NOT EXISTS (SELECT 1 FROM supplier_bonus_decline sd WHERE sd.receipt_id = r.id)""";

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

    /**
     * Bonus balans yorligʻi (prototip Payables → Bonus balans): chegirmali barcha oʻtkazilgan kirimlar holati bilan (kutilmoqda /
     * tasdiqlandi BNS / berilmadi) va YB × filial boʻyicha balanslar. Filial berilmasa — xodimning doirasi.
     */
    @Transactional(readOnly = true)
    public BonusReceipts receipts(Actor actor, Long branchId) {
        if (branchId != null && !actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        Long scope = branchId != null ? branchId : actor.allBranches() ? null : actor.branchId();
        LocalDate today = today();
        if (scope == null && !actor.allBranches()) {
            return new BonusReceipts(today, List.of(), List.of());
        }
        List<BonusReceiptRow> rows = jdbc.sql("""
                SELECT r.id, r.number, r.receipt_date, r.branch_id, b.name AS branch, r.supplier_id, c.name AS supplier, r.debt_amount,
                       r.discount_kind, r.discount_value, r.discount_date, sb.number AS bns_number, sb.amount AS bns_amount, sd.reason
                FROM receipt r JOIN branch b ON b.id = r.branch_id JOIN counterparty c ON c.id = r.supplier_id
                     LEFT JOIN supplier_bonus sb ON sb.receipt_id = r.id LEFT JOIN supplier_bonus_decline sd ON sd.receipt_id = r.id
                WHERE r.status = 'POSTED' AND r.discount_kind IS NOT NULL AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b)
                ORDER BY (sb.id IS NULL AND sd.id IS NULL) DESC, r.discount_date NULLS LAST, r.receipt_date DESC, r.id DESC
                LIMIT 2000""")
                .param("b", scope)
                .query((rs, n) -> {
                    BigDecimal base = rs.getBigDecimal("debt_amount") == null ? BigDecimal.ZERO : rs.getBigDecimal("debt_amount");
                    boolean percent = DiscountKind.valueOf(rs.getString("discount_kind")) == DiscountKind.PERCENT;
                    BigDecimal value = rs.getBigDecimal("discount_value");
                    Money amount = rs.getBigDecimal("bns_amount") != null ? new Money(rs.getBigDecimal("bns_amount"))
                            : percent ? new Money(base.multiply(value).movePointLeft(2)) : new Money(value);
                    BonusState state = rs.getString("bns_number") != null ? BonusState.CONFIRMED
                            : rs.getString("reason") != null ? BonusState.DECLINED : BonusState.PENDING;
                    LocalDate due = rs.getDate("discount_date") == null ? null : rs.getDate("discount_date").toLocalDate();
                    return new BonusReceiptRow(rs.getLong("id"), rs.getString("number"), rs.getDate("receipt_date").toLocalDate(), rs.getLong("branch_id"),
                            rs.getString("branch"), rs.getLong("supplier_id"), rs.getString("supplier"), new Money(base).toString(), amount.toString(),
                            percent ? value.stripTrailingZeros().toPlainString() : null, due,
                            due == null ? null : (int) ChronoUnit.DAYS.between(today, due), state, rs.getString("bns_number"), rs.getString("reason"));
                })
                .list();
        List<BonusBalanceRow> balances = jdbc.sql("""
                WITH led AS (SELECT branch_id, supplier_id, sum(amount) AS balance, max(occurred_at) AS last_move
                             FROM supplier_bonus_ledger WHERE (CAST(:b AS BIGINT) IS NULL OR branch_id = :b) GROUP BY branch_id, supplier_id),
                     pen AS (SELECT r.branch_id, r.supplier_id, count(*) AS cnt,
                                    sum(CASE r.discount_kind WHEN 'SUM' THEN r.discount_value ELSE round(r.debt_amount * r.discount_value / 100, 2) END) AS pending
                             FROM receipt r
                             WHERE r.status = 'POSTED' AND r.discount_kind IS NOT NULL AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b)
                               AND NOT EXISTS (SELECT 1 FROM supplier_bonus s WHERE s.receipt_id = r.id)
                               AND NOT EXISTS (SELECT 1 FROM supplier_bonus_decline sd WHERE sd.receipt_id = r.id)
                             GROUP BY r.branch_id, r.supplier_id),
                     k AS (SELECT branch_id, supplier_id FROM led UNION SELECT branch_id, supplier_id FROM pen)
                SELECT k.branch_id, b.name AS branch, k.supplier_id, c.name AS supplier, coalesce(led.balance, 0) AS balance,
                       coalesce(pen.pending, 0) AS pending, coalesce(pen.cnt, 0)::int AS cnt, led.last_move
                FROM k JOIN branch b ON b.id = k.branch_id JOIN counterparty c ON c.id = k.supplier_id
                     LEFT JOIN led ON led.branch_id = k.branch_id AND led.supplier_id = k.supplier_id
                     LEFT JOIN pen ON pen.branch_id = k.branch_id AND pen.supplier_id = k.supplier_id
                ORDER BY coalesce(led.balance, 0) DESC, coalesce(pen.pending, 0) DESC, c.name, b.name""")
                .param("b", scope)
                .query((rs, n) -> {
                    Money balance = new Money(rs.getBigDecimal("balance"));
                    Instant last = rs.getTimestamp("last_move") == null ? null : rs.getTimestamp("last_move").toInstant();
                    Integer idleDays = idleDays(balance, last);
                    return new BonusBalanceRow(rs.getLong("branch_id"), rs.getString("branch"), rs.getLong("supplier_id"), rs.getString("supplier"),
                            balance.toString(), new Money(rs.getBigDecimal("pending")).toString(), rs.getInt("cnt"),
                            idleDays != null && idleDays >= IDLE_DAYS);
                })
                .list();
        return new BonusReceipts(today, rows, balances);
    }
}
