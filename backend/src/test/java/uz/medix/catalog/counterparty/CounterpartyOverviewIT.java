package uz.medix.catalog.counterparty;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
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

/** «Mijozlar» / «Yetkazib beruvchilar» ro'yxati (prototip Counterparties): tur, filiallar, litsenziya, qarz va muddati o'tgani, limit. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class CounterpartyOverviewIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "ov" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :login, 'Sinov', id, :b, :hash, false FROM role WHERE code = :role""")
                .param("login", login)
                .param("b", branchId)
                .param("hash", encoder.encode(PASSWORD))
                .param("role", role)
                .update();
        MvcResult r = mvc.perform(post("/api/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"login\":\"" + login + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        for (String h : r.getResponse().getHeaders("Set-Cookie")) {
            if (h.startsWith("MEDIX_SESSION=")) {
                return new Cookie("MEDIX_SESSION", h.substring("MEDIX_SESSION=".length(), h.indexOf(';')));
            }
        }
        throw new AssertionError("sessiya yo'q");
    }

    private long branch() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        return jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'Filial ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(500_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private static String tin() {
        return String.valueOf(200_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L));
    }

    @Test
    void customerRowCarriesTermsLicenseAndDebt() throws Exception {
        long b1 = branch();
        long b2 = branch();
        String code1 = jdbc.sql("SELECT code FROM branch WHERE id = :b").param("b", b1).query(String.class).single();
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Tashkent"));
        String tin = tin();
        long c = jdbc.sql("""
                INSERT INTO counterparty (tin, name, is_customer, is_supplier, kind) VALUES (:t, :n, true, false, 'CLINIC') RETURNING id""")
                .param("t", tin)
                .param("n", "Shifo Klinika " + tin)
                .query(Long.class)
                .single();
        jdbc.sql("INSERT INTO counterparty_branch_terms (counterparty_id, branch_id, credit_limit, payment_days) VALUES (:c, :b, 5000000, 15)")
                .param("c", c)
                .param("b", b1)
                .update();
        jdbc.sql("""
                INSERT INTO counterparty_license (counterparty_id, number, kind, valid_until, controlled_allowed)
                VALUES (:c, 'L-1', 'Farmatsevtika', :d, true)""")
                .param("c", c)
                .param("d", today.plusDays(10))
                .update();
        // Muddati 40 kun oldin o'tgan sotuv qarzi
        jdbc.sql("""
                INSERT INTO party_ledger (branch_id, counterparty_id, side, amount, due_date, doc_type, doc_id, doc_number)
                VALUES (:b, :c, 'CUSTOMER', 1250000.50, :d, 'SV', :i, :n)""")
                .param("b", b1)
                .param("c", c)
                .param("d", today.minusDays(40))
                .param("i", 800_000_000L + c)
                .param("n", "SV-OV-" + c)
                .update();

        Cookie director = loginAs("DIRECTOR", null);
        String row = "$.items[?(@.id == " + c + ")]";
        mvc.perform(get("/api/counterparties/overview").param("role", "CUSTOMER").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath(row + ".kind").value(contains("CLINIC")))
                .andExpect(jsonPath(row + ".branches[0]").value(contains(code1)))
                .andExpect(jsonPath(row + ".inScope").value(contains(true)))
                .andExpect(jsonPath(row + ".controlledAllowed").value(contains(true)))
                .andExpect(jsonPath(row + ".licenseValidUntil").value(contains(today.plusDays(10).toString())))
                .andExpect(jsonPath(row + ".debt").value(contains("1250000.50")))
                .andExpect(jsonPath(row + ".overdue").value(contains("1250000.50")))
                .andExpect(jsonPath(row + ".maxOverdueDays").value(contains(40)))
                .andExpect(jsonPath(row + ".agingBuckets[0]").value(contains("31-60")))
                .andExpect(jsonPath(row + ".creditLimit").value(contains("5000000.00")))
                .andExpect(jsonPath(row + ".status").value(contains("ACTIVE")))
                .andExpect(jsonPath("$.branches[*].code").value(hasItem(code1)));

        // Kartochka o'ng paneli: filial bo'yicha qarz, qolgan limit, narx turi
        mvc.perform(get("/api/counterparties/" + c + "/summary").param("role", "CUSTOMER").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.branches[0].code").value(code1))
                .andExpect(jsonPath("$.branches[0].hasTerms").value(true))
                .andExpect(jsonPath("$.branches[0].debt").value("1250000.50"))
                .andExpect(jsonPath("$.branches[0].maxOverdueDays").value(40))
                .andExpect(jsonPath("$.branches[0].limitLeft").value("3749999.50"))
                .andExpect(jsonPath("$.branches[0].paymentDays").value(15))
                .andExpect(jsonPath("$.branches.length()").value(1));

        // Boshqa filial tanlansa: sharti yo'q, qarz 0
        mvc.perform(get("/api/counterparties/overview").param("role", "CUSTOMER").param("branchId", String.valueOf(b2)).cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath(row + ".inScope").value(contains(false)))
                .andExpect(jsonPath(row + ".debt").value(contains("0.00")));

        // Filial xodimi boshqa filialni so'rasa ham — faqat o'z filiali
        Cookie operator = loginAs("OPERATOR", b2);
        mvc.perform(get("/api/counterparties/overview").param("role", "CUSTOMER").param("branchId", String.valueOf(b1)).cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath(row + ".inScope").value(contains(false)))
                .andExpect(jsonPath(row + ".debt").value(contains("0.00")));

        // Yetkazib beruvchilar ro'yxatida mijoz yo'q
        mvc.perform(get("/api/counterparties/overview").param("role", "SUPPLIER").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath(row).isEmpty());
    }

    @Test
    void kindIsSavedOnCard() throws Exception {
        Cookie manager = loginAs("BRANCH_MANAGER", null);
        String tin = tin();
        MvcResult r = mvc.perform(post("/api/counterparties").with(csrf()).cookie(manager).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tin\":\"" + tin + "\",\"name\":\"Dorixona " + tin + "\",\"customer\":true,\"supplier\":false,\"kind\":\"PHARMACY\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        long id = Long.parseLong(r.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));
        mvc.perform(get("/api/counterparties/" + id).cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("PHARMACY"));
        // Kartochka «Tarix»: yaratish yozuvi, kim bilan
        mvc.perform(get("/api/counterparties/" + id + "/history").param("role", "CUSTOMER").cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].action").value("counterparty.create"))
                .andExpect(jsonPath("$[0].employee").value("Sinov"));
        mvc.perform(get("/api/counterparties/" + id + "/history").param("role", "SUPPLIER").cookie(loginAs("PICKER", null)))
                .andExpect(status().isForbidden());
    }

    @Test
    void cardDocumentTabsAreScopedAndPermissioned() throws Exception {
        long b1 = branch();
        long b2 = branch();
        String tin = tin();
        long c = jdbc.sql("INSERT INTO counterparty (tin, name, is_customer, is_supplier) VALUES (:t, :n, true, false) RETURNING id")
                .param("t", tin)
                .param("n", "Hujjat Dorixona " + tin)
                .query(Long.class)
                .single();
        Cookie director = loginAs("DIRECTOR", null);
        long emp = jdbc.sql("SELECT max(id) FROM employee").query(Long.class).single();
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Tashkent"));
        for (long b : new long[] {b1, b2}) {
            long acc = jdbc.sql("INSERT INTO money_account (branch_id, kind, code, name) VALUES (:b, 'TERMINAL', :k, 'Terminal') RETURNING id")
                    .param("b", b)
                    .param("k", "T" + b + "-" + c)
                    .query(Long.class)
                    .single();
            jdbc.sql("""
                    INSERT INTO customer_payment (number, branch_id, customer_id, account_id, payment_date, amount, created_by)
                    VALUES (:n, :b, :c, :a, :d, 150000.25, :e)""")
                    .param("n", "MT-DOC-" + b + "-" + c)
                    .param("b", b)
                    .param("c", c)
                    .param("a", acc)
                    .param("d", b == b1 ? today.minusDays(1) : today)
                    .param("e", emp)
                    .update();
        }
        String url = "/api/counterparties/" + c + "/documents";

        mvc.perform(get(url).param("role", "CUSTOMER").param("section", "PAYMENTS").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[0].number").value("MT-DOC-" + b2 + "-" + c))
                .andExpect(jsonPath("$.items[0].amount").value("150000.25"))
                .andExpect(jsonPath("$.items[0].status").value("DRAFT"))
                .andExpect(jsonPath("$.items[1].date").value(today.minusDays(1).toString()));
        mvc.perform(get(url).param("role", "CUSTOMER").param("section", "ORDERS").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));
        // Mijozda «Kirimlar» yorlig'i yo'q
        mvc.perform(get(url).param("role", "CUSTOMER").param("section", "RECEIPTS").cookie(director))
                .andExpect(status().isBadRequest());

        // Filial rahbari — faqat o'z filiali
        Cookie manager = loginAs("BRANCH_MANAGER", b2);
        mvc.perform(get(url).param("role", "CUSTOMER").param("section", "PAYMENTS").cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].branchCode").value(
                        jdbc.sql("SELECT code FROM branch WHERE id = :b").param("b", b2).query(String.class).single()));

        // Operatorda payments.view yo'q
        Cookie operator = loginAs("OPERATOR", b2);
        mvc.perform(get(url).param("role", "CUSTOMER").param("section", "PAYMENTS").cookie(operator))
                .andExpect(status().isForbidden());
    }
}
