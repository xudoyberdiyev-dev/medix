package uz.medix.identity.security;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/** Login va parol almashtirish. Xato matnlari i18n kalitlari bilan ({@code auth.*}). */
@Service
public class AuthService {

    /** Login topilmasa ham parol tekshiruvi bajariladi — javob vaqti bo'yicha loginni taxmin qilib bo'lmasin. */
    private final String dummyHash;

    private final EmployeeAccounts accounts;
    private final PasswordEncoder encoder;
    private final Clock clock;
    private final AuditLog audit;
    private final LoginThrottle throttle;

    AuthService(EmployeeAccounts accounts, PasswordEncoder encoder, Clock clock, AuditLog audit, LoginThrottle throttle) {
        this.accounts = accounts;
        this.throttle = throttle;
        this.encoder = encoder;
        this.clock = clock;
        this.audit = audit;
        this.dummyHash = encoder.encode("medix-dummy-password");
    }

    public static String normalizeLogin(String login) {
        return login.strip().toLowerCase(Locale.ROOT);
    }

    /** Muvaffaqiyatsiz urinish ham hisoblanishi uchun xatoda ham commit qilinadi. */
    @Transactional(noRollbackFor = MedixException.class, propagation = Propagation.REQUIRED)
    public UsernamePasswordAuthenticationToken login(String rawLogin, String password) {
        String login = normalizeLogin(rawLogin);
        var now = clock.instant();
        throttle.checkNotLocked(login, now);
        var account = accounts.findByLogin(login);
        if (account.isEmpty()) {
            encoder.matches(password, dummyHash);
            throw throttle.fail(login, now);
        }
        var a = account.get();
        var actor = new Actor(a.id(), a.branchId(), MedixPrincipal.allBranches(a.roleCode(), a.allBranches()));
        if (!encoder.matches(password, a.passwordHash())) {
            accounts.recordFailedLogin(a.id());
            audit.record(AuditEntry.of("auth.loginFailed", "employee", a.id()), actor);
            throw throttle.fail(login, now);
        }
        if (a.blocked()) {
            audit.record(AuditEntry.of("auth.loginBlocked", "employee", a.id()), actor);
            throw MedixException.forbidden("auth.blocked");
        }
        throttle.reset(login);
        accounts.recordSuccessfulLogin(a.id(), now);
        audit.record(AuditEntry.of("auth.login", "employee", a.id()), actor);
        return authenticationFor(a);
    }

    /** Sessiyani yangilash uchun (masalan, rol o'zgargandan keyin) — bazadan qayta o'qiydi. */
    @Transactional(readOnly = true)
    public UsernamePasswordAuthenticationToken reload(long employeeId) {
        var a = accounts.findById(employeeId).orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        if (a.blocked()) {
            throw MedixException.forbidden("auth.blocked");
        }
        return authenticationFor(a);
    }

    @Transactional
    public void changePassword(long employeeId, String currentPassword, String newPassword) {
        var a = accounts.findById(employeeId).orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        if (!encoder.matches(currentPassword, a.passwordHash())) {
            throw MedixException.badRequest("auth.currentPasswordWrong");
        }
        if (currentPassword.equals(newPassword)) {
            throw MedixException.badRequest("auth.passwordSame");
        }
        accounts.changePassword(employeeId, encoder.encode(newPassword), clock.instant());
        audit.record(AuditEntry.of("auth.passwordChanged", "employee", employeeId), new Actor(a.id(), a.branchId(), MedixPrincipal.allBranches(a.roleCode(), a.allBranches())));
    }

    private UsernamePasswordAuthenticationToken authenticationFor(EmployeeAccounts.Account a) {
        List<String> permissions = accounts.permissionsOf(a.roleId());
        var principal = new MedixPrincipal(a.id(), a.login(), a.fullName(), a.roleCode(), a.roleName(), a.branchId(),
                a.mustChangePassword(), new HashSet<>(permissions), a.allBranches());
        List<GrantedAuthority> authorities = new ArrayList<>();
        authorities.add(new SimpleGrantedAuthority("ROLE_" + a.roleCode()));
        permissions.forEach(p -> authorities.add(new SimpleGrantedAuthority(p)));
        return UsernamePasswordAuthenticationToken.authenticated(principal, null, authorities);
    }
}
