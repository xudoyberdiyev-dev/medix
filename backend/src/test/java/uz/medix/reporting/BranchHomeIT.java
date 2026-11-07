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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import uz.medix.TestcontainersConfig;

/** Filial rahbari bosh sahifasi (prototip): tasdiqlarim (ruxsat bo'yicha), ko'rsatkichlar, pul hisoblari, filial doirasi. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class BranchHomeIT {

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

    private ResultActions send(MockHttpServletRequestBuilder b, Cookie session, String body) throws Exception {
        return mvc.perform(b.with(csrf()).cookie(session).contentType(MediaType.APPLICATION_JSON).content(body))
                .andDo(r -> {
                    if (r.getResponse().getStatus() >= 500) {
                        throw new AssertionError("500: " + r.getResolvedException(), r.getResolvedException());
                    }
                });
    }

    private static LocalDate today() {
        return LocalDate.now(ZoneId.of("Asia/Tashkent"));
    }

    private long account(Cookie who, long branch, int index) throws Exception {
        MvcResult r = mvc.perform(get("/api/money-accounts").param("branchId", String.valueOf(branch)).cookie(who))
                .andExpect(status().isOk()).andReturn();
        return ((Number) JsonPath.read(r.getResponse().getContentAsString(), "$[" + index + "].id")).longValue();
    }

    private long item(String name) {
        return jdbc.sql("SELECT id FROM expense_item WHERE name = :n").param("n", name).query(Long.class).single();
    }

    private String op(long branch, long account, String dir, String item, String amount, LocalDate date) {
        return "{\"branchId\":" + branch + ",\"accountId\":" + account + ",\"direction\":\"" + dir + "\",\"itemId\":" + item(item)
                + ",\"amount\":\"" + amount + "\"" + (date == null ? "" : ",\"opDate\":\"" + date + "\"") + "}";
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

    private void entry(long branch, long party, String side, String type, long docId, String amount, LocalDate due, String appliesType, Long appliesId) {
        jdbc.sql("""
                INSERT INTO party_ledger (branch_id, counterparty_id, side, amount, due_date, doc_type, doc_id, doc_number, applies_doc_type, applies_doc_id)
                VALUES (:b, :c, :s, CAST(:a AS NUMERIC), :d, :t, :i, :n, :at, :ai)""")
                .param("b", branch)
                .param("c", party)
                .param("s", side)
                .param("a", amount)
                .param("d", due == null ? null : java.sql.Date.valueOf(due))
                .param("t", type)
                .param("i", docId)
                .param("n", type + "-TST-" + docId)
                .param("at", appliesType)
                .param("ai", appliesId)
                .update();
    }

    @Test
    void approvalsKpiAccountsAndScope() throws Exception {
        long b = branch();
        long other = branch();
        Cookie cashier = loginAs("CASHIER", b).cookie();
        Cookie manager = loginAs("BRANCH_MANAGER", b).cookie();
        Cookie operator = loginAs("OPERATOR", b).cookie();
        long k = account(cashier, b, 0);
        LocalDate t = today();

        send(post("/api/cash-ops"), cashier, op(b, k, "IN", "Boshqa kirim", "3000000.00", t)).andExpect(status().isCreated());
        // Tasdiq kutayotgan katta chiqim — Filial rahbarining «tasdiqlarim» ro'yxatida (cash.approve)
        send(post("/api/cash-ops"), cashier, op(b, k, "OUT", "Ijara", "2500000.00", t)).andExpect(status().isCreated());
        long c = party(false);
        entry(b, c, "CUSTOMER", "SV", 9_800_001L, "1000000.00", t.minusDays(40), null, null);

        mvc.perform(get("/api/home/branch").cookie(operator)).andExpect(status().isForbidden());
        mvc.perform(get("/api/home/branch").cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.branchId").value(b))
                .andExpect(jsonPath("$.approvals.length()").value(1))
                .andExpect(jsonPath("$.approvals[0].type").value("KO"))
                .andExpect(jsonPath("$.approvals[0].amount").value("2500000.00"))
                .andExpect(jsonPath("$.approvals[0].page").value(false))
                .andExpect(jsonPath("$.approvals[0].href").value("/cash?tab=ops"))
                .andExpect(jsonPath("$.kpi.sales").value("0.00"))
                .andExpect(jsonPath("$.kpi.salesDocs").value(0))
                .andExpect(jsonPath("$.kpi.profit").value("0.00"))
                .andExpect(jsonPath("$.kpi.margin").doesNotExist())
                .andExpect(jsonPath("$.kpi.debt").value("1000000.00"))
                .andExpect(jsonPath("$.kpi.overdue").value("1000000.00"))
                .andExpect(jsonPath("$.kpi.money").value("3000000.00"))
                .andExpect(jsonPath("$.kpi.cash").value("3000000.00"))
                .andExpect(jsonPath("$.trips.length()").value(0))
                .andExpect(jsonPath("$.accounts[0].id").value(k))
                .andExpect(jsonPath("$.accounts[0].balance").value("3000000.00"))
                .andExpect(jsonPath("$.accounts[0].closedAt").doesNotExist());
        // Boshqa filial — yo'q (filial doirasi serverda)
        mvc.perform(get("/api/home/branch").param("branchId", "" + other).cookie(manager)).andExpect(status().isNotFound());
        // Kassir hisobot ruxsatisiz
        mvc.perform(get("/api/home/branch").cookie(cashier)).andExpect(status().isForbidden());
    }
}
