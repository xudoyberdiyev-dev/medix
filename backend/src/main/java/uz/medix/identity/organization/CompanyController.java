package uz.medix.identity.organization;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;

/**
 * «Kompaniya» sahifasi (prototip AdminOrg `company`): guruh nomi va tizim holati — faol filiallar, omborlar, xodimlar, ishga
 * tushirilgan vaqt va kim. Ko'rish — company.view, nomni tahrirlash — company.edit (audit: company.update).
 */
@RestController
@RequestMapping("/api/company")
@Tag(name = "company", description = "Kompaniya")
class CompanyController {

    record CompanyOverview(long id, String name, String defaultLocale, @Schema(nullable = true) Long logoVersion, int branches,
            int warehouses, int employees, @Schema(nullable = true) Instant launchedAt, @Schema(nullable = true) String launchedBy) {}

    record CompanyNameRequest(@NotBlank(message = "{validation.required}") @Size(max = 200) String name) {}

    private final Organization organization;
    private final JdbcClient jdbc;

    CompanyController(Organization organization, JdbcClient jdbc) {
        this.organization = organization;
        this.jdbc = jdbc;
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('company.view', 'company.edit')")
    @Transactional(readOnly = true)
    @Operation(summary = "Kompaniya va tizim holati", description = "Faol filiallar, omborlar va xodimlar soni; ishga tushirilgan vaqt va kim.")
    CompanyOverview get() {
        Organization.Company c = organization.company().orElseThrow(() -> MedixException.notFound("error.notFound"));
        record Counts(int branches, int warehouses, int employees, String launchedBy) {}
        Counts n = jdbc.sql("""
                SELECT (SELECT count(*) FROM branch WHERE active) AS branches,
                       (SELECT count(*) FROM warehouse w JOIN branch b ON b.id = w.branch_id WHERE w.active AND b.active) AS warehouses,
                       (SELECT count(*) FROM employee WHERE status = 'ACTIVE') AS employees,
                       (SELECT e.full_name FROM audit_log a JOIN employee e ON e.id = a.employee_id
                        WHERE a.action = 'setup.complete' ORDER BY a.occurred_at DESC LIMIT 1) AS launched_by""")
                .query((rs, i) -> new Counts(rs.getInt("branches"), rs.getInt("warehouses"), rs.getInt("employees"), rs.getString("launched_by")))
                .single();
        return new CompanyOverview(c.id(), c.name(), c.defaultLocale(), c.logoVersion(), n.branches(), n.warehouses(), n.employees(),
                c.setupCompletedAt(), c.setupCompletedAt() == null ? null : n.launchedBy());
    }

    @PutMapping
    @PreAuthorize("hasAuthority('company.edit')")
    @Operation(summary = "Guruh nomini tahrirlash", description = "Audit jurnaliga eski → yangi qiymat yoziladi.")
    CompanyOverview rename(@Valid @RequestBody CompanyNameRequest r) {
        organization.company().orElseThrow(() -> MedixException.notFound("error.notFound"));
        organization.saveCompany(r.name());
        return get();
    }
}
