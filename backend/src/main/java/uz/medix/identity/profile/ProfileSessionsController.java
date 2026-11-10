package uz.medix.identity.profile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/**
 * Profil (prototip Profile): «Faol sessiyalar» — o'z ochiq sessiyalari (qurilma, IP, oxirgi faollik), boshqalarini tugatish;
 * «Mening harakatlarim» — audit jurnalidagi oxirgi harakatlar. Sessiya identifikatori javobda berilmaydi.
 */
@RestController
@RequestMapping("/api/profile")
@Tag(name = "profile", description = "Profil")
class ProfileSessionsController {

    /** AuthController kirishda yozadigan sessiya atributlari. */
    static final String SESSION_DEVICE = "medix.device";
    static final String SESSION_IP = "medix.ip";
    static final int ACTIONS_LIMIT = 10;

    record SessionInfo(boolean current, @Schema(nullable = true) String device, @Schema(nullable = true) String ip, Instant createdAt,
            Instant lastAccessAt) {}

    record EndSessionsResult(int ended) {}

    record MyAction(OffsetDateTime at, String action, @Schema(nullable = true) String entityType, @Schema(nullable = true) String entityId,
            @Schema(nullable = true) String reason) {}

    private final FindByIndexNameSessionRepository<? extends Session> sessions;
    private final JdbcClient jdbc;
    private final CurrentActor currentActor;
    private final AuditLog audit;

    ProfileSessionsController(FindByIndexNameSessionRepository<? extends Session> sessions, JdbcClient jdbc, CurrentActor currentActor,
            AuditLog audit) {
        this.sessions = sessions;
        this.jdbc = jdbc;
        this.currentActor = currentActor;
        this.audit = audit;
    }

    private long me() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized")).employeeId();
    }

    private static String currentId(HttpServletRequest request) {
        HttpSession s = request.getSession(false);
        return s == null ? null : s.getId();
    }

    @GetMapping("/sessions")
    @Operation(summary = "Faol sessiyalarim (joriysi birinchi)")
    List<SessionInfo> sessions(Authentication auth, HttpServletRequest request) {
        me();
        String current = currentId(request);
        return sessions.findByPrincipalName(auth.getName()).values().stream()
                .map(s -> new SessionInfo(s.getId().equals(current), s.getAttribute(SESSION_DEVICE), s.getAttribute(SESSION_IP),
                        s.getCreationTime(), s.getLastAccessedTime()))
                .sorted(Comparator.comparing(SessionInfo::current).reversed().thenComparing(SessionInfo::lastAccessAt, Comparator.reverseOrder()))
                .toList();
    }

    @PostMapping("/sessions/end-others")
    @Transactional
    @Operation(summary = "Boshqa qurilmalardagi sessiyalarni tugatish (joriysi qoladi)")
    EndSessionsResult endOthers(Authentication auth, HttpServletRequest request) {
        long id = me();
        String current = currentId(request);
        Map<String, ? extends Session> mine = sessions.findByPrincipalName(auth.getName());
        int n = 0;
        for (String sid : mine.keySet()) {
            if (!sid.equals(current)) {
                sessions.deleteById(sid);
                n++;
            }
        }
        audit.record(AuditEntry.of("employee.endSessions", "employee", id).change(null, Map.of("sessions", n, "self", true)));
        return new EndSessionsResult(n);
    }

    @GetMapping("/actions")
    @Transactional(readOnly = true)
    @Operation(summary = "Mening harakatlarim — oxirgi 10 ta (kirishlarsiz)")
    List<MyAction> actions() {
        return jdbc.sql("""
                SELECT occurred_at, action, entity_type, entity_id, reason FROM audit_log
                WHERE employee_id = :id AND action NOT IN ('auth.login', 'auth.loginFailed', 'auth.loginBlocked')
                ORDER BY occurred_at DESC, id DESC LIMIT :lim""")
                .param("id", me())
                .param("lim", ACTIONS_LIMIT)
                .query((rs, n) -> new MyAction(rs.getObject("occurred_at", OffsetDateTime.class), rs.getString("action"),
                        rs.getString("entity_type"), rs.getString("entity_id"), rs.getString("reason")))
                .list();
    }
}
