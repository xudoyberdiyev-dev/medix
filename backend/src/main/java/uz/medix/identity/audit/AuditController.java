package uz.medix.identity.audit;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/** Audit jurnalini ko'rish — Direktor va Bosh administrator. Filial doirasi qo'llanadi. */
@RestController
@RequestMapping("/api/audit")
@PreAuthorize("hasAuthority('audit.view')")
@Tag(name = "audit", description = "Audit jurnali")
class AuditController {

    record AuditRow(
            long id,
            Instant occurredAt,
            @Schema(nullable = true) Long employeeId,
            @Schema(nullable = true) String employeeName,
            String action,
            String entityType,
            @Schema(nullable = true) String entityId,
            @Schema(nullable = true, description = "JSON") String oldValue,
            @Schema(nullable = true, description = "JSON") String newValue,
            @Schema(nullable = true) String reason) {}

    record AuditPage(List<AuditRow> items, long total) {}

    private static final int MAX_SIZE = 100;

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;

    AuditController(JdbcClient jdbc, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
    }

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "Audit yozuvlari (yangilari birinchi)")
    AuditPage list(
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size) {
        var actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        int limit = Math.clamp(size, 1, MAX_SIZE);
        int offset = (Math.max(page, 1) - 1) * limit;
        String where = """
                WHERE (CAST(:type AS varchar) IS NULL OR a.entity_type = :type)
                  AND (CAST(:emp AS bigint) IS NULL OR a.employee_id = :emp)
                  AND (:all OR a.branch_id = :branch)""";
        long total = jdbc.sql("SELECT count(*) FROM audit_log a " + where)
                .param("type", entityType)
                .param("emp", employeeId)
                .param("all", actor.allBranches())
                .param("branch", actor.branchId() == null ? -1L : actor.branchId())
                .query(Long.class)
                .single();
        List<AuditRow> items = jdbc.sql("""
                SELECT a.id, a.occurred_at, a.employee_id, e.full_name AS employee_name, a.action, a.entity_type, a.entity_id,
                       a.old_value::text AS old_value, a.new_value::text AS new_value, a.reason
                FROM audit_log a LEFT JOIN employee e ON e.id = a.employee_id
                """ + where + " ORDER BY a.occurred_at DESC, a.id DESC LIMIT :limit OFFSET :offset")
                .param("type", entityType)
                .param("emp", employeeId)
                .param("all", actor.allBranches())
                .param("branch", actor.branchId() == null ? -1L : actor.branchId())
                .param("limit", limit)
                .param("offset", offset)
                .query((rs, n) -> new AuditRow(
                        rs.getLong("id"),
                        rs.getTimestamp("occurred_at").toInstant(),
                        (Long) rs.getObject("employee_id"),
                        rs.getString("employee_name"),
                        rs.getString("action"),
                        rs.getString("entity_type"),
                        rs.getString("entity_id"),
                        rs.getString("old_value"),
                        rs.getString("new_value"),
                        rs.getString("reason")))
                .list();
        return new AuditPage(items, total);
    }
}
