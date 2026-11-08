package uz.medix.reporting.expenses;

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
 * Xarajatlar (va boshqa kirimlar) hisoboti (SPEC 5.5, 8): o'tkazilgan KO/BO — modda, filial, oy yoki kun bo'yicha; hisob turi bo'yicha
 * Naqd / Bank (perechisleniye) / Terminal (online). Bosh sahifadagi «Xarajatlar» kartasi bilan bir manba (OUT, POSTED).
 */
@Service
class ExpenseReport {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    public enum Direction {
        OUT,
        IN
    }

    /** Guruhlash ifodalari — faqat shu konstantalar SQL'ga qo'shiladi. */
    public enum GroupBy {
        ITEM("c.expense_item_id::text", "i.name"),
        BRANCH("c.branch_id::text", "b.name"),
        MONTH("to_char(c.op_date, 'YYYY-MM')", "to_char(c.op_date, 'MM.YYYY')"),
        DAY("c.op_date::text", "to_char(c.op_date, 'DD.MM.YYYY')");

        final String key;
        final String name;

        GroupBy(String key, String name) {
            this.key = key;
            this.name = name;
        }
    }

    public record ExpenseRow(String key, String name, int ops, String cash, String transfer, String online, String total) {}

    public record ExpenseReportView(LocalDate from, LocalDate to, @Schema(nullable = true) Long branchId, Direction direction, GroupBy groupBy,
            List<ExpenseRow> rows, ExpenseRow total) {}

    private record Raw(String k, String name, int ops, BigDecimal cash, BigDecimal transfer, BigDecimal online) {}

    private final JdbcClient jdbc;
    private final Clock clock;

    ExpenseReport(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ExpenseReportView report(Actor actor, Long requestedBranch, LocalDate from, LocalDate to, Direction direction, GroupBy groupBy) {
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
        Direction d = direction == null ? Direction.OUT : direction;
        GroupBy g = groupBy == null ? GroupBy.ITEM : groupBy;
        // Modda bo'yicha — summasi kattasi birinchi; oy/kun — xronologik
        String order = g == GroupBy.ITEM || g == GroupBy.BRANCH ? "sum(c.amount) DESC, 2" : "1";
        List<Raw> raw = jdbc.sql("""
                SELECT %s AS k, %s AS name, count(*) AS ops,
                       coalesce(sum(c.amount) FILTER (WHERE a.kind = 'CASH'), 0) AS cash,
                       coalesce(sum(c.amount) FILTER (WHERE a.kind = 'BANK'), 0) AS transfer,
                       coalesce(sum(c.amount) FILTER (WHERE a.kind NOT IN ('CASH', 'BANK')), 0) AS online
                FROM cash_op c JOIN money_account a ON a.id = c.account_id
                JOIN expense_item i ON i.id = c.expense_item_id JOIN branch b ON b.id = c.branch_id
                WHERE c.direction = :d AND c.status = 'POSTED' AND c.op_date BETWEEN :f AND :t
                  AND (CAST(:b AS BIGINT) IS NULL OR c.branch_id = :b)
                GROUP BY 1, 2 ORDER BY %s""".formatted(g.key, g.name, order))
                .param("d", d.name()).param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("b", branchId)
                .query((rs, n) -> new Raw(rs.getString("k"), rs.getString("name"), rs.getInt("ops"), rs.getBigDecimal("cash"),
                        rs.getBigDecimal("transfer"), rs.getBigDecimal("online")))
                .list();
        Money cash = Money.ZERO;
        Money transfer = Money.ZERO;
        Money online = Money.ZERO;
        int ops = 0;
        for (Raw r : raw) {
            cash = cash.plus(new Money(r.cash()));
            transfer = transfer.plus(new Money(r.transfer()));
            online = online.plus(new Money(r.online()));
            ops += r.ops();
        }
        List<ExpenseRow> rows = raw.stream()
                .map(r -> row(r.k(), r.name(), r.ops(), new Money(r.cash()), new Money(r.transfer()), new Money(r.online())))
                .toList();
        return new ExpenseReportView(f, t, branchId, d, g, rows, row("", "Jami", ops, cash, transfer, online));
    }

    private static ExpenseRow row(String k, String name, int ops, Money cash, Money transfer, Money online) {
        return new ExpenseRow(k, name, ops, cash.toString(), transfer.toString(), online.toString(), cash.plus(transfer).plus(online).toString());
    }
}
