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

    /**
     * @param defaultLocale tizimning asosiy tili (uz-Latn, uz-Cyrl, ru)
     * @param logoVersion logotip yuklangan vaqt (epoch ms) — URL keshini yangilash uchun; null — logotip yoʻq
     */
    public record Company(long id, String name, @Schema(nullable = true) Instant setupCompletedAt, String defaultLocale,
            @Schema(nullable = true) Long logoVersion) {}

    /** Logotip fayli (PNG yoki SVG). */
    public record Logo(byte[] content, String contentType) {}

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
        return jdbc.sql("SELECT id, name, setup_completed_at, default_locale, logo_updated_at, logo IS NOT NULL AS has_logo FROM company")
                .query((rs, n) -> new Company(rs.getLong("id"), rs.getString("name"),
                        Optional.ofNullable(rs.getTimestamp("setup_completed_at")).map(java.sql.Timestamp::toInstant).orElse(null),
                        rs.getString("default_locale"),
                        rs.getBoolean("has_logo")
                                ? Optional.ofNullable(rs.getTimestamp("logo_updated_at")).map(java.sql.Timestamp::getTime).orElse(0L)
                                : null))
                .optional();
    }

    @Transactional
    public Company saveCompany(String name) {
        return saveCompany(name, company().map(Company::defaultLocale).orElse("uz-Latn"));
    }

    @Transactional
    public Company saveCompany(String name, String defaultLocale) {
        var existing = company();
        if (existing.isPresent()) {
            jdbc.sql("UPDATE company SET name = :n, default_locale = :l, updated_at = now(), version = version + 1 WHERE id = :id")
                    .param("n", name.strip())
                    .param("l", defaultLocale)
                    .param("id", existing.get().id())
                    .update();
            audit.record(AuditEntry.of("company.update", "company", existing.get().id())
                    .change(Map.of("name", existing.get().name(), "defaultLocale", existing.get().defaultLocale()),
                            Map.of("name", name.strip(), "defaultLocale", defaultLocale)));
        } else {
            long id = jdbc.sql("INSERT INTO company (name, default_locale) VALUES (:n, :l) RETURNING id")
                    .param("n", name.strip())
                    .param("l", defaultLocale)
                    .query(Long.class)
                    .single();
            audit.record(AuditEntry.of("company.create", "company", id)
                    .change(null, Map.of("name", name.strip(), "defaultLocale", defaultLocale)));
        }
        return company().orElseThrow();
    }

    /** Logotipni saqlaydi; {@code content == null} — oʻchiradi. Kompaniya avval yaratilgan boʻlishi shart. */
    @Transactional
    public Company saveLogo(byte[] content, String contentType) {
        var c = company().orElseThrow(() -> MedixException.badRequest("setup.companyMissing"));
        if (content == null) {
            jdbc.sql("""
                    UPDATE company SET logo = NULL, logo_type = NULL, logo_updated_at = NULL, updated_at = now(), version = version + 1
                    WHERE id = :id""")
                    .param("id", c.id())
                    .update();
        } else {
            jdbc.sql("""
                    UPDATE company SET logo = :b, logo_type = :t, logo_updated_at = :at, updated_at = now(), version = version + 1
                    WHERE id = :id""")
                    .param("b", content)
                    .param("t", contentType)
                    .param("at", java.sql.Timestamp.from(clock.instant()))
                    .param("id", c.id())
                    .update();
        }
        audit.record(AuditEntry.of(content == null ? "company.logoRemove" : "company.logoUpload", "company", c.id()));
        return company().orElseThrow();
    }

    @Transactional(readOnly = true)
    public Optional<Logo> logo() {
        return jdbc.sql("SELECT logo, logo_type FROM company WHERE logo IS NOT NULL")
                .query((rs, n) -> new Logo(rs.getBytes("logo"), rs.getString("logo_type")))
                .optional();
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
        ensureUnique(d, 0L);
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
        ensureUnique(d, id);
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

    /**
     * Filialni faollashtirish / nofaol qilish (SPEC 13-qoida: filial o'chirilmaydi). Oxirgi faol filial nofaol qilinmaydi.
     */
    @Transactional
    public Branch setActive(long id, boolean active, String reason) {
        Branch before = jdbc.sql("SELECT id, code, name, legal_name, tin, address, phone, active FROM branch WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query(Branch.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (before.active() == active) {
            return before;
        }
        if (!active) {
            long others = jdbc.sql("SELECT count(*) FROM branch WHERE active AND id <> :id")
                    .param("id", id)
                    .query(Long.class)
                    .single();
            if (others == 0) {
                throw MedixException.conflict("branch.lastActive");
            }
        }
        jdbc.sql("UPDATE branch SET active = :a, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("a", active)
                .param("id", id)
                .update();
        var entry = AuditEntry.of(active ? "branch.activate" : "branch.deactivate", "branch", id)
                .change(Map.of("active", before.active()), Map.of("active", active));
        audit.record(reason == null || reason.isBlank() ? entry : entry.withReason(reason.strip()));
        return branch(id).orElseThrow();
    }

    /** Oldindan tekshiruv: bazadagi UNIQUE xatosi tranzaksiyani buzadi; UNIQUE esa poyga holati uchun qoladi. */
    private void ensureUnique(BranchData d, long exceptId) {
        boolean taken = jdbc.sql("SELECT EXISTS (SELECT 1 FROM branch WHERE (code = :code OR tin = :tin) AND id <> :id)")
                .param("code", d.code().strip().toUpperCase(java.util.Locale.ROOT))
                .param("tin", d.tin().strip())
                .param("id", exceptId)
                .query(Boolean.class)
                .single();
        if (taken) {
            throw MedixException.conflict("branch.duplicate", d.code(), d.tin());
        }
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
