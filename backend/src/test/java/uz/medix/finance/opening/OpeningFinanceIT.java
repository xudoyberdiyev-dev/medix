package uz.medix.finance.opening;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
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

/** BQ — mijozlar qarzi, YB qarzi, kassa va bank: qoralama, tekshiruv, o'tkazish (jurnallar), bitta o'tkazilgan, parallel, ruxsatlar. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class OpeningFinanceIT {

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
                SELECT id, :c, 'Qarz sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(300_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private record Session(Cookie cookie, long id) {}

    private Session loginAs(String role, long branchId) throws Exception {
        String login = "dq" + UUID.randomUUID().toString().substring(0, 8);
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

    private long party(boolean supplier) {
        return jdbc.sql("INSERT INTO counterparty (tin, name, is_customer, is_supplier) VALUES (:t, :n, :c, :s) RETURNING id")
                .param("t", String.valueOf(500_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .param("n", "Kontragent " + UUID.randomUUID().toString().substring(0, 6))
                .param("c", !supplier)
                .param("s", supplier)
                .query(Long.class)
                .single();
    }

    private long account(long branch, String kind) {
        String code = "BQ" + UUID.randomUUID().toString().substring(0, 8);
        return jdbc.sql("INSERT INTO money_account (branch_id, kind, code, name, account_no) VALUES (:b, :k, :c, :n, :no) RETURNING id")
                .param("b", branch)
                .param("k", kind)
                .param("c", code)
                .param("n", "Hisob " + code)
                .param("no", kind.equals("BANK") ? "2020800" + code.substring(2) : null)
                .query(Long.class)
                .single();
    }

    private org.springframework.test.web.servlet.ResultActions send(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b, Session s, String body) throws Exception {
        return mvc.perform(b.with(csrf()).cookie(s.cookie()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private long id(MvcResult r) throws Exception {
        return ((Number) com.jayway.jsonpath.JsonPath.read(r.getResponse().getContentAsString(), "$.id")).longValue();
    }

    private static String doc(String kind, long branch, String lines) {
        return "{\"kind\":\"" + kind + "\",\"branchId\":" + branch + ",\"cutoffDate\":\"" + today().minusDays(1) + "\",\"lines\":[" + lines + "]}";
    }

    private java.math.BigDecimal ledger(long party, long branch, String side) {
        return jdbc.sql("SELECT coalesce(sum(amount), 0) FROM party_ledger WHERE counterparty_id = :c AND branch_id = :b AND side = :s AND doc_type = 'BQ'")
                .param("c", party)
                .param("b", branch)
                .param("s", side)
                .query(java.math.BigDecimal.class)
                .single();
    }

    @Test
    void customerDebtDraftValidatePostOncePerBranch() throws Exception {
        long b = branch();
        long c1 = party(false);
        long c2 = party(false);
        long sup = party(true);
        Session dir = loginAs("DIRECTOR", b);

        send(post("/api/opening-finance"), dir, doc("CUSTOMER_DEBT", b, "{\"counterpartyId\":" + sup + ",\"amount\":\"100\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("opening.fin.partyUnknown"));
        send(post("/api/opening-finance"), dir, doc("CUSTOMER_DEBT", b, "{\"counterpartyId\":" + c1 + ",\"amount\":\"0\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("opening.fin.zero"));

        String lines = "{\"counterpartyId\":" + c1 + ",\"amount\":\"1000.50\",\"dueDate\":\"" + today().plusDays(10)
                + "\",\"docRef\":\"SV-ESKI-1\"},{\"counterpartyId\":" + c2 + ",\"amount\":\"-200\"}";
        long id = id(send(post("/api/opening-finance"), dir, doc("CUSTOMER_DEBT", b, lines))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(org.hamcrest.Matchers.startsWith("BQ-")))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.total").value("800.50"))
                .andExpect(jsonPath("$.lines[0].docRef").value("SV-ESKI-1"))
                .andReturn());
        // Qoralama jurnalga ta'sir qilmaydi
        assertThat(ledger(c1, b, "CUSTOMER")).isZero();

        send(post("/api/opening-finance/" + id + "/post"), dir, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("POSTED"));
        assertThat(ledger(c1, b, "CUSTOMER")).isEqualByComparingTo("1000.50");
        assertThat(ledger(c2, b, "CUSTOMER")).isEqualByComparingTo("-200.00");
        assertThat(jdbc.sql("SELECT due_date FROM party_ledger WHERE counterparty_id = :c AND doc_type = 'BQ'").param("c", c1)
                .query(java.sql.Date.class).single().toLocalDate()).isEqualTo(today().plusDays(10));

        // O'tkazilgan hujjat o'zgarmaydi; ikkinchi BQ shu filial va turga o'tkazilmaydi
        send(put("/api/opening-finance/" + id), dir, doc("CUSTOMER_DEBT", b, lines)).andExpect(status().isConflict());
        long second = id(send(post("/api/opening-finance"), dir, doc("CUSTOMER_DEBT", b, "{\"counterpartyId\":" + c1 + ",\"amount\":\"5\"}"))
                .andExpect(status().isCreated()).andReturn());
        send(post("/api/opening-finance/" + second + "/post"), dir, "{}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("opening.fin.alreadyPosted"));
        send(post("/api/opening-finance/" + second + "/cancel"), dir, "{\"reason\":\"Takror\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        // YB qarzi — boshqa tur, alohida o'tkaziladi
        long s = id(send(post("/api/opening-finance"), dir, doc("SUPPLIER_DEBT", b, "{\"counterpartyId\":" + sup + ",\"amount\":\"300\"}"))
                .andExpect(status().isCreated()).andReturn());
        send(post("/api/opening-finance/" + s + "/post"), dir, "{}").andExpect(status().isOk());
        assertThat(ledger(sup, b, "SUPPLIER")).isEqualByComparingTo("300.00");
        mvc.perform(get("/api/opening-finance").param("branchId", String.valueOf(b)).cookie(dir.cookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
    }

    @Test
    void moneyPostsToCashJournalAndScope() throws Exception {
        long b = branch();
        long other = branch();
        long cash = account(b, "CASH");
        long bank = account(b, "BANK");
        long foreign = account(other, "CASH");
        Session dir = loginAs("DIRECTOR", b);

        send(post("/api/opening-finance"), dir, doc("MONEY", b, "{\"accountId\":" + cash + ",\"amount\":\"-5\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("opening.fin.moneyNegative"));
        send(post("/api/opening-finance"), dir, doc("MONEY", b, "{\"accountId\":" + foreign + ",\"amount\":\"5\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("opening.fin.accountUnknown"));
        send(post("/api/opening-finance"), dir, doc("MONEY", b, "{\"accountId\":" + cash + ",\"amount\":\"5\"},{\"accountId\":" + cash + ",\"amount\":\"6\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("opening.fin.accountDuplicate"));

        Session accountant = loginAs("ACCOUNTANT", b);
        long id = id(send(post("/api/opening-finance"), accountant,
                        doc("MONEY", b, "{\"accountId\":" + cash + ",\"amount\":\"5000.25\"},{\"accountId\":" + bank + ",\"amount\":\"120000\"}"))
                .andExpect(status().isCreated()).andReturn());
        // Buxgalterda o'tkazish ruxsati yo'q; boshqa filial rahbari hujjatni ko'rmaydi
        send(post("/api/opening-finance/" + id + "/post"), accountant, "{}").andExpect(status().isForbidden());
        Session stranger = loginAs("BRANCH_MANAGER", other);
        mvc.perform(get("/api/opening-finance/" + id).cookie(stranger.cookie())).andExpect(status().isNotFound());

        send(post("/api/opening-finance/" + id + "/post"), dir, "{}").andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT balance FROM money_account WHERE id = :a").param("a", cash).query(java.math.BigDecimal.class).single())
                .isEqualByComparingTo("5000.25");
        assertThat(jdbc.sql("SELECT balance FROM money_account WHERE id = :a").param("a", bank).query(java.math.BigDecimal.class).single())
                .isEqualByComparingTo("120000.00");
        assertThat(jdbc.sql("SELECT move_date FROM money_move WHERE account_id = :a AND doc_type = 'BQ'").param("a", cash)
                .query(java.sql.Date.class).single().toLocalDate()).isEqualTo(today().minusDays(1));
    }

    @Test
    void parallelPostsOnlyOneWins() throws Exception {
        long b = branch();
        long cash = account(b, "CASH");
        Session dir = loginAs("DIRECTOR", b);
        long a = id(send(post("/api/opening-finance"), dir, doc("MONEY", b, "{\"accountId\":" + cash + ",\"amount\":\"100\"}")).andReturn());
        long c = id(send(post("/api/opening-finance"), dir, doc("MONEY", b, "{\"accountId\":" + cash + ",\"amount\":\"200\"}")).andReturn());
        var pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Integer> pa = () -> send(post("/api/opening-finance/" + a + "/post"), dir, "{}").andReturn().getResponse().getStatus();
            Callable<Integer> pc = () -> send(post("/api/opening-finance/" + c + "/post"), dir, "{}").andReturn().getResponse().getStatus();
            var fa = pool.submit(pa);
            var fc = pool.submit(pc);
            assertThat(java.util.List.of(fa.get(), fc.get())).containsExactlyInAnyOrder(200, 409);
        } finally {
            pool.shutdown();
        }
        java.math.BigDecimal bal = jdbc.sql("SELECT balance FROM money_account WHERE id = :a").param("a", cash).query(java.math.BigDecimal.class).single();
        assertThat(bal.compareTo(new java.math.BigDecimal("100")) == 0 || bal.compareTo(new java.math.BigDecimal("200")) == 0).isTrue();
        assertThat(jdbc.sql("SELECT count(*) FROM opening_finance WHERE branch_id = :b AND status = 'POSTED'").param("b", b).query(Long.class).single())
                .isEqualTo(1);
    }
}
