package uz.yuzplus.shared.error;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * P4: ushlanmagan server xatolari (5xx) jurnali — «Tizim holati» (Sozlamalar → Xavfsizlik) va kunlik Telegram xulosasi.
 * Faqat texnik maʼlumot: metod, yoʻl (soʻrov parametrlarisiz), istisno turi, qisqa matn. Yozish hech qachon asosiy javobni buzmaydi.
 */
@Component
public class SystemErrors {

    private static final Logger log = LoggerFactory.getLogger(SystemErrors.class);
    static final int KEEP_DAYS = 30;

    public record ErrorRow(Instant occurredAt, String method, String path, String exception, String message) {}

    public record Group(String exception, String path, long count) {}

    public record Status(Instant startedAt, long last24h, long last7d, List<Group> top24h, List<ErrorRow> recent) {}

    private final JdbcClient jdbc;
    private final String botToken;
    private final String chatId;
    private final Instant startedAt = Instant.now();

    SystemErrors(JdbcClient jdbc, @Value("${yuzplus.telegram.bot-token:}") String botToken,
            @Value("${yuzplus.telegram.chat-id:}") String chatId) {
        this.jdbc = jdbc;
        this.botToken = botToken;
        this.chatId = chatId;
    }

    /** Ushlanmagan xatoni yozadi (o'z tranzaksiyasisiz — chaqiruvchi tranzaksiyasi allaqachon bekor qilingan). */
    public void record(String method, String path, Throwable e) {
        try {
            jdbc.sql("INSERT INTO system_error (method, path, exception, message) VALUES (:m, :p, :e, :msg)")
                    .param("m", cut(method == null ? "?" : method, 10))
                    .param("p", cut(path == null ? "?" : path, 300))
                    .param("e", cut(e.getClass().getName(), 200))
                    .param("msg", e.getMessage() == null ? null : cut(e.getMessage().strip(), 500))
                    .update();
        } catch (RuntimeException ex) {
            log.warn("Server xatosini jurnalga yozib bo'lmadi: {}", ex.getMessage());
        }
    }

    public Status status() {
        long day = count("24 hours");
        long week = count("7 days");
        List<Group> top = jdbc.sql("""
                SELECT exception, path, count(*) AS n FROM system_error WHERE occurred_at > now() - interval '24 hours'
                GROUP BY exception, path ORDER BY n DESC, max(occurred_at) DESC LIMIT 5""")
                .query((rs, n) -> new Group(rs.getString("exception"), rs.getString("path"), rs.getLong("n")))
                .list();
        List<ErrorRow> recent = jdbc.sql("SELECT occurred_at, method, path, exception, message FROM system_error ORDER BY occurred_at DESC, id DESC LIMIT 20")
                .query((rs, n) -> new ErrorRow(rs.getTimestamp("occurred_at").toInstant(), rs.getString("method"), rs.getString("path"),
                        rs.getString("exception"), rs.getString("message")))
                .list();
        return new Status(startedAt, day, week, top, recent);
    }

    private long count(String interval) {
        return jdbc.sql("SELECT count(*) FROM system_error WHERE occurred_at > now() - CAST(:i AS interval)")
                .param("i", interval)
                .query(Long.class)
                .single();
    }

    /** Har kuni 08:10 (Toshkent): oxirgi 24 soatda xato bo'lsa — Telegram'ga xulosa (soni va turlari, shaxsiy maʼlumotsiz); eskilarini tozalash. */
    @Scheduled(cron = "0 10 8 * * *", zone = "Asia/Tashkent")
    void dailySummary() {
        jdbc.sql("DELETE FROM system_error WHERE occurred_at < now() - make_interval(days => :d)").param("d", KEEP_DAYS).update();
        if (botToken.isBlank() || chatId.isBlank()) {
            return;
        }
        Status s = status();
        if (s.last24h() == 0) {
            return;
        }
        send(summaryText(s));
    }

    static String summaryText(Status s) {
        StringBuilder text = new StringBuilder("⚠️ 100+: oxirgi 24 soatda ").append(s.last24h()).append(" ta server xatosi (7 kunda ")
                .append(s.last7d()).append(").");
        for (Group g : s.top24h()) {
            String type = g.exception().substring(g.exception().lastIndexOf('.') + 1);
            text.append("\n• ").append(g.count()).append(" × ").append(type).append(" — ").append(g.path().replaceAll("/\\d+", "/{id}"));
        }
        text.append("\nTafsilot: Sozlamalar → Xavfsizlik → Tizim holati.");
        return text.toString();
    }

    private void send(String text) {
        try {
            String body = "chat_id=" + URLEncoder.encode(chatId, StandardCharsets.UTF_8) + "&text=" + URLEncoder.encode(text, StandardCharsets.UTF_8);
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.telegram.org/bot" + botToken + "/sendMessage"))
                    .timeout(Duration.ofSeconds(15))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            try (HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()) {
                HttpResponse<Void> r = client.send(request, HttpResponse.BodyHandlers.discarding());
                if (r.statusCode() != 200) {
                    log.warn("Telegram xulosasi yuborilmadi: HTTP {}", r.statusCode());
                }
            }
        } catch (java.io.IOException e) {
            log.warn("Telegram xulosasi yuborilmadi: {}", e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static String cut(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
