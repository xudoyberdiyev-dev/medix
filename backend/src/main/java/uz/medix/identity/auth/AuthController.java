package uz.medix.identity.auth;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.identity.role.Roles;
import uz.medix.identity.security.AuthService;
import uz.medix.identity.security.MedixPrincipal;
import uz.medix.shared.settings.SettingKey;
import uz.medix.shared.settings.SystemSettings;

/** Kirish, chiqish ({@code POST /api/auth/logout} — Spring Security), joriy foydalanuvchi, parol almashtirish. */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "auth", description = "Tizimga kirish va sessiya")
class AuthController {

    private final AuthService auth;
    private final SecurityContextRepository contextRepository;
    private final SessionAuthenticationStrategy sessionStrategy;
    private final Roles roles;
    private final SystemSettings settings;

    AuthController(AuthService auth, SecurityContextRepository contextRepository, SessionAuthenticationStrategy sessionStrategy, Roles roles,
            SystemSettings settings) {
        this.settings = settings;
        this.auth = auth;
        this.roles = roles;
        this.contextRepository = contextRepository;
        this.sessionStrategy = sessionStrategy;
    }

    @GetMapping("/csrf")
    @Operation(summary = "CSRF tokenini olish", description = "XSRF-TOKEN cookie'sini o'rnatadi. Ilova ochilganda bir marta chaqiriladi.")
    CsrfResponse csrf(@Parameter(hidden = true) CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }

    @PostMapping("/login")
    @Operation(summary = "Tizimga kirish")
    MeResponse login(@Valid @RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
        UsernamePasswordAuthenticationToken authentication = auth.login(body.login(), body.password());
        establish(authentication, request, response);
        MedixPrincipal p = (MedixPrincipal) authentication.getPrincipal();
        return MeResponse.of(p, roles.home(p.roleCode()));
    }

    @GetMapping("/me")
    @Operation(summary = "Joriy foydalanuvchi")
    MeResponse me(@Parameter(hidden = true) @AuthenticationPrincipal MedixPrincipal principal) {
        return MeResponse.of(principal, roles.home(principal.roleCode()));
    }

    @PostMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Parolni almashtirish", description = "Birinchi kirishda majburiy.")
    void changePassword(
            @Parameter(hidden = true) @AuthenticationPrincipal MedixPrincipal principal,
            @Valid @RequestBody ChangePasswordRequest body,
            HttpServletRequest request,
            HttpServletResponse response) {
        auth.changePassword(principal.id(), body.currentPassword(), body.newPassword());
        var current = SecurityContextHolder.getContext().getAuthentication();
        var updated = UsernamePasswordAuthenticationToken.authenticated(
                principal.withPasswordChanged(), null, current.getAuthorities());
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(updated);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
        // Profil → «Faol sessiyalar»: qurilma va IP sessiya atributida (sessiya identifikatori foydalanuvchiga berilmaydi)
        var session = request.getSession();
        String ua = request.getHeader("User-Agent");
        if (ua != null && !ua.isBlank()) {
            session.setAttribute(SESSION_DEVICE, ua.strip().length() > 160 ? ua.strip().substring(0, 160) : ua.strip());
        }
        session.setAttribute(SESSION_IP, request.getRemoteAddr());
    }

    /** Sessiya atributlari (Profil → Faol sessiyalar). */
    static final String SESSION_DEVICE = "medix.device";
    static final String SESSION_IP = "medix.ip";

    private void establish(UsernamePasswordAuthenticationToken authentication, HttpServletRequest request, HttpServletResponse response) {
        sessionStrategy.onAuthentication(authentication, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
        // Harakatsizlikdan keyin sessiya tugashi — Sozlamalar → Xavfsizlik (sessionMin)
        var session = request.getSession(false);
        if (session != null) {
            session.setMaxInactiveInterval(settings.intValue(SettingKey.sessionMin) * 60);
        }
    }
}
