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

/** Xarid bosh sahifasi (SPEC 8): kutayotgan kirimlar, YB qarzi va to'lov kunlari, bonus, ruxsat va filial doirasi. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class PurchaserHomeIT {

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

    private long supplier() {
        return jdbc.sql("INSERT INTO counterparty (tin, name, is_supplier) VALUES (:t, :n, true) RETURNING id")
                .param("t", String.valueOf(500_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .param("n", "YB " + UUID.randomUUID().toString().substring(0, 6))
                .query(Long.class)
                .single();
    }

    private void receipt(long branch, long warehouse, long supplier, long createdBy, String status) {
        jdbc.sql("""
                INSERT INTO receipt (number, branch_id, warehouse_id, supplier_id, receipt_date, payment_type, due_date, status, created_by,
                    accepted_by, accepted_at)
                VALUES (:n, :b, :w, :s, :d, 'TRANSFER', :d, :st, :e, CASE WHEN :st = 'ACCEPTED' THEN :e END,
                    CASE WHEN :st = 'ACCEPTED' THEN now() END)""")
                .param("n", "KR-TST-" + UUID.randomUUID().toString().substring(0, 8)).param("b", branch).param("w", warehouse)
                .param("s", supplier).param("d", java.sql.Date.valueOf(today())).param("st", status).param("e", createdBy)
                .update();
    }

    @Test
    void receiptsDebtAndScope() throws Exception {
        long b = branch();
        long other = branch();
        long w = jdbc.sql("INSERT INTO warehouse (branch_id, name) VALUES (:b, 'Asosiy') RETURNING id").param("b", b).query(Long.class).single();
        Session me = loginAs("PURCHASER", b);
        Session colleague = loginAs("PURCHASER", b);
        Cookie operator = loginAs("OPERATOR", b).cookie();
        long s = supplier();

        receipt(b, w, s, me.id(), "DRAFT");
        receipt(b, w, s, colleague.id(), "DRAFT");
        receipt(b, w, s, colleague.id(), "ACCEPTED");
        // YB qarzi: bugun to'lanadigan 700 000
        jdbc.sql("""
                INSERT INTO party_ledger (branch_id, counterparty_id, side, amount, due_date, doc_type, doc_id, doc_number)
                VALUES (:b, :c, 'SUPPLIER', 700000.00, :d, 'KR', 9800001, 'KR-TST-9800001')""")
                .param("b", b).param("c", s).param("d", java.sql.Date.valueOf(today())).update();

        mvc.perform(get("/api/home/purchaser").cookie(operator)).andExpect(status().isForbidden());
        mvc.perform(get("/api/home/purchaser").cookie(me.cookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.branchId").value(b))
                .andExpect(jsonPath("$.receipts.toAccept").value(2))
                .andExpect(jsonPath("$.receipts.toAcceptMine").value(1))
                .andExpect(jsonPath("$.receipts.toPost").value(1))
                .andExpect(jsonPath("$.receipts.toPostMine").value(0))
                .andExpect(jsonPath("$.receipts.toAcceptNumbers.length()").value(2))
                .andExpect(jsonPath("$.receipts.toPostNumbers.length()").value(1))
                .andExpect(jsonPath("$.due.todayCount").value(1))
                .andExpect(jsonPath("$.due.overdueCount").value(0))
                .andExpect(jsonPath("$.bonusDue.length()").value(0))
                .andExpect(jsonPath("$.ownMoves.receipts").value(0))
                .andExpect(jsonPath("$.ownMoves.active").value(false))
                .andExpect(jsonPath("$.supplierDebt.debt").value("700000.00"))
                .andExpect(jsonPath("$.due.today").value("700000.00"))
                .andExpect(jsonPath("$.due.overdue").value("0.00"))
                .andExpect(jsonPath("$.topSuppliers[0].id").value(s))
                .andExpect(jsonPath("$.bonus.balance").value("0.00"))
                .andExpect(jsonPath("$.bonus.pending").value(0))
                .andExpect(jsonPath("$.ownGoods.products").value(0))
                .andExpect(jsonPath("$.ownGoods.leftQty").value(0));
        // Boshqa filial — yopiq
        mvc.perform(get("/api/home/purchaser").param("branchId", "" + other).cookie(me.cookie())).andExpect(status().isNotFound());
    }
}
