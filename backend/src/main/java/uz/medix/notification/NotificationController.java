package uz.medix.notification;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/** Xodimning o'z bildirishnomalari (har kim faqat o'zinikini ko'radi — alohida ruxsat kaliti kerak emas). */
@RestController
@RequestMapping("/api/notifications")
@Tag(name = "notifications", description = "Bildirishnomalar")
class NotificationController {

    record NotificationItem(long id, String kind, String title, @Schema(nullable = true) String body, @Schema(nullable = true) String link,
            Instant createdAt, @Schema(nullable = true) Instant readAt) {}

    record NotificationList(List<NotificationItem> items, long unread) {}

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;

    NotificationController(JdbcClient jdbc, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
    }

    private long me() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized")).employeeId();
    }

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "Oxirgi 50 ta bildirishnoma va o'qilmaganlar soni")
    NotificationList list() {
        long e = me();
        List<NotificationItem> items = jdbc.sql("""
                SELECT id, kind, title, body, link, created_at, read_at FROM notification WHERE employee_id = :e
                ORDER BY (read_at IS NULL) DESC, created_at DESC, id DESC LIMIT 50""")
                .param("e", e)
                .query((rs, n) -> new NotificationItem(rs.getLong("id"), rs.getString("kind"), rs.getString("title"), rs.getString("body"),
                        rs.getString("link"), rs.getTimestamp("created_at").toInstant(), instant(rs.getTimestamp("read_at"))))
                .list();
        long unread = jdbc.sql("SELECT count(*) FROM notification WHERE employee_id = :e AND read_at IS NULL").param("e", e)
                .query(Long.class).single();
        return new NotificationList(items, unread);
    }

    @PostMapping("/{id}/read")
    @Transactional
    @Operation(summary = "O'qildi deb belgilash")
    void read(@PathVariable long id) {
        jdbc.sql("UPDATE notification SET read_at = now() WHERE id = :id AND employee_id = :e AND read_at IS NULL")
                .param("id", id)
                .param("e", me())
                .update();
    }

    @PostMapping("/read-all")
    @Transactional
    @Operation(summary = "Hammasini o'qildi deb belgilash")
    void readAll() {
        jdbc.sql("UPDATE notification SET read_at = now() WHERE employee_id = :e AND read_at IS NULL").param("e", me()).update();
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
