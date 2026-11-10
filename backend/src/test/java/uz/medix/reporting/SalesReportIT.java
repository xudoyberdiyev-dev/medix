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

/** Savdo hisoboti (SPEC 8): sof savdo guruhlari, jami, tannarx faqat prices.cost bilan, reports.own — faqat o'z buyurtmalari, filial doirasi. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class SalesReportIT {

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
    void groupsTotalsCostAndScope() throws Exception {
        long b = branch();
        long other = branch();
        long w = jdbc.sql("INSERT INTO warehouse (branch_id, name) VALUES (:b, 'Asosiy') RETURNING id").param("b", b).query(Long.class).single();
        Session op1 = loginAs("OPERATOR", b);
        Session op2 = loginAs("OPERATOR", b);
        Cookie director = loginAs("DIRECTOR", b).cookie();
        Cookie manager = loginAs("BRANCH_MANAGER", b).cookie();
        Cookie cashier = loginAs("CASHIER", b).cookie();
        long c1 = customer();
        long c2 = customer();

        long o1 = order(b, w, c1, op1.id(), "DELIVERED", "1200000.00", "CASH");
        sale(o1, b, w, c1, op1.id(), "1200000.00");
        long o2 = order(b, w, c2, op1.id(), "DELIVERED", "300000.00", "TRANSFER");
        sale(o2, b, w, c2, op1.id(), "300000.00");
        long o3 = order(b, w, c1, op2.id(), "DELIVERED", "500000.00", "CASH");
        sale(o3, b, w, c1, op2.id(), "500000.00");
        String t = today().toString();

        mvc.perform(get("/api/reports/sales").cookie(cashier)).andExpect(status().isForbidden());
        // Direktor: mijoz bo'yicha, tannarx ko'rinadi
        mvc.perform(get("/api/reports/sales").param("branchId", "" + b).param("from", t).param("to", t).cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groupBy").value("CUSTOMER"))
                .andExpect(jsonPath("$.mineOnly").value(false))
                .andExpect(jsonPath("$.costVisible").value(true))
                .andExpect(jsonPath("$.rows.length()").value(2))
                .andExpect(jsonPath("$.rows[0].key").value(String.valueOf(c1)))
                .andExpect(jsonPath("$.rows[0].net").value("1700000.00"))
                .andExpect(jsonPath("$.rows[0].orders").value(2))
                .andExpect(jsonPath("$.rows[0].profit").value("1700000.00"))
                .andExpect(jsonPath("$.total.net").value("2000000.00"))
                .andExpect(jsonPath("$.total.orders").value(3))
                .andExpect(jsonPath("$.total.returns").value("0.00"))
                .andExpect(jsonPath("$.total.discount").value("0.00"));
        // Operator bo'yicha
        mvc.perform(get("/api/reports/sales").param("branchId", "" + b).param("from", t).param("groupBy", "OPERATOR").cookie(director))
                .andExpect(jsonPath("$.rows[0].key").value(String.valueOf(op1.id())))
                .andExpect(jsonPath("$.rows[0].net").value("1500000.00"));
        // Guruh 2 (prototip Reports): mijoz → operator ichki qatorlari; QQS ustunlari
        mvc.perform(get("/api/reports/sales").param("branchId", "" + b).param("from", t).param("groupBy2", "OPERATOR").cookie(director))
                .andExpect(jsonPath("$.groupBy2").value("OPERATOR"))
                .andExpect(jsonPath("$.rows[0].key").value(String.valueOf(c1)))
                .andExpect(jsonPath("$.rows[0].children.length()").value(2))
                .andExpect(jsonPath("$.rows[0].children[0].key").value(String.valueOf(op1.id())))
                .andExpect(jsonPath("$.rows[0].children[0].net").value("1200000.00"))
                .andExpect(jsonPath("$.rows[0].children[1].key").value(String.valueOf(op2.id())))
                .andExpect(jsonPath("$.rows[0].children[1].net").value("500000.00"))
                .andExpect(jsonPath("$.rows[1].children.length()").value(1))
                .andExpect(jsonPath("$.total.vat").exists())
                .andExpect(jsonPath("$.total.netExVat").exists());
        // Guruh 2 = Guruh 1 — e'tiborga olinmaydi
        mvc.perform(get("/api/reports/sales").param("branchId", "" + b).param("from", t).param("groupBy2", "CUSTOMER").cookie(director))
                .andExpect(jsonPath("$.groupBy2").doesNotExist())
                .andExpect(jsonPath("$.rows[0].children").doesNotExist());
        // Kun bo'yicha
        mvc.perform(get("/api/reports/sales").param("branchId", "" + b).param("from", t).param("groupBy", "DAY").cookie(director))
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].key").value(t));
        // To'lov turi va hudud: guruhlash va filtr (prototip: ptype, region)
        mvc.perform(get("/api/reports/sales").param("branchId", "" + b).param("from", t).param("groupBy", "PAYMENT_TYPE").cookie(director))
                .andExpect(jsonPath("$.rows.length()").value(2))
                .andExpect(jsonPath("$.rows[0].key").value("CASH"))
                .andExpect(jsonPath("$.rows[0].net").value("1700000.00"))
                .andExpect(jsonPath("$.rows[1].key").value("TRANSFER"));
        mvc.perform(get("/api/reports/sales").param("branchId", "" + b).param("from", t).param("paymentType", "TRANSFER").cookie(director))
                .andExpect(jsonPath("$.paymentType").value("TRANSFER"))
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.total.net").value("300000.00"));
        long region = jdbc.sql("INSERT INTO region (name) VALUES (:n) RETURNING id").param("n", "Chilonzor " + UUID.randomUUID().toString().substring(0, 6))
                .query(Long.class).single();
        jdbc.sql("UPDATE counterparty SET region_id = :r WHERE id = :c").param("r", region).param("c", c1).update();
        mvc.perform(get("/api/reports/sales").param("branchId", "" + b).param("from", t).param("groupBy", "REGION").cookie(director))
                .andExpect(jsonPath("$.rows[0].key").value(String.valueOf(region)))
                .andExpect(jsonPath("$.rows[0].net").value("1700000.00"))
                .andExpect(jsonPath("$.rows[1].key").value(""));
        mvc.perform(get("/api/reports/sales").param("branchId", "" + b).param("from", t).param("regionId", "" + region).cookie(director))
                .andExpect(jsonPath("$.regionId").value(region))
                .andExpect(jsonPath("$.total.net").value("1700000.00"));
        // Operator (reports.own): faqat o'zi kiritganlar, tannarxsiz
        mvc.perform(get("/api/reports/sales").param("from", t).cookie(op1.cookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mineOnly").value(true))
                .andExpect(jsonPath("$.costVisible").value(false))
                .andExpect(jsonPath("$.total.net").value("1500000.00"))
                .andExpect(jsonPath("$.rows[0].cost").doesNotExist());
        // Filial rahbari: boshqa filial — yopiq
        mvc.perform(get("/api/reports/sales").param("branchId", "" + other).cookie(manager)).andExpect(status().isNotFound());
        // Qatordan hujjatlarga: shu davrda sotilgan, shu operator / mijoz buyurtmalari (SPEC 8)
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("operatorId", "" + op1.id()).param("soldFrom", t).param("soldTo", t)
                        .cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2));
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("customerId", "" + c1).param("soldFrom", t).param("soldTo", t)
                        .cookie(director))
                .andExpect(jsonPath("$.total").value(2));
        String tomorrow = today().plusDays(1).toString();
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("soldFrom", tomorrow).cookie(director))
                .andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/orders").param("soldFrom", tomorrow).param("soldTo", t).cookie(director))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("home.periodInvalid"));
        // Buyurtma sanasi filtri (SPEC 120) va ro'yxat eksporti
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("orderFrom", t).param("orderTo", t).cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(org.hamcrest.Matchers.greaterThanOrEqualTo(2)));
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("orderFrom", tomorrow).cookie(director))
                .andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/orders").param("orderFrom", tomorrow).param("orderTo", t).cookie(director))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("home.periodInvalid"));
        // Saralash (summa bo'yicha) va qidiruv — mijoz nomi lotin/kirill farqsiz (SPEC 120)
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("sort", "TOTAL").param("desc", "false").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(o2))
                .andExpect(jsonPath("$.items[2].id").value(o1));
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("sort", "TOTAL").cookie(director))
                .andExpect(jsonPath("$.items[0].id").value(o1));
        jdbc.sql("UPDATE counterparty SET name = 'Шифо Фарм', search_text = :s WHERE id = :id")
                .param("s", uz.medix.shared.text.SearchText.of("Шифо Фарм"))
                .param("id", c2)
                .update();
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("q", "farm shifo").cookie(director))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(o2));
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("sort", "NOPE").cookie(director))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/orders/export").param("branchId", "" + b).param("orderFrom", t).cookie(director))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        // Prototip filtr chiplari: hudud, to'lov turi, holat (bir nechta qiymat) va variantlar (facets) soni bilan
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("regionId", "" + region).cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[0].region").exists())
                .andExpect(jsonPath("$.facets.regions[0].id").value(region))
                .andExpect(jsonPath("$.facets.regions[0].count").value(2));
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("paymentType", "TRANSFER").cookie(director))
                .andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("customerId", "" + c1).param("customerId", "" + c2).cookie(director))
                .andExpect(jsonPath("$.total").value(3));
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("statuses", "DRAFT").param("statuses", "CANCELLED").cookie(director))
                .andExpect(jsonPath("$.total").value(0))
                .andExpect(jsonPath("$.statuses[0].count").value(0));
        mvc.perform(get("/api/orders").param("branchId", "" + b).param("operatorId", "" + op1.id()).cookie(director))
                .andExpect(jsonPath("$.facets.operators[?(@.id == " + op1.id() + ")].count").value(2));
        // Eksport
        mvc.perform(get("/api/reports/sales/export").param("branchId", "" + b).param("from", t).cookie(director))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    }
    /** E7: chegirma ustuni — Σ dona × (narx turidagi narx − chegirmali narx); chegirmasiz qatorda 0. */
    @Test
    void discountColumn() throws Exception {
        long b = branch();
        long w = jdbc.sql("INSERT INTO warehouse (branch_id, name) VALUES (:b, 'Asosiy') RETURNING id").param("b", b).query(Long.class).single();
        Session op = loginAs("OPERATOR", b);
        Cookie director = loginAs("DIRECTOR", b).cookie();
        long c = customer();
        long p = product();
        long p2 = product();
        long batch = jdbc.sql("""
                INSERT INTO batch (product_id, number, expiry_date, cost, source_type) VALUES (:p, 'B1', :x, 50, 'TST') RETURNING id""")
                .param("p", p).param("x", java.sql.Date.valueOf(today().plusYears(1))).query(Long.class).single();
        long batch2 = jdbc.sql("""
                INSERT INTO batch (product_id, number, expiry_date, cost, source_type) VALUES (:p, 'B1', :x, 20, 'TST') RETURNING id""")
                .param("p", p2).param("x", java.sql.Date.valueOf(today().plusYears(1))).query(Long.class).single();
        // 3 × 100,00 → 7,5% chegirma → 92,50; 2 × 40,00 — chegirmasiz. Sotuv: 277,50 + 80,00 = 357,50; chegirma 22,50
        long o = order(b, w, c, op.id(), "DRAFT", "357.50", "CASH");
        long l1 = line(o, 1, p, 3, "92.50", "100.00", "7.5");
        long l2 = line(o, 2, p2, 2, "40.00", "40.00", "0");
        jdbc.sql("UPDATE sales_order SET status = 'DELIVERED' WHERE id = :o").param("o", o).update();
        String n = UUID.randomUUID().toString().substring(0, 8);
        long s = jdbc.sql("""
                INSERT INTO sale (number, invoice_number, order_id, branch_id, warehouse_id, customer_id, sale_date, total, vat_total, cost_total, created_by)
                VALUES (:n, :i, :o, :b, :w, :c, :d, 357.50, 0, 0, :e) RETURNING id""")
                .param("n", "SV-TST-" + n).param("i", "HF-TST-" + n).param("o", o).param("b", b).param("w", w)
                .param("c", c).param("d", java.sql.Date.valueOf(today())).param("e", op.id()).query(Long.class).single();
        saleLine(s, l1, p, batch, 3, "92.50", "277.50");
        saleLine(s, l2, p2, batch2, 2, "40.00", "80.00");
        String t = today().toString();
        mvc.perform(get("/api/reports/sales").param("branchId", "" + b).param("from", t).param("to", t).cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].sales").value("357.50"))
                .andExpect(jsonPath("$.rows[0].discount").value("22.50"))
                .andExpect(jsonPath("$.total.discount").value("22.50"));
    }

    private long product() {
        return jdbc.sql("""
                INSERT INTO product (unit_id, code, name) SELECT id, :c, :n FROM unit ORDER BY id LIMIT 1 RETURNING id""")
                .param("c", String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999)))
                .param("n", "Chegirma " + UUID.randomUUID().toString().substring(0, 6)).query(Long.class).single();
    }

    private long line(long order, int no, long product, int qty, String price, String listPrice, String pct) {
        return jdbc.sql("""
                INSERT INTO sales_order_line (order_id, line_no, product_id, qty, price, list_price, discount_pct)
                VALUES (:o, :n, :p, :q, CAST(:pr AS NUMERIC), CAST(:lp AS NUMERIC), CAST(:d AS NUMERIC)) RETURNING id""")
                .param("o", order).param("n", no).param("p", product).param("q", qty).param("pr", price).param("lp", listPrice).param("d", pct)
                .query(Long.class).single();
    }

    private void saleLine(long sale, long orderLine, long product, long batch, int qty, String price, String amount) {
        jdbc.sql("""
                INSERT INTO sale_line (sale_id, order_line_id, product_id, batch_id, qty, price, amount, vat_rate, vat_amount, cost)
                VALUES (:s, :l, :p, :b, :q, CAST(:pr AS NUMERIC), CAST(:a AS NUMERIC), 0, 0, 50)""")
                .param("s", sale).param("l", orderLine).param("p", product).param("b", batch).param("q", qty).param("pr", price).param("a", amount)
                .update();
    }
}
