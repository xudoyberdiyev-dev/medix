package uz.medix.identity.employee;

import io.swagger.v3.oas.annotations.media.Schema;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.CashierAssignments;
import uz.medix.identity.security.PasswordPolicy;
import uz.medix.inventory.Warehouses;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/** Xodimlar. Loginni administrator yaratadi; vaqtinchalik parol birinchi kirishda almashtiriladi (SPEC 2, 13). */
@Service
public class Employees {

    public record Employee(long id, String login, String fullName,
            @Schema(nullable = true, description = "Familiya (eski yozuvlarda boʻsh)") String lastName,
            @Schema(nullable = true) String firstName, @Schema(nullable = true) String middleName,
            @Schema(nullable = true) String phone,
            @Schema(nullable = true) String position, String roleCode, String roleName, @Schema(nullable = true) Long branchId,
            String status, boolean mustChangePassword,
            @Schema(description = "Buxgalterga Direktor bergan «barcha filiallar» doirasi (E3)") boolean allBranches,
            @Schema(nullable = true, description = "Oxirgi kirish; boʻsh — hali kirmagan («Yangi»)") OffsetDateTime lastLoginAt,
            @Schema(nullable = true) String blockedReason,
            @Schema(description = "Omborchi boʻlgan omborlar (special.whs)") List<Long> warehouseIds,
            @Schema(description = "Kassir boʻlgan kassalar (special.till)") List<Long> cashAccountIds) {}

    /** Yangi xodim. {@code fullName} boʻsh boʻlsa — «Ism Familiya» qismlardan quriladi. */
    public record NewEmployee(String login, String fullName, String lastName, String firstName, String middleName, String phone,
            String position, String roleCode, Long branchId, String temporaryPassword, List<Long> warehouseIds,
            List<Long> cashAccountIds) {}

    public record EmployeeChange(String login, String lastName, String firstName, String middleName, String phone, String position,
            String roleCode, Long branchId, List<Long> warehouseIds, List<Long> cashAccountIds) {}

    public record LoginCheck(@Schema(description = "Ism va familiyadan taklif (boʻsh joyi bilan raqam qoʻshiladi)") String suggested,
            @Schema(nullable = true, description = "Berilgan login boʻshmi; login berilmasa — null") Boolean available) {}

    public record Seats(@Schema(description = "Bloklanmagan xodimlar") long used,
            @Schema(nullable = true, description = "Litsenziya chegarasi; null — cheklanmagan") Integer limit) {}

    private static final String SELECT = """
            SELECT e.id, e.login, e.full_name, e.last_name, e.first_name, e.middle_name, e.phone, e.position,
                   r.code AS role_code, r.name AS role_name, e.branch_id, e.status, e.must_change_password, e.all_branches,
                   e.last_login_at, e.blocked_reason,
                   ARRAY(SELECT w.id FROM warehouse w WHERE w.keeper_id = e.id ORDER BY w.id) AS warehouse_ids,
                   ARRAY(SELECT a.id FROM money_account a WHERE a.cashier_id = e.id ORDER BY a.id) AS cash_ids
            FROM employee e JOIN role r ON r.id = e.role_id""";

    private static Employee map(ResultSet rs, int n) throws SQLException {
        return new Employee(rs.getLong("id"), rs.getString("login"), rs.getString("full_name"), rs.getString("last_name"),
                rs.getString("first_name"), rs.getString("middle_name"), rs.getString("phone"), rs.getString("position"),
                rs.getString("role_code"), rs.getString("role_name"), (Long) rs.getObject("branch_id"), rs.getString("status"),
                rs.getBoolean("must_change_password"), rs.getBoolean("all_branches"),
                rs.getObject("last_login_at", OffsetDateTime.class), rs.getString("blocked_reason"), ids(rs.getArray("warehouse_ids")),
                ids(rs.getArray("cash_ids")));
    }

    private static List<Long> ids(Array a) throws SQLException {
        if (a == null) {
            return List.of();
        }
        return Arrays.stream((Object[]) a.getArray()).map(o -> ((Number) o).longValue()).toList();
    }

    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    private final AuditLog audit;
    private final Warehouses warehouses;
    private final CashierAssignments cashiers;
    /** Litsenziya chegarasi (E13); testda oʻzgartiriladi, shuning uchun final emas. */
    private int limit;

    private final PasswordPolicy passwords;

    Employees(JdbcClient jdbc, PasswordEncoder encoder, AuditLog audit, Warehouses warehouses, CashierAssignments cashiers,
            @Value("${medix.employees.limit:40}") int limit, PasswordPolicy passwords) {
        this.passwords = passwords;
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.audit = audit;
        this.warehouses = warehouses;
        this.cashiers = cashiers;
        this.limit = limit;
    }

    @Transactional(readOnly = true)
    public List<Employee> list() {
        return jdbc.sql(SELECT + " ORDER BY e.full_name").query(Employees::map).list();
    }

    /** Filial doirasi bilan (SPEC 13): barcha filiallar huquqi bo'lmasa — faqat o'z filiali xodimlari. */
    @Transactional(readOnly = true)
    public List<Employee> list(Actor actor) {
        if (actor.allBranches()) {
            return list();
        }
        return jdbc.sql(SELECT + " WHERE e.branch_id = :b ORDER BY e.full_name")
                .param("b", actor.branchId() == null ? -1L : actor.branchId())
                .query(Employees::map)
                .list();
    }

    @Transactional
    public Employee block(Actor actor, long id, String reason) {
        Employee e = accessible(actor, id);
        if (e.id() == actor.employeeId()) {
            throw MedixException.badRequest("employee.cannotBlockSelf");
        }
        if ("DIRECTOR".equals(e.roleCode())) {
            checkNotLastDirector(id);
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
        if ("BLOCKED".equals(e.status()) && limit > 0) {
            jdbc.sql("SELECT pg_advisory_xact_lock(hashtext('employee.limit'))").query(Object.class).single();
            if (seats().used() >= limit) {
                throw MedixException.conflict("employee.limit", limit);
            }
        }
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
        passwords.check(temporaryPassword);
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

    /** Oxirgi faol Direktorni bloklash yoki rolini almashtirish mumkin emas (tizim egasiz qolmasin). */
    private void checkNotLastDirector(long id) {
        long others = jdbc.sql("""
                SELECT count(*) FROM employee e JOIN role r ON r.id = e.role_id
                WHERE r.code = 'DIRECTOR' AND e.status <> 'BLOCKED' AND e.id <> :id""")
                .param("id", id)
                .query(Long.class)
                .single();
        if (others == 0) {
            throw MedixException.badRequest("employee.lastDirector");
        }
    }

    public record LoginEvent(
            OffsetDateTime at,
            @Schema(description = "OK — kirdi, FAILED — notoʻgʻri parol, BLOCKED — bloklangan") String result,
            @Schema(nullable = true) String device,
            @Schema(nullable = true) String ip) {}

    public record ActionEvent(
            OffsetDateTime at,
            String action,
            String entityType,
            @Schema(nullable = true) String entityId,
            @Schema(nullable = true) String reason) {}

    public record Journal(
            List<LoginEvent> logins,
            List<ActionEvent> actions,
            @Schema(description = "Ochiq sessiyalar soni") int sessions,
            boolean pinSet,
            @Schema(nullable = true) OffsetDateTime pinSetAt) {}

    /** Xodim kartasi (prototip AdminStaff): oxirgi 20 kirish, oxirgi 50 harakat, ochiq sessiyalar, PIN holati. */
    @Transactional(readOnly = true)
    public Journal journal(Actor actor, long id) {
        Employee e = accessible(actor, id);
        List<LoginEvent> logins = jdbc.sql("""
                SELECT occurred_at, action, new_value ->> 'device' AS device, host(ip_address) AS ip FROM audit_log
                WHERE entity_type = 'employee' AND entity_id = :id AND action IN ('auth.login', 'auth.loginFailed', 'auth.loginBlocked')
                ORDER BY occurred_at DESC, id DESC LIMIT 20""")
                .param("id", String.valueOf(id))
                .query((rs, n) -> new LoginEvent(rs.getObject("occurred_at", OffsetDateTime.class),
                        switch (rs.getString("action")) {
                            case "auth.login" -> "OK";
                            case "auth.loginBlocked" -> "BLOCKED";
                            default -> "FAILED";
                        },
                        rs.getString("device"), rs.getString("ip")))
                .list();
        List<ActionEvent> actions = jdbc.sql("""
                SELECT occurred_at, action, entity_type, entity_id, reason FROM audit_log
                WHERE employee_id = :id AND action NOT IN ('auth.login', 'auth.loginFailed', 'auth.loginBlocked')
                ORDER BY occurred_at DESC, id DESC LIMIT 50""")
                .param("id", id)
                .query((rs, n) -> new ActionEvent(rs.getObject("occurred_at", OffsetDateTime.class), rs.getString("action"),
                        rs.getString("entity_type"), rs.getString("entity_id"), rs.getString("reason")))
                .list();
        int sessions = jdbc.sql("SELECT count(*) FROM spring_session WHERE principal_name = :login")
                .param("login", e.login())
                .query(Integer.class)
                .single();
        return jdbc.sql("SELECT pin_hash IS NOT NULL AS pin_set, pin_set_at FROM employee WHERE id = :id")
                .param("id", id)
                .query((rs, n) -> new Journal(logins, actions, sessions, rs.getBoolean("pin_set"),
                        rs.getObject("pin_set_at", OffsetDateTime.class)))
                .single();
    }

    /** Xodimning barcha ochiq sessiyalarini tugatadi; tugatilganlar sonini qaytaradi. */
    @Transactional
    public int endSessions(Actor actor, long id) {
        Employee e = accessible(actor, id);
        int n = jdbc.sql("DELETE FROM spring_session WHERE principal_name = :login").param("login", e.login()).update();
        audit.record(AuditEntry.of("employee.endSessions", "employee", id).change(null, Map.of("sessions", n)));
        return n;
    }

    /** PIN-kodni bekor qiladi — xodim keyingi kirishda yangisini oʻrnatadi. */
    @Transactional
    public Employee resetPin(Actor actor, long id) {
        accessible(actor, id);
        jdbc.sql("""
                UPDATE employee SET pin_hash = NULL, pin_set_at = NULL, pin_failed_count = 0, pin_locked_until = NULL,
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("employee.resetPin", "employee", id));
        return get(id);
    }

    private Employee get(long id) {
        return jdbc.sql(SELECT + " WHERE e.id = :id").param("id", id).query(Employees::map).single();
    }

    /** Topilmasa yoki boshqa filialniki bo'lsa — 404 (boshqa filial xodimi borligini ham bildirmaymiz). */
    private Employee accessible(Actor actor, long id) {
        Employee e = jdbc.sql(SELECT + " WHERE e.id = :id")
                .param("id", id)
                .query(Employees::map)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (!actor.allBranches() && (e.branchId() == null || !actor.canAccessBranch(e.branchId()))) {
            throw MedixException.notFound("error.notFound");
        }
        return e;
    }

    @Transactional
    public Employee create(NewEmployee n) {
        passwords.check(n.temporaryPassword());
        Long roleId = roleId(n.roleCode());
        checkBranch(n.branchId());
        String fullName = fullName(n.fullName(), n.firstName(), n.lastName());
        if (limit > 0) {
            // Parallel qoʻshishda chegaradan oshmasin
            jdbc.sql("SELECT pg_advisory_xact_lock(hashtext('employee.limit'))").query(Object.class).single();
            if (seats().used() >= limit) {
                throw MedixException.conflict("employee.limit", limit);
            }
        }
        String login = n.login().strip().toLowerCase(Locale.ROOT);
        if (loginTaken(login, null)) {
            throw MedixException.conflict("employee.loginTaken", login);
        }
        long id;
        try {
            id = jdbc.sql("""
                    INSERT INTO employee (login, full_name, last_name, first_name, middle_name, phone, position, role_id, branch_id,
                                          password_hash, must_change_password)
                    VALUES (:login, :name, :last, :first, :mid, :phone, :position, :role, :branch, :hash, true) RETURNING id""")
                    .param("login", login)
                    .param("name", fullName)
                    .param("last", blankToNull(n.lastName()))
                    .param("first", blankToNull(n.firstName()))
                    .param("mid", blankToNull(n.middleName()))
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
        assignPlaces(id, n.roleCode(), n.branchId(), n.warehouseIds(), n.cashAccountIds());
        Map<String, Object> snapshot = new HashMap<>();
        snapshot.put("login", login);
        snapshot.put("fullName", fullName);
        snapshot.put("role", n.roleCode());
        snapshot.put("branchId", n.branchId());
        audit.record(AuditEntry.of("employee.create", "employee", id).change(null, snapshot));
        return get(id);
    }

    /**
     * Xodim maʼlumotlarini tahrirlash (prototip WizStaff/AdminStaff paneli). Login oʻzgarsa ochiq sessiyalari tugatiladi.
     * Oʻz rolini oʻzgartirib boʻlmaydi (oʻzini qulflab qoʻymasin).
     */
    @Transactional
    public Employee update(Actor actor, long id, EmployeeChange c) {
        Employee before = accessible(actor, id);
        Long roleId = roleId(c.roleCode());
        if (id == actor.employeeId() && !before.roleCode().equals(c.roleCode())) {
            throw MedixException.badRequest("employee.cannotChangeOwnRole");
        }
        if ("DIRECTOR".equals(before.roleCode()) && !"DIRECTOR".equals(c.roleCode())) {
            checkNotLastDirector(id);
        }
        checkBranch(c.branchId());
        String login = c.login().strip().toLowerCase(Locale.ROOT);
        if (loginTaken(login, id)) {
            throw MedixException.conflict("employee.loginTaken", login);
        }
        String fullName = fullName(null, c.firstName(), c.lastName());
        try {
            jdbc.sql("""
                    UPDATE employee SET login = :login, full_name = :name, last_name = :last, first_name = :first, middle_name = :mid,
                           phone = :phone, position = :position, role_id = :role, branch_id = :branch, updated_at = now(),
                           version = version + 1
                    WHERE id = :id""")
                    .param("login", login)
                    .param("name", fullName)
                    .param("last", blankToNull(c.lastName()))
                    .param("first", blankToNull(c.firstName()))
                    .param("mid", blankToNull(c.middleName()))
                    .param("phone", blankToNull(c.phone()))
                    .param("position", blankToNull(c.position()))
                    .param("role", roleId)
                    .param("branch", c.branchId())
                    .param("id", id)
                    .update();
        } catch (DuplicateKeyException e) {
            throw MedixException.conflict("employee.loginTaken", login);
        }
        assignPlaces(id, c.roleCode(), c.branchId(), c.warehouseIds(), c.cashAccountIds());
        boolean access = !before.login().equals(login) || !before.roleCode().equals(c.roleCode())
                || !java.util.Objects.equals(before.branchId(), c.branchId());
        if (access) {
            // Yangi login / rol / filial keyingi kirishda kuchga kiradi
            jdbc.sql("DELETE FROM spring_session WHERE principal_name = :login").param("login", before.login()).update();
        }
        Employee after = get(id);
        audit.record(AuditEntry.of("employee.update", "employee", id).change(snapshot(before), snapshot(after)));
        return after;
    }

    /** Login taklifi (ism bosh harfi + «.» + familiya, lotinda) va berilgan login boʻshligi. */
    @Transactional(readOnly = true)
    public LoginCheck checkLogin(String firstName, String lastName, String login, Long exceptId) {
        String base = latin(firstName).isEmpty() && latin(lastName).isEmpty() ? ""
                : (latin(firstName).isEmpty() ? "" : latin(firstName).substring(0, 1)) + "." + latin(lastName);
        String suggested = "";
        if (base.length() >= 3) {
            suggested = base;
            for (int i = 2; loginTaken(suggested, exceptId); i++) {
                suggested = base + i;
            }
        }
        Boolean available = login == null || login.isBlank() ? null : !loginTaken(login.strip().toLowerCase(Locale.ROOT), exceptId);
        return new LoginCheck(suggested, available);
    }

    @Transactional(readOnly = true)
    public Seats seats() {
        long used = jdbc.sql("SELECT count(*) FROM employee WHERE status <> 'BLOCKED'").query(Long.class).single();
        return new Seats(used, limit > 0 ? limit : null);
    }

    private void assignPlaces(long id, String roleCode, Long branchId, List<Long> warehouseIds, List<Long> cashIds) {
        warehouses.assignKeeper(id, branchId, rolePermits(roleCode, "special.whs") && branchId != null ? warehouseIds : List.of());
        cashiers.assign(id, branchId, rolePermits(roleCode, "special.till") && branchId != null ? cashIds : List.of());
    }

    private boolean rolePermits(String roleCode, String permission) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM role_permission rp JOIN role r ON r.id = rp.role_id
                               WHERE r.code = :c AND rp.permission_key = :p)""")
                .param("c", roleCode)
                .param("p", permission)
                .query(Boolean.class)
                .single();
    }

    private Long roleId(String code) {
        return jdbc.sql("SELECT id FROM role WHERE code = :c AND active")
                .param("c", code)
                .query(Long.class)
                .optional()
                .orElseThrow(() -> MedixException.badRequest("employee.roleUnknown"));
    }

    private void checkBranch(Long branchId) {
        if (branchId == null) {
            return;
        }
        boolean branchExists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM branch WHERE id = :b)")
                .param("b", branchId)
                .query(Boolean.class)
                .single();
        if (!branchExists) {
            throw MedixException.badRequest("employee.branchUnknown");
        }
    }

    private boolean loginTaken(String login, Long exceptId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM employee WHERE login = :l AND id <> :x)")
                .param("l", login)
                .param("x", exceptId == null ? -1L : exceptId)
                .query(Boolean.class)
                .single();
    }

    private static String fullName(String fullName, String first, String last) {
        if (fullName != null && !fullName.isBlank()) {
            return fullName.strip();
        }
        String f = first == null ? "" : first.strip();
        String l = last == null ? "" : last.strip();
        if (f.isEmpty() || l.isEmpty()) {
            throw MedixException.badRequest("employee.nameRequired");
        }
        return f + " " + l;
    }

    private static Map<String, Object> snapshot(Employee e) {
        Map<String, Object> m = new HashMap<>();
        m.put("login", e.login());
        m.put("fullName", e.fullName());
        m.put("middleName", e.middleName());
        m.put("phone", e.phone());
        m.put("role", e.roleCode());
        m.put("branchId", e.branchId());
        m.put("warehouseIds", e.warehouseIds());
        m.put("cashAccountIds", e.cashAccountIds());
        return m;
    }

    private static final String[][] CYR = {
        {"ё", "yo"}, {"ж", "j"}, {"ц", "ts"}, {"ч", "ch"}, {"ш", "sh"}, {"щ", "sh"}, {"ю", "yu"}, {"я", "ya"}, {"ў", "o"},
        {"қ", "q"}, {"ғ", "g"}, {"ҳ", "h"}, {"а", "a"}, {"б", "b"}, {"в", "v"}, {"г", "g"}, {"д", "d"}, {"е", "e"}, {"з", "z"},
        {"и", "i"}, {"й", "y"}, {"к", "k"}, {"л", "l"}, {"м", "m"}, {"н", "n"}, {"о", "o"}, {"п", "p"}, {"р", "r"}, {"с", "s"},
        {"т", "t"}, {"у", "u"}, {"ф", "f"}, {"х", "x"}, {"ы", "i"}, {"э", "e"}
    };

    /** Login uchun lotin harflari: kirill → lotin, faqat a–z va raqamlar. */
    static String latin(String s) {
        String x = Optional.ofNullable(s).orElse("").strip().toLowerCase(Locale.ROOT);
        for (String[] p : CYR) {
            x = x.replace(p[0], p[1]);
        }
        return x.replaceAll("[^a-z0-9]", "");
    }

    @Transactional(readOnly = true)
    public long count() {
        return jdbc.sql("SELECT count(*) FROM employee").query(Long.class).single();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
