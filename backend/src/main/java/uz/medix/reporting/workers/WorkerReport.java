package uz.medix.reporting.workers;

import io.swagger.v3.oas.annotations.media.Schema;
import java.sql.Date;
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
 * Yig'uvchilar va Markirovkachilar natijasi (SPEC 3 «Hisobotlar», T12: pickrep / markrep). Davrda (yakunlangan sana, Toshkent) har xodim
 * bo'yicha: yakunlagan buyurtmalar, qatorlar, dona, berilgan va haqiqiy vaqt (daqiqa), vaqtida / kechikkan; yig'uvchida FEFO'dan
 * chetlashish, markirovkachida skanerlangan va olib tashlangan kodlar. Pul yo'q — faqat sanoq va daqiqa (butun son).
 */
@Service
class WorkerReport {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    static final int MAX_ROWS = 2000;

    public enum Kind {
        PICKERS, MARKERS
    }

    public record WorkerRow(long employeeId, String name, int orders, int lines, int units,
            @Schema(description = "Berilgan vaqt jami, daqiqa (vaqt berilgan buyurtmalar)") int givenMinutes,
            @Schema(description = "Haqiqiy vaqt jami, daqiqa") int actualMinutes,
            @Schema(description = "Bir buyurtmaga o'rtacha haqiqiy vaqt, daqiqa") int avgMinutes,
            int onTime, int late,
            @Schema(nullable = true, description = "Faqat yig'uvchilar: FEFO'dan boshqa partiya olingan buyurtmalar") Integer fefoDeviations,
            @Schema(nullable = true, description = "Faqat markirovkachilar: buyurtmada qolgan kodlar") Integer codes,
            @Schema(nullable = true, description = "Faqat markirovkachilar: sabab bilan olib tashlangan kodlar") Integer removedCodes,
            @Schema(nullable = true, description = "Faqat markirovkachilar: qolgan kodlardan qutilar (qolgani — donalar)") Integer boxCodes,
            @Schema(nullable = true, description = "Faqat markirovkachilar: rad etilgan skanerlashlar («Xato urishlar»)") Integer wrongScans) {}

    public record WorkerReportView(Kind kind, LocalDate from, LocalDate to, @Schema(nullable = true) Long branchId, List<WorkerRow> rows,
            WorkerRow total, boolean truncated) {}

    private static final String PICKERS_SQL = """
            SELECT e.id, e.full_name AS name, count(*) AS orders, coalesce(sum(l.lines), 0) AS lines, coalesce(sum(l.units), 0) AS units,
                   coalesce(sum(o.pick_minutes), 0) AS given,
                   coalesce(round(sum(extract(epoch FROM o.pick_finished_at - o.pick_started_at)) / 60), 0) AS actual,
                   count(*) FILTER (WHERE o.pick_minutes IS NOT NULL
                       AND o.pick_finished_at - o.pick_started_at <= make_interval(mins => o.pick_minutes)) AS on_time,
                   count(*) FILTER (WHERE o.pick_minutes IS NOT NULL
                       AND o.pick_finished_at - o.pick_started_at > make_interval(mins => o.pick_minutes)) AS late,
                   count(*) FILTER (WHERE o.fefo_deviation) AS fefo, 0 AS codes, 0 AS removed, 0 AS boxes, 0 AS wrong
            FROM sales_order o
            JOIN employee e ON e.id = o.picker_id
            LEFT JOIN LATERAL (SELECT count(*) AS lines, sum(x.qty) AS units FROM sales_order_line x WHERE x.order_id = o.id) l ON true
            WHERE o.pick_started_at IS NOT NULL AND o.pick_finished_at IS NOT NULL
              AND CAST(o.pick_finished_at AT TIME ZONE 'Asia/Tashkent' AS DATE) BETWEEN :f AND :t
              AND (CAST(:b AS BIGINT) IS NULL OR o.branch_id = :b)
            GROUP BY e.id, e.full_name
            ORDER BY orders DESC, name
            LIMIT :lim""";

    private static final String MARKERS_SQL = """
            SELECT e.id, e.full_name AS name, count(*) AS orders, coalesce(sum(m.lines), 0) AS lines, coalesce(sum(m.codes), 0) AS units,
                   coalesce(sum(o.mark_minutes), 0) AS given,
                   coalesce(round(sum(extract(epoch FROM o.mark_finished_at - o.mark_started_at)) / 60), 0) AS actual,
                   count(*) FILTER (WHERE o.mark_minutes IS NOT NULL
                       AND o.mark_finished_at - o.mark_started_at <= make_interval(mins => o.mark_minutes)) AS on_time,
                   count(*) FILTER (WHERE o.mark_minutes IS NOT NULL
                       AND o.mark_finished_at - o.mark_started_at > make_interval(mins => o.mark_minutes)) AS late,
                   0 AS fefo, coalesce(sum(m.codes), 0) AS codes, coalesce(sum(m.removed), 0) AS removed, coalesce(sum(m.boxes), 0) AS boxes,
                   coalesce(sum(m.wrong), 0) AS wrong
            FROM sales_order o
            JOIN employee e ON e.id = o.marker_id
            LEFT JOIN LATERAL (
                SELECT count(DISTINCT k.line_id) FILTER (WHERE k.status IN ('ACTIVE', 'SOLD')) AS lines,
                       count(*) FILTER (WHERE k.status IN ('ACTIVE', 'SOLD')) AS codes,
                       count(*) FILTER (WHERE k.status = 'REMOVED') AS removed,
                       count(*) FILTER (WHERE k.status IN ('ACTIVE', 'SOLD') AND k.kind = 'Q') AS boxes,
                       (SELECT count(*) FROM mark_scan_error w WHERE w.order_id = o.id AND w.employee_id = o.marker_id) AS wrong
                FROM sales_order_mark k WHERE k.order_id = o.id) m ON true
            WHERE o.mark_started_at IS NOT NULL AND o.mark_finished_at IS NOT NULL
              AND CAST(o.mark_finished_at AT TIME ZONE 'Asia/Tashkent' AS DATE) BETWEEN :f AND :t
              AND (CAST(:b AS BIGINT) IS NULL OR o.branch_id = :b)
            GROUP BY e.id, e.full_name
            ORDER BY orders DESC, name
            LIMIT :lim""";

    private record Raw(long id, String name, int orders, int lines, int units, int given, int actual, int onTime, int late, int fefo,
            int codes, int removed, int boxes, int wrong) {}

    private final JdbcClient jdbc;
    private final Clock clock;

    WorkerReport(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public WorkerReportView report(Actor actor, Kind kind, Long requestedBranch, LocalDate from, LocalDate to) {
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
        List<Raw> raw = jdbc.sql(kind == Kind.PICKERS ? PICKERS_SQL : MARKERS_SQL)
                .param("f", Date.valueOf(f)).param("t", Date.valueOf(t)).param("b", branchId).param("lim", MAX_ROWS + 1)
                .query((rs, n) -> new Raw(rs.getLong("id"), rs.getString("name"), rs.getInt("orders"), rs.getInt("lines"),
                        rs.getInt("units"), rs.getInt("given"), rs.getInt("actual"), rs.getInt("on_time"), rs.getInt("late"),
                        rs.getInt("fefo"), rs.getInt("codes"), rs.getInt("removed"), rs.getInt("boxes"), rs.getInt("wrong")))
                .list();
        boolean truncated = raw.size() > MAX_ROWS;
        List<Raw> shown = truncated ? raw.subList(0, MAX_ROWS) : raw;
        Raw sum = new Raw(0, "Jami", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        for (Raw r : raw) {
            sum = new Raw(0, "Jami", sum.orders() + r.orders(), sum.lines() + r.lines(), sum.units() + r.units(), sum.given() + r.given(),
                    sum.actual() + r.actual(), sum.onTime() + r.onTime(), sum.late() + r.late(), sum.fefo() + r.fefo(),
                    sum.codes() + r.codes(), sum.removed() + r.removed(), sum.boxes() + r.boxes(), sum.wrong() + r.wrong());
        }
        List<WorkerRow> rows = shown.stream().map(r -> row(r, kind)).toList();
        return new WorkerReportView(kind, f, t, branchId, rows, row(sum, kind), truncated);
    }

    /** «Bugungi natijam» (Yig'uvchi / Markirovkachi paneli): shu xodimning bugungi natijasi, ish bo'lmasa — nollar. */
    @Transactional(readOnly = true)
    public WorkerRow mine(Actor actor, Kind kind) {
        LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
        WorkerReportView v = report(actor, kind, null, today, today);
        return v.rows().stream()
                .filter(r -> r.employeeId() == actor.employeeId())
                .findFirst()
                .orElseGet(() -> row(new Raw(actor.employeeId(), "", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), kind));
    }

    /** O'rtacha — butun daqiqa, yarmidan yuqoriga (HALF_UP). */
    static int avg(int total, int count) {
        return count == 0 ? 0 : (2 * total + count) / (2 * count);
    }

    private static WorkerRow row(Raw r, Kind kind) {
        boolean pick = kind == Kind.PICKERS;
        return new WorkerRow(r.id(), r.name(), r.orders(), r.lines(), r.units(), r.given(), r.actual(), avg(r.actual(), r.orders()),
                r.onTime(), r.late(), pick ? r.fefo() : null, pick ? null : r.codes(), pick ? null : r.removed(), pick ? null : r.boxes(),
                pick ? null : r.wrong());
    }
}
