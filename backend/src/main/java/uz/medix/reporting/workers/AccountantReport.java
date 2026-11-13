package uz.medix.reporting.workers;

import io.swagger.v3.oas.annotations.media.Schema;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/**
 * O10f «Buxgalter natijasi» (Hisobotlar → Xodimlar): davrda (yuborilgan sana, Toshkent) har buxgalter bo'yicha yuborilgan fakturalar
 * soni, o'rtacha vaqt «Yuklanmoqda → Yuborildi» (daqiqa), 1 kundan kechikkanlar; hozir navbatda nechta (kutilayotgan, 1 kundan ko'p).
 */
@Service
class AccountantReport {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    static final int MAX_ROWS = 500;

    private final JdbcClient jdbc;
    private final Clock clock;

    AccountantReport(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public record AccountantRow(long employeeId, String name,
            @Schema(description = "Yuborilgan fakturalar") int sent,
            @Schema(description = "O'rtacha vaqt «Yuklanmoqda → Yuborildi», daqiqa") int avgMinutes,
            @Schema(description = "1 kundan ko'p kutib yuborilganlar") int late) {}

    public record AccountantReportView(LocalDate from, LocalDate to, @Schema(nullable = true) Long branchId, List<AccountantRow> rows,
            AccountantRow total,
            @Schema(description = "Hozir navbatda (yuborilishi kerak)") int queue,
            @Schema(description = "Navbatda 1 kundan ko'p kutayotganlar") int queueLate) {}

    private static final String SQL = """
            SELECT e.id, e.full_name AS name, count(*) AS sent,
                   coalesce(round(avg(extract(epoch FROM t.sent_at - t.opened_at) / 60)), 0) AS avg_min,
                   count(*) FILTER (WHERE t.sent_at - t.opened_at > INTERVAL '1 day') AS late,
                   sum(extract(epoch FROM t.sent_at - t.opened_at) / 60) AS sum_min
            FROM invoice_task t JOIN employee e ON e.id = t.sent_by
            WHERE t.status = 'SENT' AND t.sent_at >= :f AND t.sent_at < :t AND (CAST(:b AS BIGINT) IS NULL OR t.branch_id = :b)
            GROUP BY e.id, e.full_name ORDER BY count(*) DESC, e.full_name LIMIT :lim""";

    @Transactional(readOnly = true)
    public AccountantReportView report(Actor actor, Long requestedBranch, LocalDate from, LocalDate to) {
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
        record Raw(AccountantRow row, double sumMin) {}
        List<Raw> raw = jdbc.sql(SQL)
                .param("f", Timestamp.from(f.atStartOfDay(TASHKENT).toInstant()))
                .param("t", Timestamp.from(t.plusDays(1).atStartOfDay(TASHKENT).toInstant()))
                .param("b", branchId)
                .param("lim", MAX_ROWS)
                .query((rs, n) -> new Raw(new AccountantRow(rs.getLong("id"), rs.getString("name"), rs.getInt("sent"), rs.getInt("avg_min"),
                        rs.getInt("late")), rs.getDouble("sum_min")))
                .list();
        int sent = raw.stream().mapToInt(r -> r.row().sent()).sum();
        int late = raw.stream().mapToInt(r -> r.row().late()).sum();
        double sumMin = raw.stream().mapToDouble(Raw::sumMin).sum();
        AccountantRow total = new AccountantRow(0, "Jami", sent, sent == 0 ? 0 : (int) Math.round(sumMin / sent), late);
        record Queue(int n, int late) {}
        Queue q = jdbc.sql("""
                SELECT count(*) AS n, count(*) FILTER (WHERE t.opened_at < now() - INTERVAL '1 day') AS late
                FROM invoice_task t JOIN sales_order o ON o.id = t.order_id
                WHERE t.status = 'PENDING' AND o.status NOT IN ('CANCELLED', 'REJECTED') AND (CAST(:b AS BIGINT) IS NULL OR t.branch_id = :b)""")
                .param("b", branchId)
                .query((rs, n) -> new Queue(rs.getInt("n"), rs.getInt("late")))
                .single();
        return new AccountantReportView(f, t, branchId, raw.stream().map(Raw::row).toList(), total, q.n(), q.late());
    }
}
