package uz.medix.identity.profile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.time.Instant;
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
 * «Mening harakatlarim» — {@code /api/audit/mine}. Sessiya identifikatori javobda berilmaydi.
 */
@RestController
@RequestMapping("/api/profile")
@Tag(name = "profile", description = "Profil")
class ProfileSessionsController {

    /** AuthController kirishda yozadigan sessiya atributlari. */
    static final String SESSION_DEVICE = "medix.device";
    static final String SESSION_IP = "medix.ip";

    record SessionInfo(boolean current, @Schema(nullable = true) String device, @Schema(nullable = true) String ip, Instant createdAt,
            Instant lastAccessAt) {}

    record EndSessionsResult(int ended) {}

    /** Kirish yozuvi (audit auth.login): qurilma va IP — sessiya atributi bo'lmasa, yaratilish vaqti bo'yicha moslanadi. */
    private record LoginEvent(Instant at, String device, String ip) {}

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
    @Transactional(readOnly = true)
    List<SessionInfo> sessions(Authentication auth, HttpServletRequest request) {
        long id = me();
        String current = currentId(request);
        List<LoginEvent> logins = jdbc.sql("""
                SELECT occurred_at, new_value ->> 'device' AS device, host(ip_address) AS ip FROM audit_log
                WHERE employee_id = :id AND action = 'auth.login' ORDER BY occurred_at DESC LIMIT 200""")
                .param("id", id)
                .query((rs, n) -> new LoginEvent(rs.getTimestamp("occurred_at").toInstant(), rs.getString("device"), rs.getString("ip")))
                .list();
        return sessions.findByPrincipalName(auth.getName()).values().stream()
                .map(s -> {
                    String device = s.getAttribute(SESSION_DEVICE);
                    String ip = s.getAttribute(SESSION_IP);
                    if (device == null || ip == null) {
                        LoginEvent e = loginOf(logins, s.getCreationTime());
                        if (e != null) {
                            device = device == null ? e.device() : device;
                            ip = ip == null ? e.ip() : ip;
                        }
                    }
                    return new SessionInfo(s.getId().equals(current), device, ip, s.getCreationTime(), s.getLastAccessedTime());
                })
                .sorted(Comparator.comparing(SessionInfo::current).reversed().thenComparing(SessionInfo::lastAccessAt, Comparator.reverseOrder()))
                .toList();
    }

    /** Sessiya yaratilishidan oldingi eng yaqin kirish (bir daqiqa ichida); kirish tranzaksiyasi sessiyadan oldin boshlanadi. */
    private static LoginEvent loginOf(List<LoginEvent> newestFirst, Instant created) {
        for (LoginEvent e : newestFirst) {
            if (!e.at().isAfter(created)) {
                return e.at().isBefore(created.minusSeconds(60)) ? null : e;
            }
        }
        return null;
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
}
