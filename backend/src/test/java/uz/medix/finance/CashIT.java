package uz.medix.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
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
    void baseNumberIsStoredAndReturned() throws Exception {
        long b = branch();
        Cookie cashier = loginAs("CASHIER", b).cookie();
        long k = account(cashier, b, 0);
        // «Asos hujjat №» (prototip `MoneyOpDoc`): bo'shliqsiz saqlanadi va qaytadi; bo'sh — null; 40 belgidan uzun — rad
        String withBase = op(b, k, "IN", "Boshqa kirim", "10", null).replace("}", ",\"baseNo\":\" AV-0412 \"}");
        long based = id(send(post("/api/cash-ops"), cashier, withBase).andExpect(status().isCreated())
                .andExpect(jsonPath("$.baseNo").value("AV-0412")).andReturn());
        mvc.perform(get("/api/cash-ops/" + based).cookie(cashier)).andExpect(jsonPath("$.baseNo").value("AV-0412"));
        send(post("/api/cash-ops"), cashier, withBase.replace(" AV-0412 ", " ")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.baseNo").doesNotExist());
        send(post("/api/cash-ops"), cashier, withBase.replace(" AV-0412 ", "A".repeat(41))).andExpect(status().isBadRequest());
        assertThat(balance(k)).isEqualTo("20.00");
        assertThat(jdbc.sql("SELECT base_no FROM cash_op WHERE id = :id").param("id", based).query(String.class).single()).isEqualTo("AV-0412");
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
        // Bildirishnomalar: tasdiq kutmoqda — cash.approve egalariga (Filial rahbari), rad etildi — muallifga (kassir) sabab bilan
        assertThat(jdbc.sql("""
                SELECT count(*) FROM notification n JOIN employee e ON e.id = n.employee_id JOIN role r ON r.id = e.role_id
                WHERE n.dedup_key = :d AND r.code = 'BRANCH_MANAGER'""").param("d", "cash.approval:" + big1).query(Integer.class).single())
                .isPositive();
        assertThat(jdbc.sql("""
                SELECT n.body FROM notification n JOIN cash_op o ON o.created_by = n.employee_id
                WHERE n.dedup_key = :d AND o.id = :id""").param("d", "cash.rejected:" + big1).param("id", big1).query(String.class).single())
                .isEqualTo("Shartnoma yoʻq");

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

        // Kassa orderi — server PDF: summa so'z bilan, bekor qilingan belgisi
        byte[] pdfBytes = mvc.perform(get("/api/cash-ops/" + small + "/pdf").cookie(cashier))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().contentType("application/pdf"))
                .andReturn().getResponse().getContentAsByteArray();
        try (var pdfDoc = org.apache.pdfbox.Loader.loadPDF(pdfBytes)) {
            assertThat(new org.apache.pdfbox.text.PDFTextStripper().getText(pdfDoc))
                    .contains("Kassa chiqim orderi", "2.000.000,00", "Ikki million soʻm 00 tiyin", "BEKOR QILINGAN", "Xoʻjalik");
        }
        mvc.perform(get("/api/cash-ops/" + small + "/pdf").cookie(picker)).andExpect(status().isForbidden());

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

        // Kassir paneli: IO kirim/chiqimga kirmaydi; bekor qilingan chiqim moddalarda yoʻq
        mvc.perform(get("/api/cash-panel").param("branchId", "" + b).cookie(picker)).andExpect(status().isForbidden());
        // Mijozlarning to'lov kuni: bugun va 3 kun ichida (ochiq sotuv qarzi)
        long debtor = jdbc.sql("INSERT INTO counterparty (tin, name, is_customer) VALUES (:t, 'Toʻlov kuni sinov', true) RETURNING id")
                .param("t", String.valueOf(400_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .query(Long.class).single();
        for (Object[] r : new Object[][] {{"150000.00", today(), 1L}, {"90000.00", today().plusDays(2), 2L}, {"70000.00", today().plusDays(10), 3L}}) {
            jdbc.sql("""
                    INSERT INTO party_ledger (branch_id, counterparty_id, side, amount, due_date, doc_type, doc_id, doc_number)
                    VALUES (:b, :c, 'CUSTOMER', CAST(:a AS NUMERIC), :d, 'SV', :i, :n)""")
                    .param("b", b).param("c", debtor).param("a", r[0]).param("d", r[1])
                    .param("i", 900_000_000L + debtor * 10 + (Long) r[2]).param("n", "SV-TEST-" + r[2])
                    .update();
        }
        mvc.perform(get("/api/cash-panel").param("branchId", "" + b).cookie(cashier))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customerDueToday").value("150000.00"))
                .andExpect(jsonPath("$.customerDueSoon").value("90000.00"))
                .andExpect(jsonPath("$.balances.cash").value("2500000.00"))
                .andExpect(jsonPath("$.balances.terminal").value("300000.00"))
                .andExpect(jsonPath("$.balances.total").value("2800000.00"))
                .andExpect(jsonPath("$.income").value("7300000.00"))
                .andExpect(jsonPath("$.expense").value("4500000.00"))
                .andExpect(jsonPath("$.expenses.length()").value(1))
                .andExpect(jsonPath("$.expenses[0].item").value("Ijara"))
                .andExpect(jsonPath("$.expensesTotal").value("2500000.00"))
                .andExpect(jsonPath("$.pendingOps").value(0))
                .andExpect(jsonPath("$.accounts[0].closing").value("2500000.00"))
                .andExpect(jsonPath("$.days.length()").value(1))
                .andExpect(jsonPath("$.recent.length()").value(9));
        mvc.perform(get("/api/cash-panel").param("branchId", "" + b).param("accountId", "" + t).cookie(cashier))
                .andExpect(jsonPath("$.balances.total").value("300000.00"))
                .andExpect(jsonPath("$.accounts.length()").value(1))
                .andExpect(jsonPath("$.accounts[0].income").value("600000.00"))
                .andExpect(jsonPath("$.accounts[0].expense").value("300000.00"));
        // To'lov turi filtri (SPEC 8): Terminal — faqat terminal hisoblari; Naqd — faqat kassalar
        mvc.perform(get("/api/cash-panel").param("branchId", "" + b).param("kind", "TERMINAL").cookie(cashier))
                .andExpect(jsonPath("$.balances.total").value("300000.00"))
                .andExpect(jsonPath("$.balances.cash").value("0.00"))
                .andExpect(jsonPath("$.accounts.length()").value(1));
        mvc.perform(get("/api/cash-panel").param("branchId", "" + b).param("kind", "CASH").cookie(cashier))
                .andExpect(jsonPath("$.balances.total").value("2500000.00"))
                .andExpect(jsonPath("$.balances.terminal").value("0.00"));
        mvc.perform(get("/api/cash-panel").param("branchId", "" + b).param("from", today().toString()).param("to", today().minusDays(1).toString())
                        .cookie(cashier))
                .andExpect(jsonPath("$.code").value("cash.periodInvalid"));
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

    /** Kassa sahifasi filial tanlanmaganda (prototip Cash): barcha ochiq filiallar hisoblari; boshqa filial — koʻrinmaydi. */
    @Test
    void allAccountsRespectBranchScope() throws Exception {
        long b1 = branch();
        long b2 = branch();
        Cookie director = loginAs("DIRECTOR", b1).cookie();
        long k1 = account(director, b1, 0);
        long k2 = account(director, b2, 0);
        mvc.perform(get("/api/money-accounts/all").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", hasItem((int) k1)))
                .andExpect(jsonPath("$[*].id", hasItem((int) k2)));
        Cookie cashier = loginAs("CASHIER", b1).cookie();
        mvc.perform(get("/api/money-accounts/all").cookie(cashier))
                .andExpect(jsonPath("$[*].id", hasItem((int) k1)))
                .andExpect(jsonPath("$[*].id", not(hasItem((int) k2))));
        mvc.perform(get("/api/money-accounts/all").cookie(loginAs("PICKER", b1).cookie())).andExpect(status().isForbidden());
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

    @Test
    void cashierWorksOnlyInOwnCash() throws Exception {
        long b = branch();
        Session c1 = loginAs("CASHIER", b);
        Session c2 = loginAs("CASHIER", b);
        Session acct = loginAs("ACCOUNTANT", b);
        Session picker = loginAs("PICKER", b);
        Cookie manager = loginAs("BRANCH_MANAGER", b).cookie();
        Cookie director = loginAs("DIRECTOR", b).cookie();
        account(manager, b, 0);
        send(post("/api/money-accounts"), director, "{\"branchId\":" + b + ",\"kind\":\"CASH\",\"name\":\"Kassa 2\"}")
                .andExpect(status().isCreated());
        long k1 = account(manager, b, 0);
        long k2 = account(manager, b, 1);
        long t = account(manager, b, 2);

        // Biriktirish: faqat kassa, faqat cash.io ruxsatli faol xodim; kassir oʻzi biriktira olmaydi
        mvc.perform(get("/api/money-accounts/cashier-options").param("branchId", "" + b).cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + c1.id() + ")]").exists())
                .andExpect(jsonPath("$[?(@.id == " + acct.id() + ")]").exists())
                .andExpect(jsonPath("$[?(@.id == " + picker.id() + ")]").doesNotExist());
        send(put("/api/money-accounts/" + t + "/cashier"), manager, "{\"cashierId\":" + c1.id() + "}")
                .andExpect(jsonPath("$.code").value("money.cashierOnlyCash"));
        send(put("/api/money-accounts/" + k1 + "/cashier"), manager, "{\"cashierId\":" + picker.id() + "}")
                .andExpect(jsonPath("$.code").value("money.cashierUnknown"));
        send(put("/api/money-accounts/" + k1 + "/cashier"), c1.cookie(), "{\"cashierId\":" + c1.id() + "}").andExpect(status().isForbidden());
        send(put("/api/money-accounts/" + k1 + "/cashier"), manager, "{\"cashierId\":" + c1.id() + "}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cashierId").value(c1.id()))
                .andExpect(jsonPath("$.cashierName").value("Sinov CASHIER"));
        send(put("/api/money-accounts/" + k2 + "/cashier"), manager, "{\"cashierId\":" + c2.id() + "}").andExpect(status().isOk());

        // Har kassir — faqat oʻz kassasida
        send(post("/api/cash-ops"), c1.cookie(), op(b, k1, "IN", "Boshqa kirim", "1000", null)).andExpect(status().isCreated());
        send(post("/api/cash-ops"), c2.cookie(), op(b, k1, "IN", "Boshqa kirim", "1000", null))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("money.notYourCash"));
        send(post("/api/cash-ops"), c1.cookie(), op(b, k2, "IN", "Boshqa kirim", "1000", null)).andExpect(jsonPath("$.code").value("money.notYourCash"));
        send(post("/api/cash-ops"), acct.cookie(), op(b, k1, "IN", "Boshqa kirim", "1000", null)).andExpect(jsonPath("$.code").value("money.notYourCash"));
        // Nazoratchi (cash.approve) — istalgan kassada; Terminal — cheklanmaydi
        send(post("/api/cash-ops"), manager, op(b, k2, "IN", "Boshqa kirim", "500", null)).andExpect(status().isCreated());
        send(post("/api/cash-ops"), c2.cookie(), op(b, t, "IN", "Boshqa kirim", "700", null)).andExpect(status().isCreated());
        // IO: oʻz kassasidan Terminalga — mumkin; boshqa kassirning kassasiga kirim ham — yoʻq
        send(post("/api/money-transfers"), c1.cookie(), transfer(b, k1, t, "100")).andExpect(status().isCreated());
        send(post("/api/money-transfers"), c2.cookie(), transfer(b, t, k1, "100")).andExpect(jsonPath("$.code").value("money.notYourCash"));
        assertThat(balance(k1)).isEqualTo("900.00");
        assertThat(balance(t)).isEqualTo("800.00");

        // Biriktirilmagan kassa: kassasi bor kassir ishlatmaydi, kassasi yoʻq xodim (Buxgalter) — ishlatadi
        send(put("/api/money-accounts/" + k2 + "/cashier"), manager, "{\"cashierId\":null}")
                .andExpect(jsonPath("$.cashierId").doesNotExist());
        send(post("/api/cash-ops"), c1.cookie(), op(b, k2, "IN", "Boshqa kirim", "1000", null)).andExpect(jsonPath("$.code").value("money.useOwnCash"));
        send(post("/api/cash-ops"), c2.cookie(), op(b, k2, "IN", "Boshqa kirim", "1000", null)).andExpect(status().isCreated());
        send(post("/api/cash-ops"), acct.cookie(), op(b, k2, "IN", "Boshqa kirim", "1000", null)).andExpect(status().isCreated());
        assertThat(balance(k2)).isEqualTo("2500.00");
        assertThatThrownBy(() -> jdbc.sql("UPDATE money_account SET cashier_id = :c WHERE id = :t").param("c", c1.id()).param("t", t).update())
                .hasMessageContaining("money_account_cashier_cash_only");
    }

    @Test
    void bankStatementReconciliation() throws Exception {
        long b = branch();
        Cookie acct = loginAs("ACCOUNTANT", b).cookie();
        Cookie picker = loginAs("PICKER", b).cookie();
        Cookie director = loginAs("DIRECTOR", b).cookie();
        long k = account(acct, b, 0);
        long bank = id(send(post("/api/money-accounts"), director,
                        "{\"branchId\":" + b + ",\"kind\":\"BANK\",\"name\":\"Hamkorbank\",\"accountNo\":\"20208000900111222001\"}")
                .andExpect(status().isCreated()).andReturn());
        LocalDate yesterday = today().minusDays(1);
        send(post("/api/cash-ops"), acct, op(b, bank, "IN", "Boshqa kirim", "1000000", yesterday)).andExpect(status().isCreated());
        send(post("/api/cash-ops"), acct, op(b, bank, "IN", "Boshqa kirim", "500000", null)).andExpect(status().isCreated());
        send(post("/api/cash-ops"), acct, op(b, bank, "OUT", "Ijara", "200000", null)).andExpect(status().isCreated());

        mvc.perform(get("/api/bank-reconciliations/preview").param("accountId", "" + bank).cookie(picker)).andExpect(status().isForbidden());
        mvc.perform(get("/api/bank-reconciliations/preview").param("accountId", "" + k).cookie(acct))
                .andExpect(jsonPath("$.code").value("bankRecon.onlyBank"));
        MvcResult pv = mvc.perform(get("/api/bank-reconciliations/preview").param("accountId", "" + bank).param("date", yesterday.toString()).cookie(acct))
                .andExpect(jsonPath("$.medixBalance").value("1000000.00"))
                .andExpect(jsonPath("$.unmatched.length()").value(1))
                .andExpect(jsonPath("$.lastDate").doesNotExist())
                .andReturn();
        long m1 = ((Number) JsonPath.read(pv.getResponse().getContentAsString(), "$.unmatched[0].id")).longValue();
        String recon = "{\"accountId\":" + bank + ",\"statementDate\":\"%s\",\"bankBalance\":\"%s\",\"moveIds\":[%s]%s}";
        send(post("/api/bank-reconciliations"), acct, recon.formatted(yesterday, "1000000", m1, ""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.difference").value("0.00"))
                .andExpect(jsonPath("$.moves").value(1));
        send(post("/api/bank-reconciliations"), acct, recon.formatted(yesterday, "1000000", "", ""))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("bankRecon.dateNotAfterLast"));

        MvcResult pv2 = mvc.perform(get("/api/bank-reconciliations/preview").param("accountId", "" + bank).cookie(acct))
                .andExpect(jsonPath("$.medixBalance").value("1300000.00"))
                .andExpect(jsonPath("$.unmatched.length()").value(2))
                .andExpect(jsonPath("$.unmatchedTotal").value("300000.00"))
                .andExpect(jsonPath("$.lastBankBalance").value("1000000.00"))
                .andReturn();
        long m2 = ((Number) JsonPath.read(pv2.getResponse().getContentAsString(), "$.unmatched[0].id")).longValue();
        send(post("/api/bank-reconciliations"), acct, recon.formatted(today(), "1500000", m1, ",\"note\":\"x\""))
                .andExpect(jsonPath("$.code").value("bankRecon.moveUnknown"));
        send(post("/api/bank-reconciliations"), acct, recon.formatted(today(), "1500000", m2, ""))
                .andExpect(jsonPath("$.code").value("bankRecon.noteRequired"));
        send(post("/api/bank-reconciliations"), acct, recon.formatted(today(), "1500000", m2, ",\"note\":\"Ijara toʻlovi bankda hali oʻtmagan\""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.difference").value("200000.00"));
        mvc.perform(get("/api/bank-reconciliations/preview").param("accountId", "" + bank).cookie(acct))
                .andExpect(jsonPath("$.unmatched.length()").value(1));
        mvc.perform(get("/api/bank-reconciliations").param("accountId", "" + bank).cookie(acct))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].note").value("Ijara toʻlovi bankda hali oʻtmagan"));
        assertThatThrownBy(() -> jdbc.sql("UPDATE bank_reconciliation SET bank_balance = 0 WHERE account_id = :a").param("a", bank).update())
                .hasMessageContaining("faqat qo'shiladigan");

        // «Bank» sahifasi: bank hisobi kartasi — qoldiq, oxirgi harakat, oxirgi solishtirish; kassa kirmaydi; ruxsat — bank.view
        mvc.perform(get("/api/bank/overview").param("branchId", "" + b).cookie(acct))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cards[?(@.id == " + bank + ")].balance").value("1300000.00"))
                .andExpect(jsonPath("$.cards[?(@.id == " + bank + ")].kind").value("BANK"))
                .andExpect(jsonPath("$.cards[?(@.id == " + bank + ")].accountNo").value("20208000900111222001"))
                .andExpect(jsonPath("$.cards[?(@.id == " + bank + ")].lastMove").value(today().toString()))
                .andExpect(jsonPath("$.cards[?(@.id == " + bank + ")].reconciledOn").value(today().toString()))
                .andExpect(jsonPath("$.cards[?(@.id == " + k + ")]").isEmpty());
        mvc.perform(get("/api/bank/overview").param("branchId", "" + b).cookie(picker)).andExpect(status().isForbidden());
    }
}
