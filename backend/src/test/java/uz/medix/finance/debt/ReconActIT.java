package uz.medix.finance.debt;

import static org.assertj.core.api.Assertions.assertThat;
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

/** Akt sverka hujjati: tuzish, holatlar, filial doirasi va ruxsatlar. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ReconActIT {

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
    void createSendDiffSignAndScope() throws Exception {
        long b = branch();
        long other = branch();
        long c = party(false);
        LocalDate t = today();
        entry(b, c, "CUSTOMER", "SV", 9_500_001L, "1000.00", t.plusDays(5), null, null);
        entry(b, c, "CUSTOMER", "MT", 9_500_002L, "-400.00", null, null, null);

        Cookie acc = loginAs("ACCOUNTANT", b).cookie();
        Cookie cashier = loginAs("CASHIER", b).cookie();
        Cookie stranger = loginAs("ACCOUNTANT", other).cookie();
        String body = "{\"side\":\"CUSTOMER\",\"counterpartyId\":" + c + ",\"branchId\":" + b + ",\"from\":\"" + t.withDayOfMonth(1)
                + "\",\"to\":\"" + t + "\"}";
        mvc.perform(post("/api/reconciliations").with(csrf()).cookie(cashier).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/reconciliations").with(csrf()).cookie(acc).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.head.number").value(org.hamcrest.Matchers.startsWith("AS-")))
                .andExpect(jsonPath("$.head.status").value("MADE"))
                .andExpect(jsonPath("$.head.closing").value("600.00"))
                .andExpect(jsonPath("$.act.lines.length()").value(2));
        long id = jdbc.sql("SELECT id FROM reconciliation_act WHERE counterparty_id = :c").param("c", c).query(Long.class).single();

        mvc.perform(get("/api/reconciliations").param("branchId", "" + b).cookie(acc))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].counterpartyId").value(c));
        mvc.perform(get("/api/reconciliations/" + id).cookie(stranger)).andExpect(status().isNotFound());
        mvc.perform(get("/api/reconciliations").param("branchId", "" + b).cookie(stranger)).andExpect(status().isNotFound());

        // MADE → SIGNED mumkin emas; avval yuboriladi
        mvc.perform(post("/api/reconciliations/" + id + "/status").with(csrf()).cookie(acc).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"SIGNED\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/reconciliations/" + id + "/status").with(csrf()).cookie(acc).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"SENT\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.head.status").value("SENT"));
        // Farq — qoldiq va izoh majburiy
        mvc.perform(post("/api/reconciliations/" + id + "/status").with(csrf()).cookie(acc).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"DIFF\",\"theirBalance\":\"500.00\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/reconciliations/" + id + "/status").with(csrf()).cookie(acc).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"DIFF\",\"theirBalance\":\"500.00\",\"note\":\"Qaytarish hisobga olinmagan\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.head.status").value("DIFF"))
                .andExpect(jsonPath("$.head.theirBalance").value("500.00"))
                .andExpect(jsonPath("$.head.diffNote").value("Qaytarish hisobga olinmagan"));
        mvc.perform(post("/api/reconciliations/" + id + "/status").with(csrf()).cookie(acc).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"SIGNED\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.head.status").value("SIGNED"));
        // Imzolangan akt oʻzgarmaydi
        mvc.perform(post("/api/reconciliations/" + id + "/status").with(csrf()).cookie(acc).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"DIFF\",\"theirBalance\":\"1.00\",\"note\":\"x\"}")).andExpect(status().isBadRequest());
        assertThat(jdbc.sql("SELECT status FROM reconciliation_act WHERE id = :i").param("i", id).query(String.class).single()).isEqualTo("SIGNED");
    }
}
