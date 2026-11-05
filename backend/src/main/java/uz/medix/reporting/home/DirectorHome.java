package uz.medix.reporting.home;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.DebtSummaries;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * Direktor va Admin bosh sahifasi (SPEC 8): 4 karta (Savdo — sof, Mijozlar qarzi, Ta'minotchilarga qarz, Xarajatlar), filiallar kesimi,
 * «Diqqat talab qiladi», eng katta qarzdorlar. Savdo = sotuv − qaytarishlar (QM) − yetkazilmaganlar (bekor qilingan sotuv), QQS bilan
 * (SPEC 6). To'lov turi: Naqd / Perechisleniye / Online — sotuvda buyurtmaning to'lov turi, xarajatda hisob turi (kassa / bank / Terminal).
 * Qarzlar — finance modulining {@link DebtSummaries} API'sidan («Mijozlar qarzi» sahifasi bilan bir manba).
 */
@Service
class DirectorHome {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    private static final int TOP = 5;

    /** Jami va to'lov turi bo'yicha: Naqd / Perechisleniye / Online. */
    record ByPayment(String total, String cash, String transfer, String online) {}

    record DebtCard(String debt, String overdue, String advance) {}

    record BranchRow(long id, String name, String sales, String customerDebt, String supplierDebt, String expenses) {}

    record Debtor(long id, String name, String debt, String overdue, int maxOverdueDays) {}

    record CountAmount(int count, String amount) {}

    record ExpiringBatches(int d0to30, int d31to60, int d61to90, int expired) {}

    record Attention(String overdue1to30, String overdue31to60, String overdue61to90, String overdue90plus, CountAmount directorOrders,
            CountAmount cashApprovals, ExpiringBatches expiring, String supplierOverdue, String supplierToday, String supplierNext3Days,
            int receiptsToPost, String driverCash) {}

    record Home(LocalDate from, LocalDate to, LocalDate today, @Schema(nullable = true) Long branchId, ByPayment sales, DebtCard customerDebt,
            DebtCard supplierDebt, ByPayment expenses, List<BranchRow> branches, Attention attention, List<Debtor> topDebtors) {}

    private final JdbcClient jdbc;
    private final DebtSummaries debts;
    private final Clock clock;

    DirectorHome(JdbcClient jdbc, DebtSummaries debts, Clock clock) {
        this.jdbc = jdbc;
        this.debts = debts;
        this.clock = clock;
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(TASHKENT));
    }

    private static Money m(BigDecimal v) {
        return new Money(v == null ? BigDecimal.ZERO : v);
    }

    /** (filial, to'lov turi) → summa. */
    private record Amount(long branchId, String kind, BigDecimal amount) {}

    @Transactional(readOnly = true)
    Home home(Actor actor, Long branchId, LocalDate from, LocalDate to) {
        if (branchId == null ? !actor.allBranches() : !actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        LocalDate today = today();
        LocalDate t = to == null ? today : to;
        LocalDate f = from == null ? t : from;
        if (f.isAfter(t)) {
            throw MedixException.badRequest("home.periodInvalid");
        }
        if (f.plusDays(366).isBefore(t)) {
            throw MedixException.badRequest("home.periodTooLong");
        }

        // Sof savdo: o'tkazilgan sotuv (bekor qilingan — yetkazilmagan — kirmaydi) − qaytarishlar, davr sanasi bo'yicha
        List<Amount> sales = jdbc.sql("""
                SELECT branch_id, kind, sum(amount) AS amount FROM (
                    SELECT s.branch_id, o.payment_type AS kind, s.total AS amount
                    FROM sale s JOIN sales_order o ON o.id = s.order_id
                    WHERE s.status = 'POSTED' AND s.sale_date BETWEEN :f AND :t AND (CAST(:b AS BIGINT) IS NULL OR s.branch_id = :b)
                    UNION ALL
                    SELECT r.branch_id, o.payment_type, -r.total
                    FROM sales_return r JOIN sales_order o ON o.id = r.order_id
                    WHERE r.return_date BETWEEN :f AND :t AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b)
                ) x GROUP BY branch_id, kind""")
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("b", branchId)
                .query(Amount.class).list();
        // Xarajatlar: o'tkazilgan chiqim (KO/BO, OUT); hisob turi → to'lov turi
        List<Amount> expenses = jdbc.sql("""
                SELECT c.branch_id,
                       CASE a.kind WHEN 'CASH' THEN 'CASH' WHEN 'BANK' THEN 'TRANSFER' ELSE 'ONLINE' END AS kind,
                       sum(c.amount) AS amount
                FROM cash_op c JOIN money_account a ON a.id = c.account_id
                WHERE c.direction = 'OUT' AND c.status = 'POSTED' AND c.op_date BETWEEN :f AND :t
                  AND (CAST(:b AS BIGINT) IS NULL OR c.branch_id = :b)
                GROUP BY 1, 2""")
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("b", branchId)
                .query(Amount.class).list();

        DebtSummaries.Summary customers = debts.summary(actor, Side.CUSTOMER, branchId, TOP);
        DebtSummaries.Summary suppliers = debts.summary(actor, Side.SUPPLIER, branchId, 0);

        // Filiallar kesimi
        record Branch(long id, String name) {}
        List<Branch> branchList = jdbc.sql("""
                SELECT id, name FROM branch WHERE (CAST(:b AS BIGINT) IS NULL AND active) OR id = :b ORDER BY name""")
                .param("b", branchId).query(Branch.class).list();
        List<BranchRow> rows = new ArrayList<>();
        for (Branch b : branchList) {
            DebtSummaries.Summary c = branchId == null ? debts.summary(actor, Side.CUSTOMER, b.id(), 0) : customers;
            DebtSummaries.Summary s = branchId == null ? debts.summary(actor, Side.SUPPLIER, b.id(), 0) : suppliers;
            rows.add(new BranchRow(b.id(), b.name(), sum(sales, b.id()).toString(), c.debt(), s.debt(), sum(expenses, b.id()).toString()));
        }

        Attention attention = attention(actor, branchId, today, customers);
        List<Debtor> top = customers.top().stream()
                .map(x -> new Debtor(x.counterpartyId(), x.name(), x.debt(), x.overdue(), x.maxOverdueDays())).toList();
        return new Home(f, t, today, branchId, byPayment(sales), new DebtCard(customers.debt(), customers.overdue(), customers.advance()),
                new DebtCard(suppliers.debt(), suppliers.overdue(), suppliers.advance()), byPayment(expenses), rows, attention, top);
    }

    private Attention attention(Actor actor, Long branchId, LocalDate today, DebtSummaries.Summary customers) {
        record Ca(int count, BigDecimal amount) {}
        Ca orders = jdbc.sql("""
                SELECT count(*) AS count, sum(total) AS amount FROM sales_order
                WHERE status = 'PENDING_APPROVAL' AND approval_level = 'DIRECTOR' AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)""")
                .param("b", branchId).query(Ca.class).single();
        Ca cash = jdbc.sql("""
                SELECT count(*) AS count, sum(amount) AS amount FROM cash_op
                WHERE status = 'PENDING' AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)""")
                .param("b", branchId).query(Ca.class).single();
        // Muddati tugaydigan partiyalar (qoldig'i bor): 0–30 / 31–60 / 61–90 kun; muddati o'tganlar alohida
        ExpiringBatches expiring = jdbc.sql("""
                SELECT count(*) FILTER (WHERE e.expiry_date >= :d AND e.expiry_date <= :d + 30) AS d0to30,
                       count(*) FILTER (WHERE e.expiry_date > :d + 30 AND e.expiry_date <= :d + 60) AS d31to60,
                       count(*) FILTER (WHERE e.expiry_date > :d + 60 AND e.expiry_date <= :d + 90) AS d61to90,
                       count(*) FILTER (WHERE e.expiry_date < :d) AS expired
                FROM (SELECT DISTINCT sb.branch_id, b.id, b.expiry_date
                      FROM stock_balance sb JOIN batch b ON b.id = sb.batch_id
                      WHERE sb.qty > 0 AND b.expiry_date <= :d + 90 AND (CAST(:b AS BIGINT) IS NULL OR sb.branch_id = :b)) e""")
                .param("d", Date.valueOf(today)).param("b", branchId)
                .query(ExpiringBatches.class).single();
        int receipts = jdbc.sql("""
                SELECT count(*) FROM receipt WHERE status = 'ACCEPTED' AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)""")
                .param("b", branchId).query(Integer.class).single();
        BigDecimal driver = jdbc.sql("""
                SELECT coalesce(sum(s.cash_collected), 0) FROM trip_stop s JOIN trip t ON t.id = s.trip_id
                WHERE s.active AND s.cash_collected > 0 AND s.cash_payment_id IS NULL AND t.status IN ('IN_TRANSIT', 'RETURN_WAIT')
                  AND (CAST(:b AS BIGINT) IS NULL OR t.branch_id = :b)""")
                .param("b", branchId).query(BigDecimal.class).single();
        DebtSummaries.DueSoon due = debts.supplierDue(actor, branchId, today);
        return new Attention(customers.d1to30(), customers.d31to60(), customers.d61to90(), customers.d90plus(),
                new CountAmount(orders.count(), m(orders.amount()).toString()), new CountAmount(cash.count(), m(cash.amount()).toString()),
                expiring, due.overdue(), due.today(), due.next3Days(), receipts, m(driver).toString());
    }

    private static Money sum(List<Amount> list, long branchId) {
        Money total = Money.ZERO;
        for (Amount a : list) {
            if (a.branchId() == branchId) {
                total = total.plus(m(a.amount()));
            }
        }
        return total;
    }

    private static ByPayment byPayment(List<Amount> list) {
        Map<String, Money> by = new HashMap<>();
        for (Amount a : list) {
            by.merge(a.kind(), m(a.amount()), Money::plus);
        }
        Money cash = by.getOrDefault("CASH", Money.ZERO);
        Money transfer = by.getOrDefault("TRANSFER", Money.ZERO);
        Money online = by.getOrDefault("ONLINE", Money.ZERO);
        return new ByPayment(cash.plus(transfer).plus(online).toString(), cash.toString(), transfer.toString(), online.toString());
    }
}
