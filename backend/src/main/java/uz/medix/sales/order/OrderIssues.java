package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.notification.Notifications;
import uz.medix.sales.order.OrderModels.OrderStatus;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/**
 * «Muammo bor» (SPEC 5.2): yig'uvchi (Yig'ilmoqda), markirovkachi (Markirovkada) yoki haydovchi (Yuklanmoqda / Yo'lda) sabab
 * tanlab yuboradi; xabar Ombor mudiriga (orders.queue) keladi, taymer to'xtamaydi. Ombor mudiri hal qilinganini belgilaydi.
 */
@Service
class OrderIssues {

    enum IssueReason { NOT_FOUND, SHORTAGE, DAMAGED, WRONG_BATCH, EXPIRY, CODE_UNREADABLE, OTHER }

    private static final Map<IssueReason, String> LABELS = Map.of(
            IssueReason.NOT_FOUND, "Tovar joyida yoʻq",
            IssueReason.SHORTAGE, "Miqdor yetmaydi",
            IssueReason.DAMAGED, "Qadoq shikastlangan",
            IssueReason.WRONG_BATCH, "Partiya mos emas",
            IssueReason.EXPIRY, "Yaroqlilik muddati muammosi",
            IssueReason.CODE_UNREADABLE, "Kod oʻqilmaydi",
            IssueReason.OTHER, "Boshqa");

    private static final Set<OrderStatus> STAGES = Set.of(OrderStatus.PICKING, OrderStatus.MARKING, OrderStatus.LOADING, OrderStatus.IN_TRANSIT);

    record IssueRequest(
            @NotNull(message = "{validation.required}") IssueReason reason,
            @Schema(nullable = true, description = "«Boshqa» uchun majburiy") @Size(max = 500) String note) {}

    record ResolveRequest(@NotBlank(message = "{validation.required}") @Size(max = 500) String resolution) {}

    record OrderIssueItem(
            long id,
            long orderId,
            String orderNumber,
            String customer,
            OrderStatus stage,
            IssueReason reason,
            String reasonLabel,
            @Schema(nullable = true) String note,
            String createdBy,
            Instant createdAt,
            @Schema(nullable = true) String resolvedBy,
            @Schema(nullable = true) Instant resolvedAt,
            @Schema(nullable = true) String resolution) {}

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final Notifications notifications;

    OrderIssues(JdbcClient jdbc, AuditLog audit, Notifications notifications) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.notifications = notifications;
    }

    private record Head(long id, String number, long branchId, OrderStatus status, Long pickerId, Long markerId) {}

    @Transactional
    OrderIssueItem report(Actor actor, long orderId, IssueReason reason, String note) {
        Head h = jdbc.sql("SELECT id, number, branch_id, status, picker_id, marker_id FROM sales_order WHERE id = :id FOR UPDATE")
                .param("id", orderId)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        OrderStatus.valueOf(rs.getString("status")), (Long) rs.getObject("picker_id"), (Long) rs.getObject("marker_id")))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (!STAGES.contains(h.status())) {
            throw MedixException.conflict("order.badStatus", h.status().name());
        }
        // Yig'ish va markirovkada — faqat shu ishni bajarayotgan xodim
        Long worker = h.status() == OrderStatus.PICKING ? h.pickerId() : h.status() == OrderStatus.MARKING ? h.markerId() : null;
        if ((h.status() == OrderStatus.PICKING || h.status() == OrderStatus.MARKING) && !Objects.equals(worker, actor.employeeId())) {
            throw MedixException.forbidden("order.issueNotYours");
        }
        String n = note == null || note.isBlank() ? null : note.strip();
        if (reason == IssueReason.OTHER && n == null) {
            throw MedixException.badRequest("order.issueNoteRequired");
        }
        long id = jdbc.sql("""
                INSERT INTO sales_order_issue (order_id, stage, reason, note, created_by) VALUES (:o, :s, :r, :n, :by) RETURNING id""")
                .param("o", orderId)
                .param("s", h.status().name())
                .param("r", reason.name())
                .param("n", n)
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        audit.record(AuditEntry.of("order.issue", "sales_order", orderId).change(null, Map.of("reason", reason.name())));
        notifications.notify("orders.queue", h.branchId(), List.of(), new Notifications.Message("order.issue",
                "Muammo bor: " + h.number(), LABELS.get(reason) + (n == null ? "" : " — " + n), "/warehouse?issue=" + id, "order.issue:" + id));
        return find(actor, id);
    }

    @Transactional
    OrderIssueItem resolve(Actor actor, long issueId, String resolution) {
        OrderIssueItem i = find(actor, issueId);
        if (i.resolvedAt() != null) {
            throw MedixException.conflict("order.issueResolved");
        }
        jdbc.sql("UPDATE sales_order_issue SET resolved_by = :by, resolved_at = now(), resolution = :r WHERE id = :id")
                .param("by", actor.employeeId())
                .param("r", resolution.strip())
                .param("id", issueId)
                .update();
        audit.record(AuditEntry.of("order.issueResolve", "sales_order", i.orderId()).withReason(resolution.strip()));
        return find(actor, issueId);
    }

    @Transactional(readOnly = true)
    List<OrderIssueItem> list(Actor actor, Long orderId, boolean openOnly) {
        return jdbc.sql(SELECT + """
                 WHERE (CAST(:o AS BIGINT) IS NULL OR i.order_id = :o) AND (NOT :open OR i.resolved_at IS NULL)
                ORDER BY i.resolved_at NULLS FIRST, i.created_at DESC LIMIT 200""")
                .param("o", orderId)
                .param("open", openOnly)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id")) ? row(rs) : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .toList();
    }

    private OrderIssueItem find(Actor actor, long id) {
        return jdbc.sql(SELECT + " WHERE i.id = :id")
                .param("id", id)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id")) ? row(rs) : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .findFirst()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static final String SELECT = """
            SELECT i.id, i.order_id, o.number, o.branch_id, c.name AS customer, i.stage, i.reason, i.note, cb.full_name AS created_by, i.created_at,
                   rb.full_name AS resolved_by, i.resolved_at, i.resolution
            FROM sales_order_issue i JOIN sales_order o ON o.id = i.order_id JOIN counterparty c ON c.id = o.customer_id
            JOIN employee cb ON cb.id = i.created_by LEFT JOIN employee rb ON rb.id = i.resolved_by""";

    private static OrderIssueItem row(java.sql.ResultSet rs) throws java.sql.SQLException {
        IssueReason r = IssueReason.valueOf(rs.getString("reason"));
        Timestamp resolved = rs.getTimestamp("resolved_at");
        return new OrderIssueItem(rs.getLong("id"), rs.getLong("order_id"), rs.getString("number"), rs.getString("customer"),
                OrderStatus.valueOf(rs.getString("stage")), r, LABELS.get(r), rs.getString("note"), rs.getString("created_by"),
                rs.getTimestamp("created_at").toInstant(), rs.getString("resolved_by"), resolved == null ? null : resolved.toInstant(),
                rs.getString("resolution"));
    }
}
