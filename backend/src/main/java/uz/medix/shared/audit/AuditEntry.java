package uz.medix.shared.audit;

import java.util.Map;

/**
 * Audit yozuvi: kim (joriy xodim avtomatik), nima, eski → yangi qiymat.
 *
 * @param action    masalan {@code employee.create}, {@code auth.login}
 * @param oldValue  o'zgarishdan oldingi maydonlar (yaratishda {@code null})
 * @param newValue  o'zgarishdan keyingi maydonlar (o'chirishda {@code null})
 */
public record AuditEntry(
        String action,
        String entityType,
        String entityId,
        Map<String, ?> oldValue,
        Map<String, ?> newValue,
        String reason) {

    public static AuditEntry of(String action, String entityType, Object entityId) {
        return new AuditEntry(action, entityType, entityId == null ? null : entityId.toString(), null, null, null);
    }

    public AuditEntry change(Map<String, ?> before, Map<String, ?> after) {
        return new AuditEntry(action, entityType, entityId, before, after, reason);
    }

    public AuditEntry withReason(String why) {
        return new AuditEntry(action, entityType, entityId, oldValue, newValue, why);
    }
}
