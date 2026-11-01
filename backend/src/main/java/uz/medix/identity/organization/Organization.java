package uz.medix.identity.organization;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;

/** Kompaniya va filiallar (SPEC 2: bitta guruh, har filial alohida yuridik shaxs). */
@Service
public class Organization {

    public record Company(long id, String name, @Schema(nullable = true) Instant setupCompletedAt) {}

    public record Branch(long id, String code, String name, String legalName, String tin, @Schema(nullable = true) String address,
            @Schema(nullable = true) String phone, boolean active) {}

    public record BranchData(String code, String name, String legalName, String tin, String address, String phone) {}

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final Clock clock;

    Organization(JdbcClient jdbc, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Optional<Company> company() {
        return jdbc.sql("SELECT id, name, setup_completed_at FROM company")
                .query((rs, n) -> new Company(rs.getLong("id"), rs.getString("name"),
                        Optional.ofNullable(rs.getTimestamp("setup_completed_at")).map(java.sql.Timestamp::toInstant).orElse(null)))
                .optional();
    }

    @Transactional
    public Company saveCompany(String name) {
        var existing = company();
        if (existing.isPresent()) {
            jdbc.sql("UPDATE company SET name = :n, updated_at = now(), version = version + 1 WHERE id = :id")
                    .param("n", name.strip())
                    .param("id", existing.get().id())
                    .update();
            audit.record(AuditEntry.of("company.update", "company", existing.get().id())
                    .change(Map.of("name", existing.get().name()), Map.of("name", name.strip())));
        } else {
            long id = jdbc.sql("INSERT INTO company (name) VALUES (:n) RETURNING id")
                    .param("n", name.strip())
                    .query(Long.class)
                    .single();
            audit.record(AuditEntry.of("company.create", "company", id).change(null, Map.of("name", name.strip())));
        }
        return company().orElseThrow();
    }

    @Transactional
    public void markSetupCompleted() {
        var c = company().orElseThrow(() -> MedixException.badRequest("setup.companyMissing"));
        jdbc.sql("UPDATE company SET setup_completed_at = :at, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("at", java.sql.Timestamp.from(clock.instant()))
                .param("id", c.id())
                .update();
        audit.record(AuditEntry.of("setup.complete", "company", c.id()));
    }

    @Transactional(readOnly = true)
    public List<Branch> branches() {
        return jdbc.sql("SELECT id, code, name, legal_name, tin, address, phone, active FROM branch ORDER BY id")
                .query(Branch.class)
                .list();
    }

    @Transactional(readOnly = true)
    public Optional<Branch> branch(long id) {
        return jdbc.sql("SELECT id, code, name, legal_name, tin, address, phone, active FROM branch WHERE id = :id")
                .param("id", id)
                .query(Branch.class)
                .optional();
    }

    @Transactional
    public Branch createBranch(BranchData d) {
        long companyId = company().orElseThrow(() -> MedixException.badRequest("setup.companyMissing")).id();
        try {
            long id = jdbc.sql("""
                    INSERT INTO branch (company_id, code, name, legal_name, tin, address, phone)
                    VALUES (:c, :code, :name, :legal, :tin, :address, :phone) RETURNING id""")
                    .param("c", companyId)
                    .params(params(d))
                    .query(Long.class)
                    .single();
            audit.record(AuditEntry.of("branch.create", "branch", id).change(null, snapshot(d)));
            return branch(id).orElseThrow();
        } catch (DuplicateKeyException e) {
            throw MedixException.conflict("branch.duplicate", d.code(), d.tin());
        }
    }

    @Transactional
    public Branch updateBranch(long id, BranchData d) {
        Branch before = branch(id).orElseThrow(() -> MedixException.notFound("error.notFound"));
        try {
            jdbc.sql("""
                    UPDATE branch SET code = :code, name = :name, legal_name = :legal, tin = :tin, address = :address,
                           phone = :phone, updated_at = now(), version = version + 1
                    WHERE id = :id""")
                    .params(params(d))
                    .param("id", id)
                    .update();
        } catch (DuplicateKeyException e) {
            throw MedixException.conflict("branch.duplicate", d.code(), d.tin());
        }
        Branch after = branch(id).orElseThrow();
        audit.record(AuditEntry.of("branch.update", "branch", id)
                .change(snapshot(new BranchData(before.code(), before.name(), before.legalName(), before.tin(), before.address(),
                        before.phone())), snapshot(d)));
        return after;
    }

    private static Map<String, Object> params(BranchData d) {
        Map<String, Object> m = new HashMap<>();
        m.put("code", d.code().strip().toUpperCase(java.util.Locale.ROOT));
        m.put("name", d.name().strip());
        m.put("legal", d.legalName().strip());
        m.put("tin", d.tin().strip());
        m.put("address", blankToNull(d.address()));
        m.put("phone", blankToNull(d.phone()));
        return m;
    }

    private static Map<String, Object> snapshot(BranchData d) {
        Map<String, Object> m = new HashMap<>();
        m.put("code", d.code());
        m.put("name", d.name());
        m.put("legalName", d.legalName());
        m.put("tin", d.tin());
        m.put("address", d.address());
        m.put("phone", d.phone());
        return m;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
