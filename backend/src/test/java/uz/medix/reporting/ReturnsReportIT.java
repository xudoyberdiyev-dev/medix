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

/** Qaytarishlar hisoboti (QM): sabab / mijoz / mahsulot / kun, hujjatlar soni, qaytarish ulushi, filtrlar, reports.own, filial doirasi. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ReturnsReportIT {

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

    private long product(String name, Long category, Long maker) {
        return jdbc.sql("""
                INSERT INTO product (unit_id, code, name, category_id, manufacturer_id) SELECT id, :c, :n, :cat, :m FROM unit ORDER BY id LIMIT 1
                RETURNING id""")
                .param("c", String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999)))
                .param("n", name + " " + UUID.randomUUID().toString().substring(0, 6)).param("cat", category).param("m", maker)
                .query(Long.class).single();
    }

    private long batch(long product, String cost) {
        return jdbc.sql("""
                INSERT INTO batch (product_id, number, expiry_date, cost, source_type) VALUES (:p, 'B1', :x, CAST(:c AS NUMERIC), 'TST') RETURNING id""")
                .param("p", product).param("x", java.sql.Date.valueOf(today().plusYears(1))).param("c", cost).query(Long.class).single();
    }

    /** Qator: {mahsulot, partiya, dona, narx, summa, QQS, tannarx (dona)}. */
    private record L(long product, long batch, int qty, String price, String amount, String vat, String cost) {}

    /** Buyurtma (qoralamada qatorlar → yetkazildi) + sotuv va sotuv qatorlari; sotuv qatori id'lari qaytadi. */
    private long[] sale(long branch, long warehouse, long customer, long createdBy, String status, L... lines) {
        java.math.BigDecimal total = java.math.BigDecimal.ZERO;
        java.math.BigDecimal vat = java.math.BigDecimal.ZERO;
        for (L l : lines) {
            total = total.add(new java.math.BigDecimal(l.amount()));
            vat = vat.add(new java.math.BigDecimal(l.vat()));
        }
        long o = order(branch, warehouse, customer, createdBy, "DRAFT", total.toPlainString(), "CASH");
        long[] orderLines = new long[lines.length];
        for (int i = 0; i < lines.length; i++) {
            orderLines[i] = jdbc.sql("""
                    INSERT INTO sales_order_line (order_id, line_no, product_id, qty, price) VALUES (:o, :n, :p, :q, CAST(:pr AS NUMERIC))
                    RETURNING id""")
                    .param("o", o).param("n", i + 1).param("p", lines[i].product()).param("q", lines[i].qty()).param("pr", lines[i].price())
                    .query(Long.class).single();
        }
        jdbc.sql("UPDATE sales_order SET status = 'DELIVERED' WHERE id = :o").param("o", o).update();
        String n = UUID.randomUUID().toString().substring(0, 8);
        long s = jdbc.sql("""
                INSERT INTO sale (number, invoice_number, order_id, branch_id, warehouse_id, customer_id, sale_date, total, vat_total, cost_total,
                                  status, created_by, cancelled_by, cancelled_at, cancel_reason)
                VALUES (:n, :i, :o, :b, :w, :c, :d, :a, :v, 0, :st, :e, CASE WHEN :st = 'CANCELLED' THEN :e END,
                        CASE WHEN :st = 'CANCELLED' THEN now() END, CASE WHEN :st = 'CANCELLED' THEN 'Yetkazilmadi' END) RETURNING id""")
                .param("n", "SV-TST-" + n).param("i", "HF-TST-" + n).param("o", o).param("b", branch).param("w", warehouse)
                .param("c", customer).param("d", java.sql.Date.valueOf(today())).param("a", total).param("v", vat).param("st", status)
                .param("e", createdBy)
                .query(Long.class).single();
        long[] ids = new long[lines.length + 2];
        ids[0] = s;
        ids[1] = o;
        for (int i = 0; i < lines.length; i++) {
            L l = lines[i];
            ids[i + 2] = jdbc.sql("""
                    INSERT INTO sale_line (sale_id, order_line_id, product_id, batch_id, qty, price, amount, vat_rate, vat_amount, cost)
                    VALUES (:s, :l, :p, :b, :q, CAST(:pr AS NUMERIC), CAST(:a AS NUMERIC), 12, CAST(:v AS NUMERIC), CAST(:c AS NUMERIC)) RETURNING id""")
                    .param("s", s).param("l", orderLines[i]).param("p", l.product()).param("b", l.batch()).param("q", l.qty())
                    .param("pr", l.price()).param("a", l.amount()).param("v", l.vat()).param("c", l.cost())
                    .query(Long.class).single();
        }
        return ids;
    }

    private long returned(long[] sale, int lineIndex, long branch, long warehouse, long customer, long createdBy, String reason, L l) {
        long r = jdbc.sql("""
                INSERT INTO sales_return (number, sale_id, order_id, branch_id, warehouse_id, customer_id, return_date, total, vat_total, cost_total,
                                          reason, created_by)
                VALUES (:n, :s, :o, :b, :w, :c, :d, CAST(:a AS NUMERIC), CAST(:v AS NUMERIC), 0, :r, :e) RETURNING id""")
                .param("n", "QM-TST-" + UUID.randomUUID().toString().substring(0, 8)).param("s", sale[0]).param("o", sale[1])
                .param("b", branch).param("w", warehouse).param("c", customer).param("d", java.sql.Date.valueOf(today()))
                .param("a", l.amount()).param("v", l.vat()).param("e", createdBy).param("r", reason)
                .query(Long.class).single();
        line(r, sale, lineIndex, l);
        return r;
    }

    private void line(long r, long[] sale, int lineIndex, L l) {
        jdbc.sql("""
                INSERT INTO sales_return_line (return_id, sale_line_id, product_id, batch_id, qty, price, amount, vat_rate, vat_amount, cost)
                VALUES (:r, :sl, :p, :b, :q, CAST(:pr AS NUMERIC), CAST(:a AS NUMERIC), 12, CAST(:v AS NUMERIC), CAST(:c AS NUMERIC))""")
                .param("r", r).param("sl", sale[lineIndex + 2]).param("p", l.product()).param("b", l.batch()).param("q", l.qty())
                .param("pr", l.price()).param("a", l.amount()).param("v", l.vat()).param("c", l.cost())
                .update();
    }

    @Test
    void reasonsCustomersProductsDaysRateAndScope() throws Exception {
        long b = branch();
        long other = branch();
        long w = jdbc.sql("INSERT INTO warehouse (branch_id, name) VALUES (:b, 'Asosiy') RETURNING id").param("b", b).query(Long.class).single();
        long pa = product("Paracetamol", null, null);
        long pb = product("Vitamin C", null, null);
        long ba = batch(pa, "8000.00");
        long bb = batch(pb, "5000.00");
        Session op1 = loginAs("OPERATOR", b);
        Session op2 = loginAs("OPERATOR", b);
        Cookie director = loginAs("DIRECTOR", b).cookie();
        Cookie manager = loginAs("BRANCH_MANAGER", b).cookie();
        Cookie cashier = loginAs("CASHIER", b).cookie();
        long c1 = customer();
        long c2 = customer();

        // c1: sotuv 150 000 + 32 000; QM-1 (ikki qator: 30 000 + 8 000) «Muddati yaqin», QM-2 (pb, 8 000) « muddati YAQIN » — bir sabab
        long[] s1 = sale(b, w, c1, op1.id(), "POSTED", new L(pa, ba, 10, "15000.00", "150000.00", "16071.43", "8000.00"),
                new L(pb, bb, 4, "8000.00", "32000.00", "3428.57", "5000.00"));
        long q1 = returned(s1, 0, b, w, c1, op1.id(), "Muddati yaqin", new L(pa, ba, 2, "15000.00", "30000.00", "3214.29", "8000.00"));
        line(q1, s1, 1, new L(pb, bb, 1, "8000.00", "8000.00", "857.14", "5000.00"));
        returned(s1, 1, b, w, c1, op1.id(), " muddati YAQIN ", new L(pb, bb, 1, "8000.00", "8000.00", "857.14", "5000.00"));
        // c2: sotuv 75 000; QM-3 «Mijoz rad etdi» 15 000 (op2)
        long[] s2 = sale(b, w, c2, op2.id(), "POSTED", new L(pa, ba, 5, "15000.00", "75000.00", "8035.71", "8000.00"));
        returned(s2, 0, b, w, c2, op2.id(), "Mijoz rad etdi", new L(pa, ba, 1, "15000.00", "15000.00", "1607.14", "8000.00"));
        // Bekor qilingan sotuv — ulushga kirmaydi
        sale(b, w, c2, op2.id(), "CANCELLED", new L(pa, ba, 100, "15000.00", "1500000.00", "160714.29", "8000.00"));
        String t = today().toString();

        mvc.perform(get("/api/reports/returns").cookie(cashier)).andExpect(status().isForbidden());
        // Sabab bo'yicha (standart): «muddati yaqin» — 2 hujjat, 4 dona, 46 000; jami 3 hujjat, 61 000 / sotuv 257 000 = 23,7 %
        mvc.perform(get("/api/reports/returns").param("branchId", "" + b).param("from", t).param("to", t).cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groupBy").value("REASON"))
                .andExpect(jsonPath("$.rows.length()").value(2))
                .andExpect(jsonPath("$.rows[0].key").value("muddati yaqin"))
                .andExpect(jsonPath("$.rows[0].documents").value(2))
                .andExpect(jsonPath("$.rows[0].qty").value(4))
                .andExpect(jsonPath("$.rows[0].amount").value("46000.00"))
                .andExpect(jsonPath("$.rows[0].sales").doesNotExist())
                .andExpect(jsonPath("$.rows[0].rate").doesNotExist())
                .andExpect(jsonPath("$.rows[1].name").value("Mijoz rad etdi"))
                .andExpect(jsonPath("$.total.documents").value(3))
                .andExpect(jsonPath("$.total.qty").value(5))
                .andExpect(jsonPath("$.total.amount").value("61000.00"))
                .andExpect(jsonPath("$.total.sales").value("257000.00"))
                .andExpect(jsonPath("$.total.rate").value("23.7"));
        // Mijoz bo'yicha: c1 — 46 000 / 182 000 = 25,3 %; c2 — 15 000 / 75 000 = 20,0 %
        mvc.perform(get("/api/reports/returns").param("branchId", "" + b).param("from", t).param("groupBy", "CUSTOMER").cookie(director))
                .andExpect(jsonPath("$.rows[0].key").value(String.valueOf(c1)))
                .andExpect(jsonPath("$.rows[0].code").isNotEmpty())
                .andExpect(jsonPath("$.rows[0].sales").value("182000.00"))
                .andExpect(jsonPath("$.rows[0].rate").value("25.3"))
                .andExpect(jsonPath("$.rows[1].rate").value("20.0"));
        // Mahsulot bo'yicha: pa — QM-1 va QM-3: 2 hujjat, 3 dona, 45 000 / 225 000 = 20,0 %
        mvc.perform(get("/api/reports/returns").param("branchId", "" + b).param("from", t).param("groupBy", "PRODUCT").cookie(director))
                .andExpect(jsonPath("$.rows[0].key").value(String.valueOf(pa)))
                .andExpect(jsonPath("$.rows[0].documents").value(2))
                .andExpect(jsonPath("$.rows[0].qty").value(3))
                .andExpect(jsonPath("$.rows[0].rate").value("20.0"))
                .andExpect(jsonPath("$.rows[1].documents").value(2))
                .andExpect(jsonPath("$.rows[1].rate").value("50.0"));
        // Kun bo'yicha va filtrlar
        mvc.perform(get("/api/reports/returns").param("branchId", "" + b).param("from", t).param("groupBy", "DAY").cookie(director))
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].key").value(t));
        mvc.perform(get("/api/reports/returns").param("branchId", "" + b).param("from", t).param("customerId", "" + c2).cookie(director))
                .andExpect(jsonPath("$.customerId").value(c2))
                .andExpect(jsonPath("$.total.amount").value("15000.00"))
                .andExpect(jsonPath("$.total.rate").value("20.0"));
        mvc.perform(get("/api/reports/returns").param("branchId", "" + b).param("from", t).param("productId", "" + pb).cookie(director))
                .andExpect(jsonPath("$.productId").value(pb))
                .andExpect(jsonPath("$.total.documents").value(2))
                .andExpect(jsonPath("$.total.amount").value("16000.00"));
        // reports.own — faqat o'zi kiritgan buyurtmalar
        mvc.perform(get("/api/reports/returns").param("from", t).cookie(op2.cookie()))
                .andExpect(jsonPath("$.mineOnly").value(true))
                .andExpect(jsonPath("$.total.amount").value("15000.00"));
        // Boshqa filial — yopiq; eksport
        mvc.perform(get("/api/reports/returns").param("branchId", "" + other).cookie(manager)).andExpect(status().isNotFound());
        mvc.perform(get("/api/reports/returns/export").param("branchId", "" + b).param("from", t).param("groupBy", "CUSTOMER").cookie(director))
                .andExpect(status().isOk());
    }
}
