package uz.medix.shared.audit;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import tools.jackson.databind.json.JsonMapper;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Audit jurnali (SPEC 13): faqat qo'shiladi (bazada trigger UPDATE/DELETE ni taqiqlaydi).
 * Chaqiruvchining tranzaksiyasida yoziladi — hujjat o'tkazilmasa, audit ham yozilmaydi.
 */
@Service
public class AuditLog {

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final CurrentActor currentActor;

    AuditLog(JdbcClient jdbc, JsonMapper json, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.json = json;
        this.currentActor = currentActor;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(AuditEntry entry) {
        record(entry, currentActor.current().orElse(null));
    }

    /** Xodim hali sessiyada bo'lmagan holatlar uchun (masalan, login). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void record(AuditEntry entry, Actor actor) {
        Optional<HttpServletRequest> request = currentRequest();
        jdbc.sql("""
                INSERT INTO audit_log (employee_id, branch_id, action, entity_type, entity_id, old_value, new_value, reason,
                                       ip_address, request_id)
                VALUES (:employee, :branch, :action, :type, :id, CAST(:old AS jsonb), CAST(:new AS jsonb), :reason,
                        CAST(:ip AS inet), :requestId)""")
                .param("employee", actor == null ? null : actor.employeeId())
                .param("branch", actor == null ? null : actor.branchId())
                .param("action", entry.action())
                .param("type", entry.entityType())
                .param("id", entry.entityId())
                .param("old", toJson(entry.oldValue()))
                .param("new", toJson(entry.newValue()))
                .param("reason", entry.reason())
                .param("ip", request.map(HttpServletRequest::getRemoteAddr).orElse(null))
                .param("requestId", request.map(r -> r.getHeader("X-Request-Id")).map(AuditLog::limit).orElse(null))
                .update();
    }

    private String toJson(Map<String, ?> value) {
        return value == null ? null : json.writeValueAsString(value);
    }

    private static String limit(String value) {
        return value.length() > 64 ? value.substring(0, 64) : value;
    }

    private static Optional<HttpServletRequest> currentRequest() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs
                ? Optional.of(attrs.getRequest())
                : Optional.empty();
    }
}
