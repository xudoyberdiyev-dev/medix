package uz.yuzplus.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import uz.yuzplus.TestcontainersConfig;
import uz.yuzplus.notification.MessageModels.Audience;
import uz.yuzplus.notification.MessageModels.MessageKind;
import uz.yuzplus.notification.MessageModels.NewThreadRequest;
import uz.yuzplus.notification.MessageModels.SendRequest;
import uz.yuzplus.shared.security.Actor;

/**
 * O12: ichki xabarlar — filial chegarasi, shaxsiy suhbat yagonaligi (parallel), o'qildi, guruh (rol) topshirig'i va har
 * ijrochi holati, yuboruvchiga bildirishnoma, fayl ruxsati, 15 daqiqalik tahrirlash/o'chirish.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class MessagesIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    Messages messages;

    private record Session(Cookie cookie, long id, long branchId) {}

    private long branch() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Shifo Dori' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        return jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'Xabar sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(300_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private Session login(String role, long branchId) throws Exception {
        String login = "msg" + UUID.randomUUID().toString().substring(0, 8);
        long id = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :login, 'Sinov ' || :login, id, :b, :hash, false FROM role WHERE code = :role RETURNING id""")
                .param("login", login)
                .param("b", branchId)
                .param("hash", encoder.encode(PASSWORD))
                .param("role", role)
                .query(Long.class)
                .single();
        MvcResult r = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"login\":\"" + login + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        for (String h : r.getResponse().getHeaders("Set-Cookie")) {
            if (h.startsWith("YUZPLUS_SESSION=")) {
                return new Session(new Cookie("YUZPLUS_SESSION", h.substring("YUZPLUS_SESSION=".length(), h.indexOf(';'))), id, branchId);
            }
        }
        throw new AssertionError("sessiya yo'q");
    }

    private static String json(String s) {
        return s.replace("'", "\"");
    }

    private MvcResult start(Session s, String body, int expected) throws Exception {
        return mvc.perform(post("/api/messages/threads").with(csrf()).cookie(s.cookie()).contentType(MediaType.APPLICATION_JSON).content(json(body)))
                .andExpect(status().is(expected))
                .andReturn();
    }

    private static long num(MvcResult r, String path) throws Exception {
        return ((Number) JsonPath.read(r.getResponse().getContentAsString(), path)).longValue();
    }

    @Test
    void directThreadIsUniqueBranchScopedAndTracksReads() throws Exception {
        long a = branch();
        long b = branch();
        Session a1 = login("OPERATOR", a);
        Session a2 = login("CASHIER", a);
        Session b1 = login("OPERATOR", b);

        long thread = num(start(a1, "{'audience':'PERSON','employeeIds':[" + a2.id() + "],'message':{'kind':'MESSAGE','body':'Salom'}}", 201), "$.threadId");
        // Boshqa filial xodimiga — yo'q.
        start(a1, "{'audience':'PERSON','employeeIds':[" + b1.id() + "],'message':{'kind':'MESSAGE','body':'Salom'}}", 403);
        // Javob ham shu suhbatga tushadi.
        long reply = num(start(a2, "{'audience':'PERSON','employeeIds':[" + a1.id() + "],'message':{'kind':'MESSAGE','body':'Va alaykum'}}", 201), "$.threadId");
        assertThat(reply).isEqualTo(thread);

        mvc.perform(get("/api/messages/unread").cookie(a1.cookie())).andExpect(status().isOk()).andExpect(jsonPath("$.messages").value(1));
        MvcResult d = mvc.perform(get("/api/messages/threads/" + thread).cookie(a1.cookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(2))
                .andExpect(jsonPath("$.messages[0].readCount").value(1))
                .andExpect(jsonPath("$.messages[1].readCount").value(0))
                .andReturn();
        long last = num(d, "$.messages[1].id");
        mvc.perform(post("/api/messages/threads/" + thread + "/read").with(csrf()).cookie(a1.cookie()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"upToMessageId\":" + last + "}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/messages/unread").cookie(a1.cookie())).andExpect(jsonPath("$.messages").value(0));
        mvc.perform(get("/api/messages/threads/" + thread).cookie(a2.cookie())).andExpect(jsonPath("$.messages[1].readCount").value(1));

        // Begona — suhbat ham, ro'yxatda ham yo'q.
        mvc.perform(get("/api/messages/threads/" + thread).cookie(b1.cookie())).andExpect(status().isNotFound());
        mvc.perform(get("/api/messages/threads").cookie(b1.cookie())).andExpect(jsonPath("$.items.length()").value(0));
        // Qabul qiluvchilar ro'yxatida boshqa filial xodimi yo'q; oddiy rolga rol/filial tanlovi berilmaydi.
        MvcResult rec = mvc.perform(get("/api/messages/recipients").cookie(a1.cookie()))
                .andExpect(jsonPath("$.canBroadcast").value(false))
                .andExpect(jsonPath("$.roles.length()").value(0))
                .andReturn();
        List<Integer> ids = JsonPath.read(rec.getResponse().getContentAsString(), "$.people[*].id");
        assertThat(ids).contains((int) a2.id()).doesNotContain((int) b1.id(), (int) a1.id());
    }

    @Test
    void parallelDirectStartCreatesOneThread() throws Exception {
        long a = branch();
        Session x = login("OPERATOR", a);
        Session y = login("OPERATOR", a);
        Actor ax = new Actor(x.id(), a, false);
        Actor ay = new Actor(y.id(), a, false);
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Long> fromX = () -> {
                go.await();
                return messages.start(ax, new NewThreadRequest(Audience.PERSON, List.of(y.id()), null, null,
                        new SendRequest(MessageKind.MESSAGE, "x", null, null, null)), false).threadId();
            };
            Callable<Long> fromY = () -> {
                go.await();
                return messages.start(ay, new NewThreadRequest(Audience.PERSON, List.of(x.id()), null, null,
                        new SendRequest(MessageKind.MESSAGE, "y", null, null, null)), false).threadId();
            };
            Future<Long> f1 = pool.submit(fromX);
            Future<Long> f2 = pool.submit(fromY);
            go.countDown();
            assertThat(f1.get()).isEqualTo(f2.get());
        } finally {
            pool.shutdownNow();
        }
        String key = Math.min(x.id(), y.id()) + ":" + Math.max(x.id(), y.id());
        assertThat(jdbc.sql("SELECT count(*) FROM msg_thread WHERE direct_key = :k").param("k", key).query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT count(*) FROM msg_participant p JOIN msg_thread t ON t.id = p.thread_id WHERE t.direct_key = :k")
                .param("k", key).query(Long.class).single()).isEqualTo(2);
    }

    @Test
    void roleTaskTracksEachAssigneeAndNotifiesSender() throws Exception {
        long a = branch();
        long b = branch();
        Session boss = login("WAREHOUSE_MANAGER", a);
        Session p1 = login("PICKER", a);
        Session p2 = login("PICKER", a);
        Session other = login("PICKER", b);
        Session operator = login("OPERATOR", a);

        // Oddiy rol rolga yubora olmaydi; boshqa filialga — ham.
        start(operator, "{'audience':'ROLE','roleCode':'PICKER','branchId':" + a + ",'message':{'kind':'MESSAGE','body':'x'}}", 403);
        start(boss, "{'audience':'ROLE','roleCode':'PICKER','branchId':" + b + ",'message':{'kind':'MESSAGE','body':'x'}}", 403);
        start(boss, "{'audience':'ROLE','roleCode':'PICKER','message':{'kind':'MESSAGE','body':'x'}}", 403);
        start(boss, "{'audience':'ROLE','roleCode':'PICKER','branchId':" + a + ",'message':{'kind':'TASK','body':'x'}}", 400);

        MvcResult created = start(boss, "{'audience':'ROLE','roleCode':'PICKER','branchId':" + a
                + ",'message':{'kind':'TASK','taskTitle':'Ombor tozalash','body':'Bugun 17:00 gacha'}}", 201);
        long thread = num(created, "$.threadId");
        long task = num(created, "$.messageId");
        mvc.perform(get("/api/messages/threads/" + thread).cookie(boss.cookie()))
                .andExpect(jsonPath("$.participants.length()").value(3))
                .andExpect(jsonPath("$.thread.audience").value("ROLE"))
                .andExpect(jsonPath("$.messages[0].assignees.length()").value(2));
        mvc.perform(get("/api/messages/threads/" + thread).cookie(other.cookie())).andExpect(status().isNotFound());
        mvc.perform(get("/api/messages/unread").cookie(p1.cookie())).andExpect(jsonPath("$.openTasks").value(1));

        // Ijrochilar: har biri o'z holatini o'zgartiradi; ijrochi bekor qila olmaydi.
        taskStatus(p1, task, "DONE", 200);
        taskStatus(p1, task, "DONE", 409);
        taskStatus(p2, task, "IN_PROGRESS", 200);
        taskStatus(p2, task, "CANCELLED", 403);
        mvc.perform(get("/api/messages/tasks?scope=GIVEN").cookie(boss.cookie()))
                .andExpect(jsonPath("$[0].messageId").value(task))
                .andExpect(jsonPath("$[0].status").value("IN_PROGRESS"));
        mvc.perform(get("/api/messages/tasks?scope=MINE&status=DONE").cookie(p1.cookie())).andExpect(jsonPath("$.length()").value(1));
        assertThat(jdbc.sql("SELECT count(*) FROM notification WHERE employee_id = :e AND kind = 'TASK'")
                .param("e", boss.id()).query(Long.class).single()).isEqualTo(2);
        assertThat(jdbc.sql("SELECT count(*) FROM audit_log WHERE entity_type = 'msg_message' AND entity_id = :id")
                .param("id", Long.toString(task)).query(Long.class).single()).isEqualTo(3);

        // Yuboruvchi: bekor qilish — hammasi; qayta ochish — yana NEW.
        taskStatus(boss, task, "CANCELLED", 200);
        assertThat(jdbc.sql("SELECT count(*) FROM msg_task_assignee WHERE message_id = :m AND status = 'CANCELLED'")
                .param("m", task).query(Long.class).single()).isEqualTo(2);
        taskStatus(boss, task, "NEW", 200);
        mvc.perform(get("/api/messages/unread").cookie(p2.cookie())).andExpect(jsonPath("$.openTasks").value(1));
        // Topshiriq o'chirilmaydi.
        mvc.perform(delete("/api/messages/" + task).with(csrf()).cookie(boss.cookie())).andExpect(status().isConflict());
    }

    private void taskStatus(Session s, long task, String st, int expected) throws Exception {
        mvc.perform(post("/api/messages/" + task + "/status").with(csrf()).cookie(s.cookie()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"" + st + "\"}"))
                .andExpect(status().is(expected));
    }

    @Test
    void filesAreVisibleOnlyToParticipantsAndEditWindowIsFifteenMinutes() throws Exception {
        long a = branch();
        Session a1 = login("OPERATOR", a);
        Session a2 = login("OPERATOR", a);
        Session a3 = login("OPERATOR", a);

        MvcResult up = mvc.perform(multipart("/api/messages/files")
                        .file(new MockMultipartFile("file", "hisobot.pdf", "application/pdf", "%PDF-1.4 sinov".getBytes()))
                        .with(csrf()).cookie(a1.cookie()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.image").value(false))
                .andReturn();
        long file = num(up, "$.id");
        // Boshqa xodim yuklagan faylni biriktirib bo'lmaydi.
        start(a2, "{'audience':'PERSON','employeeIds':[" + a3.id() + "],'message':{'kind':'MESSAGE','fileIds':[" + file + "]}}", 400);
        // Yuborilmagan fayl — faqat yuklaganga.
        mvc.perform(get("/api/messages/files/" + file).cookie(a2.cookie())).andExpect(status().isNotFound());

        MvcResult sent = start(a1, "{'audience':'PERSON','employeeIds':[" + a2.id() + "],'message':{'kind':'MESSAGE','fileIds':[" + file + "]}}", 201);
        long msg = num(sent, "$.messageId");
        mvc.perform(get("/api/messages/files/" + file).cookie(a2.cookie()))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Disposition", org.hamcrest.Matchers.startsWith("attachment")));
        mvc.perform(get("/api/messages/files/" + file).cookie(a3.cookie())).andExpect(status().isNotFound());

        // Tahrirlash: faqat o'ziniki.
        mvc.perform(patch("/api/messages/" + msg).with(csrf()).cookie(a2.cookie()).contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"x\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/messages/" + msg).with(csrf()).cookie(a1.cookie()).contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"Fayl ilova\"}"))
                .andExpect(status().isOk());
        long thread = num(sent, "$.threadId");
        mvc.perform(get("/api/messages/threads/" + thread).cookie(a2.cookie()))
                .andExpect(jsonPath("$.messages[0].body").value("Fayl ilova"))
                .andExpect(jsonPath("$.messages[0].editedAt").isNotEmpty())
                .andExpect(jsonPath("$.messages[0].editable").value(false));

        // 15 daqiqadan keyin — o'zgartirilmaydi.
        jdbc.sql("UPDATE msg_message SET created_at = now() - interval '16 minutes' WHERE id = :m").param("m", msg).update();
        mvc.perform(delete("/api/messages/" + msg).with(csrf()).cookie(a1.cookie())).andExpect(status().isConflict());
        jdbc.sql("UPDATE msg_message SET created_at = now() WHERE id = :m").param("m", msg).update();
        mvc.perform(delete("/api/messages/" + msg).with(csrf()).cookie(a1.cookie())).andExpect(status().isOk());
        mvc.perform(get("/api/messages/threads/" + thread).cookie(a2.cookie()))
                .andExpect(jsonPath("$.messages[0].deletedAt").isNotEmpty())
                .andExpect(jsonPath("$.messages[0].body").doesNotExist())
                .andExpect(jsonPath("$.messages[0].files.length()").value(0));
        mvc.perform(get("/api/messages/files/" + file).cookie(a2.cookie())).andExpect(status().isNotFound());
    }
}
