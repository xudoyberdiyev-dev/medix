package uz.medix.finance.debt;

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

/** Mijozlar / YB qarzi: muddat guruhlari, avans FIFO, filial doirasi va ruxsatlar. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class DebtIT {

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
    void customerAgingWithAdvanceAndBranchScope() throws Exception {
        long b = branch();
        long other = branch();
        long c1 = party(false);
        long c2 = party(false);
        LocalDate t = today();
        // c1: 95 kun o'tgan 1 000, 10 kun o'tgan 2 000 (500 to'langan), muddati kelmagan 700; 300 avans
        entry(b, c1, "CUSTOMER", "SV", 9_400_001L, "1000.00", t.minusDays(95), null, null);
        entry(b, c1, "CUSTOMER", "SV", 9_400_002L, "2000.00", t.minusDays(10), null, null);
        entry(b, c1, "CUSTOMER", "MT", 9_400_003L, "-500.00", null, "SV", 9_400_002L);
        entry(b, c1, "CUSTOMER", "SV", 9_400_004L, "700.00", t.plusDays(5), null, null);
        entry(b, c1, "CUSTOMER", "MT", 9_400_005L, "-300.00", null, null, null);
        // c2: faqat avans; boshqa filialdagi qarz bu filial hisobotiga kirmaydi
        entry(b, c2, "CUSTOMER", "MT", 9_400_006L, "-1000.00", null, null, null);
        entry(other, c2, "CUSTOMER", "SV", 9_400_007L, "5000.00", t.minusDays(40), null, null);
        jdbc.sql("INSERT INTO counterparty_branch_terms (counterparty_id, branch_id, credit_limit) VALUES (:c, :b, 10000)").param("c", c1).param("b", b).update();

        Cookie cashier = loginAs("CASHIER", b).cookie();
        Cookie picker = loginAs("PICKER", b).cookie();
        Cookie director = loginAs("DIRECTOR", b).cookie();
        mvc.perform(get("/api/debts/customers").param("branchId", "" + b).cookie(picker)).andExpect(status().isForbidden());
        mvc.perform(get("/api/debts/customers").param("branchId", "" + other).cookie(cashier)).andExpect(status().isNotFound());
        mvc.perform(get("/api/debts/customers").cookie(cashier)).andExpect(status().isNotFound());

        mvc.perform(get("/api/debts/customers").param("branchId", "" + b).cookie(cashier))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(2))
                .andExpect(jsonPath("$.rows[0].counterpartyId").value(c1))
                .andExpect(jsonPath("$.rows[0].buckets.debt").value("2900.00"))
                .andExpect(jsonPath("$.rows[0].buckets.d90plus").value("700.00"))
                .andExpect(jsonPath("$.rows[0].buckets.d1to30").value("1500.00"))
                .andExpect(jsonPath("$.rows[0].buckets.notDue").value("700.00"))
                .andExpect(jsonPath("$.rows[0].buckets.overdue").value("2200.00"))
                .andExpect(jsonPath("$.rows[0].maxOverdueDays").value(95))
                .andExpect(jsonPath("$.rows[0].creditLimit").value("10000.00"))
                .andExpect(jsonPath("$.rows[1].buckets.debt").value("0.00"))
                .andExpect(jsonPath("$.rows[1].buckets.advance").value("1000.00"))
                .andExpect(jsonPath("$.totals.debt").value("2900.00"))
                .andExpect(jsonPath("$.totals.advance").value("1000.00"));

        mvc.perform(get("/api/debts/customers/" + c1 + "/docs").param("branchId", "" + b).cookie(cashier))
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].docNumber").value("SV-TST-9400001"))
                .andExpect(jsonPath("$[0].overdueDays").value(95))
                .andExpect(jsonPath("$[1].open").value("1500.00"));

        // Direktor — barcha filiallar: c2 ning boshqa filialdagi qarzi ham (filiallar alohida hisoblanadi: avans boshqa filial qarzini yopmaydi)
        mvc.perform(get("/api/debts/customers").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[?(@.counterpartyId == " + c2 + ")].buckets.debt").value(org.hamcrest.Matchers.contains("5000.00")))
                .andExpect(jsonPath("$.rows[?(@.counterpartyId == " + c2 + ")].buckets.advance").value(org.hamcrest.Matchers.contains("1000.00")));
    }

    @Test
    void supplierDebtNeedsSdebtPermission() throws Exception {
        long b = branch();
        long s = party(true);
        entry(b, s, "SUPPLIER", "KR", 9_500_001L, "8000.00", today().minusDays(61), null, null);
        Cookie purchaser = loginAs("PURCHASER", b).cookie();
        Cookie cashier = loginAs("CASHIER", b).cookie();
        mvc.perform(get("/api/debts/suppliers").param("branchId", "" + b).cookie(cashier)).andExpect(status().isForbidden());
        mvc.perform(get("/api/debts/suppliers").param("branchId", "" + b).cookie(purchaser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].buckets.d61to90").value("8000.00"))
                .andExpect(jsonPath("$.rows[0].creditLimit").value(org.hamcrest.Matchers.nullValue()));
    }
}
