package uz.medix.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.time.ZoneId;
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
import uz.medix.TestcontainersConfig;

/** MT: qoralama → o'tkazish (eng eski qarzdan / qo'lda, ortig'i avans, kassa qoldig'i) → bekor qilish; parallel o'tkazish. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class PaymentIT {

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
                SELECT id, :c, 'MT sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(300_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private long customer() {
        return jdbc.sql("INSERT INTO counterparty (tin, name, is_customer) VALUES (:t, :n, true) RETURNING id")
                .param("t", String.valueOf(500_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .param("n", "Dorixona " + UUID.randomUUID().toString().substring(0, 6))
                .query(Long.class)
                .single();
    }

    private void debt(long branch, long customer, long docId, String amount, LocalDate due) {
        jdbc.sql("""
                INSERT INTO party_ledger (branch_id, counterparty_id, side, amount, due_date, doc_type, doc_id, doc_number)
                VALUES (:b, :c, 'CUSTOMER', CAST(:a AS NUMERIC), :d, 'SV', :i, :n)""")
                .param("b", branch)
                .param("c", customer)
                .param("a", amount)
                .param("d", java.sql.Date.valueOf(due))
                .param("i", docId)
                .param("n", "SV-TST-" + docId)
                .update();
    }

    private Cookie loginAs(String role, long branchId) throws Exception {
        String login = "mt" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :login, 'Sinov ' || :role, id, :b, :hash, false FROM role WHERE code = :role""")
                .param("login", login)
                .param("b", branchId)
                .param("hash", encoder.encode(PASSWORD))
                .param("role", role)
                .update();
        MvcResult r = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
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

    private static LocalDate today() {
        return LocalDate.now(ZoneId.of("Asia/Tashkent"));
    }

    private long kassa(Cookie who, long branch) throws Exception {
        MvcResult r = mvc.perform(get("/api/money-accounts").param("branchId", String.valueOf(branch)).cookie(who))
                .andExpect(status().isOk()).andReturn();
        return ((Number) JsonPath.read(r.getResponse().getContentAsString(), "$[0].id")).longValue();
    }

    private String debtOf(long branch, long customer) {
        return jdbc.sql("SELECT coalesce(sum(amount), 0)::text FROM party_ledger WHERE branch_id = :b AND counterparty_id = :c AND side = 'CUSTOMER'")
                .param("b", branch).param("c", customer).query(String.class).single();
    }

    private String balance(long account) {
        return jdbc.sql("SELECT balance::text FROM money_account WHERE id = :a").param("a", account).query(String.class).single();
    }

    private static String draft(long branch, long customer, long account, String amount) {
        return "{\"branchId\":" + branch + ",\"customerId\":" + customer + ",\"accountId\":" + account + ",\"amount\":\"" + amount + "\"}";
    }

    @Test
    void postAllocatesOldestFirstAdvanceAndCancelReverses() throws Exception {
        long b = branch();
        long c = customer();
        Cookie cashier = loginAs("CASHIER", b);
        Cookie manager = loginAs("BRANCH_MANAGER", b);
        Cookie picker = loginAs("PICKER", b);
        long k = kassa(cashier, b);
        debt(b, c, 9_100_001L, "5000.00", today().minusDays(40));
        debt(b, c, 9_100_002L, "4000.00", today().plusDays(5));

        mvc.perform(get("/api/payments/customer/open-docs").param("branchId", "" + b).param("customerId", "" + c).cookie(cashier))
                .andExpect(jsonPath("$.debt").value("9000.00"))
                .andExpect(jsonPath("$.docs[0].docNumber").value("SV-TST-9100001"))
                .andExpect(jsonPath("$.docs[0].overdueDays").value(40));
        send(post("/api/payments/customer"), picker, draft(b, c, k, "7000")).andExpect(status().isForbidden());
        send(post("/api/payments/customer"), cashier, draft(b, c, k, "0")).andExpect(jsonPath("$.code").value("payment.amountInvalid"));

        // Avtomatik: 5 000 → eski, 2 000 → keyingisi
        long p1 = id(send(post("/api/payments/customer"), cashier, draft(b, c, k, "7000"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number", matchesPattern("MT-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn());
        assertThat(debtOf(b, c)).isEqualTo("9000.00");
        send(put("/api/payments/customer/" + p1), cashier, draft(b, c, k, "7000.00")).andExpect(status().isOk());
        send(post("/api/payments/customer/" + p1 + "/post"), cashier, "{}")
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.allocations[0].docNumber").value("SV-TST-9100001"))
                .andExpect(jsonPath("$.allocations[0].amount").value("5000.00"))
                .andExpect(jsonPath("$.allocations[1].amount").value("2000.00"))
                .andExpect(jsonPath("$.advance").value("0.00"));
        assertThat(debtOf(b, c)).isEqualTo("2000.00");
        assertThat(balance(k)).isEqualTo("7000.00");
        send(post("/api/payments/customer/" + p1 + "/post"), cashier, "{}").andExpect(jsonPath("$.code").value("payment.notDraft"));
        assertThatThrownBy(() -> jdbc.sql("UPDATE customer_payment SET amount = 1 WHERE id = :p").param("p", p1).update())
                .hasMessageContaining("oʻzgarmaydi");

        // Qo'lda taqsimot: ochiq qarzdan ko'p — xato; 1 500 → hujjatga, 1 500 — avans
        long p2 = id(send(post("/api/payments/customer"), cashier, draft(b, c, k, "3000")).andReturn());
        String alloc = "{\"allocations\":[{\"docType\":\"SV\",\"docId\":9100002,\"amount\":\"%s\"}]}";
        send(post("/api/payments/customer/" + p2 + "/post"), cashier, alloc.formatted("2500")).andExpect(jsonPath("$.code").value("payment.allocOverOpen"));
        send(post("/api/payments/customer/" + p2 + "/post"), cashier, alloc.formatted("1500"))
                .andExpect(jsonPath("$.allocations[0].amount").value("1500.00"))
                .andExpect(jsonPath("$.advance").value("1500.00"));
        assertThat(debtOf(b, c)).isEqualTo("-1000.00");
        mvc.perform(get("/api/payments/customer/open-docs").param("branchId", "" + b).param("customerId", "" + c).cookie(cashier))
                .andExpect(jsonPath("$.advance").value("1500.00"))
                .andExpect(jsonPath("$.docs[0].open").value("500.00"));

        // Bekor qilish: faqat ruxsat bilan; qarz va kassa teskari
        send(post("/api/payments/customer/" + p2 + "/cancel"), cashier, "{\"reason\":\"Xato\"}").andExpect(status().isForbidden());
        send(post("/api/payments/customer/" + p2 + "/cancel"), manager, "{\"reason\":\"Xato summa\"}")
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(debtOf(b, c)).isEqualTo("2000.00");
        assertThat(balance(k)).isEqualTo("7000.00");
        mvc.perform(get("/api/payments/customer/open-docs").param("branchId", "" + b).param("customerId", "" + c).cookie(cashier))
                .andExpect(jsonPath("$.advance").value("0.00"))
                .andExpect(jsonPath("$.docs[0].open").value("2000.00"));
        assertThat(jdbc.sql("SELECT count(*) FROM money_move WHERE account_id = :a").param("a", k).query(Long.class).single()).isEqualTo(3);
        mvc.perform(get("/api/payments/customer").param("branchId", "" + b).cookie(cashier)).andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void cancelFailsWhenCashAlreadySpentAndParallelPostsNeverOverAllocate() throws Exception {
        long b = branch();
        long c = customer();
        Cookie cashier = loginAs("CASHIER", b);
        Cookie manager = loginAs("BRANCH_MANAGER", b);
        long k = kassa(cashier, b);
        debt(b, c, 9_200_001L, "5000.00", today().minusDays(1));

        int n = 6;
        List<Long> ids = new ArrayList<>();
        List<Cookie> who = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            ids.add(id(send(post("/api/payments/customer"), cashier, draft(b, c, k, "2000")).andReturn()));
            who.add(loginAs("CASHIER", b));
        }
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            long id = ids.get(i);
            Cookie session = who.get(i);
            Callable<Integer> task = () -> {
                go.await();
                return send(post("/api/payments/customer/" + id + "/post"), session, "{}").andReturn().getResponse().getStatus();
            };
            results.add(pool.submit(task));
        }
        go.countDown();
        for (Future<Integer> f : results) {
            assertThat(f.get()).isEqualTo(200);
        }
        pool.shutdown();
        // 6 × 2 000 = 12 000: hujjatga aniq 5 000 taqsimlangan, 7 000 — avans
        assertThat(jdbc.sql("SELECT sum(amount)::text FROM customer_payment_alloc WHERE doc_id = 9200001").query(String.class).single())
                .isEqualTo("5000.00");
        assertThat(jdbc.sql("SELECT sum(advance)::text FROM customer_payment WHERE id IN (:ids)").param("ids", ids).query(String.class).single())
                .isEqualTo("7000.00");
        assertThat(debtOf(b, c)).isEqualTo("-7000.00");
        assertThat(balance(k)).isEqualTo("12000.00");

        // Kassadan pul chiqib ketgan bo'lsa — bekor qilinmaydi (qoldiq manfiy bo'lmaydi)
        jdbc.sql("UPDATE money_account SET balance = 1000 WHERE id = :a").param("a", k).update();
        send(post("/api/payments/customer/" + ids.getFirst() + "/cancel"), manager, "{\"reason\":\"Qaytarish\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("money.insufficient"));
        assertThat(debtOf(b, c)).isEqualTo("-7000.00");
        assertThatThrownBy(() -> jdbc.sql("UPDATE money_account SET balance = -1 WHERE id = :a").param("a", k).update())
                .hasMessageContaining("check");
    }

    @Test
    void supplierPaymentApprovalFlowAllocatesReceiptsAndChecksCash() throws Exception {
        long b = branch();
        long c = customer();
        long s = jdbc.sql("INSERT INTO counterparty (tin, name, is_supplier) VALUES (:t, 'YB sinov', true) RETURNING id")
                .param("t", String.valueOf(600_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .query(Long.class).single();
        Cookie cashier = loginAs("CASHIER", b);
        Cookie manager = loginAs("BRANCH_MANAGER", b);
        Cookie director = loginAs("DIRECTOR", b);
        long k = kassa(cashier, b);
        for (long[] kr : new long[][] {{9_300_001L, 8000, -10}, {9_300_002L, 3000, 5}}) {
            jdbc.sql("""
                    INSERT INTO party_ledger (branch_id, counterparty_id, side, amount, due_date, doc_type, doc_id, doc_number)
                    VALUES (:b, :s, 'SUPPLIER', :a, :d, 'KR', :i, :n)""")
                    .param("b", b).param("s", s).param("a", kr[1]).param("d", java.sql.Date.valueOf(today().plusDays(kr[2])))
                    .param("i", kr[0]).param("n", "KR-TST-" + kr[0]).update();
        }
        String body = "{\"branchId\":" + b + ",\"supplierId\":" + s + ",\"accountId\":" + k + ",\"amount\":\"%s\"}";
        send(post("/api/payments/supplier"), cashier, body.formatted("5000").replace("\"supplierId\":" + s, "\"supplierId\":" + c))
                .andExpect(jsonPath("$.code").value("payment.supplierUnknown"));
        long y1 = id(send(post("/api/payments/supplier"), cashier, body.formatted("5000"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number", matchesPattern("YT-[A-Z]{3}-\\d{6}")))
                .andReturn());
        send(post("/api/payments/supplier/" + y1 + "/send"), cashier, "").andExpect(jsonPath("$.status").value("PENDING"));
        send(post("/api/payments/supplier/" + y1 + "/approve"), cashier, "{}").andExpect(status().isForbidden());
        // Kassada pul yo'q — o'tkazilmaydi
        send(post("/api/payments/supplier/" + y1 + "/approve"), manager, "{}").andExpect(jsonPath("$.code").value("money.insufficient"));
        long mt = id(send(post("/api/payments/customer"), cashier, draft(b, c, k, "20000")).andReturn());
        send(post("/api/payments/customer/" + mt + "/post"), cashier, "{}").andExpect(jsonPath("$.status").value("POSTED"));
        send(post("/api/payments/supplier/" + y1 + "/approve"), manager, "{}")
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.allocations[0].docNumber").value("KR-TST-9300001"))
                .andExpect(jsonPath("$.allocations[0].amount").value("5000.00"));
        assertThat(balance(k)).isEqualTo("15000.00");
        String supplierDebt = "SELECT sum(amount)::text FROM party_ledger WHERE branch_id = :b AND counterparty_id = :s AND side = 'SUPPLIER'";
        assertThat(jdbc.sql(supplierDebt).param("b", b).param("s", s).query(String.class).single()).isEqualTo("6000.00");

        // Tasdiqsiz o'tkazish — faqat ytDirect (Direktor); ortig'i avans
        long y2 = id(send(post("/api/payments/supplier"), cashier, body.formatted("7000")).andReturn());
        send(post("/api/payments/supplier/" + y2 + "/post"), cashier, "{}").andExpect(status().isForbidden());
        send(post("/api/payments/supplier/" + y2 + "/post"), director, "{}")
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.allocations.length()").value(2))
                .andExpect(jsonPath("$.advance").value("1000.00"));
        assertThat(balance(k)).isEqualTo("8000.00");
        assertThat(jdbc.sql(supplierDebt).param("b", b).param("s", s).query(String.class).single()).isEqualTo("-1000.00");

        // Qaytarish (sabab bilan) va bekor qilish (teskari)
        long y3 = id(send(post("/api/payments/supplier"), cashier, body.formatted("100")).andReturn());
        send(post("/api/payments/supplier/" + y3 + "/send"), cashier, "").andExpect(status().isOk());
        send(post("/api/payments/supplier/" + y3 + "/return"), manager, "{\"reason\":\"Hisob raqami xato\"}")
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.returnedReason").value("Hisob raqami xato"));
        send(post("/api/payments/supplier/" + y2 + "/cancel"), manager, "{\"reason\":\"Ikki marta toʻlandi\"}")
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(balance(k)).isEqualTo("15000.00");
        assertThat(jdbc.sql(supplierDebt).param("b", b).param("s", s).query(String.class).single()).isEqualTo("6000.00");
        mvc.perform(get("/api/payments/supplier/open-docs").param("branchId", "" + b).param("supplierId", "" + s).cookie(cashier))
                .andExpect(jsonPath("$.docs[0].open").value("3000.00"))
                .andExpect(jsonPath("$.docs[1].open").value("3000.00"))
                .andExpect(jsonPath("$.advance").value("0.00"));
    }
}
