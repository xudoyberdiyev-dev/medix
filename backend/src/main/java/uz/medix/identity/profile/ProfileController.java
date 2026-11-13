package uz.medix.identity.profile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.identity.employee.Employees;
import uz.medix.identity.security.MedixPrincipal;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/**
 * Profil (Boshqaruv → Profil): o'z ma'lumotlari, PIN. Har kim o'z F.I.Sh., login, telefon, email, lavozim va tug'ilgan
 * sanasini tahrirlaydi (egasi 13.11, O0); rol va filial doirasini faqat administrator o'zgartiradi.
 */
@RestController
@RequestMapping("/api/profile")
@Tag(name = "profile", description = "Profil")
class ProfileController {

    record Profile(
            long id,
            String login,
            String fullName,
            @Schema(nullable = true) String lastName,
            @Schema(nullable = true) String firstName,
            @Schema(nullable = true) String middleName,
            @Schema(nullable = true) String phone,
            @Schema(nullable = true) String email,
            @Schema(nullable = true) LocalDate birthDate,
            @Schema(nullable = true) String position,
            String roleCode,
            String roleName,
            @Schema(nullable = true) String branchName,
            boolean pinSet,
            @Schema(nullable = true) Instant pinSetAt,
            @Schema(nullable = true) Instant lastLoginAt,
            @Schema(nullable = true, description = "Oxirgi parol almashtirish (audit jurnalidan)") Instant passwordChangedAt) {}

    record UpdateProfileRequest(
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[A-Za-z0-9._-]{3,64}$", message = "{validation.login}") String login,
            @NotBlank(message = "{validation.required}") @Size(max = 100) String lastName,
            @NotBlank(message = "{validation.required}") @Size(max = 100) String firstName,
            @Schema(nullable = true) @Size(max = 100) String middleName,
            @Schema(nullable = true) @Size(max = 32) String phone,
            @Schema(nullable = true) @Email(message = "{validation.email}") @Size(max = 254) String email,
            @Schema(nullable = true) @Size(max = 100) String position,
            @Schema(nullable = true) @Past(message = "{validation.birthDate}") LocalDate birthDate) {}

    record SetPinRequest(
            @NotBlank(message = "{validation.required}") String currentPassword,
            @NotBlank(message = "{validation.required}") String pin) {}

    private final JdbcClient jdbc;
    private final PinService pins;
    private final CurrentActor currentActor;
    private final Employees employees;
    private final SecurityContextRepository contextRepository;

    ProfileController(JdbcClient jdbc, PinService pins, CurrentActor currentActor, Employees employees,
            SecurityContextRepository contextRepository) {
        this.jdbc = jdbc;
        this.pins = pins;
        this.currentActor = currentActor;
        this.employees = employees;
        this.contextRepository = contextRepository;
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
    @Operation(summary = "O'z ma'lumotlarimni yangilash",
            description = "F.I.Sh., login (unikal), telefon, email, lavozim, tug'ilgan sana. Rol va filial o'zgarmaydi. "
                    + "Joriy sessiya yangi login va ism bilan darhol yangilanadi.")
    Profile update(@Valid @RequestBody UpdateProfileRequest r, HttpServletRequest request, HttpServletResponse response) {
        long id = me();
        var saved = employees.updateSelf(id, new Employees.SelfChange(r.login(), r.lastName(), r.firstName(), r.middleName(),
                r.phone(), r.email(), r.position(), r.birthDate()));
        // Topbar/sidebar dagi ism va sessiya logini darhol yangilansin (qayta kirish shart emas)
        var current = SecurityContextHolder.getContext().getAuthentication();
        if (current != null && current.getPrincipal() instanceof MedixPrincipal p) {
            var updated = UsernamePasswordAuthenticationToken.authenticated(
                    p.withIdentity(saved.login(), saved.fullName()), null, current.getAuthorities());
            var context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(updated);
            SecurityContextHolder.setContext(context);
            contextRepository.saveContext(context, request, response);
        }
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
                SELECT e.id, e.login, e.full_name, e.last_name, e.first_name, e.middle_name, e.phone, e.email, e.birth_date, e.position, r.code, r.name, b.name AS branch_name,
                       e.pin_hash IS NOT NULL AS pin_set, e.pin_set_at, e.last_login_at,
                       (SELECT max(a.occurred_at) FROM audit_log a WHERE a.employee_id = e.id AND a.action = 'auth.passwordChanged') AS pw_at
                FROM employee e JOIN role r ON r.id = e.role_id LEFT JOIN branch b ON b.id = e.branch_id
                WHERE e.id = :id""")
                .param("id", id)
                .query((rs, n) -> new Profile(rs.getLong("id"), rs.getString("login"), rs.getString("full_name"),
                        rs.getString("last_name"), rs.getString("first_name"), rs.getString("middle_name"),
                        rs.getString("phone"), rs.getString("email"), rs.getObject("birth_date", LocalDate.class), rs.getString("position"), rs.getString("code"), rs.getString("name"),
                        rs.getString("branch_name"), rs.getBoolean("pin_set"), instant(rs.getTimestamp("pin_set_at")),
                        instant(rs.getTimestamp("last_login_at")), instant(rs.getTimestamp("pw_at"))))
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static Instant instant(Timestamp t) {
        return Optional.ofNullable(t).map(Timestamp::toInstant).orElse(null);
    }
}
