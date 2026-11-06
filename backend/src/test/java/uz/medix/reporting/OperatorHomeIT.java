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

/** Operator bosh sahifasi (SPEC 8): faqat o'zi kiritgan buyurtmalar — sof savdo, holatlar, «Diqqat talab qiladi», ruxsat. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class OperatorHomeIT {

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

    private long customer() {
        return jdbc.sql("INSERT INTO counterparty (tin, name, is_customer) VALUES (:t, :n, true) RETURNING id")
                .param("t", String.valueOf(500_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .param("n", "Dorixona " + UUID.randomUUID().toString().substring(0, 6))
                .query(Long.class)
                .single();
    }

    private long order(long branch, long warehouse, long customer, long createdBy, String status, String total, String payment) {
        String n = "BY-TST-" + UUID.randomUUID().toString().substring(0, 8);
        return jdbc.sql("""
                INSERT INTO sales_order (number, branch_id, warehouse_id, customer_id, order_date, delivery_type, payment_type, status,
                    approval_level, total, created_by, decided_by, decided_at, decision_reason)
                VALUES (:n, :b, :w, :c, :d, 'DELIVERY', :p, :s,
                    CASE WHEN :s = 'PENDING_APPROVAL' THEN 'BRANCH' END, CAST(:a AS NUMERIC), :e,
                    CASE WHEN :s = 'REJECTED' THEN :e END, CASE WHEN :s = 'REJECTED' THEN now() END,
                    CASE WHEN :s = 'REJECTED' THEN 'Sinov' END)
                RETURNING id""")
                .param("n", n).param("b", branch).param("w", warehouse).param("c", customer).param("d", java.sql.Date.valueOf(today()))
                .param("p", payment).param("s", status).param("a", total).param("e", createdBy)
                .query(Long.class).single();
    }

    private void sale(long orderId, long branch, long warehouse, long customer, long createdBy, String total) {
        String n = UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO sale (number, invoice_number, order_id, branch_id, warehouse_id, customer_id, sale_date, total, vat_total, cost_total, created_by)
                VALUES (:n, :i, :o, :b, :w, :c, :d, CAST(:a AS NUMERIC), 0, 0, :e)""")
                .param("n", "SV-TST-" + n).param("i", "HF-TST-" + n).param("o", orderId).param("b", branch).param("w", warehouse)
                .param("c", customer).param("d", java.sql.Date.valueOf(today())).param("a", total).param("e", createdBy)
                .update();
    }

    @Test
    void ownOrdersOnly() throws Exception {
        long b = branch();
        long w = jdbc.sql("INSERT INTO warehouse (branch_id, name) VALUES (:b, 'Asosiy') RETURNING id").param("b", b).query(Long.class).single();
        Session me = loginAs("OPERATOR", b);
        Session other = loginAs("OPERATOR", b);
        Cookie purchaser = loginAs("PURCHASER", b).cookie();
        long c1 = customer();
        long c2 = customer();

        long o1 = order(b, w, c1, me.id(), "DELIVERED", "1200000.00", "CASH");
        sale(o1, b, w, c1, me.id(), "1200000.00");
        long o2 = order(b, w, c2, me.id(), "IN_TRANSIT", "300000.00", "TRANSFER");
        sale(o2, b, w, c2, me.id(), "300000.00");
        order(b, w, c1, me.id(), "DRAFT", "50000.00", "CASH");
        order(b, w, c1, me.id(), "PENDING_APPROVAL", "70000.00", "CASH");
        order(b, w, c2, me.id(), "REJECTED", "90000.00", "CASH");
        // Boshqa operator — hisobga kirmaydi
        long x = order(b, w, c1, other.id(), "DELIVERED", "5000000.00", "CASH");
        sale(x, b, w, c1, other.id(), "5000000.00");

        mvc.perform(get("/api/home/operator").cookie(purchaser)).andExpect(status().isForbidden());
        mvc.perform(get("/api/home/operator").cookie(me.cookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.from").value(today().toString()))
                .andExpect(jsonPath("$.sales.total").value("1500000.00"))
                .andExpect(jsonPath("$.sales.cash").value("1200000.00"))
                .andExpect(jsonPath("$.sales.transfer").value("300000.00"))
                .andExpect(jsonPath("$.ordersCreated.count").value(4))
                .andExpect(jsonPath("$.ordersCreated.amount").value("1660000.00"))
                .andExpect(jsonPath("$.orderStatuses.length()").value(11))
                .andExpect(jsonPath("$.orderStatuses[0].status").value("DRAFT"))
                .andExpect(jsonPath("$.orderStatuses[0].count").value(1))
                .andExpect(jsonPath("$.attention.drafts.count").value(1))
                .andExpect(jsonPath("$.attention.pendingApproval.amount").value("70000.00"))
                .andExpect(jsonPath("$.attention.rejected.count").value(1))
                .andExpect(jsonPath("$.attention.rejectedDays").value(7))
                .andExpect(jsonPath("$.topCustomers.length()").value(2))
                .andExpect(jsonPath("$.topCustomers[0].id").value(c1))
                .andExpect(jsonPath("$.topCustomers[0].sales").value("1200000.00"))
                .andExpect(jsonPath("$.topCustomers[0].orders").value(1));
        mvc.perform(get("/api/home/operator").cookie(other.cookie()))
                .andExpect(jsonPath("$.sales.total").value("5000000.00"))
                .andExpect(jsonPath("$.attention.drafts.count").value(0));
        mvc.perform(get("/api/home/operator").param("from", today().toString()).param("to", today().minusDays(1).toString()).cookie(me.cookie()))
                .andExpect(jsonPath("$.code").value("home.periodInvalid"));
    }
}
