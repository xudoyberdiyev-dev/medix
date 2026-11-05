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

/** Ta'minotchi xodim / korxona tovari: tannarxda olib keldi / sotildi / boshqa / qoldi, Aktiv / Passiv, ruxsat va filial doirasi. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class SupplierGoodsReportIT {

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

    /** Kirim (KR) partiyasi: {@code brought} dona keldi, {@code sold} sotildi, {@code other} hisobdan o'tkazildi; qoldiq — farqi. */
    private void batch(long branch, long warehouse, long zone, long product, long supplier, Long owner, long createdBy, String cost,
            int brought, int sold, int other, boolean inPeriod) {
        long receipt = jdbc.sql("""
                INSERT INTO receipt (number, branch_id, warehouse_id, supplier_id, receipt_date, payment_type, due_date, owner_id, created_by)
                VALUES (:n, :b, :w, :s, :d, 'TRANSFER', :d, :o, :e) RETURNING id""")
                .param("n", "KR-TST-" + UUID.randomUUID().toString().substring(0, 8)).param("b", branch).param("w", warehouse)
                .param("s", supplier).param("d", java.sql.Date.valueOf(today())).param("o", owner).param("e", createdBy)
                .query(Long.class).single();
        long line = jdbc.sql("""
                INSERT INTO receipt_line (receipt_id, line_no, product_id, qty, expiry_date, zone_id, batch_number, price)
                VALUES (:r, 1, :p, :q, :x, :z, 'B1', 1) RETURNING id""")
                .param("r", receipt).param("p", product).param("q", brought).param("x", java.sql.Date.valueOf(today().plusYears(1)))
                .param("z", zone).query(Long.class).single();
        long batch = jdbc.sql("""
                INSERT INTO batch (product_id, number, expiry_date, cost, source_type, source_id)
                VALUES (:p, 'B1', :x, CAST(:c AS NUMERIC), 'KR', :l) RETURNING id""")
                .param("p", product).param("x", java.sql.Date.valueOf(today().plusYears(1))).param("c", cost).param("l", line)
                .query(Long.class).single();
        // Davrdan tashqari: harakatlar bir yil oldin — davrda kirim yo'q (Passiv), qoldiq bor
        java.time.Instant when = inPeriod ? java.time.Instant.now() : java.time.Instant.now().minus(java.time.Duration.ofDays(400));
        java.sql.Timestamp at = java.sql.Timestamp.from(when);
        for (Object[] mv : new Object[][] {{brought, "KR"}, {-sold, "SV"}, {-other, "HO"}}) {
            if ((int) mv[0] == 0) {
                continue;
            }
            jdbc.sql("""
                    INSERT INTO stock_move (occurred_at, branch_id, warehouse_id, zone_id, product_id, batch_id, qty, doc_type, doc_id, doc_number)
                    VALUES (:at, :b, :w, :z, :p, :bt, :q, :t, 1, 'TST')""")
                    .param("at", at).param("b", branch).param("w", warehouse).param("z", zone).param("p", product).param("bt", batch)
                    .param("q", mv[0]).param("t", mv[1]).update();
        }
        jdbc.sql("""
                INSERT INTO stock_balance (branch_id, warehouse_id, zone_id, product_id, batch_id, qty) VALUES (:b, :w, :z, :p, :bt, :q)""")
                .param("b", branch).param("w", warehouse).param("z", zone).param("p", product).param("bt", batch)
                .param("q", brought - sold - other).update();
    }

    private long supplier(String name) {
        return jdbc.sql("INSERT INTO counterparty (tin, name, is_supplier) VALUES (:t, :n, true) RETURNING id")
                .param("t", String.valueOf(400_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .param("n", name + " " + UUID.randomUUID().toString().substring(0, 6))
                .query(Long.class).single();
    }

    @Test
    void broughtSoldOtherLeftActivePassive() throws Exception {
        long b = branch();
        long other = branch();
        long w = jdbc.sql("INSERT INTO warehouse (branch_id, name) VALUES (:b, 'Asosiy') RETURNING id").param("b", b).query(Long.class).single();
        long z = jdbc.sql("INSERT INTO zone (warehouse_id, type, name) VALUES (:w, 'MAIN', 'Asosiy zona') RETURNING id").param("w", w)
                .query(Long.class).single();
        long product = jdbc.sql("""
                INSERT INTO product (unit_id, code, name) SELECT id, :c, 'Paracetamol' FROM unit ORDER BY id LIMIT 1 RETURNING id""")
                .param("c", String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999)))
                .query(Long.class).single();
        Session purchaser = loginAs("PURCHASER", b);
        Session owner = loginAs("PURCHASER", b);
        Cookie director = loginAs("DIRECTOR", b).cookie();
        Cookie manager = loginAs("BRANCH_MANAGER", b).cookie();
        Cookie operator = loginAs("OPERATOR", b).cookie();
        long krka = supplier("KRKA");
        long nobel = supplier("Nobel");

        batch(b, w, z, product, krka, owner.id(), purchaser.id(), "1000.00", 100, 30, 5, true); // Aktiv: 100 000 / 30 000 / 5 000 / 65 000
        batch(b, w, z, product, nobel, null, purchaser.id(), "2500.00", 10, 0, 0, false); // Passiv: davrda kirim yo'q, qoldi 25 000
        String t = today().toString();

        mvc.perform(get("/api/reports/supplier-goods").param("kind", "STAFF").cookie(purchaser.cookie())).andExpect(status().isForbidden());
        mvc.perform(get("/api/reports/supplier-goods").param("kind", "STAFF").cookie(operator)).andExpect(status().isForbidden());
        mvc.perform(get("/api/reports/supplier-goods").param("kind", "COMPANY").param("from", t).param("to", t).cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.branchId").value(b))
                .andExpect(jsonPath("$.rows.length()").value(2))
                .andExpect(jsonPath("$.rows[0].id").value(krka))
                .andExpect(jsonPath("$.rows[0].active").value(true))
                .andExpect(jsonPath("$.rows[0].brought").value("100000.00"))
                .andExpect(jsonPath("$.rows[0].sold").value("30000.00"))
                .andExpect(jsonPath("$.rows[0].other").value("5000.00"))
                .andExpect(jsonPath("$.rows[0].left").value("65000.00"))
                .andExpect(jsonPath("$.rows[1].id").value(nobel))
                .andExpect(jsonPath("$.rows[1].active").value(false))
                .andExpect(jsonPath("$.rows[1].brought").value("0.00"))
                .andExpect(jsonPath("$.rows[1].left").value("25000.00"))
                .andExpect(jsonPath("$.total.left").value("90000.00"));
        // Xodim («Kim nomiga»): egasi ko'rsatilmagan kirim kirmaydi
        mvc.perform(get("/api/reports/supplier-goods").param("kind", "STAFF").param("branchId", "" + b).param("from", t).cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].id").value(owner.id()))
                .andExpect(jsonPath("$.total.sold").value("30000.00"));
        mvc.perform(get("/api/reports/supplier-goods").param("kind", "STAFF").param("branchId", "" + other).cookie(manager))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/reports/supplier-goods/export").param("kind", "COMPANY").param("branchId", "" + b).param("from", t)
                        .cookie(director))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    }
}
