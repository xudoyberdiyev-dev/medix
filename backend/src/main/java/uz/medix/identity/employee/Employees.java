package uz.medix.identity.employee;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/** Xodimlar. Loginni administrator yaratadi; vaqtinchalik parol birinchi kirishda almashtiriladi (SPEC 2, 13). */
@Service
public class Employees {

    public record Employee(long id, String login, String fullName, @Schema(nullable = true) String phone,
            @Schema(nullable = true) String position, String roleCode, String roleName, @Schema(nullable = true) Long branchId,
            String status, boolean mustChangePassword,
            @Schema(description = "Buxgalterga Direktor bergan «barcha filiallar» doirasi (E3)") boolean allBranches) {}

    public record NewEmployee(String login, String fullName, String phone, String position, String roleCode, Long branchId,
            String temporaryPassword) {}

    private static final String SELECT = """
            SELECT e.id, e.login, e.full_name, e.phone, e.position, r.code AS role_code, r.name AS role_name, e.branch_id,
                   e.status, e.must_change_password, e.all_branches
            FROM employee e JOIN role r ON r.id = e.role_id""";

    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    private final AuditLog audit;

    Employees(JdbcClient jdbc, PasswordEncoder encoder, AuditLog audit) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<Employee> list() {
        return jdbc.sql(SELECT + " ORDER BY e.full_name").query(Employee.class).list();
    }

    /** Filial doirasi bilan (SPEC 13): barcha filiallar huquqi bo'lmasa — faqat o'z filiali xodimlari. */
    @Transactional(readOnly = true)
    public List<Employee> list(Actor actor) {
        if (actor.allBranches()) {
            return list();
        }
        return jdbc.sql(SELECT + " WHERE e.branch_id = :b ORDER BY e.full_name")
                .param("b", actor.branchId() == null ? -1L : actor.branchId())
                .query(Employee.class)
                .list();
    }

    @Transactional
    public Employee block(Actor actor, long id, String reason) {
        Employee e = accessible(actor, id);
        if (e.id() == actor.employeeId()) {
            throw MedixException.badRequest("employee.cannotBlockSelf");
        }
        jdbc.sql("UPDATE employee SET status = 'BLOCKED', blocked_reason = :r, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("r", reason.strip())
                .param("id", id)
                .update();
        // Bloklangan xodimning ochiq sessiyalari darhol tugatiladi.
        jdbc.sql("DELETE FROM spring_session WHERE principal_name = :login").param("login", e.login()).update();
        audit.record(AuditEntry.of("employee.block", "employee", id)
                .change(Map.of("status", e.status()), Map.of("status", "BLOCKED"))
                .withReason(reason.strip()));
        return get(id);
    }

    @Transactional
    public Employee unblock(Actor actor, long id) {
        Employee e = accessible(actor, id);
        jdbc.sql("UPDATE employee SET status = 'ACTIVE', blocked_reason = NULL, failed_login_count = 0, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("employee.unblock", "employee", id)
                .change(Map.of("status", e.status()), Map.of("status", "ACTIVE")));
        return get(id);
    }

    /** Vaqtinchalik parol beradi; xodim keyingi kirishda almashtiradi. Ochiq sessiyalar tugatiladi. */
    @Transactional
    public Employee resetPassword(Actor actor, long id, String temporaryPassword) {
        Employee e = accessible(actor, id);
        jdbc.sql("UPDATE employee SET password_hash = :h, must_change_password = true, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("h", encoder.encode(temporaryPassword))
                .param("id", id)
                .update();
        jdbc.sql("DELETE FROM spring_session WHERE principal_name = :login").param("login", e.login()).update();
        audit.record(AuditEntry.of("employee.resetPassword", "employee", id));
        return get(id);
    }

    /**
     * Buxgalterga barcha filiallar doirasini berish / olish (egasi qarori 07.11.2026, E3) — faqat Direktor.
     * Xodimning ochiq sessiyalari tugatiladi (yangi doira keyingi kirishda kuchga kiradi).
     */
    @Transactional
    public Employee setAllBranches(Actor actor, long id, boolean enabled) {
        Employee e = accessible(actor, id);
        if (!"ACCOUNTANT".equals(e.roleCode())) {
            throw MedixException.badRequest("employee.allBranchesOnlyAccountant");
        }
        if (e.allBranches() == enabled) {
            return e;
        }
        jdbc.sql("UPDATE employee SET all_branches = :v, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("v", enabled)
                .param("id", id)
                .update();
        jdbc.sql("DELETE FROM spring_session WHERE principal_name = :login").param("login", e.login()).update();
        audit.record(AuditEntry.of("employee.allBranches", "employee", id)
                .change(Map.of("allBranches", e.allBranches()), Map.of("allBranches", enabled)));
        return get(id);
    }

    private Employee get(long id) {
        return jdbc.sql(SELECT + " WHERE e.id = :id").param("id", id).query(Employee.class).single();
    }

    /** Topilmasa yoki boshqa filialniki bo'lsa — 404 (boshqa filial xodimi borligini ham bildirmaymiz). */
    private Employee accessible(Actor actor, long id) {
        Employee e = jdbc.sql(SELECT + " WHERE e.id = :id")
                .param("id", id)
                .query(Employee.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (!actor.allBranches() && (e.branchId() == null || !actor.canAccessBranch(e.branchId()))) {
            throw MedixException.notFound("error.notFound");
        }
        return e;
    }

    @Transactional
    public Employee create(NewEmployee n) {
        Long roleId = jdbc.sql("SELECT id FROM role WHERE code = :c AND active")
                .param("c", n.roleCode())
                .query(Long.class)
                .optional()
                .orElseThrow(() -> MedixException.badRequest("employee.roleUnknown"));
        if (n.branchId() != null) {
            boolean branchExists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM branch WHERE id = :b)")
                    .param("b", n.branchId())
                    .query(Boolean.class)
                    .single();
            if (!branchExists) {
                throw MedixException.badRequest("employee.branchUnknown");
            }
        }
        String login = n.login().strip().toLowerCase(Locale.ROOT);
        boolean taken = jdbc.sql("SELECT EXISTS (SELECT 1 FROM employee WHERE login = :l)")
                .param("l", login)
                .query(Boolean.class)
                .single();
        if (taken) {
            throw MedixException.conflict("employee.loginTaken", login);
        }
        long id;
        try {
            id = jdbc.sql("""
                    INSERT INTO employee (login, full_name, phone, position, role_id, branch_id, password_hash, must_change_password)
                    VALUES (:login, :name, :phone, :position, :role, :branch, :hash, true) RETURNING id""")
                    .param("login", login)
                    .param("name", n.fullName().strip())
                    .param("phone", blankToNull(n.phone()))
                    .param("position", blankToNull(n.position()))
                    .param("role", roleId)
                    .param("branch", n.branchId())
                    .param("hash", encoder.encode(n.temporaryPassword()))
                    .query(Long.class)
                    .single();
        } catch (DuplicateKeyException e) {
            throw MedixException.conflict("employee.loginTaken", login);
        }
        Map<String, Object> snapshot = new HashMap<>();
        snapshot.put("login", login);
        snapshot.put("fullName", n.fullName().strip());
        snapshot.put("role", n.roleCode());
        snapshot.put("branchId", n.branchId());
        audit.record(AuditEntry.of("employee.create", "employee", id).change(null, snapshot));
        return get(id);
    }

    @Transactional(readOnly = true)
    public long count() {
        return jdbc.sql("SELECT count(*) FROM employee").query(Long.class).single();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
