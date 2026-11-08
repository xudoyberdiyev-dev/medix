package uz.medix.reporting.home;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.DebtSummaries;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.reporting.home.DirectorHome.DebtCard;
import uz.medix.reporting.home.DirectorHome.Debtor;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/**
 * Xarid bosh sahifasi (SPEC 2, 8): qabul / o'tkazish kutayotgan kirimlar, YB qarzi va to'lov kunlari, bonus (balans va tasdiq kutayotgan
 * chegirmalar), «O'z nomimdagi tovar». Tannarx bu sahifada ko'rsatilmaydi (SPEC 2: Xarid tannarxni faqat Narxlar sahifasida ko'radi) —
 * o'z nomidagi tovar donada.
 */
@Service
class PurchaserHome {

    private static final int TOP = 5;

    /** toAcceptNumbers / toPostNumbers — prototip: hujjat raqamlari (eng eski 5 ta). */
    record ReceiptCounts(int toAccept, int toAcceptMine, int toPost, int toPostMine, List<String> toAcceptNumbers, List<String> toPostNumbers) {}

    /** Summa va ochiq kirimlar soni: kechikkan / bugun / 3 kun ichida. */
    record PaymentDue(String overdue, String today, String next3Days, int overdueCount, int todayCount, int next3Count) {}

    /** Bonus eslatmasi (prototip): bonus sanasi o'tgan yoki 3 kun ichida — YB, kirim, sana, summa. */
    record BonusDue(long receiptId, String supplier, String number, LocalDate date, String amount) {}

    /** O'z nomidagi tovar (prototip): olib keldi (kirimlar soni), sotildi (oxirgi sotuv), qoldi, boshqa harakat, aktiv (30 kunda sotuv). */
    record OwnMoves(int receipts, long soldQty, long otherQty, @Schema(nullable = true) LocalDate lastSale, boolean active) {}

    record BonusInfo(String balance, int pending, int pendingOverdue) {}

    record OwnGoods(int products, long broughtQty, long leftQty, int expiring90) {}

    record PurchaserHomeView(LocalDate today, @Schema(nullable = true) Long branchId, ReceiptCounts receipts, DebtCard supplierDebt,
            PaymentDue due, List<Debtor> topSuppliers, BonusInfo bonus, OwnGoods ownGoods, List<BonusDue> bonusDue, OwnMoves ownMoves) {}

    private final JdbcClient jdbc;
    private final DebtSummaries debts;
    private final DirectorHome director;

    PurchaserHome(JdbcClient jdbc, DebtSummaries debts, DirectorHome director) {
        this.jdbc = jdbc;
        this.debts = debts;
        this.director = director;
    }

    @Transactional(readOnly = true)
    PurchaserHomeView home(Actor actor, Long requestedBranch) {
        Long branchId = requestedBranch == null && !actor.allBranches() ? actor.branchId() : requestedBranch;
        if (branchId == null ? !actor.allBranches() : !actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        LocalDate today = director.today();
        long me = actor.employeeId();

        ReceiptCounts receipts = jdbc.sql("""
                SELECT count(*) FILTER (WHERE status = 'DRAFT') AS a, count(*) FILTER (WHERE status = 'DRAFT' AND created_by = :e) AS am,
                       count(*) FILTER (WHERE status = 'ACCEPTED') AS p, count(*) FILTER (WHERE status = 'ACCEPTED' AND created_by = :e) AS pm
                FROM receipt WHERE status IN ('DRAFT', 'ACCEPTED') AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)""")
                .param("e", me).param("b", branchId)
                .query((rs, n) -> new ReceiptCounts(rs.getInt("a"), rs.getInt("am"), rs.getInt("p"), rs.getInt("pm"), numbers("DRAFT", branchId),
                        numbers("ACCEPTED", branchId)))
                .single();

        DebtSummaries.Summary s = debts.summary(actor, Side.SUPPLIER, branchId, TOP);
        DebtSummaries.DueSoon due = debts.supplierDue(actor, branchId, today);
        List<Debtor> top = s.top().stream().map(x -> new Debtor(x.counterpartyId(), x.name(), x.debt(), x.overdue(), x.maxOverdueDays(), "")).toList();

        String balance = DirectorHome.m(jdbc.sql("""
                SELECT coalesce(sum(amount), 0) FROM supplier_bonus_ledger WHERE (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)""")
                .param("b", branchId).query(BigDecimal.class).single()).toString();
        BonusInfo bonus = jdbc.sql("""
                SELECT count(*) AS p, count(*) FILTER (WHERE r.discount_date < :d) AS o
                FROM receipt r
                WHERE r.status = 'POSTED' AND r.discount_kind IS NOT NULL AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b)
                  AND NOT EXISTS (SELECT 1 FROM supplier_bonus sb WHERE sb.receipt_id = r.id)""")
                .param("d", Date.valueOf(today)).param("b", branchId)
                .query((rs, n) -> new BonusInfo(balance, rs.getInt("p"), rs.getInt("o")))
                .single();

        // O'z nomimdagi tovar: «Kim nomiga» = shu xodim bo'lgan kirimlar partiyalari (barcha filiallar emas — tanlangan doira)
        OwnGoods own = jdbc.sql("""
                WITH src AS (SELECT b.id AS batch_id, b.product_id, b.expiry_date
                             FROM batch b JOIN receipt_line l ON l.id = b.source_id JOIN receipt r ON r.id = l.receipt_id
                             WHERE b.source_type = 'KR' AND r.owner_id = :e AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b)),
                     brought AS (SELECT coalesce(sum(m.qty), 0) AS q FROM stock_move m JOIN src ON src.batch_id = m.batch_id WHERE m.doc_type = 'KR'),
                     bal AS (SELECT src.product_id, src.expiry_date, sum(sb.qty) AS q
                             FROM stock_balance sb JOIN src ON src.batch_id = sb.batch_id GROUP BY src.batch_id, src.product_id, src.expiry_date)
                SELECT (SELECT count(DISTINCT product_id) FROM bal WHERE q > 0) AS products,
                       (SELECT q FROM brought) AS brought,
                       (SELECT coalesce(sum(q), 0) FROM bal) AS lft,
                       (SELECT count(*) FROM bal WHERE q > 0 AND expiry_date <= CAST(:d AS DATE) + 90) AS expiring""")
                .param("e", me).param("b", branchId).param("d", Date.valueOf(today))
                .query((rs, n) -> new OwnGoods(rs.getInt("products"), rs.getLong("brought"), rs.getLong("lft"), rs.getInt("expiring")))
                .single();

        // Ochiq kirimlar soni to'lov kuni bo'yicha (Debts.due bilan bir qoida)
        record Counts(int o, int t, int s3) {}
        Counts cnt = jdbc.sql("""
                WITH own AS (SELECT branch_id, counterparty_id, doc_type, doc_id, min(due_date) AS due, sum(amount) AS amt
                             FROM party_ledger WHERE side = 'SUPPLIER' AND applies_doc_type IS NULL AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)
                             GROUP BY branch_id, counterparty_id, doc_type, doc_id),
                     app AS (SELECT branch_id, counterparty_id, applies_doc_type AS t, applies_doc_id AS i, sum(amount) AS amt
                             FROM party_ledger WHERE side = 'SUPPLIER' AND applies_doc_type IS NOT NULL AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)
                             GROUP BY branch_id, counterparty_id, applies_doc_type, applies_doc_id),
                     open AS (SELECT own.due, own.amt + coalesce(app.amt, 0) AS open
                              FROM own LEFT JOIN app ON app.branch_id = own.branch_id AND app.counterparty_id = own.counterparty_id
                                                    AND app.t = own.doc_type AND app.i = own.doc_id)
                SELECT count(*) FILTER (WHERE due < :d) AS o, count(*) FILTER (WHERE due = :d) AS t,
                       count(*) FILTER (WHERE due > :d AND due <= :d3) AS s3
                FROM open WHERE open > 0 AND due IS NOT NULL""")
                .param("b", branchId).param("d", Date.valueOf(today)).param("d3", Date.valueOf(today.plusDays(3)))
                .query((rs, n) -> new Counts(rs.getInt("o"), rs.getInt("t"), rs.getInt("s3"))).single();

        List<BonusDue> bonusDue = jdbc.sql("""
                SELECT r.id, c.name AS supplier, r.number, r.discount_date,
                       CASE r.discount_kind WHEN 'SUM' THEN r.discount_value ELSE round(r.debt_amount * r.discount_value / 100, 2) END AS amount
                FROM receipt r JOIN counterparty c ON c.id = r.supplier_id
                WHERE r.status = 'POSTED' AND r.discount_kind IS NOT NULL AND r.discount_date <= :d3
                  AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b)
                  AND NOT EXISTS (SELECT 1 FROM supplier_bonus sb WHERE sb.receipt_id = r.id)
                ORDER BY r.discount_date, r.number LIMIT 10""")
                .param("d3", Date.valueOf(today.plusDays(3))).param("b", branchId)
                .query((rs, n) -> new BonusDue(rs.getLong("id"), rs.getString("supplier"), rs.getString("number"),
                        rs.getDate("discount_date").toLocalDate(), DirectorHome.m(rs.getBigDecimal("amount")).toString()))
                .list();

        OwnMoves moves = jdbc.sql("""
                WITH src AS (SELECT b.id AS batch_id, r.id AS receipt_id
                             FROM batch b JOIN receipt_line l ON l.id = b.source_id JOIN receipt r ON r.id = l.receipt_id
                             WHERE b.source_type = 'KR' AND r.owner_id = :e AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b))
                SELECT (SELECT count(DISTINCT receipt_id) FROM src) AS receipts,
                       coalesce(-sum(m.qty) FILTER (WHERE m.doc_type IN ('SV', 'QM')), 0) AS sold,
                       coalesce(-sum(m.qty) FILTER (WHERE m.doc_type NOT IN ('KR', 'SV', 'QM') AND m.qty < 0), 0) AS other,
                       max((m.occurred_at AT TIME ZONE 'Asia/Tashkent')::date) FILTER (WHERE m.doc_type = 'SV') AS last_sale
                FROM src LEFT JOIN stock_move m ON m.batch_id = src.batch_id""")
                .param("e", me).param("b", branchId)
                .query((rs, n) -> {
                    java.sql.Date last = rs.getDate("last_sale");
                    LocalDate ls = last == null ? null : last.toLocalDate();
                    return new OwnMoves(rs.getInt("receipts"), rs.getLong("sold"), rs.getLong("other"), ls,
                            ls != null && !ls.isBefore(today.minusDays(29)));
                })
                .single();

        return new PurchaserHomeView(today, branchId, receipts, new DebtCard(s.debt(), s.overdue(), s.advance()),
                new PaymentDue(due.overdue(), due.today(), due.next3Days(), cnt.o(), cnt.t(), cnt.s3()), top, bonus, own, bonusDue, moves);
    }

    private List<String> numbers(String status, Long branchId) {
        return jdbc.sql("""
                SELECT number FROM receipt WHERE status = :s AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b) ORDER BY created_at, id LIMIT 5""")
                .param("s", status).param("b", branchId).query(String.class).list();
    }
}
