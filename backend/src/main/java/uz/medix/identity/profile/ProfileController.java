package uz.medix.identity.profile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/** Profil (Boshqaruv → Profil): o'z ma'lumotlari, telefon, PIN. Ism, rol va filialni administrator o'zgartiradi. */
@RestController
@RequestMapping("/api/profile")
@Tag(name = "profile", description = "Profil")
class ProfileController {

    record Profile(
            long id,
            String login,
            String fullName,
            @Schema(nullable = true) String phone,
            @Schema(nullable = true) String position,
            String roleCode,
            String roleName,
            @Schema(nullable = true) String branchName,
            boolean pinSet,
            @Schema(nullable = true) Instant pinSetAt,
            @Schema(nullable = true) Instant lastLoginAt) {}

    record UpdateProfileRequest(@Schema(nullable = true) @Size(max = 32) String phone) {}

    record SetPinRequest(
            @NotBlank(message = "{validation.required}") String currentPassword,
            @NotBlank(message = "{validation.required}") String pin) {}

    private final JdbcClient jdbc;
    private final PinService pins;
    private final CurrentActor currentActor;
    private final AuditLog audit;

    ProfileController(JdbcClient jdbc, PinService pins, CurrentActor currentActor, AuditLog audit) {
        this.jdbc = jdbc;
        this.pins = pins;
        this.currentActor = currentActor;
        this.audit = audit;
    }

    private long me() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized")).employeeId();
    }

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "O'z profilim")
    Profile get() {
        return load(me());
    }

    @PutMapping
    @Transactional
    @Operation(summary = "Telefon raqamini yangilash")
    Profile update(@Valid @RequestBody UpdateProfileRequest r) {
        long id = me();
        Profile before = load(id);
        String phone = r.phone() == null || r.phone().isBlank() ? null : r.phone().strip();
        jdbc.sql("UPDATE employee SET phone = :p, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("p", phone)
                .param("id", id)
                .update();
        Map<String, Object> was = new HashMap<>();
        was.put("phone", before.phone());
        Map<String, Object> now = new HashMap<>();
        now.put("phone", phone);
        audit.record(AuditEntry.of("profile.update", "employee", id).change(was, now));
        return load(id);
    }

    @PutMapping("/pin")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "PIN o'rnatish yoki almashtirish", description = "Joriy parol bilan tasdiqlanadi. PIN — 4–6 raqam.")
    void setPin(@Valid @RequestBody SetPinRequest r) {
        pins.setPin(me(), r.currentPassword(), r.pin());
    }

    private Profile load(long id) {
        return jdbc.sql("""
                SELECT e.id, e.login, e.full_name, e.phone, e.position, r.code, r.name, b.name AS branch_name,
                       e.pin_hash IS NOT NULL AS pin_set, e.pin_set_at, e.last_login_at
                FROM employee e JOIN role r ON r.id = e.role_id LEFT JOIN branch b ON b.id = e.branch_id
                WHERE e.id = :id""")
                .param("id", id)
                .query((rs, n) -> new Profile(rs.getLong("id"), rs.getString("login"), rs.getString("full_name"),
                        rs.getString("phone"), rs.getString("position"), rs.getString("code"), rs.getString("name"),
                        rs.getString("branch_name"), rs.getBoolean("pin_set"), instant(rs.getTimestamp("pin_set_at")),
                        instant(rs.getTimestamp("last_login_at"))))
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static Instant instant(Timestamp t) {
        return Optional.ofNullable(t).map(Timestamp::toInstant).orElse(null);
    }
}
