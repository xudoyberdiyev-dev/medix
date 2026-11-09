package uz.medix.reporting;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
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

/** «Tasdiqlash» sahifasi: buyurtmalar navbati (daraja, limitdan oshish, muddati o'tgan), bugun hal qilinganlar, kredit tafsiloti, filial doirasi. */
@SpringBootTest(properties = "medix.test.isolation=approvals")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ApprovalsIT {

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
                SELECT id, :c, 'Tasdiq sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(300_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private record Session(Cookie cookie, long id) {}

    private Session loginAs(String role, long branchId) throws Exception {
        String login = "ap" + UUID.randomUUID().toString().substring(0, 8);
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

    private long customer(long branch, String limit) {
        long c = jdbc.sql("INSERT INTO counterparty (tin, name, is_customer, address) VALUES (:t, :n, true, 'Toshkent') RETURNING id")
                .param("t", String.valueOf(500_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .param("n", "Mijoz " + UUID.randomUUID().toString().substring(0, 6))
                .query(Long.class)
                .single();
        jdbc.sql("INSERT INTO counterparty_branch_terms (counterparty_id, branch_id, credit_limit, payment_days) VALUES (:c, :b, CAST(:l AS NUMERIC), 30)")
                .param("c", c).param("b", branch).param("l", limit).update();
        return c;
    }

    private void ledger(long branch, long party, String amount, LocalDate on, LocalDate due, String type, long docId, String appliesType, Long appliesId) {
        jdbc.sql("""
                INSERT INTO party_ledger (occurred_at, branch_id, counterparty_id, side, amount, due_date, doc_type, doc_id, doc_number,
                                          applies_doc_type, applies_doc_id)
                VALUES (:at, :b, :c, 'CUSTOMER', CAST(:a AS NUMERIC), :d, :t, :i, :n, :apt, :api)""")
                .param("at", java.sql.Timestamp.from(on.atTime(12, 0).atZone(ZoneId.of("Asia/Tashkent")).toInstant()))
                .param("b", branch).param("c", party).param("a", amount)
                .param("d", due == null ? null : java.sql.Date.valueOf(due))
                .param("t", type).param("i", docId).param("n", type + "-TST-" + docId)
                .param("apt", appliesType).param("api", appliesId)
                .update();
    }

    private long order(long branch, long warehouse, long customer, long by, String status, String level, String total, Long decidedBy) {
        String n = "BY-TST-" + UUID.randomUUID().toString().substring(0, 8);
        return jdbc.sql("""
                INSERT INTO sales_order (number, branch_id, warehouse_id, customer_id, order_date, delivery_type, payment_type, status,
                    approval_level, approval_reasons, total, created_by, submitted_at, decided_by, decided_at, decision_reason)
                VALUES (:n, :b, :w, :c, :d, 'DELIVERY', 'CASH', :s, :lvl, 'Limitdan oshadi', CAST(:a AS NUMERIC), :e, now(),
                    :db, CASE WHEN CAST(:db AS BIGINT) IS NULL THEN NULL ELSE now() END,
                    CASE WHEN :s = 'REJECTED' THEN 'Qarz katta' END)
                RETURNING id""")
                .param("n", n).param("b", branch).param("w", warehouse).param("c", customer).param("d", java.sql.Date.valueOf(today()))
                .param("s", status).param("lvl", level).param("a", total).param("e", by).param("db", decidedBy)
                .query(Long.class)
                .single();
    }

    private long warehouse(long branch) {
        return jdbc.sql("INSERT INTO warehouse (branch_id, name) VALUES (:b, 'Asosiy') RETURNING id").param("b", branch).query(Long.class).single();
    }

    @Test
    void queueLevelsLimitResolvedCreditAndScope() throws Exception {
        long b = branch();
        long other = branch();
        long w = warehouse(b);
        long w2 = warehouse(other);
        Session manager = loginAs("BRANCH_MANAGER", b);
        Session operator = loginAs("OPERATOR", b);
        long c = customer(b, "1000.00");
        LocalDate t = today();
        // Qarz: 900 (40 kun oldin, muddati 10 kun oldin o'tgan), to'lov 100 — muddatdan 5 kun keyin
        ledger(b, c, "900.00", t.minusDays(40), t.minusDays(10), "SV", 9001, null, null);
        ledger(b, c, "-100.00", t.minusDays(5), null, "MT", 9002, "SV", 9001L);

        long branchLevel = order(b, w, c, operator.id(), "PENDING_APPROVAL", "BRANCH", "300.00", null);
        long dirLevel = order(b, w, c, operator.id(), "PENDING_APPROVAL", "DIRECTOR", "50.00", null);
        long rejected = order(b, w, c, operator.id(), "REJECTED", null, "70.00", manager.id());
        long foreign = order(other, w2, customer(other, "10.00"), operator.id(), "PENDING_APPROVAL", "BRANCH", "20.00", null);

        String json = mvc.perform(get("/api/approvals").param("branchId", String.valueOf(other)).cookie(manager.cookie()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        // Filial doirasi: Filial rahbari boshqa filialni so'rasa ham — faqat o'z filiali
        java.util.List<Integer> ids = JsonPath.read(json, "$.orders[*].id");
        org.assertj.core.api.Assertions.assertThat(ids).containsExactly((int) branchLevel, (int) dirLevel).doesNotContain((int) foreign);
        mvc.perform(get("/api/approvals").cookie(manager.cookie()))
                .andExpect(jsonPath("$.orders[0].level").value("BRANCH"))
                .andExpect(jsonPath("$.orders[0].mine").value(true))
                .andExpect(jsonPath("$.orders[1].mine").value(false))
                .andExpect(jsonPath("$.orders[0].debt").value("800.00"))
                .andExpect(jsonPath("$.orders[0].overdue").value("800.00"))
                .andExpect(jsonPath("$.orders[0].overdueDays").value(10))
                .andExpect(jsonPath("$.orders[0].creditLimit").value("1000.00"))
                .andExpect(jsonPath("$.orders[0].limitOverPct").value(10))
                .andExpect(jsonPath("$.orders[1].limitOverPct").doesNotExist())
                .andExpect(jsonPath("$.orders[0].reasons[0]").value("Limitdan oshadi"))
                .andExpect(jsonPath("$.orders[0].customerAddress").value("Toshkent"))
                .andExpect(jsonPath("$.resolvedToday[0].id").value(rejected))
                .andExpect(jsonPath("$.resolvedToday[0].decision").value("REJECTED"))
                .andExpect(jsonPath("$.resolvedToday[0].reason").value("Qarz katta"))
                .andExpect(jsonPath("$.prices.length()").value(0));

        mvc.perform(get("/api/approvals/orders/" + branchLevel + "/credit").cookie(manager.cookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.d0to30").value("0.00"))
                .andExpect(jsonPath("$.d31to60").value("800.00"))
                .andExpect(jsonPath("$.avgDelayDays").value(5))
                .andExpect(jsonPath("$.months.length()").value(6))
                .andExpect(jsonPath("$.payments.length()").value(0));
        mvc.perform(get("/api/approvals/orders/" + foreign + "/credit").cookie(manager.cookie())).andExpect(status().isNotFound());
        mvc.perform(get("/api/approvals").cookie(operator.cookie())).andExpect(status().isForbidden());
    }
}
