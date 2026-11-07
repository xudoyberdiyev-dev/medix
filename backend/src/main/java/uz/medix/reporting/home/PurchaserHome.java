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

    record ReceiptCounts(int toAccept, int toAcceptMine, int toPost, int toPostMine) {}

    record PaymentDue(String overdue, String today, String next3Days) {}

    record BonusInfo(String balance, int pending, int pendingOverdue) {}

    record OwnGoods(int products, long broughtQty, long leftQty, int expiring90) {}

    record PurchaserHomeView(LocalDate today, @Schema(nullable = true) Long branchId, ReceiptCounts receipts, DebtCard supplierDebt,
            PaymentDue due, List<Debtor> topSuppliers, BonusInfo bonus, OwnGoods ownGoods) {}

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
                .query((rs, n) -> new ReceiptCounts(rs.getInt("a"), rs.getInt("am"), rs.getInt("p"), rs.getInt("pm")))
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

        return new PurchaserHomeView(today, branchId, receipts, new DebtCard(s.debt(), s.overdue(), s.advance()),
                new PaymentDue(due.overdue(), due.today(), due.next3Days()), top, bonus, own);
    }
}
