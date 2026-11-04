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

/** KO/BO (tasdiq chegarasi, rad etish, bekor qilish), IO (parallel o'tkazmalar), ko'chirma, kunni yopish (farq, PIN, yopilgan kun). */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class CashIT {

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
                SELECT id, :c, 'Kassa sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(300_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private record Session(Cookie cookie, long id) {}

    private Session loginAs(String role, long branchId) throws Exception {
        String login = "ko" + UUID.randomUUID().toString().substring(0, 8);
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

    private String balance(long account) {
        return jdbc.sql("SELECT balance::text FROM money_account WHERE id = :a").param("a", account).query(String.class).single();
    }

    private String op(long branch, long account, String dir, String item, String amount, LocalDate date) {
        return "{\"branchId\":" + branch + ",\"accountId\":" + account + ",\"direction\":\"" + dir + "\",\"itemId\":" + item(item)
                + ",\"amount\":\"" + amount + "\"" + (date == null ? "" : ",\"opDate\":\"" + date + "\"") + "}";
    }

    private static String transfer(long branch, long from, long to, String amount) {
        return "{\"branchId\":" + branch + ",\"fromAccountId\":" + from + ",\"toAccountId\":" + to + ",\"amount\":\"" + amount + "\"}";
    }

    @Test
    void operationsApprovalCancelTransfersAndStatement() throws Exception {
        long b = branch();
        Cookie cashier = loginAs("CASHIER", b).cookie();
        Cookie manager = loginAs("BRANCH_MANAGER", b).cookie();
        Cookie picker = loginAs("PICKER", b).cookie();
        long k = account(cashier, b, 0);
        long t = account(cashier, b, 1);

        send(post("/api/cash-ops"), picker, op(b, k, "IN", "Boshqa kirim", "100", null)).andExpect(status().isForbidden());
        send(post("/api/cash-ops"), cashier, op(b, k, "OUT", "Boshqa kirim", "100", null)).andExpect(jsonPath("$.code").value("cash.itemUnknown"));
        send(post("/api/cash-ops"), cashier, op(b, k, "IN", "Boshqa kirim", "100", today().plusDays(1)))
                .andExpect(jsonPath("$.code").value("payment.dateFuture"));
        send(post("/api/cash-ops"), cashier, op(b, k, "IN", "Boshqa kirim", "5000000", null))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number", matchesPattern("KO-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.status").value("POSTED"));
        assertThat(balance(k)).isEqualTo("5000000.00");

        // 2 000 000 dan katta kassa chiqimi — tasdiqlashda; rad etish
        long big1 = id(send(post("/api/cash-ops"), cashier, op(b, k, "OUT", "Ijara", "2500000", null))
                .andExpect(jsonPath("$.status").value("PENDING")).andReturn());
        assertThat(balance(k)).isEqualTo("5000000.00");
        send(post("/api/cash-ops/" + big1 + "/approve"), cashier, "").andExpect(status().isForbidden());
        send(post("/api/cash-ops/" + big1 + "/cancel"), manager, "{\"reason\":\"x\"}").andExpect(jsonPath("$.code").value("cash.pendingUseReject"));
        send(post("/api/cash-ops/" + big1 + "/reject"), manager, "{\"reason\":\"Shartnoma yoʻq\"}")
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.cancelReason").value("Shartnoma yoʻq"));
        send(post("/api/cash-ops/" + big1 + "/approve"), manager, "").andExpect(jsonPath("$.code").value("cash.notPending"));

        long big2 = id(send(post("/api/cash-ops"), cashier, op(b, k, "OUT", "Ijara", "2500000", null)).andReturn());
        send(post("/api/cash-ops/" + big2 + "/approve"), manager, "")
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.approvedBy").value("Sinov BRANCH_MANAGER"));
        assertThat(balance(k)).isEqualTo("2500000.00");

        // Kichik chiqim darhol; bekor qilish — faqat ruxsat bilan, teskari
        long small = id(send(post("/api/cash-ops"), cashier, op(b, k, "OUT", "Xoʻjalik", "2000000", null))
                .andExpect(jsonPath("$.status").value("POSTED")).andReturn());
        assertThat(balance(k)).isEqualTo("500000.00");
        send(post("/api/cash-ops/" + small + "/cancel"), cashier, "{\"reason\":\"Xato\"}").andExpect(status().isForbidden());
        send(post("/api/cash-ops/" + small + "/cancel"), manager, "{\"reason\":\"Xato summa\"}").andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(balance(k)).isEqualTo("2500000.00");
        assertThatThrownBy(() -> jdbc.sql("UPDATE cash_op SET amount = 1 WHERE id = :i").param("i", big2).update()).hasMessageContaining("oʻzgarmaydi");

        // Terminal — BO; IO: Terminal → kassa
        send(post("/api/cash-ops"), cashier, op(b, t, "IN", "Qaytarilgan mablagʻ", "300000", null))
                .andExpect(jsonPath("$.number", matchesPattern("BO-[A-Z]{3}-\\d{6}")));
        send(post("/api/money-transfers"), cashier, transfer(b, t, t, "1")).andExpect(jsonPath("$.code").value("transfer.sameAccount"));
        send(post("/api/money-transfers"), cashier, transfer(b, t, k, "300001")).andExpect(jsonPath("$.code").value("money.insufficient"));
        long io = id(send(post("/api/money-transfers"), cashier, transfer(b, t, k, "300000"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number", matchesPattern("IO-[A-Z]{3}-\\d{6}")))
                .andReturn());
        assertThat(balance(t)).isEqualTo("0.00");
        assertThat(balance(k)).isEqualTo("2800000.00");
        send(post("/api/money-transfers/" + io + "/cancel"), manager, "{\"reason\":\"Notoʻgʻri hisob\"}").andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(balance(t)).isEqualTo("300000.00");
        assertThat(balance(k)).isEqualTo("2500000.00");

        mvc.perform(get("/api/money-accounts/" + k + "/statement").cookie(cashier))
                .andExpect(jsonPath("$.opening").value("0.00"))
                .andExpect(jsonPath("$.income").value("7300000.00"))
                .andExpect(jsonPath("$.expense").value("4800000.00"))
                .andExpect(jsonPath("$.closing").value("2500000.00"))
                .andExpect(jsonPath("$.moves.length()").value(6));
        mvc.perform(get("/api/cash-ops").param("branchId", "" + b).param("status", "PENDING").cookie(cashier))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void dayCloseWithCountDiffPinAndClosedDayLock() throws Exception {
        long b = branch();
        Cookie cashier = loginAs("CASHIER", b).cookie();
        Session manager = loginAs("BRANCH_MANAGER", b);
        jdbc.sql("UPDATE employee SET pin_hash = :h WHERE id = :id").param("h", encoder.encode("4826")).param("id", manager.id()).update();
        long k = account(cashier, b, 0);
        long t = account(cashier, b, 1);
        LocalDate yesterday = today().minusDays(1);

        send(post("/api/cash-ops"), cashier, op(b, k, "IN", "Boshqa kirim", "1250350.50", yesterday)).andExpect(status().isCreated());
        mvc.perform(get("/api/cash-close/preview").param("accountId", "" + k).param("date", yesterday.toString()).cookie(cashier))
                .andExpect(jsonPath("$.expected").value("1250350.50"))
                .andExpect(jsonPath("$.income").value("1250350.50"))
                .andExpect(jsonPath("$.nominals[0]").value(200000));
        mvc.perform(get("/api/cash-close/preview").param("accountId", "" + t).cookie(cashier))
                .andExpect(jsonPath("$.code").value("cashClose.onlyCash"));

        String exact = "{\"accountId\":" + k + ",\"closeDate\":\"" + yesterday
                + "\",\"denominations\":[{\"nominal\":200000,\"count\":6},{\"nominal\":50000,\"count\":1},{\"nominal\":1000,\"count\":0}],\"coins\":\"350.50\"}";
        send(post("/api/cash-close"), cashier, exact.replace("50000,", "3000,")).andExpect(jsonPath("$.code").value("cashClose.nominalInvalid"));
        send(post("/api/cash-close"), cashier, exact)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.diff").value("0.00"))
                .andExpect(jsonPath("$.counted").value("1250350.50"))
                .andExpect(jsonPath("$.denominations.length()").value(2));
        send(post("/api/cash-close"), cashier, exact).andExpect(jsonPath("$.code").value("cashClose.alreadyClosed"));
        // Yopilgan kunga yangi harakat yo'q
        send(post("/api/cash-ops"), cashier, op(b, k, "IN", "Boshqa kirim", "1", yesterday))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("money.dayClosed"));

        // Bugun: tasdiq kutayotgan chiqim yopishni to'xtatadi
        send(post("/api/cash-ops"), cashier, op(b, k, "IN", "Boshqa kirim", "100000", null)).andExpect(status().isCreated());
        long pending = id(send(post("/api/cash-ops"), cashier, op(b, k, "OUT", "Ish haqi", "2100000", null)).andReturn());
        String counted = "{\"accountId\":" + k + ",\"denominations\":[{\"nominal\":200000,\"count\":6},{\"nominal\":50000,\"count\":3}]%s}";
        send(post("/api/cash-close"), cashier, counted.formatted("")).andExpect(jsonPath("$.code").value("cashClose.pending"));
        send(post("/api/cash-ops/" + pending + "/reject"), manager.cookie(), "{\"reason\":\"Ertaga\"}").andExpect(status().isOk());

        // Kutilgan 1 350 350,50; sanaldi 1 350 000 → farq −350,50: kassir yopolmaydi, rahbar — izoh va PIN bilan
        send(post("/api/cash-close"), cashier, counted.formatted("")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("cashClose.diffForbidden"));
        send(post("/api/cash-close"), manager.cookie(), counted.formatted("")).andExpect(jsonPath("$.code").value("cashClose.noteRequired"));
        send(post("/api/cash-close"), manager.cookie(), counted.formatted(",\"note\":\"Mayda pul yoʻq\""))
                .andExpect(jsonPath("$.code").value("cashClose.pinRequired"));
        send(post("/api/cash-close"), manager.cookie(), counted.formatted(",\"note\":\"Mayda pul yoʻq\",\"pin\":\"1111\""))
                .andExpect(jsonPath("$.code").value("pin.wrong"));
        send(post("/api/cash-close"), manager.cookie(), counted.formatted(",\"note\":\"Mayda pul yoʻq\",\"pin\":\"4826\""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.expected").value("1350350.50"))
                .andExpect(jsonPath("$.diff").value("-350.50"))
                .andExpect(jsonPath("$.correctionNumber", matchesPattern("KO-[A-Z]{3}-\\d{6}")));
        assertThat(balance(k)).isEqualTo("1350000.00");
        mvc.perform(get("/api/cash-close").param("branchId", "" + b).cookie(cashier))
                .andDo(r -> {
                    if (r.getResponse().getStatus() >= 500) {
                        throw new AssertionError("500: " + r.getResolvedException(), r.getResolvedException());
                    }
                })
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].diff").value("-350.50"))
                .andExpect(jsonPath("$[1].denominations[0].nominal").value(200000));
        // Tuzatuvchi KO bekor qilinmaydi; bugungi kunga ham endi harakat yo'q (Terminal esa ochiq)
        long corr = jdbc.sql("SELECT correction_op_id FROM cash_day_close WHERE account_id = :a AND correction_op_id IS NOT NULL")
                .param("a", k).query(Long.class).single();
        send(post("/api/cash-ops/" + corr + "/cancel"), manager.cookie(), "{\"reason\":\"x\"}").andExpect(jsonPath("$.code").value("cash.closeCorrection"));
        send(post("/api/cash-ops"), cashier, op(b, k, "IN", "Boshqa kirim", "1", null)).andExpect(jsonPath("$.code").value("money.dayClosed"));
        send(post("/api/cash-ops"), cashier, op(b, t, "IN", "Boshqa kirim", "5", null)).andExpect(status().isCreated());
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM cash_day_close WHERE account_id = :a").param("a", k).update()).isNotNull();
    }

    @Test
    void parallelTransfersNeverOverdrawAccount() throws Exception {
        long b = branch();
        Cookie cashier = loginAs("CASHIER", b).cookie();
        long k = account(cashier, b, 0);
        long t = account(cashier, b, 1);
        send(post("/api/cash-ops"), cashier, op(b, k, "IN", "Boshqa kirim", "10000", null)).andExpect(status().isCreated());

        int n = 8;
        List<Cookie> who = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            who.add(loginAs("CASHIER", b).cookie());
        }
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            Cookie session = who.get(i);
            Callable<Integer> task = () -> {
                go.await();
                return send(post("/api/money-transfers"), session, transfer(b, k, t, "2000")).andReturn().getResponse().getStatus();
            };
            results.add(pool.submit(task));
        }
        go.countDown();
        int ok = 0;
        int conflict = 0;
        for (Future<Integer> f : results) {
            int s = f.get();
            if (s == 201) {
                ok++;
            } else if (s == 409) {
                conflict++;
            }
        }
        pool.shutdown();
        assertThat(ok).isEqualTo(5);
        assertThat(conflict).isEqualTo(3);
        assertThat(balance(k)).isEqualTo("0.00");
        assertThat(balance(t)).isEqualTo("10000.00");
        assertThat(jdbc.sql("SELECT sum(amount)::text FROM money_move WHERE account_id = :a").param("a", k).query(String.class).single())
                .isEqualTo("0.00");
    }
}
