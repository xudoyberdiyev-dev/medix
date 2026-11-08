package uz.medix.identity.security;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Kirish uchun xodim hisoblari (identity moduli ichki). */
@Repository
class EmployeeAccounts {

    record Account(
            long id,
            String login,
            String fullName,
            String passwordHash,
            String status,
            boolean mustChangePassword,
            Long branchId,
            long roleId,
            String roleCode,
            String roleName,
            boolean allBranches) {

        boolean blocked() {
            return "BLOCKED".equals(status);
        }
    }

    private final JdbcClient jdbc;

    EmployeeAccounts(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<Account> findByLogin(String login) {
        return jdbc.sql("""
                SELECT e.id, e.login, e.full_name, e.password_hash, e.status, e.must_change_password, e.branch_id,
                       r.id AS role_id, r.code AS role_code, r.name AS role_name, e.all_branches
                FROM employee e JOIN role r ON r.id = e.role_id
                WHERE e.login = :login""")
                .param("login", login)
                .query(Account.class)
                .optional();
    }

    Optional<Account> findById(long id) {
        return jdbc.sql("""
                SELECT e.id, e.login, e.full_name, e.password_hash, e.status, e.must_change_password, e.branch_id,
                       r.id AS role_id, r.code AS role_code, r.name AS role_name, e.all_branches
                FROM employee e JOIN role r ON r.id = e.role_id
                WHERE e.id = :id""")
                .param("id", id)
                .query(Account.class)
                .optional();
    }

    List<String> permissionsOf(long roleId) {
        return jdbc.sql("SELECT permission_key FROM role_permission WHERE role_id = :r ORDER BY permission_key")
                .param("r", roleId)
                .query(String.class)
                .list();
    }

    void recordSuccessfulLogin(long id, Instant at) {
        jdbc.sql("UPDATE employee SET failed_login_count = 0, last_login_at = :at WHERE id = :id")
                .param("at", java.sql.Timestamp.from(at))
                .param("id", id)
                .update();
    }

    void recordFailedLogin(long id) {
        jdbc.sql("UPDATE employee SET failed_login_count = failed_login_count + 1 WHERE id = :id")
                .param("id", id)
                .update();
    }

    void changePassword(long id, String newHash, Instant at) {
        jdbc.sql("""
                UPDATE employee SET password_hash = :h, must_change_password = false, updated_at = :at, version = version + 1
                WHERE id = :id""")
                .param("h", newHash)
                .param("at", java.sql.Timestamp.from(at))
                .param("id", id)
                .update();
    }

    long count() {
        return jdbc.sql("SELECT count(*) FROM employee").query(Long.class).single();
    }

    long roleId(String code) {
        return jdbc.sql("SELECT id FROM role WHERE code = :c").param("c", code).query(Long.class).single();
    }

    long create(String login, String fullName, long roleId, String passwordHash) {
        return jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, must_change_password)
                VALUES (:login, :name, :role, :hash, true) RETURNING id""")
                .param("login", login)
                .param("name", fullName)
                .param("role", roleId)
                .param("hash", passwordHash)
                .query(Long.class)
                .single();
    }
}
