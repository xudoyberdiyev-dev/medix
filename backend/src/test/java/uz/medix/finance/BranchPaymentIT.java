package uz.medix.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;
import uz.medix.TestcontainersConfig;
import uz.medix.finance.account.Accounts;

/** Filiallar o'rtasida hisob-kitob: to'lov (pul + qarz bitta tranzaksiyada), qarzdan oshmaydi (parallel), bekor qilish, doira. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class BranchPaymentIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    Accounts accounts;

    @Autowired
    TransactionTemplate tx;

    private long branch() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        return jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'FIO sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(400_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private record Session(Cookie cookie, long id) {}

    private Session loginAs(String role, long branchId) throws Exception {
        String login = "fio" + UUID.randomUUID().toString().substring(0, 8);
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

    private static long id(MvcResult r) throws Exception {
        return ((Number) JsonPath.read(r.getResponse().getContentAsString(), "$.id")).longValue();
    }

    private long cash(long branch) {
        tx.executeWithoutResult(t -> accounts.ensureDefaults(branch));
        return jdbc.sql("SELECT id FROM money_account WHERE branch_id = :b AND kind = 'CASH' AND active ORDER BY id LIMIT 1")
                .param("b", branch)
                .query(Long.class)
                .single();
    }

    private String balance(long account) {
        return jdbc.sql("SELECT balance::text FROM money_account WHERE id = :a").param("a", account).query(String.class).single();
    }

    private String debt(long debtor, long creditor) {
        return jdbc.sql("""
                SELECT coalesce(sum(amount), 0)::numeric(18, 2)::text FROM branch_ledger WHERE debtor_branch_id = :d AND creditor_branch_id = :c""")
                .param("d", debtor)
                .param("c", creditor)
                .query(String.class)
                .single();
    }

    /** FS qarzi (to'g'ridan-to'g'ri jurnalga — FS oqimi BranchSaleIT da). */
    private void seedDebt(long debtor, long creditor, String amount, long employee) {
        jdbc.sql("""
                INSERT INTO branch_ledger (debtor_branch_id, creditor_branch_id, amount, doc_type, doc_id, doc_number, created_by)
                VALUES (:d, :c, CAST(:a AS NUMERIC), 'FS', 1, 'FS-TST-000001', :e)""")
                .param("d", debtor)
                .param("c", creditor)
                .param("a", amount)
                .param("e", employee)
                .update();
    }

    private void income(Cookie who, long branch, long account, String amount) throws Exception {
        long item = jdbc.sql("SELECT id FROM expense_item WHERE name = 'Boshqa kirim'").query(Long.class).single();
        send(post("/api/cash-ops"), who, "{\"branchId\":" + branch + ",\"accountId\":" + account + ",\"direction\":\"IN\",\"itemId\":" + item
                + ",\"amount\":\"" + amount + "\"}").andExpect(status().isCreated());
    }

    private static String pay(long payer, long payee, long from, long to, String amount) {
        return "{\"payerBranchId\":" + payer + ",\"payeeBranchId\":" + payee + ",\"fromAccountId\":" + from + ",\"toAccountId\":" + to
                + ",\"amount\":\"" + amount + "\"}";
    }

    @Test
    void paymentMovesMoneyReducesDebtAndCancelReverses() throws Exception {
        long a = branch();
        long b = branch();
        long stranger = branch();
        Session manager = loginAs("BRANCH_MANAGER", a);
        long ka = cash(a);
        long kb = cash(b);
        seedDebt(a, b, "10000.00", manager.id());
        income(manager.cookie(), a, ka, "20000");

        mvc.perform(get("/api/branch-payments/payee-accounts").param("payerBranchId", String.valueOf(a))
                        .param("payeeBranchId", String.valueOf(b)).cookie(manager.cookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + kb + ")].name").exists())
                .andExpect(jsonPath("$[0].balance").doesNotExist());
        send(post("/api/branch-payments"), manager.cookie(), pay(a, b, ka, kb, "10000.01"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("branchPayment.overDebt"));
        send(post("/api/branch-payments"), manager.cookie(), pay(a, a, ka, kb, "1"))
                .andExpect(jsonPath("$.code").value("branchPayment.sameBranch"));
        send(post("/api/branch-payments"), manager.cookie(), pay(a, b, ka, cash(stranger), "1"))
                .andExpect(jsonPath("$.code").value("payment.accountUnknown"));
        // Boshqa filial nomidan to'lab bo'lmaydi
        send(post("/api/branch-payments"), manager.cookie(), pay(b, a, kb, ka, "1")).andExpect(status().isNotFound());

        long id = id(send(post("/api/branch-payments"), manager.cookie(), pay(a, b, ka, kb, "6000"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(matchesPattern("IO-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.amount").value("6000.00"))
                .andReturn());
        assertThat(balance(ka)).isEqualTo("14000.00");
        assertThat(balance(kb)).isEqualTo("6000.00");
        assertThat(debt(a, b)).isEqualTo("4000.00");
        assertThat(jdbc.sql("SELECT count(*) FROM money_move WHERE doc_type = 'FIO' AND doc_id = :id").param("id", id).query(Integer.class)
                .single()).isEqualTo(2);

        Session payeeManager = loginAs("BRANCH_MANAGER", b);
        mvc.perform(get("/api/branch-payments").param("branchId", String.valueOf(b)).cookie(payeeManager.cookie()))
                .andExpect(jsonPath("$[0].id").value(id));
        Session strangerManager = loginAs("BRANCH_MANAGER", stranger);
        mvc.perform(get("/api/branch-payments").cookie(strangerManager.cookie()))
                .andExpect(jsonPath("$[?(@.id == " + id + ")]").isEmpty());
        // Bekor qilish — faqat to'lovchi filial
        send(post("/api/branch-payments/" + id + "/cancel"), payeeManager.cookie(), "{\"reason\":\"Xato\"}").andExpect(status().isNotFound());
        send(post("/api/branch-payments/" + id + "/cancel"), manager.cookie(), "{\"reason\":\"Notoʻgʻri hisob\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(balance(ka)).isEqualTo("20000.00");
        assertThat(balance(kb)).isEqualTo("0.00");
        assertThat(debt(a, b)).isEqualTo("10000.00");
        send(post("/api/branch-payments/" + id + "/cancel"), manager.cookie(), "{\"reason\":\"Yana\"}").andExpect(status().isConflict());
        assertThatThrownBy(() -> jdbc.sql("UPDATE branch_payment SET amount = 1 WHERE id = :id").param("id", id).update())
                .hasMessageContaining("oʻzgarmaydi");
    }

    @Test
    void parallelPaymentsNeverExceedDebt() throws Exception {
        long a = branch();
        long b = branch();
        Session manager = loginAs("BRANCH_MANAGER", a);
        long ka = cash(a);
        long kb = cash(b);
        seedDebt(a, b, "2000.00", manager.id());
        income(manager.cookie(), a, ka, "100000");

        // 4 ta parallel so'rov: har biri sessiya + tranzaksiya ulanishini oladi — 10 talik pulda kutib qolmasin (flaky edi)
        int n = 4;
        List<Cookie> who = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            who.add(loginAs("BRANCH_MANAGER", a).cookie());
        }
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            Cookie session = who.get(i);
            Callable<Integer> task = () -> {
                go.await();
                return send(post("/api/branch-payments"), session, pay(a, b, ka, kb, "1000")).andReturn().getResponse().getStatus();
            };
            results.add(pool.submit(task));
        }
        go.countDown();
        int ok = 0;
        int rejected = 0;
        for (Future<Integer> f : results) {
            int s = f.get();
            if (s == 201) {
                ok++;
            } else if (s == 400) {
                rejected++;
            }
        }
        pool.shutdown();
        assertThat(ok).isEqualTo(2);
        assertThat(rejected).isEqualTo(2);
        assertThat(debt(a, b)).isEqualTo("0.00");
        assertThat(balance(ka)).isEqualTo("98000.00");
        assertThat(balance(kb)).isEqualTo("2000.00");
    }
}
