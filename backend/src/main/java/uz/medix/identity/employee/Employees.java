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

/** Xodimlar. Loginni administrator yaratadi; vaqtinchalik parol birinchi kirishda almashtiriladi (SPEC 2, 13). */
@Service
public class Employees {

    public record Employee(long id, String login, String fullName, @Schema(nullable = true) String phone,
            @Schema(nullable = true) String position, String roleCode, String roleName, @Schema(nullable = true) Long branchId,
            String status, boolean mustChangePassword) {}

    public record NewEmployee(String login, String fullName, String phone, String position, String roleCode, Long branchId,
            String temporaryPassword) {}

    private static final String SELECT = """
            SELECT e.id, e.login, e.full_name, e.phone, e.position, r.code AS role_code, r.name AS role_name, e.branch_id,
                   e.status, e.must_change_password
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

    @Transactional
    public Employee create(NewEmployee n) {
        Long roleId = jdbc.sql("SELECT id FROM role WHERE code = :c")
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
        return jdbc.sql(SELECT + " WHERE e.id = :id").param("id", id).query(Employee.class).single();
    }

    @Transactional(readOnly = true)
    public long count() {
        return jdbc.sql("SELECT count(*) FROM employee").query(Long.class).single();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
