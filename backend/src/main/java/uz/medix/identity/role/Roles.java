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
            @Schema(description = "Biriktirilgan faol xodimlar soni") long employeeCount,
            @Schema(nullable = true) String description,
            @Schema(description = "all — barcha filiallar, own — o'z filiali", allowableValues = {"all", "own"}) String scope,
            @Schema(description = "Bosh sahifa turi", allowableValues = {"director", "branch", "operator", "purchase", "keeper", "cashier",
                    "accountant", "picker", "marker", "driver"}) String home,
            boolean active) {}

    public record Permission(
            String key,
            String module,
            String description,
            @Schema(description = "Matritsa guruhi", allowableValues = {"sales", "wh", "money", "ref", "rep", "admin", "special"}) String group,
            @Schema(allowableValues = {"view", "create", "cancel", "approve", "special"}) String kind,
            @Schema(nullable = true, description = "Bog'liq sahifa: amal uchun <page>.view kerak") String page,
            @Schema(nullable = true, description = "dir — faqat Direktorda; excl — Direktorga avtomatik berilmaydi",
                    allowableValues = {"dir", "excl"}) String lock) {}

    public record LastChange(java.time.Instant at, @Schema(nullable = true) String by) {}

    public record Matrix(List<Role> roles, List<Permission> permissions,
            @Schema(description = "Rol kodi → ruxsat kalitlari") Map<String, List<String>> grants,
            @Schema(description = "Standart rol kodi → standart ruxsatlar («Standartga qaytarish»)") Map<String, List<String>> defaults,
            @Schema(nullable = true, description = "Oxirgi o'zgarish") LastChange lastChange) {}

    /** Matritsani saqlash: {@code code} bo'sh — yangi rol ({@code copiedFrom} — asos rol). */
    public record RoleDraft(
            @Schema(nullable = true) String code,
            String name,
            @Schema(nullable = true) String description,
            String scope,
            String home,
            boolean active,
            Set<String> permissions,
            @Schema(nullable = true) String copiedFrom) {}

    static final Set<String> SCOPES = Set.of("all", "own");
    static final Set<String> HOMES = Set.of("director", "branch", "operator", "purchase", "keeper", "cashier", "accountant", "picker", "marker", "driver");

    private final JdbcClient jdbc;
    private final AuditLog audit;

    Roles(JdbcClient jdbc, AuditLog audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public Matrix matrix() {
        List<Permission> permissions = jdbc.sql("""
                SELECT key, module, description, grp AS "group", kind, page, lock_kind AS lock FROM permission ORDER BY module, key""")
                .query(Permission.class)
                .list();
        List<Role> roles = list();
        Map<String, List<String>> grants = new LinkedHashMap<>();
        for (Role r : roles) {
            grants.put(r.code(), new ArrayList<>());
        }
        jdbc.sql("""
                SELECT r.code, rp.permission_key FROM role_permission rp JOIN role r ON r.id = rp.role_id
                ORDER BY r.id, rp.permission_key""")
                .query((rs, n) -> grants.computeIfAbsent(rs.getString("code"), k -> new ArrayList<>()).add(rs.getString("permission_key")))
                .list();
        Map<String, List<String>> defaults = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT r.code, d.permission_key FROM role_permission_default d JOIN role r ON r.id = d.role_id
                ORDER BY r.id, d.permission_key""")
                .query((rs, n) -> defaults.computeIfAbsent(rs.getString("code"), k -> new ArrayList<>()).add(rs.getString("permission_key")))
                .list();
        LastChange last = jdbc.sql("""
                SELECT a.occurred_at AS "at", e.full_name AS "by" FROM audit_log a LEFT JOIN employee e ON e.id = a.employee_id
                WHERE a.entity_type = 'role' ORDER BY a.occurred_at DESC, a.id DESC LIMIT 1""")
                .query(LastChange.class)
                .optional()
                .orElse(null);
        return new Matrix(roles, permissions, grants, defaults, last);
    }

    /**
     * Butun matritsani bitta tranzaksiyada saqlaydi (prototip WizRoles «Saqlash»): rol maydonlari, ruxsatlar, yangi rollar.
     * Direktor roli o'zgarmaydi; «faqat Direktor» kalitlari boshqa rolga berilmaydi; amal yoqilsa — sahifani ko'rish ham.
     * Xodimi bor rol nofaol qilinmaydi. O'zgarish xodimning keyingi kirishida kuchga kiradi.
     */
    @Transactional
    public Matrix save(List<RoleDraft> drafts) {
        return save(drafts, true);
    }

    /** {@code director} — false boʻlsa rol doirasini («Barcha filiallar») oʻzgartirib boʻlmaydi (egasi E14). */
    public Matrix save(List<RoleDraft> drafts, boolean director) {
        Map<String, Role> byCode = new LinkedHashMap<>();
        list().forEach(r -> byCode.put(r.code(), r));
        Map<String, String[]> meta = new LinkedHashMap<>();
        jdbc.sql("SELECT key, kind, page, lock_kind FROM permission")
                .query((rs, n) -> meta.put(rs.getString("key"), new String[] {rs.getString("kind"), rs.getString("page"), rs.getString("lock_kind")}))
                .list();
        Set<String> names = new HashSet<>();
        for (RoleDraft d : drafts) {
            Role r = d.code() == null ? null : byCode.get(d.code());
            if (d.code() != null && r == null) {
                throw MedixException.notFound("error.notFound");
            }
            String name = r != null && r.system() ? r.name() : d.name() == null ? "" : d.name().strip();
            if (name.isEmpty() || name.length() > 100) {
                throw MedixException.badRequest("role.nameRequired");
            }
            if (!names.add(name.toLowerCase(java.util.Locale.ROOT))) {
                throw MedixException.conflict("role.nameTaken", name);
            }
            if (!SCOPES.contains(d.scope()) || !HOMES.contains(d.home())) {
                throw MedixException.badRequest("role.badScope");
            }
            if (!director && (r == null ? "all".equals(d.scope()) : !d.scope().equals(r.scope()))) {
                throw MedixException.forbidden("role.scopeDirectorOnly");
            }
        }
        for (Role r : byCode.values()) {
            boolean inDraft = drafts.stream().anyMatch(d -> r.code().equals(d.code()));
            if (!inDraft && !names.add(r.name().toLowerCase(java.util.Locale.ROOT))) {
                throw MedixException.conflict("role.nameTaken", r.name());
            }
        }
        for (RoleDraft d : drafts) {
            if ("DIRECTOR".equals(d.code())) {
                continue;
            }
            Role r = d.code() == null ? null : byCode.get(d.code());
            Set<String> before = r == null ? Set.of() : new HashSet<>(jdbc.sql("SELECT permission_key FROM role_permission WHERE role_id = :r")
                    .param("r", r.id()).query(String.class).list());
            Set<String> keys = normalize(d.permissions() == null ? Set.of() : d.permissions(), before, meta);
            if (r == null) {
                create(d, keys);
                continue;
            }
            if ("ADMIN".equals(r.code()) && !keys.contains("roles.view")) {
                throw MedixException.conflict("role.adminNeedsRoles");
            }
            boolean active = r.system() || d.active();
            if (!active && r.active() && r.employeeCount() > 0) {
                throw MedixException.conflict("role.hasEmployees", r.name(), r.employeeCount());
            }
            String desc = r.system() ? r.description() : blankToNull(d.description());
            String name = r.system() ? r.name() : d.name().strip();
            boolean fieldsChanged = !name.equals(r.name()) || !java.util.Objects.equals(desc, r.description())
                    || !d.scope().equals(r.scope()) || !d.home().equals(r.home()) || active != r.active();
            if (fieldsChanged) {
                jdbc.sql("""
                        UPDATE role SET name = :n, description = :d, scope = :s, home_kind = :h, active = :a,
                               updated_at = now(), version = version + 1 WHERE id = :id""")
                        .param("n", name).param("d", desc).param("s", d.scope()).param("h", d.home()).param("a", active).param("id", r.id())
                        .update();
                audit.record(AuditEntry.of("role.update", "role", r.id())
                        .change(fields(r.name(), r.description(), r.scope(), r.home(), r.active()), fields(name, desc, d.scope(), d.home(), active)));
            }
            replacePermissions(r.id(), keys);
        }
        return matrix();
    }

    private static Map<String, Object> fields(String name, String desc, String scope, String home, boolean active) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("description", desc == null ? "" : desc);
        m.put("scope", scope);
        m.put("home", home);
        m.put("active", active);
        return m;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    /**
     * Noma'lum va «faqat Direktor» kalitlari rad etiladi; YANGI yoqilgan amal kaliti sahifani ko'rishni ham yoqadi
     * (avvaldan bor standart to'plamlarga tegilmaydi — masalan, Haydovchi «Reys: haydovchi» bilan, Jo'natish sahifasisiz).
     */
    static Set<String> normalize(Set<String> keys, Set<String> before, Map<String, String[]> meta) {
        Set<String> out = new TreeSet<>();
        for (String k : keys) {
            String[] m = meta.get(k);
            if (m == null) {
                throw MedixException.badRequest("role.unknownPermission", k);
            }
            if ("dir".equals(m[2])) {
                throw MedixException.conflict("role.directorOnly", k);
            }
            out.add(k);
            if (!before.contains(k) && !"view".equals(m[0]) && m[1] != null && meta.containsKey(m[1] + ".view")) {
                out.add(m[1] + ".view");
            }
        }
        return out;
    }

    private void create(RoleDraft d, Set<String> keys) {
        String code = nextCode();
        Long source = d.copiedFrom() == null ? null
                : jdbc.sql("SELECT id FROM role WHERE code = :c").param("c", d.copiedFrom()).query(Long.class).optional().orElse(null);
        long id = jdbc.sql("""
                INSERT INTO role (code, name, system, copied_from, description, scope, home_kind, active)
                VALUES (:c, :n, false, :src, :d, :s, :h, true) RETURNING id""")
                .param("c", code).param("n", d.name().strip()).param("src", source).param("d", blankToNull(d.description()))
                .param("s", d.scope()).param("h", d.home())
                .query(Long.class)
                .single();
        audit.record(AuditEntry.of("role.create", "role", id).change(null, Map.of("code", code, "name", d.name().strip())));
        replacePermissions(id, keys);
    }

    private String nextCode() {
        long n = jdbc.sql("SELECT count(*) FROM role WHERE NOT system").query(Long.class).single() + 1;
        String code = "CUSTOM_" + n;
        while (jdbc.sql("SELECT EXISTS (SELECT 1 FROM role WHERE code = :c)").param("c", code).query(Boolean.class).single()) {
            code = "CUSTOM_" + (++n);
        }
        return code;
    }

    private void replacePermissions(long roleId, Set<String> keys) {
        List<String> before = jdbc.sql("SELECT permission_key FROM role_permission WHERE role_id = :r ORDER BY permission_key")
                .param("r", roleId)
                .query(String.class)
                .list();
        Set<String> added = new TreeSet<>(keys);
        before.forEach(added::remove);
        Set<String> removed = new TreeSet<>(before);
        removed.removeAll(keys);
        if (added.isEmpty() && removed.isEmpty()) {
            return;
        }
        jdbc.sql("DELETE FROM role_permission WHERE role_id = :r").param("r", roleId).update();
        for (String k : new TreeSet<>(keys)) {
            jdbc.sql("INSERT INTO role_permission (role_id, permission_key) VALUES (:r, :k)").param("r", roleId).param("k", k).update();
        }
        audit.record(AuditEntry.of("role.permissions", "role", roleId)
                .change(Map.of("removed", List.copyOf(removed)), Map.of("added", List.copyOf(added))));
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
        long id = jdbc.sql("INSERT INTO role (code, name, system, copied_from, scope, home_kind) SELECT :c, :n, false, :src, scope, home_kind FROM role WHERE id = :src RETURNING id")
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

    /** Rolning bosh sahifa turi (frontend bosh sahifani shundan tanlaydi). */
    @Transactional(readOnly = true)
    public String home(String roleCode) {
        return jdbc.sql("SELECT home_kind FROM role WHERE code = :c").param("c", roleCode).query(String.class).optional().orElse("operator");
    }

    @Transactional(readOnly = true)
    public List<Role> list() {
        return jdbc.sql("""
                SELECT r.id, r.code, r.name, r.system, count(e.id) AS employee_count, r.description, r.scope,
                       r.home_kind AS home, r.active
                FROM role r LEFT JOIN employee e ON e.role_id = r.id AND e.status <> 'BLOCKED'
                GROUP BY r.id ORDER BY r.id""")
                .query(Role.class)
                .list();
    }
}
