package uz.medix.reporting;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.time.ZoneId;
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
import uz.medix.TestcontainersConfig;

/** Yig'uvchilar va Markirovkachilar natijasi: xodim bo'yicha buyurtmalar, vaqt (vaqtida / kechikkan), FEFO, ruxsat va filial doirasi. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class WorkerReportIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private long branch() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        return jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'Bosh sahifa sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(300_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private record Session(Cookie cookie, long id) {}

    private Session loginAs(String role, long branchId) throws Exception {
        String login = "bs" + UUID.randomUUID().toString().substring(0, 8);
        long id = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :login, 'Sinov ' || :role, id, :b, :hash, false FROM role WHERE code = :role RETURNING id""")
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
            if (h.startsWith("MEDIX_SESSION=")) {
                return new Session(new Cookie("MEDIX_SESSION", h.substring("MEDIX_SESSION=".length(), h.indexOf(';'))), id);
            }
        }
        throw new AssertionError("sessiya yo'q");
    }

    private static LocalDate today() {
        return LocalDate.now(ZoneId.of("Asia/Tashkent"));
    }

    private long customer() {
        return jdbc.sql("INSERT INTO counterparty (tin, name, is_customer) VALUES (:t, :n, true) RETURNING id")
                .param("t", String.valueOf(500_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .param("n", "Dorixona " + UUID.randomUUID().toString().substring(0, 6))
                .query(Long.class)
                .single();
    }

    /** Toshkent bo'yicha bugun 10:00 dan boshlangan, {@code actual} daqiqada yakunlangan ish. */
    private void order(long branch, long warehouse, long customer, long createdBy, String who, long worker, Integer given, int actual,
            boolean fefo) {
        String n = "BY-TST-" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO sales_order (number, branch_id, warehouse_id, customer_id, order_date, delivery_type, payment_type, status,
                    total, created_by, %1$s_id, %2$s_minutes, %2$s_started_at, %2$s_finished_at, fefo_deviation)
                VALUES (:n, :b, :w, :c, :d, 'DELIVERY', 'CASH', 'CHECKING', 1000, :e, :k, :g,
                    (CAST(:d AS TIMESTAMP) + interval '10 hours') AT TIME ZONE 'Asia/Tashkent',
                    ((CAST(:d AS TIMESTAMP) + interval '10 hours') AT TIME ZONE 'Asia/Tashkent') + make_interval(mins => :a), :f)"""
                        .formatted(who.equals("pick") ? "picker" : "marker", who))
                .param("n", n).param("b", branch).param("w", warehouse).param("c", customer).param("d", java.sql.Date.valueOf(today()))
                .param("e", createdBy).param("k", worker).param("g", given).param("a", actual).param("f", fefo)
                .update();
    }

    @Test
    void pickersAndMarkersByEmployee() throws Exception {
        long b = branch();
        long other = branch();
        long w = jdbc.sql("INSERT INTO warehouse (branch_id, name) VALUES (:b, 'Asosiy') RETURNING id").param("b", b).query(Long.class).single();
        Session op = loginAs("OPERATOR", b);
        Session p1 = loginAs("PICKER", b);
        Session p2 = loginAs("PICKER", b);
        Session m1 = loginAs("MARKER", b);
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", b).cookie();
        Cookie director = loginAs("DIRECTOR", b).cookie();
        long c = customer();

        order(b, w, c, op.id(), "pick", p1.id(), 20, 15, false); // vaqtida
        order(b, w, c, op.id(), "pick", p1.id(), 10, 25, true); // kechikkan, FEFO'dan chetlashgan
        order(b, w, c, op.id(), "pick", p2.id(), null, 8, false); // vaqt berilmagan — vaqtida ham, kechikkan ham emas
        order(b, w, c, op.id(), "mark", m1.id(), 30, 30, false); // aynan vaqtida
        String t = today().toString();

        mvc.perform(get("/api/reports/pickers").cookie(op.cookie())).andExpect(status().isForbidden());
        mvc.perform(get("/api/reports/markers").cookie(p1.cookie())).andExpect(status().isForbidden());
        // «Bugungi natijam»: faqat o'zi; ish bo'lmasa — nollar; picking.do siz — yopiq
        mvc.perform(get("/api/reports/pickers/mine").cookie(p1.cookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.employeeId").value(p1.id()))
                .andExpect(jsonPath("$.orders").value(2))
                .andExpect(jsonPath("$.onTime").value(1))
                .andExpect(jsonPath("$.late").value(1));
        Session p3 = loginAs("PICKER", b);
        mvc.perform(get("/api/reports/pickers/mine").cookie(p3.cookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.employeeId").value(p3.id()))
                .andExpect(jsonPath("$.orders").value(0));
        mvc.perform(get("/api/reports/pickers/mine").cookie(op.cookie())).andExpect(status().isForbidden());
        // «Xato urishlar»: shu markirovkachining rad etilgan skanerlashlari (boshqa xodimniki hisoblanmaydi)
        jdbc.sql("""
                INSERT INTO mark_scan_error (order_id, employee_id, error_key)
                SELECT o.id, e.id, 'marking.duplicate' FROM sales_order o, (VALUES (CAST(:m AS BIGINT)), (CAST(:m AS BIGINT)), (CAST(:p AS BIGINT))) AS e(id) WHERE o.marker_id = :m""")
                .param("m", m1.id()).param("p", p1.id()).update();
        mvc.perform(get("/api/reports/markers/mine").cookie(m1.cookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.employeeId").value(m1.id()))
                .andExpect(jsonPath("$.orders").value(1))
                .andExpect(jsonPath("$.codes").value(0))
                .andExpect(jsonPath("$.boxCodes").value(0))
                .andExpect(jsonPath("$.wrongScans").value(2));
        mvc.perform(get("/api/reports/markers/mine").cookie(p1.cookie())).andExpect(status().isForbidden());
        mvc.perform(get("/api/reports/pickers").param("from", t).param("to", t).cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("PICKERS"))
                .andExpect(jsonPath("$.branchId").value(b))
                .andExpect(jsonPath("$.rows.length()").value(2))
                .andExpect(jsonPath("$.rows[0].employeeId").value(p1.id()))
                .andExpect(jsonPath("$.rows[0].orders").value(2))
                .andExpect(jsonPath("$.rows[0].givenMinutes").value(30))
                .andExpect(jsonPath("$.rows[0].actualMinutes").value(40))
                .andExpect(jsonPath("$.rows[0].avgMinutes").value(20))
                .andExpect(jsonPath("$.rows[0].onTime").value(1))
                .andExpect(jsonPath("$.rows[0].late").value(1))
                .andExpect(jsonPath("$.rows[0].fefoDeviations").value(1))
                .andExpect(jsonPath("$.rows[0].codes").doesNotExist())
                .andExpect(jsonPath("$.rows[0].wrongScans").doesNotExist())
                .andExpect(jsonPath("$.rows[1].onTime").value(0))
                .andExpect(jsonPath("$.rows[1].late").value(0))
                .andExpect(jsonPath("$.total.orders").value(3))
                .andExpect(jsonPath("$.total.actualMinutes").value(48))
                .andExpect(jsonPath("$.total.avgMinutes").value(16));
        mvc.perform(get("/api/reports/markers").param("branchId", "" + b).param("from", t).cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].employeeId").value(m1.id()))
                .andExpect(jsonPath("$.rows[0].onTime").value(1))
                .andExpect(jsonPath("$.rows[0].codes").value(0))
                .andExpect(jsonPath("$.rows[0].fefoDeviations").doesNotExist());
        // Ombor mudiri: boshqa filial — yopiq
        mvc.perform(get("/api/reports/pickers").param("branchId", "" + other).cookie(keeper)).andExpect(status().isNotFound());
        mvc.perform(get("/api/reports/pickers/export").param("branchId", "" + b).param("from", t).cookie(director))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    }
}
