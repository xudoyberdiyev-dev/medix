package uz.medix.catalog.dictionary;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * «Boshqa ma'lumotnomalar» kartalar to'ri (prototip Lookups): har ma'lumotnoma — elementlar soni va oxirgi o'zgarish vaqti.
 * Haydovchilar va mashinalar — filial doirasida (mashinalar ro'yxati bilan bir xil), haydovchi — DRIVER rolidagi faol xodim.
 */
@RestController
@Tag(name = "dictionaries", description = "Kichik ma'lumotnomalar")
class DictionaryOverviewController {

    /** Kartalar tartibi prototipdagidek. */
    public enum OverviewKind {
        MANUFACTURER,
        CATEGORY,
        COUNTRY,
        UNIT,
        REGION,
        FLEET,
        EXPENSE_ITEM
    }

    public record OverviewCard(OverviewKind kind, @Schema(description = "Elementlar soni (FLEET — mashinalar)") int count,
            @Schema(description = "Faol elementlar soni") int active,
            @Schema(nullable = true, description = "Faqat FLEET: faol haydovchilar soni") Integer drivers,
            @Schema(nullable = true) Instant lastChangedAt) {}

    private record Stat(int count, int active, Instant last) {}

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;

    DictionaryOverviewController(JdbcClient jdbc, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
    }

    @GetMapping("/api/dictionaries-overview")
    @PreAuthorize("hasAuthority('lookups.view')")
    @Transactional(readOnly = true)
    @Operation(summary = "Boshqa ma'lumotnomalar: soni va oxirgi o'zgarish")
    List<OverviewCard> overview() {
        Actor a = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        boolean all = a.allBranches();
        long branch = a.branchId() == null ? -1L : a.branchId();
        Stat vehicles = stat("SELECT count(*) AS c, count(*) FILTER (WHERE active) AS a, max(updated_at) AS l FROM vehicle WHERE (:all OR branch_id = :b)",
                all, branch);
        Stat drivers = stat("""
                SELECT count(*) AS c, count(*) FILTER (WHERE e.status = 'ACTIVE') AS a, max(e.updated_at) AS l
                FROM employee e JOIN role r ON r.id = e.role_id
                WHERE r.code = 'DRIVER' AND (:all OR e.branch_id = :b)""", all, branch);
        Instant fleetLast = vehicles.last() == null ? drivers.last()
                : drivers.last() == null || vehicles.last().isAfter(drivers.last()) ? vehicles.last() : drivers.last();
        return List.of(
                card(OverviewKind.MANUFACTURER, DictionaryKind.MANUFACTURER),
                card(OverviewKind.CATEGORY, DictionaryKind.CATEGORY),
                card(OverviewKind.COUNTRY, DictionaryKind.COUNTRY),
                card(OverviewKind.UNIT, DictionaryKind.UNIT),
                card(OverviewKind.REGION, DictionaryKind.REGION),
                new OverviewCard(OverviewKind.FLEET, vehicles.count(), vehicles.active(), drivers.active(), fleetLast),
                cardOf(OverviewKind.EXPENSE_ITEM,
                        stat("SELECT count(*) AS c, count(*) FILTER (WHERE active) AS a, max(updated_at) AS l FROM expense_item", true, -1L)));
    }

    private OverviewCard card(OverviewKind kind, DictionaryKind table) {
        // Jadval nomi faqat enum'dan (foydalanuvchi matni SQL'ga tushmaydi)
        return cardOf(kind, stat("SELECT count(*) AS c, count(*) FILTER (WHERE active) AS a, max(updated_at) AS l FROM " + table.table(), true, -1L));
    }

    private static OverviewCard cardOf(OverviewKind kind, Stat s) {
        return new OverviewCard(kind, s.count(), s.active(), null, s.last());
    }

    private Stat stat(String sql, boolean all, long branch) {
        var q = jdbc.sql(sql);
        if (sql.contains(":all")) {
            q = q.param("all", all).param("b", branch);
        }
        return q.query((rs, n) -> {
            java.sql.Timestamp l = rs.getTimestamp("l");
            return new Stat(rs.getInt("c"), rs.getInt("a"), l == null ? null : l.toInstant());
        }).single();
    }
}
