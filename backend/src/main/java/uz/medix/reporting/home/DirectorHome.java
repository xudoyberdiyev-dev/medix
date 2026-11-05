package uz.medix.reporting.home;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Duration;
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
 * Direktor / Admin / Buxgalter bosh sahifasi (barcha filiallar) va Filial rahbari bosh sahifasi (o'z filiali) (SPEC 8): 4 karta (Savdo — sof, Mijozlar qarzi, Ta'minotchilarga qarz, Xarajatlar), filiallar kesimi,
 * «Diqqat talab qiladi», eng katta qarzdorlar. Savdo = sotuv − qaytarishlar (QM) − yetkazilmaganlar (bekor qilingan sotuv), QQS bilan
 * (SPEC 6). To'lov turi: Naqd / Perechisleniye / Online — sotuvda buyurtmaning to'lov turi, xarajatda hisob turi (kassa / bank / Terminal).
 * Qarzlar — finance modulining {@link DebtSummaries} API'sidan («Mijozlar qarzi» sahifasi bilan bir manba).
 */
@Service
class DirectorHome {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    private static final int TOP = 5;
    static final int STALE_DAYS = 2;
    /** «Hammasi» filtridagi 11 katak (Rad etilgan va Bekor qilingan kirmaydi). */
    static final List<String> STATUSES = List.of("DRAFT", "PENDING_APPROVAL", "QUEUED", "PICKING", "MARKING", "CHECKING", "DOCUMENTING",
            "LOADING", "IN_TRANSIT", "DELIVERED", "UNDELIVERED");

    /** Jami va to'lov turi bo'yicha: Naqd / Perechisleniye / Online. */
    record ByPayment(String total, String cash, String transfer, String online) {}

    record DebtCard(String debt, String overdue, String advance) {}

    record BranchRow(long id, String name, String sales, String customerDebt, String supplierDebt, String expenses) {}

    record Debtor(long id, String name, String debt, String overdue, int maxOverdueDays) {}

    record CountAmount(int count, String amount) {}

    record ExpiringBatches(int d0to30, int d31to60, int d61to90, int expired) {}

    record Attention(String overdue1to30, String overdue31to60, String overdue61to90, String overdue90plus, CountAmount directorOrders,
            CountAmount branchOrders, CountAmount cashApprovals, ExpiringBatches expiring, String supplierOverdue, String supplierToday, String supplierNext3Days,
            int receiptsToPost, String driverCash) {}

    /**
     * Buyurtma holati katagi: soni va summasi — Hammasi / Bugungi (bugun kiritilgan) / Kechikkanlar (holatda 2 kundan
     * oshgan). Faol holatlar — hozirgi; Yetkazildi / Yetkazilmadi — davr ichida.
     */
    record StatusCell(String status, int count, String amount, int todayCount, String todayAmount, int staleCount, String staleAmount) {}

    /** Operator: sof savdo (QQS bilan) — o'zi kiritgan buyurtmalar bo'yicha. */
    record OperatorRow(long id, String name, String sales) {}

    /** Ta'minotchi (xodim — «Kim nomiga» yoki korxona) hisobi, tannarxda (SPEC 6): davrda olib keldi / sotildi, hozir qoldi. */
    record SupplierStat(long id, String name, String brought, String sold, String left) {}

    /** Aktiv — davrda kirim qilgan; Passiv — davrda kirim yo'q, lekin qoldig'i bor. Har biri top 5. */
    record SupplierBlock(List<SupplierStat> active, List<SupplierStat> passive) {}

    record Home(LocalDate from, LocalDate to, LocalDate today, @Schema(nullable = true) Long branchId, ByPayment sales, DebtCard customerDebt,
            DebtCard supplierDebt, ByPayment expenses, List<BranchRow> branches, Attention attention, List<Debtor> topDebtors,
            int staleDays, List<StatusCell> orderStatuses, List<OperatorRow> operators,
            @Schema(nullable = true, description = "Faqat tannarx ko'rish ruxsati (prices.cost) bilan") SupplierBlock supplierStaff,
            @Schema(nullable = true, description = "Faqat tannarx ko'rish ruxsati (prices.cost) bilan") SupplierBlock supplierCompanies) {}

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

    static Money m(BigDecimal v) {
        return new Money(v == null ? BigDecimal.ZERO : v);
    }

    /** (filial, to'lov turi) → summa. */
    record Amount(long branchId, String kind, BigDecimal amount) {}

    @Transactional(readOnly = true)
    Home home(Actor actor, Long branchId, LocalDate from, LocalDate to, boolean canSeeCost) {
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
                new DebtCard(suppliers.debt(), suppliers.overdue(), suppliers.advance()), byPayment(expenses), rows, attention, top,
                STALE_DAYS, statuses(branchId, null, f, t, today), operators(branchId, f, t),
                canSeeCost ? suppliers(branchId, f, t, "owner_id", "employee", "full_name") : null,
                canSeeCost ? suppliers(branchId, f, t, "supplier_id", "counterparty", "name") : null);
    }

    /** Buyurtma holatlari: createdBy berilsa — faqat shu xodim kiritgan buyurtmalar (Operator bosh sahifasi). */
    List<StatusCell> statuses(Long branchId, Long createdBy, LocalDate f, LocalDate t, LocalDate today) {
        Map<String, StatusCell> by = new HashMap<>();
        jdbc.sql("""
                SELECT status, count(*) AS cnt, sum(total) AS amt,
                       count(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Tashkent')::date = :d) AS today_cnt,
                       sum(total) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Tashkent')::date = :d) AS today_amt,
                       count(*) FILTER (WHERE status NOT IN ('DELIVERED', 'UNDELIVERED') AND status_changed_at < :stale) AS stale_cnt,
                       sum(total) FILTER (WHERE status NOT IN ('DELIVERED', 'UNDELIVERED') AND status_changed_at < :stale) AS stale_amt
                FROM sales_order
                WHERE status NOT IN ('REJECTED', 'CANCELLED') AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)
                  AND (CAST(:e AS BIGINT) IS NULL OR created_by = :e)
                  AND (status NOT IN ('DELIVERED', 'UNDELIVERED') OR (status_changed_at AT TIME ZONE 'Asia/Tashkent')::date BETWEEN :f AND :t)
                GROUP BY status""")
                .param("d", Date.valueOf(today))
                .param("stale", Timestamp.from(clock.instant().minus(Duration.ofDays(STALE_DAYS))))
                .param("b", branchId)
                .param("e", createdBy)
                .param("f", Date.valueOf(f))
                .param("t", Date.valueOf(t))
                .query((rs, n) -> {
                    String st = rs.getString("status");
                    by.put(st, new StatusCell(st, rs.getInt("cnt"), m(rs.getBigDecimal("amt")).toString(), rs.getInt("today_cnt"),
                            m(rs.getBigDecimal("today_amt")).toString(), rs.getInt("stale_cnt"), m(rs.getBigDecimal("stale_amt")).toString()));
                    return st;
                })
                .list();
        return STATUSES.stream().map(st -> by.getOrDefault(st, new StatusCell(st, 0, "0.00", 0, "0.00", 0, "0.00"))).toList();
    }

    private record SupplierRaw(long id, BigDecimal brought, BigDecimal sold, BigDecimal remain) {}

    /** key — receipt ustuni (owner_id / supplier_id), nameTable/nameColumn — nom manbai. Faqat ichki konstantalar bilan chaqiriladi. */
    private SupplierBlock suppliers(Long branchId, LocalDate f, LocalDate t, String key, String nameTable, String nameColumn) {
        List<SupplierRaw> raw = jdbc.sql("""
                WITH src AS (SELECT b.id AS batch_id, b.cost, r.%1$s AS party
                             FROM batch b JOIN receipt_line l ON l.id = b.source_id JOIN receipt r ON r.id = l.receipt_id
                             WHERE b.source_type = 'KR' AND r.%1$s IS NOT NULL AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b)),
                     mv AS (SELECT m.batch_id,
                                   sum(m.qty) FILTER (WHERE m.doc_type = 'KR') AS brought,
                                   -sum(m.qty) FILTER (WHERE m.doc_type IN ('SV', 'QM')) AS sold
                            FROM stock_move m JOIN src ON src.batch_id = m.batch_id
                            WHERE (m.occurred_at AT TIME ZONE 'Asia/Tashkent')::date BETWEEN :f AND :t
                            GROUP BY m.batch_id),
                     bal AS (SELECT sb.batch_id, sum(sb.qty) AS qty FROM stock_balance sb JOIN src ON src.batch_id = sb.batch_id GROUP BY sb.batch_id)
                SELECT src.party AS id, sum(coalesce(mv.brought, 0) * src.cost) AS brought, sum(coalesce(mv.sold, 0) * src.cost) AS sold,
                       sum(coalesce(bal.qty, 0) * src.cost) AS remain
                FROM src LEFT JOIN mv ON mv.batch_id = src.batch_id LEFT JOIN bal ON bal.batch_id = src.batch_id
                GROUP BY src.party""".formatted(key))
                .param("b", branchId).param("f", Date.valueOf(f)).param("t", Date.valueOf(t))
                .query(SupplierRaw.class).list();
        if (raw.isEmpty()) {
            return new SupplierBlock(List.of(), List.of());
        }
        Map<Long, String> names = new HashMap<>();
        jdbc.sql("SELECT id, %s AS name FROM %s WHERE id IN (:ids)".formatted(nameColumn, nameTable))
                .param("ids", raw.stream().map(SupplierRaw::id).toList())
                .query((rs, n) -> names.put(rs.getLong("id"), rs.getString("name")))
                .list();
        java.util.function.Function<SupplierRaw, SupplierStat> stat = r -> new SupplierStat(r.id(), names.getOrDefault(r.id(), "—"),
                m(r.brought()).toString(), m(r.sold()).toString(), m(r.remain()).toString());
        List<SupplierStat> active = raw.stream().filter(r -> m(r.brought()).isPositive())
                .sorted(java.util.Comparator.comparing((SupplierRaw r) -> m(r.brought())).reversed())
                .limit(TOP).map(stat).toList();
        List<SupplierStat> passive = raw.stream().filter(r -> !m(r.brought()).isPositive() && m(r.remain()).isPositive())
                .sorted(java.util.Comparator.comparing((SupplierRaw r) -> m(r.remain())).reversed())
                .limit(TOP).map(stat).toList();
        return new SupplierBlock(active, passive);
    }

    private List<OperatorRow> operators(Long branchId, LocalDate f, LocalDate t) {
        // Savdo kartasi bilan bir manba: o'tkazilgan sotuv − qaytarishlar, buyurtmani kiritgan xodim bo'yicha
        return jdbc.sql("""
                SELECT e.id, e.full_name AS name, sum(x.amount) AS amount FROM (
                    SELECT o.created_by AS emp, s.total AS amount
                    FROM sale s JOIN sales_order o ON o.id = s.order_id
                    WHERE s.status = 'POSTED' AND s.sale_date BETWEEN :f AND :t AND (CAST(:b AS BIGINT) IS NULL OR s.branch_id = :b)
                    UNION ALL
                    SELECT o.created_by, -r.total
                    FROM sales_return r JOIN sales_order o ON o.id = r.order_id
                    WHERE r.return_date BETWEEN :f AND :t AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b)
                ) x JOIN employee e ON e.id = x.emp
                GROUP BY e.id, e.full_name ORDER BY amount DESC, e.full_name LIMIT :top""")
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("b", branchId).param("top", TOP)
                .query((rs, n) -> new OperatorRow(rs.getLong("id"), rs.getString("name"), m(rs.getBigDecimal("amount")).toString()))
                .list();
    }

    private Attention attention(Actor actor, Long branchId, LocalDate today, DebtSummaries.Summary customers) {
        record Ca(int count, BigDecimal amount) {}
        Ca orders = jdbc.sql("""
                SELECT count(*) AS count, sum(total) AS amount FROM sales_order
                WHERE status = 'PENDING_APPROVAL' AND approval_level = 'DIRECTOR' AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)""")
                .param("b", branchId).query(Ca.class).single();
        Ca branchOrders = jdbc.sql("""
                SELECT count(*) AS count, sum(total) AS amount FROM sales_order
                WHERE status = 'PENDING_APPROVAL' AND approval_level = 'BRANCH' AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)""")
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
                new CountAmount(orders.count(), m(orders.amount()).toString()),
                new CountAmount(branchOrders.count(), m(branchOrders.amount()).toString()), new CountAmount(cash.count(), m(cash.amount()).toString()),
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

    static ByPayment byPayment(List<Amount> list) {
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
