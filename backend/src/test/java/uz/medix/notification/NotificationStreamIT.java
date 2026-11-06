package uz.medix.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionTemplate;
import uz.medix.TestcontainersConfig;

/** Bildirishnomalar real vaqtda (SSE): obuna, tranzaksiyadan keyingi signal, bekor qilinganda signal yo'q, faqat o'ziga. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class NotificationStreamIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    Notifications notifications;

    @Autowired
    NotificationStream stream;

    @Autowired
    TransactionTemplate tx;

    @Autowired
    LiveSignalListener listener;

    private static void waitUntil(java.util.function.BooleanSupplier ok) throws InterruptedException {
        long end = System.nanoTime() + java.time.Duration.ofSeconds(15).toNanos();
        while (!ok.getAsBoolean() && System.nanoTime() < end) {
            Thread.sleep(100);
        }
    }

    private static String content(MvcResult r) {
        try {
            return r.getResponse().getContentAsString();
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    private long branch() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        return jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'SSE sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(300_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private record Session(Cookie cookie, long id) {}

    private Session login(long branchId) throws Exception {
        String login = "sse" + UUID.randomUUID().toString().substring(0, 8);
        long id = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :login, 'Sinov SSE', id, :b, :hash, false FROM role WHERE code = 'OPERATOR' RETURNING id""")
                .param("login", login)
                .param("b", branchId)
                .param("hash", encoder.encode(PASSWORD))
                .query(Long.class)
                .single();
        MvcResult r = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"login\":\"" + login + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        for (String h : r.getResponse().getHeaders("Set-Cookie")) {
            if (h.startsWith("MEDIX_SESSION=")) {
                return new Session(new Cookie("MEDIX_SESSION", h.substring("MEDIX_SESSION=".length(), h.indexOf(';'))), id);
            }
        }
        throw new AssertionError("sessiya yo'q");
    }

    private static int count(String text, String part) {
        int n = 0;
        for (int i = text.indexOf(part); i >= 0; i = text.indexOf(part, i + 1)) {
            n++;
        }
        return n;
    }

    private Notifications.Message message(String key) {
        return new Notifications.Message("TEST", "Sinov bildirishnomasi", null, "/orders", key);
    }

    @Test
    void streamReceivesSignalOnlyAfterCommitAndOnlyForRecipient() throws Exception {
        long b = branch();
        Session me = login(b);
        Session other = login(b);

        MvcResult mine = mvc.perform(get("/api/notifications/stream").cookie(me.cookie()).accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(request().asyncStarted())
                .andReturn();
        MvcResult theirs = mvc.perform(get("/api/notifications/stream").cookie(other.cookie()).accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(request().asyncStarted())
                .andReturn();
        assertThat(mine.getResponse().getContentType()).startsWith(MediaType.TEXT_EVENT_STREAM_VALUE);
        assertThat(mine.getResponse().getContentAsString()).contains("event:ready");
        assertThat(stream.subscribers(me.id())).isEqualTo(1);

        // Bekor qilingan tranzaksiya — signal yo'q.
        tx.executeWithoutResult(s -> {
            notifications.notify("no.such.permission", b, List.of(me.id()), message("sse-rollback-" + me.id()));
            s.setRollbackOnly();
        });
        stream.awaitSent();
        assertThat(count(mine.getResponse().getContentAsString(), "event:notifications")).isZero();

        // Muvaffaqiyatli — faqat qabul qiluvchiga.
        int created = notifications.notify("no.such.permission", b, List.of(me.id()), message("sse-ok-" + me.id()));
        assertThat(created).isEqualTo(1);
        stream.awaitSent();
        assertThat(count(mine.getResponse().getContentAsString(), "event:notifications")).isEqualTo(1);
        assertThat(count(theirs.getResponse().getContentAsString(), "event:notifications")).isZero();

        // Takroriy (dedup) — yangi yozuv yo'q, signal ham yo'q.
        notifications.notify("no.such.permission", b, List.of(me.id()), message("sse-ok-" + me.id()));
        stream.awaitSent();
        assertThat(count(mine.getResponse().getContentAsString(), "event:notifications")).isEqualTo(1);

        // O'qildi — boshqa varaqlar ham yangilanadi.
        mvc.perform(post("/api/notifications/read-all").with(csrf()).cookie(me.cookie())).andExpect(status().isOk());
        stream.awaitSent();
        assertThat(count(mine.getResponse().getContentAsString(), "event:notifications")).isEqualTo(2);
    }

    @Test
    void topicSignalFromDatabaseReachesOnlyBranchSubscribers() throws Exception {
        long b = branch();
        long otherBranch = branch();
        Session here = login(b);
        Session there = login(otherBranch);
        waitUntil(listener::listening);
        assertThat(listener.listening()).isTrue();

        MvcResult mine = mvc.perform(get("/api/notifications/stream").cookie(here.cookie()).accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(request().asyncStarted())
                .andReturn();
        MvcResult theirs = mvc.perform(get("/api/notifications/stream").cookie(there.cookie()).accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(request().asyncStarted())
                .andReturn();

        // Bekor qilingan tranzaksiyadagi signal yetkazilmaydi (PostgreSQL NOTIFY semantikasi).
        tx.executeWithoutResult(s -> {
            jdbc.sql("SELECT pg_notify('medix_live', :p)").param("p", "trips:" + b).query(String.class).single();
            s.setRollbackOnly();
        });
        jdbc.sql("SELECT pg_notify('medix_live', :p)").param("p", "orders:" + b).query(String.class).single();
        waitUntil(() -> content(mine).contains("event:orders"));

        assertThat(content(mine)).contains("event:orders\ndata:" + b);
        assertThat(content(mine)).doesNotContain("event:trips");
        stream.awaitSent();
        assertThat(content(theirs)).doesNotContain("event:orders");
    }

    @Test
    void malformedSignalIsIgnored() {
        listener.dispatch(null);
        listener.dispatch("orders");
        listener.dispatch("orders:abc");
        listener.dispatch("Bad Topic:1");
    }

    @Test
    void streamRequiresLogin() throws Exception {
        mvc.perform(get("/api/notifications/stream").accept(MediaType.TEXT_EVENT_STREAM)).andExpect(status().isUnauthorized());
    }
}
