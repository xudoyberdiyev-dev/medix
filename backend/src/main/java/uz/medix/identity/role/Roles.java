package uz.medix.identity.role;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;

/** Rollar (SPEC 3: 11 ta standart rol + nusxalar) va ruxsatlar matritsasi (1.3: 132 kalit). */
@Service
public class Roles {

    public record Role(
            long id,
            String code,
            String name,
            @Schema(description = "Standart rol: o'chirilmaydi") boolean system,
            @Schema(description = "Biriktirilgan xodimlar soni") long employeeCount) {}

    public record Permission(String key, String module, String description) {}

    public record Matrix(List<Role> roles, List<Permission> permissions,
            @Schema(description = "Rol kodi → ruxsat kalitlari") Map<String, List<String>> grants) {}

    private final JdbcClient jdbc;
    private final AuditLog audit;

    Roles(JdbcClient jdbc, AuditLog audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public Matrix matrix() {
        List<Permission> permissions = jdbc.sql("SELECT key, module, description FROM permission ORDER BY module, key")
                .query(Permission.class)
                .list();
        Map<String, List<String>> grants = new LinkedHashMap<>();
        for (Role r : list()) {
            grants.put(r.code(), new ArrayList<>());
        }
        jdbc.sql("""
                SELECT r.code, rp.permission_key FROM role_permission rp JOIN role r ON r.id = rp.role_id
                ORDER BY r.id, rp.permission_key""")
                .query((rs, n) -> grants.computeIfAbsent(rs.getString("code"), k -> new ArrayList<>()).add(rs.getString("permission_key")))
                .list();
        return new Matrix(list(), permissions, grants);
    }

    /**
     * Rol ruxsatlarini almashtiradi. Direktor roli himoyalangan (tizimga kirish huquqini yo'qotmaslik uchun).
     * O'zgarish xodimning keyingi kirishida kuchga kiradi.
     */
    @Transactional
    public void setPermissions(String roleCode, Set<String> keys) {
        Role role = list().stream().filter(r -> r.code().equals(roleCode)).findFirst()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if ("DIRECTOR".equals(role.code())) {
            throw MedixException.conflict("role.directorProtected");
        }
        Set<String> known = new HashSet<>(jdbc.sql("SELECT key FROM permission").query(String.class).list());
        for (String k : keys) {
            if (!known.contains(k)) {
                throw MedixException.badRequest("role.unknownPermission", k);
            }
        }
        if ("ADMIN".equals(role.code()) && !keys.contains("roles.view")) {
            throw MedixException.conflict("role.adminNeedsRoles");
        }
        List<String> before = jdbc.sql("SELECT permission_key FROM role_permission WHERE role_id = :r ORDER BY permission_key")
                .param("r", role.id())
                .query(String.class)
                .list();
        jdbc.sql("DELETE FROM role_permission WHERE role_id = :r").param("r", role.id()).update();
        for (String k : new TreeSet<>(keys)) {
            jdbc.sql("INSERT INTO role_permission (role_id, permission_key) VALUES (:r, :k)").param("r", role.id()).param("k", k).update();
        }
        Set<String> added = new TreeSet<>(keys);
        before.forEach(added::remove);
        Set<String> removed = new TreeSet<>(before);
        removed.removeAll(keys);
        audit.record(AuditEntry.of("role.permissions", "role", role.id())
                .change(Map.of("removed", List.copyOf(removed)), Map.of("added", List.copyOf(added))));
    }

    /** Rol nusxasi (SPEC 3): standart rol asosida yangi rol, ruxsatlari bilan. */
    @Transactional
    public Role copy(String sourceCode, String name) {
        Role source = list().stream().filter(r -> r.code().equals(sourceCode)).findFirst()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        boolean taken = jdbc.sql("SELECT EXISTS (SELECT 1 FROM role WHERE lower(name) = lower(:n))").param("n", name.strip()).query(Boolean.class).single();
        if (taken) {
            throw MedixException.conflict("role.nameTaken", name.strip());
        }
        long n = jdbc.sql("SELECT count(*) FROM role WHERE NOT system").query(Long.class).single() + 1;
        String code = "CUSTOM_" + n;
        while (jdbc.sql("SELECT EXISTS (SELECT 1 FROM role WHERE code = :c)").param("c", code).query(Boolean.class).single()) {
            code = "CUSTOM_" + (++n);
        }
        long id = jdbc.sql("INSERT INTO role (code, name, system, copied_from) VALUES (:c, :n, false, :src) RETURNING id")
                .param("c", code)
                .param("n", name.strip())
                .param("src", source.id())
                .query(Long.class)
                .single();
        jdbc.sql("INSERT INTO role_permission (role_id, permission_key) SELECT :id, permission_key FROM role_permission WHERE role_id = :src")
                .param("id", id)
                .param("src", source.id())
                .update();
        audit.record(AuditEntry.of("role.copy", "role", id).change(null, Map.of("code", code, "name", name.strip(), "from", source.code())));
        final String newCode = code;
        return list().stream().filter(r -> r.code().equals(newCode)).findFirst().orElseThrow();
    }

    @Transactional(readOnly = true)
    public List<Role> list() {
        return jdbc.sql("""
                SELECT r.id, r.code, r.name, r.system, count(e.id) AS employee_count
                FROM role r LEFT JOIN employee e ON e.role_id = r.id
                GROUP BY r.id ORDER BY r.id""")
                .query(Role.class)
                .list();
    }
}
