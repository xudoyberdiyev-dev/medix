package uz.medix.reporting;

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

/** Xarajatlar hisoboti (SPEC 8): o'tkazilgan KO/BO modda / oy bo'yicha, hisob turi ustunlari, filial doirasi, ruxsat. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ExpenseReportIT {

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

    private static LocalDate today() {
        return LocalDate.now(ZoneId.of("Asia/Tashkent"));
    }

    private long account(long branch, String kind) {
        return jdbc.sql("""
                INSERT INTO money_account (branch_id, kind, code, name, account_no) VALUES (:b, :k, :c, :k, CASE WHEN :k = 'BANK' THEN '2020800' END)
                RETURNING id""")
                .param("b", branch).param("k", kind).param("c", "T-" + UUID.randomUUID().toString().substring(0, 8))
                .query(Long.class).single();
    }

    private long item(String direction, String name) {
        return jdbc.sql("INSERT INTO expense_item (direction, name) VALUES (:d, :n) RETURNING id")
                .param("d", direction).param("n", name + " " + UUID.randomUUID().toString().substring(0, 6)).query(Long.class).single();
    }

    private void op(long branch, long account, long item, String direction, String amount, String status, LocalDate date, long by) {
        jdbc.sql("""
                INSERT INTO cash_op (number, doc_type, branch_id, account_id, op_date, direction, expense_item_id, amount, status, created_by,
                                     posted_at, cancel_reason)
                VALUES (:n, 'KO', :b, :a, :d, :dir, :i, CAST(:amt AS NUMERIC), :s, :by, CASE WHEN :s = 'POSTED' THEN now() END,
                        CASE WHEN :s IN ('CANCELLED', 'REJECTED') THEN 'Sinov' END)""")
                .param("n", "KO-TST-" + UUID.randomUUID().toString().substring(0, 8)).param("b", branch).param("a", account)
                .param("d", java.sql.Date.valueOf(date)).param("dir", direction).param("i", item).param("amt", amount).param("s", status)
                .param("by", by).update();
    }

    @Test
    void itemsMonthsAccountKindsAndScope() throws Exception {
        long b = branch();
        long other = branch();
        Session director = loginAs("DIRECTOR", b);
        Cookie manager = loginAs("BRANCH_MANAGER", b).cookie();
        Cookie cashier = loginAs("CASHIER", b).cookie();
        Cookie operator = loginAs("OPERATOR", b).cookie();
        long cash = account(b, "CASH");
        long bank = account(b, "BANK");
        long terminal = account(b, "TERMINAL");
        long rent = item("EXPENSE", "Ijara");
        long fuel = item("EXPENSE", "Yoqilgʻi");
        long income = item("INCOME", "Boshqa kirim");
        LocalDate d = today();
        long by = director.id();
        op(b, cash, fuel, "OUT", "300000.00", "POSTED", d, by);
        op(b, cash, fuel, "OUT", "200000.00", "POSTED", d, by);
        op(b, bank, rent, "OUT", "5000000.00", "POSTED", d, by);
        op(b, terminal, fuel, "OUT", "50000.00", "POSTED", d, by);
        op(b, cash, fuel, "OUT", "999000.00", "PENDING", d, by);
        op(b, cash, fuel, "OUT", "888000.00", "CANCELLED", d, by);
        op(b, cash, income, "IN", "70000.00", "POSTED", d, by);
        op(other, account(other, "CASH"), rent, "OUT", "123000.00", "POSTED", d, by);
        String t = d.toString();

        mvc.perform(get("/api/reports/expenses").cookie(cashier)).andExpect(status().isForbidden());
        mvc.perform(get("/api/reports/expenses").cookie(operator)).andExpect(status().isForbidden());
        mvc.perform(get("/api/reports/expenses").param("branchId", "" + b).param("from", t).param("to", t).cookie(director.cookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.direction").value("OUT"))
                .andExpect(jsonPath("$.groupBy").value("ITEM"))
                .andExpect(jsonPath("$.rows.length()").value(2))
                .andExpect(jsonPath("$.rows[0].key").value(String.valueOf(rent)))
                .andExpect(jsonPath("$.rows[0].transfer").value("5000000.00"))
                .andExpect(jsonPath("$.rows[1].key").value(String.valueOf(fuel)))
                .andExpect(jsonPath("$.rows[1].ops").value(3))
                .andExpect(jsonPath("$.rows[1].cash").value("500000.00"))
                .andExpect(jsonPath("$.rows[1].online").value("50000.00"))
                .andExpect(jsonPath("$.rows[1].total").value("550000.00"))
                .andExpect(jsonPath("$.total.total").value("5550000.00"))
                .andExpect(jsonPath("$.total.ops").value(4));
        mvc.perform(get("/api/reports/expenses").param("branchId", "" + b).param("from", t).param("direction", "IN").cookie(director.cookie()))
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.total.cash").value("70000.00"));
        mvc.perform(get("/api/reports/expenses").param("branchId", "" + b).param("from", t).param("groupBy", "MONTH").cookie(director.cookie()))
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].key").value(t.substring(0, 7)));
        // Qatordan hujjatlarga: shu moddaning KO/BO ro'yxati (barcha holatlar)
        mvc.perform(get("/api/cash-ops").param("branchId", "" + b).param("expenseItemId", "" + fuel).param("from", t).param("to", t)
                        .cookie(director.cookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5));
        // Filial rahbari: o'z filiali (branchId'siz ham), boshqa filial — yopiq
        mvc.perform(get("/api/reports/expenses").param("from", t).cookie(manager))
                .andExpect(jsonPath("$.branchId").value(b))
                .andExpect(jsonPath("$.total.total").value("5550000.00"));
        mvc.perform(get("/api/reports/expenses").param("branchId", "" + other).cookie(manager)).andExpect(status().isNotFound());
        mvc.perform(get("/api/reports/expenses/export").param("branchId", "" + b).param("from", t).cookie(director.cookie()))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    }
}
