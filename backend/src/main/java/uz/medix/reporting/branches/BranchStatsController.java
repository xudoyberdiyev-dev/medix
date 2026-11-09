package uz.medix.reporting.branches;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Filiallar ro'yxati ustunlari (prototip AdminOrg): filial rahbari, faol omborlar, faol xodimlar, mijozlar qarzi (avanslarsiz — faqat qarzdorlar). Faqat ko'rish mumkin
 * bo'lgan filiallar; qarz — faqat cdebt.view bilan.
 */
@RestController
@RequestMapping("/api/branches")
@Tag(name = "branch-stats", description = "Filiallar ro'yxati ko'rsatkichlari")
class BranchStatsController {

    record BranchStats(long branchId, @Schema(nullable = true) String headName, int warehouses, int employees,
            @Schema(nullable = true, description = "Faqat cdebt.view bilan") String customerDebt) {}

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;

    BranchStatsController(JdbcClient jdbc, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
    }

    @GetMapping("/stats")
    @Transactional(readOnly = true)
    @Operation(summary = "Filiallar ko'rsatkichlari")
    List<BranchStats> stats(Authentication auth) {
        Actor actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        boolean debt = auth.getAuthorities().stream().anyMatch(a -> "cdebt.view".equals(a.getAuthority()));
        return jdbc.sql("""
                SELECT b.id,
                       (SELECT e.full_name FROM employee e JOIN role r ON r.id = e.role_id
                        WHERE e.branch_id = b.id AND r.code = 'BRANCH_MANAGER' AND e.status = 'ACTIVE' ORDER BY e.id LIMIT 1) AS head,
                       (SELECT count(*) FROM warehouse w WHERE w.branch_id = b.id AND w.active) AS whs,
                       (SELECT count(*) FROM employee e WHERE e.branch_id = b.id AND e.status = 'ACTIVE') AS emps,
                       (SELECT coalesce(sum(t.bal), 0) FROM (SELECT sum(p.amount) AS bal FROM party_ledger p
                         WHERE p.branch_id = b.id AND p.side = 'CUSTOMER' GROUP BY p.counterparty_id HAVING sum(p.amount) > 0) t) AS debt
                FROM branch b
                WHERE :all OR b.id = :own
                ORDER BY b.id""")
                .param("all", actor.allBranches())
                .param("own", actor.branchId() == null ? -1L : actor.branchId())
                .query((rs, n) -> new BranchStats(rs.getLong("id"), rs.getString("head"), rs.getInt("whs"), rs.getInt("emps"),
                        debt ? new Money(rs.getBigDecimal("debt")).toString() : null))
                .list();
    }
}
