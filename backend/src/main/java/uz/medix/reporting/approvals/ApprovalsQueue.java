package uz.medix.reporting.approvals;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.PartyLedger;
import uz.medix.finance.PartyLedger.CreditState;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * «Tasdiqlash» sahifasi (prototip `Approvals`): kredit muammosi bo'lgan buyurtmalar (Tasdiqlashda), tannarxdan past narx hujjatlari
 * (faqat Direktor) va bugun hal qilinganlar; tanlangan buyurtma uchun mijozning qarz yoshi, oxirgi to'lovlari va to'lov intizomi.
 * Faqat o'qish — tasdiq/rad/qaytarish {@code /api/orders/{id}/approve|reject|return} orqali.
 */
@Service
class ApprovalsQueue {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    /** Narx o'zgarishi hujjati (NO) — tannarxdan past narx, faqat Direktor tasdiqlaydi. */
    record PriceApproval(long id, String number, String branch, int lines, Instant submittedAt, String createdBy) {}

    /**
     * Tasdiq kutayotgan buyurtma. level — kerakli daraja (BRANCH / DIRECTOR); mine — joriy foydalanuvchi shu darajada tasdiqlay oladi.
     * limitOverPct — limitdan oshish foizi (qarz + shu buyurtma − limit) / limit; limit yo'q yoki oshmasa — null.
     */
    record OrderApproval(long id, String number, long branchId, String branchCode, long customerId, String customer,
            @Schema(nullable = true) String customerTin, @Schema(nullable = true) String customerAddress, String createdBy, String total, int lines,
            Instant submittedAt, long waitMinutes, String level, boolean mine, List<String> reasons, String debt, String overdue, int overdueDays,
            @Schema(nullable = true) String creditLimit, @Schema(nullable = true) Integer limitOverPct, boolean blocked,
            @Schema(nullable = true) String note) {}

    /** Bugun hal qilingan buyurtma: decision — APPROVED / REJECTED. */
    record ResolvedApproval(long id, String number, String customer, String total, String decision, String decidedBy, Instant decidedAt,
            @Schema(nullable = true) String reason) {}

    record ApprovalsView(List<PriceApproval> prices, List<OrderApproval> orders, List<ResolvedApproval> resolvedToday) {}

    /** Mijozning oxirgi to'lovi: kind — hisob turi (CASH / TERMINAL / BANK). */
    record LastPayment(LocalDate date, String kind, String amount) {}

    /** Oy bo'yicha o'rtacha kechikish (kun) — to'lov intizomi ustunlari; to'lov bo'lmagan oy — 0. */
    record MonthDelay(String month, int avgDelayDays) {}

    /**
     * Mijoz kredit tafsiloti (filial bo'yicha): qarz yoshi — ochiq qarz hujjat sanasidan beri o'tgan kun bo'yicha; avgDelayDays — so'nggi 6
     * oyda to'lovlar sotuv to'lov muddatidan o'rtacha necha kun kechikkan.
     */
    record CreditDetail(String d0to30, String d31to60, String d61to90, String d90plus, List<LastPayment> payments, int avgDelayDays,
            List<MonthDelay> months) {}

    private final JdbcClient jdbc;
    private final PartyLedger ledger;
    private final Clock clock;

    ApprovalsQueue(JdbcClient jdbc, PartyLedger ledger, Clock clock) {
        this.jdbc = jdbc;
        this.ledger = ledger;
        this.clock = clock;
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(TASHKENT));
    }

    /** Filial doirasi: barcha filiallarni ko'radigan — tanlangan filial yoki hammasi (null); qolganlar — faqat o'z filiali. */
    private Long scope(Actor actor, Long branchId) {
        if (!actor.allBranches()) {
            if (actor.branchId() == null) {
                throw MedixException.forbidden("error.forbidden");
            }
            return actor.branchId();
        }
        return branchId;
    }

    private record OrderRaw(long id, String number, long branchId, String branchCode, long customerId, String customer, String customerTin,
            String customerAddress, String createdBy, BigDecimal total, int lines, Timestamp submittedAt, String level, String reasons,
            BigDecimal creditLimit, boolean blocked, String note) {}

    @Transactional(readOnly = true)
    ApprovalsView view(Actor actor, Set<String> perms, Long branchId) {
        Long b = scope(actor, branchId);
        boolean br = perms.contains("approvals.branch");
        boolean dir = perms.contains("approvals.director");
        Instant now = clock.instant();
        LocalDate today = today();
        List<OrderRaw> raw = jdbc.sql("""
                SELECT o.id, o.number, o.branch_id, br.code AS branch_code, o.customer_id, c.name AS customer, c.tin AS customer_tin,
                       coalesce(o.address, c.address) AS customer_address, e.full_name AS created_by, o.total,
                       (SELECT count(*) FROM sales_order_line l WHERE l.order_id = o.id) AS lines,
                       coalesce(o.submitted_at, o.status_changed_at) AS submitted_at, o.approval_level AS level, o.approval_reasons AS reasons,
                       t.credit_limit, c.blocked, o.note
                FROM sales_order o
                JOIN branch br ON br.id = o.branch_id
                JOIN counterparty c ON c.id = o.customer_id
                JOIN employee e ON e.id = o.created_by
                LEFT JOIN counterparty_branch_terms t ON t.counterparty_id = o.customer_id AND t.branch_id = o.branch_id
                WHERE o.status = 'PENDING_APPROVAL' AND (CAST(:b AS BIGINT) IS NULL OR o.branch_id = :b)
                ORDER BY coalesce(o.submitted_at, o.status_changed_at), o.id""")
                .param("b", b)
                .query(OrderRaw.class)
                .list();
        List<OrderApproval> orders = new ArrayList<>();
        for (OrderRaw r : raw) {
            CreditState cs = ledger.creditState(r.branchId(), r.customerId(), Side.CUSTOMER, today);
            Integer overPct = null;
            if (r.creditLimit() != null && r.creditLimit().signum() > 0) {
                BigDecimal over = cs.debt().amount().add(r.total()).subtract(r.creditLimit());
                if (over.signum() > 0) {
                    overPct = over.multiply(BigDecimal.valueOf(100)).divide(r.creditLimit(), 0, RoundingMode.HALF_UP).intValue();
                }
            }
            boolean mine = "DIRECTOR".equals(r.level()) ? dir : br || dir;
            List<String> reasons = r.reasons() == null || r.reasons().isBlank() ? List.of() : Arrays.asList(r.reasons().split("\n"));
            orders.add(new OrderApproval(r.id(), r.number(), r.branchId(), r.branchCode(), r.customerId(), r.customer(), r.customerTin(),
                    r.customerAddress(), r.createdBy(), new Money(r.total()).toString(), r.lines(), r.submittedAt().toInstant(),
                    Math.max(0, Duration.between(r.submittedAt().toInstant(), now).toMinutes()), r.level(), mine, reasons, cs.debt().toString(),
                    cs.overdue().toString(), cs.overdueDays(), r.creditLimit() == null ? null : new Money(r.creditLimit()).toString(), overPct,
                    r.blocked(), r.note()));
        }
        List<PriceApproval> prices = !perms.contains("prices.below") ? List.of() : jdbc.sql("""
                SELECT p.id, p.number, br.name AS branch, (SELECT count(*) FROM price_change_line l WHERE l.price_change_id = p.id) AS lines,
                       coalesce(p.submitted_at, p.created_at) AS submitted_at, e.full_name AS created_by
                FROM price_change p JOIN branch br ON br.id = p.branch_id JOIN employee e ON e.id = p.created_by
                WHERE p.status = 'PENDING_APPROVAL' AND (CAST(:b AS BIGINT) IS NULL OR p.branch_id = :b)
                ORDER BY coalesce(p.submitted_at, p.created_at), p.id""")
                .param("b", b)
                .query((rs, n) -> new PriceApproval(rs.getLong("id"), rs.getString("number"), rs.getString("branch"), rs.getInt("lines"),
                        rs.getTimestamp("submitted_at").toInstant(), rs.getString("created_by")))
                .list();
        Instant dayStart = today.atStartOfDay(TASHKENT).toInstant();
        List<ResolvedApproval> resolved = jdbc.sql("""
                SELECT o.id, o.number, c.name AS customer, o.total, o.status, e.full_name AS decided_by, o.decided_at, o.decision_reason
                FROM sales_order o JOIN counterparty c ON c.id = o.customer_id JOIN employee e ON e.id = o.decided_by
                WHERE o.decided_at >= :from AND (CAST(:b AS BIGINT) IS NULL OR o.branch_id = :b)
                ORDER BY o.decided_at DESC, o.id DESC""")
                .param("from", Timestamp.from(dayStart))
                .param("b", b)
                .query((rs, n) -> new ResolvedApproval(rs.getLong("id"), rs.getString("number"), rs.getString("customer"),
                        new Money(rs.getBigDecimal("total")).toString(), "REJECTED".equals(rs.getString("status")) ? "REJECTED" : "APPROVED",
                        rs.getString("decided_by"), rs.getTimestamp("decided_at").toInstant(), rs.getString("decision_reason")))
                .list();
        return new ApprovalsView(prices, orders, resolved);
    }

    private record Head(long branchId, long customerId) {}

    @Transactional(readOnly = true)
    CreditDetail credit(Actor actor, long orderId) {
        Head h = jdbc.sql("SELECT branch_id, customer_id FROM sales_order WHERE id = :id")
                .param("id", orderId)
                .query(Head.class)
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        LocalDate today = today();
        // Qarz yoshi: har bir qarz hujjatining ochiq qoldig'i (o'zi + unga qo'llangan yozuvlar) hujjat sanasidan beri o'tgan kun bo'yicha
        Map<String, BigDecimal> aging = new LinkedHashMap<>();
        for (String k : List.of("a0", "a1", "a2", "a3")) {
            aging.put(k, BigDecimal.ZERO);
        }
        jdbc.sql("""
                SELECT (:today - (d.occurred_at AT TIME ZONE 'Asia/Tashkent')::date) AS age,
                       d.amount + coalesce((SELECT sum(a.amount) FROM party_ledger a
                                            WHERE a.applies_doc_type = d.doc_type AND a.applies_doc_id = d.doc_id
                                              AND a.counterparty_id = d.counterparty_id AND a.branch_id = d.branch_id AND a.side = d.side), 0) AS open
                FROM party_ledger d
                WHERE d.counterparty_id = :c AND d.branch_id = :b AND d.side = 'CUSTOMER' AND d.amount > 0 AND d.applies_doc_type IS NULL""")
                .param("today", Date.valueOf(today))
                .param("c", h.customerId())
                .param("b", h.branchId())
                .query((rs, n) -> {
                    BigDecimal open = rs.getBigDecimal("open");
                    if (open.signum() > 0) {
                        int age = rs.getInt("age");
                        String k = age <= 30 ? "a0" : age <= 60 ? "a1" : age <= 90 ? "a2" : "a3";
                        aging.merge(k, open, BigDecimal::add);
                    }
                    return 0;
                })
                .list();
        List<LastPayment> payments = jdbc.sql("""
                SELECT p.payment_date, a.kind, p.amount FROM customer_payment p JOIN money_account a ON a.id = p.account_id
                WHERE p.customer_id = :c AND p.branch_id = :b AND p.status = 'POSTED'
                ORDER BY p.payment_date DESC, p.id DESC LIMIT 5""")
                .param("c", h.customerId())
                .param("b", h.branchId())
                .query((rs, n) -> new LastPayment(rs.getDate("payment_date").toLocalDate(), rs.getString("kind"),
                        new Money(rs.getBigDecimal("amount")).toString()))
                .list();
        // To'lov intizomi: to'lov yozuvi (manfiy, qarz hujjatiga qo'llangan) sanasi − o'sha hujjat to'lov muddati, so'nggi 6 oy
        YearMonth first = YearMonth.from(today).minusMonths(5);
        record Delay(String month, int days) {}
        List<Delay> delays = jdbc.sql("""
                SELECT to_char((p.occurred_at AT TIME ZONE 'Asia/Tashkent')::date, 'YYYY-MM') AS month,
                       greatest(0, (p.occurred_at AT TIME ZONE 'Asia/Tashkent')::date - d.due_date) AS days
                FROM party_ledger p
                JOIN party_ledger d ON d.doc_type = p.applies_doc_type AND d.doc_id = p.applies_doc_id AND d.amount > 0
                     AND d.counterparty_id = p.counterparty_id AND d.branch_id = p.branch_id AND d.side = p.side AND d.due_date IS NOT NULL
                WHERE p.counterparty_id = :c AND p.branch_id = :b AND p.side = 'CUSTOMER' AND p.amount < 0
                  AND p.doc_type IN ('MT', 'PAY') AND (p.occurred_at AT TIME ZONE 'Asia/Tashkent')::date >= :from""")
                .param("c", h.customerId())
                .param("b", h.branchId())
                .param("from", Date.valueOf(first.atDay(1)))
                .query((rs, n) -> new Delay(rs.getString("month"), rs.getInt("days")))
                .list();
        List<MonthDelay> months = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            String m = first.plusMonths(i).toString();
            months.add(new MonthDelay(m, (int) Math.round(delays.stream().filter(d -> d.month().equals(m)).mapToInt(Delay::days).average().orElse(0))));
        }
        int avg = (int) Math.round(delays.stream().mapToInt(Delay::days).average().orElse(0));
        return new CreditDetail(new Money(aging.get("a0")).toString(), new Money(aging.get("a1")).toString(), new Money(aging.get("a2")).toString(),
                new Money(aging.get("a3")).toString(), payments, avg, months);
    }
}
