package uz.medix.sales;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
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
import java.util.List;
import java.util.Set;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;
import uz.medix.TestcontainersConfig;
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.inventory.Warehouses;
import uz.medix.inventory.ZoneType;
import uz.medix.shared.money.Money;

/** BY: qoralama → yuborish (qoldiq, narx, min/max, kredit limiti, muddati o'tgan qarz) → tasdiq darajalari → Navbatda; bekor qilish. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class OrderIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    Warehouses warehouses;

    @Autowired
    StockLedger ledger;

    @Autowired
    TransactionTemplate tx;

    @Autowired
    uz.medix.delivery.trip.TripReminders tripReminders;

    private record Place(long branchId, long warehouseId, long main, long quarantine) {}

    private Place place() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        Long branch = jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'BY sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(300_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElse(null);
        if (branch == null) {
            return place();
        }
        long b = branch;
        Warehouses.Warehouse w = tx.execute(s -> warehouses.create(b, "BY ombor " + code, null, Set.of()));
        long main = w.zones().stream().filter(z -> z.type() == ZoneType.MAIN).findFirst().orElseThrow().id();
        long quarantine = w.zones().stream().filter(z -> z.type() == ZoneType.QUARANTINE).findFirst().orElseThrow().id();
        return new Place(b, w.id(), main, quarantine);
    }

    private long customer(long branchId, String limit) {
        long id = jdbc.sql("INSERT INTO counterparty (tin, name, is_customer, address) VALUES (:t, :n, true, 'Chilonzor 5') RETURNING id")
                .param("t", String.valueOf(500_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .param("n", "Dorixona " + UUID.randomUUID().toString().substring(0, 6))
                .query(Long.class)
                .single();
        jdbc.sql("INSERT INTO counterparty_branch_terms (counterparty_id, branch_id, credit_limit, payment_days) VALUES (:c, :b, :l, 15)")
                .param("c", id)
                .param("b", branchId)
                .param("l", limit == null ? null : new java.math.BigDecimal(limit))
                .update();
        return id;
    }

    private long employee() {
        return jdbc.sql("SELECT min(id) FROM employee").query(Long.class).single();
    }

    /** Mahsulot, bazaviy narx va sotuvga ochiq zonada qoldiq. */
    private long product(Place p, String name, String price, int stock, Integer min, Integer max) {
        long id = jdbc.sql("""
                INSERT INTO product (code, name, unit_id, search_text, min_qty, max_qty)
                SELECT :c, :n, id, lower(:n), :min, :max FROM unit WHERE short_name = 'dona' RETURNING id""")
                .param("c", String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999)))
                .param("n", name)
                .param("min", min)
                .param("max", max)
                .query(Long.class)
                .single();
        setPrice(p, id, price);
        if (stock > 0) {
            tx.executeWithoutResult(s -> {
                long b = ledger.createBatch(id, "S-" + id, null, LocalDate.now().plusYears(2), Money.of("100"), false, "BQ", null);
                ledger.post(new DocRef("BQ", id, "BQ-TST-" + id), List.of(Move.in(p.main(), b, stock)));
            });
        }
        return id;
    }

    private String pdfText(String url, Cookie who) throws Exception {
        byte[] bytes = mvc.perform(get(url).cookie(who))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().contentType("application/pdf"))
                .andReturn().getResponse().getContentAsByteArray();
        try (var doc = org.apache.pdfbox.Loader.loadPDF(bytes)) {
            return new org.apache.pdfbox.text.PDFTextStripper().getText(doc);
        }
    }

    private void setPrice(Place p, long product, String price) {
        setTypePrice(p, product, null, price);
    }

    /** Narx turidagi narx (code == null — bazaviy). */
    private void setTypePrice(Place p, long product, String typeCode, String price) {
        long doc = jdbc.sql("""
                INSERT INTO price_change (number, branch_id, effective_from, created_by, status)
                VALUES (:n, :b, :d, :e, 'APPROVED') RETURNING id""")
                .param("n", "NO-T-" + UUID.randomUUID().toString().substring(0, 8))
                .param("b", p.branchId())
                .param("d", java.sql.Date.valueOf(today().minusDays(1)))
                .param("e", employee())
                .query(Long.class)
                .single();
        jdbc.sql("""
                INSERT INTO price (product_id, price_type_id, branch_id, effective_from, amount, price_change_id)
                SELECT :p, id, :b, :d, :a, :doc FROM price_type WHERE\s""" + (typeCode == null ? "base" : "code = '" + typeCode + "'"))
                .param("p", product)
                .param("b", p.branchId())
                .param("d", java.sql.Date.valueOf(today()))
                .param("a", new java.math.BigDecimal(price))
                .param("doc", doc)
                .update();
    }

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "by" + UUID.randomUUID().toString().substring(0, 8);
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

    private static String order(Place p, long customer, long[][] lines) {
        StringBuilder l = new StringBuilder();
        for (long[] x : lines) {
            l.append(l.isEmpty() ? "" : ",").append("{\"productId\":").append(x[0]).append(",\"qty\":").append(x[1]).append("}");
        }
        return "{\"warehouseId\":" + p.warehouseId() + ",\"customerId\":" + customer + ",\"deliveryType\":\"DELIVERY\",\"paymentType\":\"TRANSFER\","
                + "\"lines\":[" + l + "]}";
    }

    private long draft(Cookie who, String body) throws Exception {
        return id(send(post("/api/orders"), who, body).andExpect(status().isCreated()).andReturn());
    }

    @Test
    void withinLimitGoesToQueueAndPriceIsFrozen() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), "100000");
        Cookie operator = loginAs("OPERATOR", p.branchId());
        long a = product(p, "BY Aspirin", "2500.50", 50, null, null);

        MvcResult created = send(post("/api/orders"), operator, order(p, c, new long[][] {{a, 10}}))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(matchesPattern("^BY-[A-Z]{3}-\\d{6}$")))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.address").value("Chilonzor 5"))
                .andExpect(jsonPath("$.total").value("25005.00"))
                // QQS narx ichida: 25 005 × 12 / 112 = 2 679,11 (HALF_UP)
                .andExpect(jsonPath("$.vatTotal").value("2679.11"))
                .andExpect(jsonPath("$.lines[0].vatAmount").value("2679.11"))
                .andExpect(jsonPath("$.lines[0].available").value(50))
                .andExpect(jsonPath("$.credit.creditLimit").value("100000.00"))
                .andExpect(jsonPath("$.credit.limitLeft").value("100000.00"))
                .andExpect(jsonPath("$.issues.length()").value(0))
                .andReturn();
        long doc = id(created);
        // Mijoz holati — saqlanmagan buyurtma uchun ham (prototip «Buyurtma kiritish» mijoz qatori)
        mvc.perform(get("/api/orders/customer-credit").param("warehouseId", String.valueOf(p.warehouseId())).param("customerId", String.valueOf(c))
                        .cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.creditLimit").value("100000.00"))
                .andExpect(jsonPath("$.limitLeft").value("100000.00"))
                .andExpect(jsonPath("$.debt").value("0.00"))
                .andExpect(jsonPath("$.overdueDays").value(0))
                .andExpect(jsonPath("$.blocked").value(false));
        Cookie foreign = loginAs("OPERATOR", place().branchId());
        mvc.perform(get("/api/orders/customer-credit").param("warehouseId", String.valueOf(p.warehouseId())).param("customerId", String.valueOf(c))
                        .cookie(foreign))
                .andExpect(status().isBadRequest());
        // Oxirgi buyurtmalar — birinchi mahsulot nomlari bilan
        mvc.perform(get("/api/orders/previous").param("customerId", String.valueOf(c)).cookie(operator))
                .andExpect(jsonPath("$[0].products[0]").value("BY Aspirin"));
        // «Mahsulot qo'shish» katalogi: mavjud qoldiq va mijoz narxi; «Faqat bor mahsulotlar»
        long empty = product(p, "BY Aspirin bo'sh", "100", 0, null, null);
        mvc.perform(get("/api/orders/catalog").param("warehouseId", String.valueOf(p.warehouseId())).param("customerId", String.valueOf(c))
                        .param("q", "аспирин").cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].available").value(50))
                .andExpect(jsonPath("$.items[0].price").value("2500.50"));
        mvc.perform(get("/api/orders/catalog").param("warehouseId", String.valueOf(p.warehouseId())).param("q", "by aspirin")
                        .param("inStockOnly", "false").cookie(operator))
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[*].productId", hasItem((int) empty)));
        // Prototip `ProductPicker` filtrlari: variantlar soni bilan, «Belgilar» — nazoratdagi yo'q
        mvc.perform(get("/api/orders/catalog").param("warehouseId", String.valueOf(p.warehouseId())).param("q", "by aspirin")
                        .param("inStockOnly", "false").param("flags", "CONTROLLED").cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0))
                .andExpect(jsonPath("$.facets.flags.controlled").value(0))
                .andExpect(jsonPath("$.facets.manufacturers").isArray());
        mvc.perform(get("/api/orders/catalog").param("warehouseId", String.valueOf(p.warehouseId())).param("q", "by aspirin")
                        .param("inStockOnly", "false").param("manufacturerIds", "-1").cookie(operator))
                .andExpect(jsonPath("$.total").value(0));
        // Qoralamada narx o'zgarsa — ogohlantirish
        setPrice(p, a, "2600");
        mvc.perform(get("/api/orders/" + doc).cookie(operator))
                .andExpect(jsonPath("$.priceChanged").value(true))
                .andExpect(jsonPath("$.issues[*].code", hasItem("order.priceChanged")))
                .andExpect(jsonPath("$.total").value("26000.00"))
                .andExpect(jsonPath("$.vatTotal").value("2785.71"));

        send(post("/api/orders/" + doc + "/submit"), operator, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("QUEUED"))
                .andExpect(jsonPath("$.total").value("26000.00"))
                .andExpect(jsonPath("$.lines[0].reserved[0].qty").value(10))
                .andExpect(jsonPath("$.lines[0].reserved[0].batch").value("S-" + a));
        // Zahira mavjud qoldiqdan ayriladi
        mvc.perform(get("/api/orders/catalog").param("warehouseId", String.valueOf(p.warehouseId())).param("q", "by aspirin").cookie(operator))
                .andExpect(jsonPath("$.items[0].available").value(40));
        // Tasdiqlangan buyurtmada narx muzlatiladi
        setPrice(p, a, "9999");
        mvc.perform(get("/api/orders/" + doc).cookie(operator))
                .andExpect(jsonPath("$.total").value("26000.00"))
                .andExpect(jsonPath("$.lines[0].price").value("2600.00"))
                .andExpect(jsonPath("$.issues.length()").value(0));
        send(put("/api/orders/" + doc), operator, order(p, c, new long[][] {{a, 1}})).andExpect(status().isConflict());
        assertThatThrownBy(() -> jdbc.sql("UPDATE sales_order_line SET qty = 1 WHERE order_id = :d").param("d", doc).update())
                .hasMessageContaining("faqat qoralamada");

        // Navbatda — Operator bekor qila olmaydi, Ombor mudiri — ha
        send(post("/api/orders/" + doc + "/cancel"), operator, "{\"reason\":\"Mijoz voz kechdi\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("order.cancelForbidden"));
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        send(post("/api/orders/" + doc + "/cancel"), keeper, "{\"reason\":\"Mijoz voz kechdi\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.lines[0].reserved.length()").value(0));
        mvc.perform(get("/api/orders/catalog").param("warehouseId", String.valueOf(p.warehouseId())).param("q", "by aspirin").cookie(operator))
                .andExpect(jsonPath("$.items[0].available").value(50));
        // «Tarix» yorligʻi — audit: yaratildi → yuborildi → bekor qilindi (sababi bilan)
        mvc.perform(get("/api/orders/" + doc + "/history").cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].action").value("order.create"))
                .andExpect(jsonPath("$[?(@.action == 'order.submit')]").isNotEmpty())
                .andExpect(jsonPath("$[-1].action").value("order.cancel"))
                .andExpect(jsonPath("$[-1].reason").value("Mijoz voz kechdi"));
        mvc.perform(get("/api/orders/" + doc + "/history").cookie(foreign)).andExpect(status().isNotFound());
    }

    private static String discounted(Place p, long customer, long product, int qty, String pct) {
        return "{\"warehouseId\":" + p.warehouseId() + ",\"customerId\":" + customer
                + ",\"deliveryType\":\"DELIVERY\",\"paymentType\":\"TRANSFER\",\"lines\":[{\"productId\":" + product + ",\"qty\":" + qty
                + (pct == null ? "" : ",\"discountPct\":" + pct) + "}]}";
    }

    /** E7/E8: qator chegirmasi %, 5% dan katta — Filial rahbari tasdig'i, narx chegirmali muzlatiladi, standart chegirma, ruxsat. */
    @Test
    void discountUpToFivePercentSelfAboveNeedsBranchApproval() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        long a = product(p, "BY Chegirma", "1000", 50, null, null);

        long doc = id(send(post("/api/orders"), operator, discounted(p, c, a, 10, "5"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.total").value("9500.00"))
                .andExpect(jsonPath("$.grossTotal").value("10000.00"))
                .andExpect(jsonPath("$.discountTotal").value("500.00"))
                .andExpect(jsonPath("$.lines[0].discountPct").value("5.00"))
                .andExpect(jsonPath("$.lines[0].listPrice").value("1000.00"))
                .andExpect(jsonPath("$.lines[0].currentPrice").value("950.00"))
                .andExpect(jsonPath("$.issues.length()").value(0))
                .andReturn());
        // 7,5% — tasdiqqa ketadi (Filial rahbari)
        send(put("/api/orders/" + doc), operator, discounted(p, c, a, 10, "7.5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value("9250.00"))
                .andExpect(jsonPath("$.issues[*].code", hasItem("order.discountOver")));
        send(post("/api/orders/" + doc + "/submit"), operator, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING_APPROVAL"))
                .andExpect(jsonPath("$.approvalLevel").value("BRANCH"))
                .andExpect(jsonPath("$.total").value("9250.00"))
                .andExpect(jsonPath("$.lines[0].price").value("925.00"));
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        send(post("/api/orders/" + doc + "/approve"), manager, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("QUEUED"));
        // Muzlatilgan: narx turi o'zgarsa ham chegirmali narx va chegirmasiz summa saqlanadi
        setPrice(p, a, "2000");
        mvc.perform(get("/api/orders/" + doc).cookie(operator))
                .andExpect(jsonPath("$.total").value("9250.00"))
                .andExpect(jsonPath("$.grossTotal").value("10000.00"))
                .andExpect(jsonPath("$.discountTotal").value("750.00"))
                .andExpect(jsonPath("$.lines[0].price").value("925.00"))
                .andExpect(jsonPath("$.lines[0].listPrice").value("1000.00"))
                .andExpect(jsonPath("$.lines[0].discountPct").value("7.50"));

        // E8: mijozning standart chegirmasi qatorga avtomatik qo'yiladi; 2000 × (100 − 3,3) / 100 = 1934,00
        long c2 = customer(p.branchId(), null);
        jdbc.sql("UPDATE counterparty_branch_terms SET discount_pct = 3.3 WHERE counterparty_id = :c").param("c", c2).update();
        send(post("/api/orders"), operator, discounted(p, c2, a, 1, null))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.lines[0].discountPct").value("3.30"))
                .andExpect(jsonPath("$.lines[0].currentPrice").value("1934.00"))
                .andExpect(jsonPath("$.total").value("1934.00"));
        // Noto'g'ri qiymat — 400
        send(post("/api/orders"), operator, discounted(p, c, a, 1, "100")).andExpect(status().isBadRequest());

        // orders.discount ruxsatisiz — qo'lda chegirma taqiqlanadi, standart chegirma esa qo'yiladi
        String code = "NODISC" + ThreadLocalRandom.current().nextInt(1_000_000);
        long role = jdbc.sql("INSERT INTO role (code, name) VALUES (:c, :c) RETURNING id").param("c", code).query(Long.class).single();
        jdbc.sql("INSERT INTO role_permission (role_id, permission_key) VALUES (:r, 'orders.create'), (:r, 'orders.view')")
                .param("r", role)
                .update();
        Cookie limited = loginAs(code, p.branchId());
        send(post("/api/orders"), limited, discounted(p, c, a, 1, "2"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("order.discountForbidden"));
        send(post("/api/orders"), limited, discounted(p, c2, a, 1, null))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.lines[0].discountPct").value("3.30"));
    }

    @Test
    void creditLimitAndOverdueRequireApprovalLevels() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), "100000");
        Cookie operator = loginAs("OPERATOR", p.branchId());
        long a = product(p, "BY Limit", "1000", 500, null, null);
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        Cookie director = loginAs("DIRECTOR", null);

        // +10% — Filial rahbari
        long small = draft(operator, order(p, c, new long[][] {{a, 110}}));
        send(post("/api/orders/" + small + "/submit"), operator, "")
                .andExpect(jsonPath("$.status").value("PENDING_APPROVAL"))
                .andExpect(jsonPath("$.approvalLevel").value("BRANCH"))
                .andExpect(jsonPath("$.approvalReasons[0]").value(containsString("Limitdan 10.000,00 soʻm oshadi — Filial rahbari")));
        send(post("/api/orders/" + small + "/approve"), operator, "").andExpect(status().isForbidden());
        send(post("/api/orders/" + small + "/approve"), manager, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("QUEUED"))
                .andExpect(jsonPath("$.decidedBy").value("Sinov BRANCH_MANAGER"));
        // Bildirishnomalar: tasdiq kutmoqda — Filial rahbariga (filialida); tasdiqlandi — muallifga
        assertThat(notified("order.approval", small, "BRANCH_MANAGER")).isPositive();
        assertThat(notified("order.approval", small, "OPERATOR")).isZero();
        assertThat(notified("order.approved", small, "OPERATOR")).isEqualTo(1);
        long big = draft(operator, order(p, c, new long[][] {{a, 150}}));
        send(post("/api/orders/" + big + "/submit"), operator, "").andExpect(jsonPath("$.approvalLevel").value("DIRECTOR"));
        // Ro'yxatda ⚠ belgisi (prototip): limitdan oshgan summa — faqat ochiq buyurtmada
        mvc.perform(get("/api/orders").param("customerId", "" + c).param("statuses", "PENDING_APPROVAL").cookie(manager))
                .andExpect(jsonPath("$.items[0].id").value(big))
                .andExpect(jsonPath("$.items[0].credit.overLimit").value("50000.00"))
                .andExpect(jsonPath("$.items[0].credit.blocked").value(false));
        mvc.perform(get("/api/orders").param("customerId", "" + c).param("statuses", "QUEUED").cookie(manager))
                .andExpect(jsonPath("$.items[0].id").value(small))
                .andExpect(jsonPath("$.items[0].credit").doesNotExist());
        // Sidebar nishoni: tasdiq kutayotgan buyurtmalar soni — filial doirasida
        mvc.perform(get("/api/nav/badges").cookie(manager)).andExpect(status().isOk()).andExpect(jsonPath("$.orders.count").value(1))
                .andExpect(jsonPath("$.company").isNotEmpty());
        mvc.perform(get("/api/nav/badges").param("branchId", "" + p.branchId()).cookie(director)).andExpect(jsonPath("$.orders.count").value(1));
        mvc.perform(get("/api/nav/badges").param("branchId", "" + place().branchId()).cookie(manager)).andExpect(jsonPath("$.orders.count").value(1));
        send(post("/api/orders/" + big + "/approve"), manager, "")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("order.directorOnly"));
        send(post("/api/orders/" + big + "/return"), operator, "").andExpect(jsonPath("$.status").value("DRAFT"));
        send(post("/api/orders/" + big + "/submit"), operator, "").andExpect(jsonPath("$.status").value("PENDING_APPROVAL"));
        send(post("/api/orders/" + big + "/reject"), director, "{\"reason\":\"Avval qarzni yopsin\"}")
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.decisionReason").value("Avval qarzni yopsin"));
        // Direktor darajasi — Filial rahbariga yuborilmaydi; rad etildi — muallifga sabab bilan
        assertThat(notified("order.approval", big, "DIRECTOR")).isPositive();
        assertThat(notified("order.approval", big, "BRANCH_MANAGER")).isZero();
        assertThat(notified("order.rejected", big, "OPERATOR")).isEqualTo(1);

        // Muddati o'tgan qarz 40 kun — limit ichida bo'lsa ham Direktor
        long c2 = customer(p.branchId(), null);
        jdbc.sql("""
                INSERT INTO party_ledger (branch_id, counterparty_id, side, amount, due_date, doc_type, doc_id, doc_number)
                VALUES (:b, :c, 'CUSTOMER', 5000, :d, 'SV', 1, 'SV-TST-000001')""")
                .param("b", p.branchId())
                .param("c", c2)
                .param("d", java.sql.Date.valueOf(today().minusDays(40)))
                .update();
        long od = draft(operator, order(p, c2, new long[][] {{a, 1}}));
        mvc.perform(get("/api/orders/" + od).cookie(operator))
                .andExpect(jsonPath("$.credit.debt").value("5000.00"))
                .andExpect(jsonPath("$.credit.overdue").value("5000.00"))
                .andExpect(jsonPath("$.credit.overdueDays").value(40));
        send(post("/api/orders/" + od + "/submit"), operator, "")
                .andExpect(jsonPath("$.approvalLevel").value("DIRECTOR"))
                .andExpect(jsonPath("$.approvalReasons[0]").value(containsString("40 kun")));
        send(post("/api/orders/" + od + "/approve"), director, "").andExpect(jsonPath("$.status").value("QUEUED"));
        // Qisman to'lov (FIFO) — muddati o'tgan qism kamayadi
        jdbc.sql("""
                INSERT INTO party_ledger (branch_id, counterparty_id, side, amount, doc_type, doc_id, doc_number)
                VALUES (:b, :c, 'CUSTOMER', -5000, 'MT', 1, 'MT-TST-000001')""")
                .param("b", p.branchId())
                .param("c", c2)
                .update();
        long od2 = draft(operator, order(p, c2, new long[][] {{a, 1}}));
        send(post("/api/orders/" + od2 + "/submit"), operator, "").andExpect(jsonPath("$.status").value("QUEUED"));
    }

    @Test
    void errorsBlockSubmitAndCancelRules() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        long a = product(p, "BY Qoldiq", "500", 5, 2, 4);
        long noPrice = jdbc.sql("""
                INSERT INTO product (code, name, unit_id, search_text) SELECT :c, 'BY narxsiz', id, 'by narxsiz' FROM unit WHERE short_name = 'dona'
                RETURNING id""")
                .param("c", String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999)))
                .query(Long.class)
                .single();
        Cookie other = loginAs("OPERATOR", p.branchId());

        long doc = draft(operator, order(p, c, new long[][] {{a, 6}, {noPrice, 1}}));
        mvc.perform(get("/api/orders/" + doc).cookie(operator))
                .andExpect(jsonPath("$.issues[*].code", hasItem("order.insufficient")))
                .andExpect(jsonPath("$.issues[*].code", hasItem("order.noPrice")))
                .andExpect(jsonPath("$.issues[*].code", hasItem("order.aboveMax")));
        send(post("/api/orders/" + doc + "/submit"), operator, "")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("order.hasErrors"));
        // Min — yuborilmaydi; max — tasdiqqa
        send(put("/api/orders/" + doc), operator, order(p, c, new long[][] {{a, 1}})).andExpect(status().isOk());
        send(post("/api/orders/" + doc + "/submit"), operator, "").andExpect(status().isBadRequest());
        send(put("/api/orders/" + doc), operator, order(p, c, new long[][] {{a, 5}})).andExpect(status().isOk());
        send(post("/api/orders/" + doc + "/submit"), operator, "")
                .andExpect(jsonPath("$.status").value("PENDING_APPROVAL"))
                .andExpect(jsonPath("$.approvalLevel").value("BRANCH"));

        // Bekor qilish: boshqa operator — yo'q; muallif — ha
        send(post("/api/orders/" + doc + "/cancel"), other, "{\"reason\":\"xato\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("order.notOwner"));
        send(post("/api/orders/" + doc + "/cancel"), operator, "{\"reason\":\" \"}").andExpect(status().isBadRequest());
        send(post("/api/orders/" + doc + "/cancel"), operator, "{\"reason\":\"xato\"}").andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThatThrownBy(() -> jdbc.sql("UPDATE sales_order SET note = 'x' WHERE id = :d").param("d", doc).update())
                .hasMessageContaining("yakunlangan");

        // Bloklangan mijoz — qoralama ham yo'q; muddati o'tmagan qoldiq yo'q bo'lsa — mavjud 0
        long blocked = customer(p.branchId(), null);
        jdbc.sql("UPDATE counterparty SET blocked = true, blocked_reason = 'qarz' WHERE id = :c").param("c", blocked).update();
        send(post("/api/orders"), operator, order(p, blocked, new long[][] {{a, 1}}))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("order.customerBlocked"));

        // Ro'yxat va filial doirasi
        Place otherBranch = place();
        Cookie outsider = loginAs("OPERATOR", otherBranch.branchId());
        mvc.perform(get("/api/orders/" + doc).cookie(outsider)).andExpect(status().isNotFound());
        mvc.perform(get("/api/orders").param("mine", "true").cookie(operator))
                .andExpect(jsonPath("$.items[0].number").exists())
                .andExpect(jsonPath("$.items[0].status").value("CANCELLED"))
                .andExpect(jsonPath("$.items[0].holder").value("Yakunlangan"));
        // Holat yorliqlari: «Hammasi» + 13 holat; holat filtri yorliq raqamlariga ta'sir qilmaydi
        mvc.perform(get("/api/orders").param("customerId", String.valueOf(c)).param("status", "QUEUED").cookie(operator))
                .andExpect(jsonPath("$.total").value(0))
                .andExpect(jsonPath("$.statuses.length()").value(14))
                .andExpect(jsonPath("$.statuses[0].count").value(org.hamcrest.Matchers.greaterThan(0)))
                .andExpect(jsonPath("$.statuses[?(@.status == 'CANCELLED')].count").value(org.hamcrest.Matchers.contains(org.hamcrest.Matchers.greaterThan(0))))
                .andExpect(jsonPath("$.statuses[?(@.status == 'QUEUED')].total").value(org.hamcrest.Matchers.contains("0.00")));
        mvc.perform(get("/api/orders/previous").param("customerId", String.valueOf(c)).cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        assertThat(jdbc.sql("SELECT count(*) FROM stock_move WHERE batch_id IN (SELECT id FROM batch WHERE product_id = :p) AND doc_type <> 'BQ'")
                        .param("p", a).query(Long.class).single())
                .isZero();
    }

    @Autowired
    uz.medix.inventory.StockReservations reservations;

    @Test
    void fefoAndParallelReservationsNeverOverbook() throws Exception {
        Place p = place();
        loginAs("OPERATOR", p.branchId());
        long prod = product(p, "BY FEFO", "100", 0, null, null);
        tx.executeWithoutResult(s -> {
            long late = ledger.createBatch(prod, "LATE", null, LocalDate.now().plusYears(3), Money.of("100"), false, "BQ", null);
            long early = ledger.createBatch(prod, "EARLY", null, LocalDate.now().plusMonths(8), Money.of("100"), false, "BQ", null);
            long expired = ledger.createBatch(prod, "OLD", null, LocalDate.now().minusDays(1), Money.of("100"), false, "BQ", null);
            long quarantined = ledger.createBatch(prod, "Q", null, LocalDate.now().plusMonths(2), Money.of("100"), false, "BQ", null);
            ledger.post(new DocRef("BQ", prod, "BQ-FEFO"), List.of(Move.in(p.main(), late, 6), Move.in(p.main(), early, 4),
                    Move.in(p.main(), expired, 50), Move.in(p.quarantine(), quarantined, 50)));
        });
        // FEFO: avval eng yaqin muddat (EARLY 4), keyin LATE; muddati o'tgan va Karantin — yo'q
        var first = tx.execute(s -> reservations.reserve("BY", 900_001, "BY-T-1", p.warehouseId(), today(),
                List.of(new uz.medix.inventory.StockReservations.Request(1, prod, 5, "BY FEFO"))));
        assertThat(first).extracting(a -> a.batchNumber() + ":" + a.qty()).containsExactly("EARLY:4", "LATE:1");

        // Qolgan 5 dona — 6 ta parallel so'rov (har biri 2): aniq 2 tasi muvaffaqiyatli
        var pool = java.util.concurrent.Executors.newFixedThreadPool(6);
        var start = new java.util.concurrent.CountDownLatch(1);
        var ok = new java.util.concurrent.atomic.AtomicInteger();
        List<java.util.concurrent.Future<?>> futures = new java.util.ArrayList<>();
        for (int i = 0; i < 6; i++) {
            long doc = 900_100 + i;
            futures.add(pool.submit(() -> {
                start.await();
                try {
                    tx.executeWithoutResult(s -> reservations.reserve("BY", doc, "BY-T-" + doc, p.warehouseId(), today(),
                            List.of(new uz.medix.inventory.StockReservations.Request(doc, prod, 2, "BY FEFO"))));
                    ok.incrementAndGet();
                } catch (uz.medix.shared.error.MedixException e) {
                    // yetmadi
                }
                return null;
            }));
        }
        start.countDown();
        for (var f : futures) {
            f.get(60, java.util.concurrent.TimeUnit.SECONDS);
        }
        pool.shutdown();
        assertThat(ok.get()).isEqualTo(2);
        assertThat(jdbc.sql("SELECT sum(qty) FROM stock_reservation WHERE product_id = :p AND status = 'ACTIVE'").param("p", prod)
                        .query(Long.class).single())
                .isEqualTo(9);
        Integer released = tx.execute(s -> reservations.release("BY", 900_001));
        assertThat(released).isEqualTo(2);
    }

    private long zoneOf(long warehouseId, String type) {
        return jdbc.sql("SELECT id FROM zone WHERE warehouse_id = :w AND type = :t").param("w", warehouseId).param("t", type).query(Long.class).single();
    }

    private long qtyIn(long zone, long product) {
        return jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_balance WHERE zone_id = :z AND product_id = :p")
                .param("z", zone).param("p", product).query(Long.class).single();
    }

    @Test
    void timePickFinishMovesToShippingAndCancelReturns() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        long prod = product(p, "BY Yig'ish", "1000", 0, null, null);
        long[] batches = new long[2];
        tx.executeWithoutResult(s -> {
            batches[0] = ledger.createBatch(prod, "Y-EARLY", null, LocalDate.now().plusMonths(6), Money.of("100"), false, "BQ", null);
            batches[1] = ledger.createBatch(prod, "Y-LATE", null, LocalDate.now().plusYears(2), Money.of("100"), false, "BQ", null);
            ledger.post(new DocRef("BQ", prod, "BQ-Y"), List.of(Move.in(p.main(), batches[0], 10), Move.in(p.main(), batches[1], 10)));
        });
        long shipping = zoneOf(p.warehouseId(), "SHIPPING");
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie picker = loginAs("PICKER", p.branchId());

        long o1 = draft(operator, order(p, c, new long[][] {{prod, 4}}));
        send(post("/api/orders/" + o1 + "/submit"), operator, "").andExpect(jsonPath("$.status").value("QUEUED"));
        long o2 = draft(operator, order(p, c, new long[][] {{prod, 3}}));
        send(post("/api/orders/" + o2 + "/submit"), operator, "").andExpect(jsonPath("$.status").value("QUEUED"));

        // Vaqt berilmagan — boshlab bo'lmaydi; vaqt — faqat Ombor mudiri
        send(post("/api/orders/" + o1 + "/pick/start"), picker, "").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("order.noTime"));
        send(post("/api/orders/" + o1 + "/time"), picker, "{\"pickMinutes\":15}").andExpect(status().isForbidden());
        send(post("/api/orders/" + o1 + "/time"), keeper, "{\"pickMinutes\":15}").andExpect(jsonPath("$.pickMinutes").value(15));
        send(post("/api/orders/" + o2 + "/time"), keeper, "{\"pickMinutes\":10}").andExpect(status().isOk());
        mvc.perform(get("/api/orders/pick-queue").cookie(picker))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", hasItem((int) o1)))
                .andExpect(jsonPath("$[0].deliveryType").isNotEmpty());

        // Bitta faol yig'ish
        send(post("/api/orders/" + o1 + "/pick/start"), picker, "").andExpect(jsonPath("$.status").value("PICKING"));
        send(post("/api/orders/" + o2 + "/pick/start"), picker, "")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("order.pickerBusy"));
        Cookie otherPicker = loginAs("PICKER", p.branchId());
        send(post("/api/orders/" + o1 + "/pick/finish"), otherPicker, "{}").andExpect(status().isForbidden());

        // «Ha, shundan oldim» — FEFO zahira (Y-EARLY) Jo'natish zonasiga
        // E1: markirovkasiz buyurtma ham Markirovkachiga o'tadi
        send(post("/api/orders/" + o1 + "/pick/finish"), picker, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("MARKING"))
                .andExpect(jsonPath("$.fefoDeviation").value(false));
        // «Bugun yakunlanganlar» — faqat o'zi yig'ganlari
        mvc.perform(get("/api/orders/pick-done-today").cookie(picker))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(o1))
                .andExpect(jsonPath("$[0].status").value("MARKING"))
                .andExpect(jsonPath("$[0].onTime").value(true))
                .andExpect(jsonPath("$[0].issues").value(0));
        mvc.perform(get("/api/orders/pick-done-today").cookie(otherPicker)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/orders/pick-done-today").cookie(keeper)).andExpect(status().isForbidden());
        assertThat(qtyIn(shipping, prod)).isEqualTo(4);
        assertThat(qtyIn(p.main(), prod)).isEqualTo(16);
        assertThat(jdbc.sql("SELECT string_agg(status, ',') FROM stock_reservation WHERE doc_type = 'BY' AND doc_id = :o").param("o", o1)
                        .query(String.class).single())
                .isEqualTo("CONSUMED");

        // «Boshqa partiyadan oldim» — Y-LATE; ogohlantirish belgisi
        send(post("/api/orders/" + o2 + "/pick/start"), picker, "").andExpect(status().isOk());
        long line2 = jdbc.sql("SELECT id FROM sales_order_line WHERE order_id = :o").param("o", o2).query(Long.class).single();
        // Partiyalar ro'yxati (stock.view siz): FEFO tartibi, o'z zahirasi bo'sh qoldiqqa qo'shiladi; faqat o'z yig'ishi
        mvc.perform(get("/api/orders/" + o2 + "/pick/lines/" + line2 + "/batches").cookie(picker))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].number").value("Y-EARLY"))
                .andExpect(jsonPath("$[0].free").value(6))
                .andExpect(jsonPath("$[0].reserved").value(3))
                .andExpect(jsonPath("$[1].number").value("Y-LATE"))
                .andExpect(jsonPath("$[1].free").value(10))
                .andExpect(jsonPath("$[1].reserved").value(0))
                .andExpect(jsonPath("$[0].cost").doesNotExist());
        mvc.perform(get("/api/orders/" + o2 + "/pick/lines/" + line2 + "/batches").cookie(otherPicker)).andExpect(status().isForbidden());
        mvc.perform(get("/api/orders/" + o2 + "/pick/lines/" + line2 + "/batches").cookie(keeper)).andExpect(status().isForbidden());
        mvc.perform(get("/api/orders/" + o1 + "/pick/lines/" + line2 + "/batches").cookie(picker)).andExpect(status().isConflict());
        send(post("/api/orders/" + o2 + "/pick/finish"), picker, "{\"lines\":[{\"lineId\":" + line2 + ",\"batchId\":" + batches[1] + "}]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fefoDeviation").value(true));
        assertThat(qtyIn(shipping, prod)).isEqualTo(7);
        assertThat(jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_balance WHERE batch_id = :b AND zone_id = :z").param("b", batches[1])
                        .param("z", p.main()).query(Long.class).single())
                .isEqualTo(7);

        // Hisobdan o'tkazish: avval Markirovkachi tasdig'i (E1), keyin barcha qatorlar va joylar soni
        send(post("/api/orders/" + o2 + "/check"), keeper, "{\"checkedLines\":[" + line2 + "],\"places\":2}").andExpect(status().isConflict());
        passMarking(p.branchId(), o2);
        send(post("/api/orders/" + o2 + "/check"), keeper, "{\"checkedLines\":[],\"places\":2}").andExpect(status().isBadRequest());
        send(post("/api/orders/" + o2 + "/check"), picker, "{\"checkedLines\":[" + line2 + "],\"places\":2}").andExpect(status().isForbidden());
        send(post("/api/orders/" + o2 + "/check"), keeper, "{\"checkedLines\":[" + line2 + "],\"places\":2}")
                .andExpect(jsonPath("$.status").value("DOCUMENTING"))
                .andExpect(jsonPath("$.places").value(2));

        // Yig'ishga qaytarish: tovar joyiga, zahira qayta; qayta yig'ilgach bekor qilinsa — sof miqdor qaytadi
        send(post("/api/orders/" + o1 + "/return-to-pick"), keeper, "{\"reason\":\"Partiya aralashgan\"}")
                .andExpect(jsonPath("$.status").value("QUEUED"))
                .andExpect(jsonPath("$.lines[0].reserved[0].qty").value(4))
                // Qaytarilgan tovar yig'ilgandan ayiriladi
                .andExpect(jsonPath("$.lines[0].picked").value(0))
                .andExpect(jsonPath("$.pickMinutes").value(15));
        assertThat(qtyIn(shipping, prod)).isEqualTo(3);
        assertThat(qtyIn(p.main(), prod)).isEqualTo(17);
        send(post("/api/orders/" + o1 + "/pick/start"), picker, "").andExpect(status().isOk());
        send(post("/api/orders/" + o1 + "/pick/finish"), picker, "{}")
                .andExpect(jsonPath("$.status").value("MARKING"))
                .andExpect(jsonPath("$.lines[0].picked").value(4));
        assertThat(qtyIn(shipping, prod)).isEqualTo(7);
        send(post("/api/orders/" + o1 + "/cancel"), keeper, "{\"reason\":\"Mijoz voz kechdi\"}").andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(qtyIn(shipping, prod)).isEqualTo(3);
        assertThat(qtyIn(p.main(), prod)).isEqualTo(17);
    }

    @Test
    void returnToPickSelectedLinesOnly() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        long a = product(p, "BY Qator A", "1000", 5, null, null);
        long b = product(p, "BY Qator B", "1000", 5, null, null);
        long shipping = zoneOf(p.warehouseId(), "SHIPPING");
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie picker = loginAs("PICKER", p.branchId());
        long o = draft(operator, order(p, c, new long[][] {{a, 2}, {b, 3}}));
        send(post("/api/orders/" + o + "/submit"), operator, "").andExpect(jsonPath("$.status").value("QUEUED"));
        send(post("/api/orders/" + o + "/time"), keeper, "{\"pickMinutes\":15}").andExpect(status().isOk());
        send(post("/api/orders/" + o + "/pick/start"), picker, "").andExpect(status().isOk());
        send(post("/api/orders/" + o + "/pick/finish"), picker, "{}").andExpect(jsonPath("$.status").value("MARKING"));
        passMarking(p.branchId(), o);
        long lineA = jdbc.sql("SELECT id FROM sales_order_line WHERE order_id = :o AND product_id = :p").param("o", o).param("p", a)
                .query(Long.class).single();
        long lineB = jdbc.sql("SELECT id FROM sales_order_line WHERE order_id = :o AND product_id = :p").param("o", o).param("p", b)
                .query(Long.class).single();

        // Boshqa buyurtma qatori — rad etiladi
        send(post("/api/orders/" + o + "/return-to-pick"), keeper, "{\"reason\":\"B singan\",\"lineIds\":[999999999]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("order.lineUnknown"));
        // Faqat B qatori: B tovari joyiga, zahira faqat B ga; A Jo'natish zonasida qoladi (SPEC 188)
        send(post("/api/orders/" + o + "/return-to-pick"), keeper, "{\"reason\":\"B singan\",\"lineIds\":[" + lineB + "]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("QUEUED"))
                .andExpect(jsonPath("$.repickLineIds.length()").value(1))
                .andExpect(jsonPath("$.repickLineIds[0]").value(lineB));
        assertThat(qtyIn(shipping, a)).isEqualTo(2);
        assertThat(qtyIn(shipping, b)).isZero();
        assertThat(qtyIn(p.main(), b)).isEqualTo(5);
        assertThat(jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_reservation WHERE doc_type = 'BY' AND doc_id = :o AND status = 'ACTIVE' "
                        + "AND doc_line_id = :l").param("o", o).param("l", lineB).query(Long.class).single())
                .isEqualTo(3);
        assertThat(jdbc.sql("SELECT count(*) FROM stock_reservation WHERE doc_type = 'BY' AND doc_id = :o AND status = 'ACTIVE' AND doc_line_id = :l")
                        .param("o", o).param("l", lineA).query(Long.class).single())
                .isZero();
        assertThat(jdbc.sql("SELECT line_id FROM sales_order_pick_return WHERE order_id = :o").param("o", o).query(Long.class).list())
                .containsOnly(lineB);
        // Navbat kartasi: faqat qayta yig'iladigan qator; mijozning amaldagi shartnomasi (SPEC 213)
        jdbc.sql("INSERT INTO counterparty_contract (counterparty_id, branch_id, number, valid_until) VALUES (:c, :b, 'SH-OLD', :old)")
                .param("c", c).param("b", p.branchId()).param("old", java.sql.Date.valueOf(LocalDate.now().minusDays(1))).update();
        jdbc.sql("INSERT INTO counterparty_contract (counterparty_id, branch_id, number, signed_on) VALUES (:c, :b, 'SH-2026/7', :d)")
                .param("c", c).param("b", p.branchId()).param("d", java.sql.Date.valueOf(LocalDate.now().minusMonths(1))).update();
        mvc.perform(get("/api/orders/pick-queue").cookie(picker))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + o + ")].lines").value(1))
                .andExpect(jsonPath("$[?(@.id == " + o + ")].totalQty").value(3))
                .andExpect(jsonPath("$[?(@.id == " + o + ")].contract").value("SH-2026/7"));

        // Qayta yig'ish — faqat B; A ikki marta olinmaydi
        send(post("/api/orders/" + o + "/pick/start"), picker, "").andExpect(status().isOk());
        send(post("/api/orders/" + o + "/pick/finish"), picker, "{}").andExpect(jsonPath("$.status").value("MARKING"));
        // Qayta tasdiq — faqat B (A tasdig'i saqlanadi, B niki yopilgan)
        assertThat(jdbc.sql("SELECT line_id FROM sales_order_mark_confirm WHERE order_id = :o AND active").param("o", o).query(Long.class).list())
                .containsOnly(lineA);
        passMarking(p.branchId(), o);
        assertThat(qtyIn(shipping, a)).isEqualTo(2);
        assertThat(qtyIn(shipping, b)).isEqualTo(3);
        assertThat(qtyIn(p.main(), a)).isEqualTo(3);
        assertThat(jdbc.sql("SELECT count(*) FROM sales_order_pick WHERE order_id = :o AND line_id = :l").param("o", o).param("l", lineA)
                        .query(Long.class).single())
                .isEqualTo(1);
        send(post("/api/orders/" + o + "/check"), keeper, "{\"checkedLines\":[" + lineA + "," + lineB + "],\"places\":1}")
                .andExpect(jsonPath("$.status").value("DOCUMENTING"))
                .andExpect(jsonPath("$.repickLineIds.length()").value(0));
    }

    /** Tasodifiy EAN-13 (to'g'ri nazorat raqami bilan) → GTIN-14. */
    private static String ean13() {
        StringBuilder b = new StringBuilder("478");
        for (int i = 0; i < 9; i++) {
            b.append(ThreadLocalRandom.current().nextInt(10));
        }
        int sum = 0;
        for (int i = 0; i < 12; i++) {
            int d = b.charAt(i) - '0';
            sum += i % 2 == 0 ? d : d * 3;
        }
        return b.append((10 - sum % 10) % 10).toString();
    }

    private static String mark(String ean, String serial, String batch, String kind) {
        return "{\"code\":\"(01)0" + ean + "(21)" + serial + "(17)300531(10)" + batch + "(91)" + kind + "\"}";
    }

    /** Markirovkali buyurtma: yig'ilgan, «Markirovkada». */
    private long markedOrder(Place p, long c, long prod, int qty, Cookie operator, Cookie keeper, Cookie picker) throws Exception {
        long o = draft(operator, order(p, c, new long[][] {{prod, qty}}));
        send(post("/api/orders/" + o + "/submit"), operator, "").andExpect(jsonPath("$.status").value("QUEUED"));
        send(post("/api/orders/" + o + "/time"), keeper, "{\"pickMinutes\":10}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("order.markTimeRequired"));
        send(post("/api/orders/" + o + "/time"), keeper, "{\"pickMinutes\":10,\"markMinutes\":5}").andExpect(status().isOk());
        send(post("/api/orders/" + o + "/pick/start"), picker, "").andExpect(status().isOk());
        send(post("/api/orders/" + o + "/pick/finish"), picker, "{}").andExpect(jsonPath("$.status").value("MARKING"));
        return o;
    }

    @Test
    void markingScanRulesFinishReleaseAndParallelDuplicate() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie picker = loginAs("PICKER", p.branchId());
        Cookie marker = loginAs("MARKER", p.branchId());
        Cookie marker2 = loginAs("MARKER", p.branchId());
        long prod = product(p, "BY Markirovka", "1000", 0, null, null);
        String ean = ean13();
        jdbc.sql("UPDATE product SET marked = true WHERE id = :p").param("p", prod).update();
        jdbc.sql("INSERT INTO product_barcode (product_id, barcode) VALUES (:p, :b)").param("p", prod).param("b", ean).update();
        long other = product(p, "BY Boshqa", "1000", 0, null, null);
        String otherEan = ean13();
        jdbc.sql("INSERT INTO product_barcode (product_id, barcode) VALUES (:p, :b)").param("p", other).param("b", otherEan).update();
        tx.executeWithoutResult(s -> {
            long b = ledger.createBatch(prod, "LOT-7", null, LocalDate.now().plusYears(2), Money.of("100"), false, "BQ", null);
            ledger.post(new DocRef("BQ", prod, "BQ-MK"), List.of(Move.in(p.main(), b, 20)));
        });

        long o1 = markedOrder(p, c, prod, 3, operator, keeper, picker);
        mvc.perform(get("/api/marking/queue").cookie(marker)).andExpect(jsonPath("$[*].id", hasItem((int) o1)));
        send(post("/api/marking/orders/" + o1 + "/scan"), marker, mark(ean, "S1", "LOT-7", "D"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("marking.notStarted"));
        send(post("/api/marking/orders/" + o1 + "/start"), picker, "").andExpect(status().isForbidden());
        send(post("/api/marking/orders/" + o1 + "/start"), marker, "")
                .andExpect(jsonPath("$.lines[0].kind").value("UNIT"))
                .andExpect(jsonPath("$.unitsNeeded").value(3))
                .andExpect(jsonPath("$.complete").value(false));
        send(post("/api/marking/orders/" + o1 + "/start"), marker2, "").andExpect(jsonPath("$.code").value("marking.taken"));
        mvc.perform(get("/api/orders/monitor").cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cards[?(@.id == " + o1 + ")].person", hasItem("Sinov MARKER")))
                .andExpect(jsonPath("$.cards[?(@.id == " + o1 + ")].late", hasItem(false)));
        mvc.perform(get("/api/orders/monitor").cookie(marker)).andExpect(status().isForbidden());

        // «Muammo bor»: faqat shu ishni bajarayotgan xodim; «Boshqa» — izoh bilan; Ombor mudiri hal qiladi
        send(post("/api/orders/" + o1 + "/issues"), marker2, "{\"reason\":\"DAMAGED\"}").andExpect(status().isForbidden());
        send(post("/api/orders/" + o1 + "/issues"), marker, "{\"reason\":\"OTHER\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("order.issueNoteRequired"));
        long issue = id(send(post("/api/orders/" + o1 + "/issues"), marker, "{\"reason\":\"DAMAGED\",\"note\":\"2 ta quti ezilgan\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.stage").value("MARKING"))
                .andReturn());
        mvc.perform(get("/api/orders/issues").cookie(keeper)).andExpect(jsonPath("$[*].id", hasItem((int) issue)));
        mvc.perform(get("/api/notifications").cookie(keeper)).andExpect(jsonPath("$.items[*].title", hasItem(containsString("Muammo bor"))));
        // O'quvchi tilida (MEDIX_LOCALE): kalit va o'rinbosarlar saqlangan.
        mvc.perform(get("/api/notifications").cookie(keeper).cookie(new Cookie("MEDIX_LOCALE", "ru")))
                .andExpect(jsonPath("$.items[*].title", hasItem(containsString("Есть проблема"))));
        send(post("/api/orders/issues/" + issue + "/resolve"), keeper, "{\"resolution\":\"Almashtirildi\"}")
                .andExpect(jsonPath("$.resolvedBy").value("Sinov WAREHOUSE_MANAGER"));
        send(post("/api/orders/issues/" + issue + "/resolve"), keeper, "{\"resolution\":\"Yana\"}").andExpect(status().isConflict());

        // Tekshiruv tartibi: format → mahsulot → partiya → tur
        send(post("/api/marking/orders/" + o1 + "/scan"), marker, "{\"code\":\"" + ean + "\"}").andExpect(jsonPath("$.code").value("marking.format"));
        send(post("/api/marking/orders/" + o1 + "/scan"), marker, mark(otherEan, "S1", "LOT-7", "D"))
                .andExpect(jsonPath("$.code").value("marking.productMismatch"));
        send(post("/api/marking/orders/" + o1 + "/scan"), marker, mark(ean, "S1", "LOT-8", "D"))
                .andExpect(jsonPath("$.code").value("marking.batchMismatch"))
                .andExpect(jsonPath("$.detail", containsString("LOT-7")));
        send(post("/api/marking/orders/" + o1 + "/scan"), marker, mark(ean, "S1", "LOT-7", "Q"))
                .andExpect(jsonPath("$.code").value("marking.kindNeedUnit"));
        // Qabul: 3 ta; takror (shu buyurtmada) va qator to'lgan
        for (String s : List.of("S1", "S2", "S3")) {
            send(post("/api/marking/orders/" + o1 + "/scan"), marker, mark(ean, s, "lot-7", "D"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.accepted.serial").value(s));
        }
        send(post("/api/marking/orders/" + o1 + "/scan"), marker, mark(ean, "S2", "LOT-7", "D"))
                .andExpect(jsonPath("$.code").value("marking.duplicateHere"));
        MvcResult full = send(post("/api/marking/orders/" + o1 + "/scan"), marker, mark(ean, "S4", "LOT-7", "D"))
                .andExpect(jsonPath("$.code").value("marking.lineFull")).andReturn();
        assertThat(full.getResponse().getStatus()).isEqualTo(409);

        // Olib tashlash (sabab bilan) → to'liq emas → qayta urish → yakunlash
        long s3 = jdbc.sql("SELECT id FROM sales_order_mark WHERE order_id = :o AND serial = 'S3'").param("o", o1).query(Long.class).single();
        send(post("/api/marking/orders/" + o1 + "/codes/" + s3 + "/remove"), marker, "{\"reason\":\"Qadoq shikastlangan\"}")
                .andExpect(jsonPath("$.unitsScanned").value(2));
        send(post("/api/marking/orders/" + o1 + "/finish"), marker, "").andExpect(jsonPath("$.code").value("marking.incomplete"));
        send(post("/api/marking/orders/" + o1 + "/scan"), marker, mark(ean, "S3", "LOT-7", "D")).andExpect(status().isOk());
        send(post("/api/marking/orders/" + o1 + "/finish"), marker, "").andExpect(jsonPath("$.status").value("CHECKING"));
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM sales_order_mark WHERE id = :m").param("m", s3).update()).hasMessageContaining("oʻchirilmaydi");

        // Global takror: boshqa buyurtmada shu kod qabul qilinmaydi
        long o2 = markedOrder(p, c, prod, 2, operator, keeper, picker);
        send(post("/api/marking/orders/" + o2 + "/start"), marker, "").andExpect(status().isOk());
        send(post("/api/marking/orders/" + o2 + "/scan"), marker, mark(ean, "S1", "LOT-7", "D"))
                .andExpect(jsonPath("$.code").value("marking.duplicate"))
                .andExpect(jsonPath("$.detail", containsString(JsonPath.read(
                        mvc.perform(get("/api/orders/" + o1).cookie(keeper)).andReturn().getResponse().getContentAsString(), "$.number").toString())));
        long o3 = markedOrder(p, c, prod, 2, operator, keeper, picker);
        send(post("/api/marking/orders/" + o3 + "/start"), marker, "").andExpect(jsonPath("$.code").value("marking.markerBusy"));
        send(post("/api/marking/orders/" + o3 + "/start"), marker2, "").andExpect(status().isOk());

        // Parallel: ikki markirovkachi bir kodni bir vaqtda — faqat bittasi qabul qiladi
        var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        var go = new java.util.concurrent.CountDownLatch(1);
        var ok = new java.util.concurrent.atomic.AtomicInteger();
        List<java.util.concurrent.Future<?>> futures = new java.util.ArrayList<>();
        for (long[] pair : new long[][] {{o2, 1}, {o3, 2}}) {
            Cookie who = pair[1] == 1 ? marker : marker2;
            futures.add(pool.submit(() -> {
                go.await();
                int st = send(post("/api/marking/orders/" + pair[0] + "/scan"), who, mark(ean, "P1", "LOT-7", "D")).andReturn().getResponse().getStatus();
                if (st == 200) {
                    ok.incrementAndGet();
                }
                return null;
            }));
        }
        go.countDown();
        for (var f : futures) {
            f.get(60, java.util.concurrent.TimeUnit.SECONDS);
        }
        pool.shutdown();
        assertThat(ok.get()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT count(*) FROM sales_order_mark WHERE serial = 'P1' AND status = 'ACTIVE' AND gtin = :g").param("g", "0" + ean)
                        .query(Long.class).single())
                .isEqualTo(1);

        // Yig'ishga qaytarish (Markirovkada) — kodlar bo'shaydi, shu kodni boshqa buyurtmada urish mumkin
        send(post("/api/orders/" + o2 + "/return-to-pick"), keeper, "{\"reason\":\"Qayta yig'ish\"}").andExpect(jsonPath("$.status").value("QUEUED"));
        send(post("/api/orders/" + o1 + "/cancel"), keeper, "{\"reason\":\"Mijoz voz kechdi\"}").andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(jdbc.sql("SELECT count(*) FROM sales_order_mark WHERE order_id IN (:a, :b) AND status = 'ACTIVE'").param("a", o1).param("b", o2)
                        .query(Long.class).single())
                .isZero();
        send(post("/api/marking/orders/" + o3 + "/scan"), marker2, mark(ean, "S1", "LOT-7", "D")).andExpect(status().isOk());
        mvc.perform(get("/api/marking/codes").param("q", "s1").cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2));
        mvc.perform(get("/api/marking/codes").cookie(picker)).andExpect(status().isForbidden());
        // Kodlar .xlsx — marking.export (Markirovkachi); Ombor mudirida yo'q
        mvc.perform(get("/api/marking/codes/export").param("orderId", "" + o3).cookie(marker))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Disposition", containsString("kodlar-")));
        mvc.perform(get("/api/marking/codes/export").cookie(keeper)).andExpect(status().isForbidden());
    }

    /** E1: markirovkasiz qatorlarni yangi Markirovkachi tasdiqlaydi va yakunlaydi → «Hisobdan o'tkazilmoqda». */
    private void passMarking(long branchId, long o) throws Exception {
        Cookie m = loginAs("MARKER", branchId);
        send(post("/api/marking/orders/" + o + "/start"), m, "").andExpect(status().isOk());
        List<Long> lines = jdbc.sql("""
                SELECT l.id FROM sales_order_line l JOIN product p ON p.id = l.product_id JOIN sales_order so ON so.id = l.order_id
                WHERE l.order_id = :o AND NOT p.marked AND (so.repick_line_ids IS NULL OR l.id = ANY (so.repick_line_ids))""")
                .param("o", o).query(Long.class).list();
        String ids = lines.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(","));
        send(post("/api/marking/orders/" + o + "/confirm"), m, "{\"lineIds\":[" + ids + "]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.complete").value(true));
        send(post("/api/marking/orders/" + o + "/finish"), m, "").andExpect(jsonPath("$.status").value("CHECKING"));
    }

    /** E1 (07.11.2026): aralash buyurtma — markirovkali qator skanerlanadi, markirovkasizi tasdiqlanadi; hammasi markirovkasiz — tasdiq. */
    @Test
    void everyOrderPassesMarkingUnmarkedLinesConfirmed() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie picker = loginAs("PICKER", p.branchId());
        Cookie marker = loginAs("MARKER", p.branchId());
        long plain = product(p, "BY Oddiy", "1000", 10, null, null);
        long markedProd = product(p, "BY Aralash markirovka", "1000", 0, null, null);
        String ean = ean13();
        jdbc.sql("UPDATE product SET marked = true WHERE id = :p").param("p", markedProd).update();
        jdbc.sql("INSERT INTO product_barcode (product_id, barcode) VALUES (:p, :b)").param("p", markedProd).param("b", ean).update();
        tx.executeWithoutResult(st -> {
            long b = ledger.createBatch(markedProd, "LOT-AR", null, LocalDate.now().plusYears(2), Money.of("100"), false, "BQ", null);
            ledger.post(new DocRef("BQ", markedProd, "BQ-AR"), List.of(Move.in(p.main(), b, 5)));
        });

        // Aralash: 1 markirovkali (2 dona) + 1 markirovkasiz
        long o = draft(operator, order(p, c, new long[][] {{markedProd, 2}, {plain, 3}}));
        send(post("/api/orders/" + o + "/submit"), operator, "").andExpect(jsonPath("$.status").value("QUEUED"));
        send(post("/api/orders/" + o + "/time"), keeper, "{\"pickMinutes\":10,\"markMinutes\":5}").andExpect(status().isOk());
        send(post("/api/orders/" + o + "/pick/start"), picker, "").andExpect(status().isOk());
        send(post("/api/orders/" + o + "/pick/finish"), picker, "{}").andExpect(jsonPath("$.status").value("MARKING"));
        long markedLine = jdbc.sql("SELECT id FROM sales_order_line WHERE order_id = :o AND product_id = :p").param("o", o).param("p", markedProd)
                .query(Long.class).single();
        long plainLine = jdbc.sql("SELECT id FROM sales_order_line WHERE order_id = :o AND product_id = :p").param("o", o).param("p", plain)
                .query(Long.class).single();
        mvc.perform(get("/api/marking/queue").cookie(marker))
                .andExpect(jsonPath("$[?(@.id == " + o + ")].lines").value(hasItem(1)))
                .andExpect(jsonPath("$[?(@.id == " + o + ")].unmarkedLines").value(hasItem(1)));
        send(post("/api/marking/orders/" + o + "/start"), marker, "")
                .andExpect(jsonPath("$.lines.length()").value(1))
                .andExpect(jsonPath("$.unmarkedLines.length()").value(1))
                .andExpect(jsonPath("$.unmarkedLines[0].lineId").value(plainLine))
                .andExpect(jsonPath("$.unmarkedLines[0].confirmed").value(false))
                .andExpect(jsonPath("$.unmarkedOnly").value(false))
                .andExpect(jsonPath("$.complete").value(false));
        // Yig'ishdan to'g'ridan-to'g'ri Tekshiruvga o'tish yo'q
        send(post("/api/orders/" + o + "/check"), keeper, "{\"checkedLines\":[" + markedLine + "," + plainLine + "],\"places\":1}")
                .andExpect(status().isConflict());
        send(post("/api/marking/orders/" + o + "/scan"), marker, mark(ean, "AR1", "LOT-AR", "D")).andExpect(status().isOk());
        send(post("/api/marking/orders/" + o + "/scan"), marker, mark(ean, "AR2", "LOT-AR", "D")).andExpect(status().isOk());
        // Kodlar to'liq, lekin markirovkasiz qator tasdiqlanmagan
        send(post("/api/marking/orders/" + o + "/finish"), marker, "")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("marking.unconfirmed"));
        // Markirovkali qatorni «tasdiqlab» bo'lmaydi; boshqa xodim — yo'q
        send(post("/api/marking/orders/" + o + "/confirm"), marker, "{\"lineIds\":[" + markedLine + "]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("marking.confirmMarkedLine"));
        send(post("/api/marking/orders/" + o + "/confirm"), picker, "{\"lineIds\":[" + plainLine + "]}").andExpect(status().isForbidden());
        send(post("/api/marking/orders/" + o + "/confirm"), loginAs("MARKER", p.branchId()), "{\"lineIds\":[" + plainLine + "]}")
                .andExpect(status().isForbidden());
        send(post("/api/marking/orders/" + o + "/confirm"), marker, "{\"lineIds\":[" + plainLine + "]}")
                .andExpect(jsonPath("$.unmarkedLines[0].confirmed").value(true))
                .andExpect(jsonPath("$.complete").value(true));
        // Takror tasdiq — o'zgarishsiz
        send(post("/api/marking/orders/" + o + "/confirm"), marker, "{\"lineIds\":[" + plainLine + "]}").andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT count(*) FROM sales_order_mark_confirm WHERE order_id = :o").param("o", o).query(Long.class).single())
                .isEqualTo(1);
        send(post("/api/marking/orders/" + o + "/finish"), marker, "").andExpect(jsonPath("$.status").value("CHECKING"));

        // Hammasi markirovkasiz — «Markirovkasiz — tasdiqlash»
        long o2 = draft(operator, order(p, c, new long[][] {{plain, 2}}));
        send(post("/api/orders/" + o2 + "/submit"), operator, "").andExpect(jsonPath("$.status").value("QUEUED"));
        send(post("/api/orders/" + o2 + "/time"), keeper, "{\"pickMinutes\":10}").andExpect(status().isOk());
        send(post("/api/orders/" + o2 + "/pick/start"), picker, "").andExpect(status().isOk());
        send(post("/api/orders/" + o2 + "/pick/finish"), picker, "{}").andExpect(jsonPath("$.status").value("MARKING"));
        long line2 = jdbc.sql("SELECT id FROM sales_order_line WHERE order_id = :o").param("o", o2).query(Long.class).single();
        send(post("/api/marking/orders/" + o2 + "/start"), marker, "")
                .andExpect(jsonPath("$.lines.length()").value(0))
                .andExpect(jsonPath("$.unmarkedOnly").value(true))
                .andExpect(jsonPath("$.complete").value(false));
        send(post("/api/marking/orders/" + o2 + "/finish"), marker, "").andExpect(jsonPath("$.code").value("marking.unconfirmed"));
        send(post("/api/marking/orders/" + o2 + "/confirm"), marker, "{\"lineIds\":[" + line2 + "]}").andExpect(jsonPath("$.complete").value(true));
        send(post("/api/marking/orders/" + o2 + "/finish"), marker, "").andExpect(jsonPath("$.status").value("CHECKING"));
        // Tasdiq o'chirilmaydi / o'zgartirilmaydi
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM sales_order_mark_confirm WHERE order_id = :o").param("o", o2).update())
                .hasMessageContaining("oʻchirilmaydi");
    }

    /** Buyurtmani «Hujjatlashtirilmoqda»gacha olib boradi (joylar soni bilan). */
    private long documenting(Place p, long c, long prod, int qty, int places, String delivery, Cookie operator, Cookie keeper, Cookie picker)
            throws Exception {
        long o = draft(operator, order(p, c, new long[][] {{prod, qty}}).replace("\"DELIVERY\"", "\"" + delivery + "\""));
        send(post("/api/orders/" + o + "/submit"), operator, "").andExpect(jsonPath("$.status").value("QUEUED"));
        send(post("/api/orders/" + o + "/time"), keeper, "{\"pickMinutes\":10}").andExpect(status().isOk());
        send(post("/api/orders/" + o + "/pick/start"), picker, "").andExpect(status().isOk());
        send(post("/api/orders/" + o + "/pick/finish"), picker, "{}").andExpect(jsonPath("$.status").value("MARKING"));
        passMarking(p.branchId(), o);
        long line = jdbc.sql("SELECT id FROM sales_order_line WHERE order_id = :o").param("o", o).query(Long.class).single();
        send(post("/api/orders/" + o + "/check"), keeper, "{\"checkedLines\":[" + line + "],\"places\":" + places + "}")
                .andExpect(jsonPath("$.status").value("DOCUMENTING"));
        return o;
    }

    private String statusOf(long order) {
        return jdbc.sql("SELECT status FROM sales_order WHERE id = :o").param("o", order).query(String.class).single();
    }

    @Test
    void tripWithoutCapacityWaybillCancelAndPickup() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie picker = loginAs("PICKER", p.branchId());
        long prod = product(p, "BY Reys", "1000", 50, null, null);
        long o1 = documenting(p, c, prod, 2, 2, "DELIVERY", operator, keeper, picker);
        long o2 = documenting(p, c, prod, 3, 2, "DELIVERY", operator, keeper, picker);
        long o3 = documenting(p, c, prod, 1, 1, "PICKUP", operator, keeper, picker);
        String plate = "01" + ThreadLocalRandom.current().nextInt(100_000, 999_999);
        long vehicle = jdbc.sql("INSERT INTO vehicle (branch_id, plate_number, model, has_refrigerator) VALUES (:b, :p, 'Damas', true) RETURNING id")
                .param("b", p.branchId()).param("p", plate).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :l, 'Haydovchi Sinov', id, :b, 'x', false FROM role WHERE code = 'DRIVER'""")
                .param("l", "drv" + UUID.randomUUID().toString().substring(0, 8)).param("b", p.branchId()).update();
        long driver = jdbc.sql("SELECT id FROM employee WHERE full_name = 'Haydovchi Sinov' AND branch_id = :b").param("b", p.branchId())
                .query(Long.class).single();

        mvc.perform(get("/api/trips/ready").cookie(keeper))
                .andExpect(jsonPath("$[*].id", hasItem((int) o1)))
                .andExpect(jsonPath("$[?(@.id == " + o1 + ")].lines").value(hasItem(1)))
                .andExpect(jsonPath("$[?(@.id == " + o1 + ")].qty").value(hasItem(2)))
                .andExpect(jsonPath("$[?(@.id == " + o1 + ")].shortQty").value(hasItem(0)))
                .andExpect(jsonPath("$[?(@.id == " + o1 + ")].controlled").value(hasItem(false)))
                .andExpect(jsonPath("$[?(@.id == " + o1 + ")].readyAt").exists());
        mvc.perform(get("/api/trips/options").param("branchId", String.valueOf(p.branchId())).cookie(keeper))
                .andExpect(jsonPath("$.vehicles[0].hasRefrigerator").value(true))
                .andExpect(jsonPath("$.drivers[0].fullName").value("Haydovchi Sinov"));
        String body = "{\"vehicleId\":" + vehicle + ",\"driverId\":" + driver + ",\"tripDate\":\"" + today() + "\",\"orderIds\":[" + o1 + "," + o2 + "]}";
        send(post("/api/trips"), picker, body).andExpect(status().isForbidden());
        // E5 (07.11): reysni faqat Ombor mudiri tuzadi — Operator va Filial rahbari emas
        send(post("/api/trips"), operator, body).andExpect(status().isForbidden());
        send(post("/api/trips"), loginAs("BRANCH_MANAGER", p.branchId()), body).andExpect(status().isForbidden());
        send(post("/api/trips"), keeper, body.replace("[" + o1 + "," + o2 + "]", "[" + o1 + "," + o3 + "]"))
                .andExpect(jsonPath("$.code").value("trip.pickupInTrip"));
        MvcResult trip = send(post("/api/trips"), keeper, body)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number", matchesPattern("RS-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.status").value("PLANNED"))
                .andExpect(jsonPath("$.places").value(4))
                .andExpect(jsonPath("$.stops[0].waybillNumber", matchesPattern("NK-[A-Z]{3}-\\d{6}")))
                .andReturn();
        long t1 = id(trip);
        assertThat(statusOf(o1)).isEqualTo("LOADING");
        mvc.perform(get("/api/trips").param("branchId", String.valueOf(p.branchId())).cookie(keeper))
                .andExpect(jsonPath("$[?(@.id == " + t1 + ")].plateNumber").value(hasItem(plate)))
                .andExpect(jsonPath("$[?(@.id == " + t1 + ")].refrigerator").value(hasItem(true)))
                .andExpect(jsonPath("$[?(@.id == " + t1 + ")].marked").value(hasItem(0)));
        String nk1 = jdbc.sql("SELECT waybill_number FROM sales_order WHERE id = :o").param("o", o1).query(String.class).single();
        // Nakladnoy — server PDF (raqam, mahsulot, miqdor, imzolar)
        assertThat(pdfText("/api/orders/" + o1 + "/waybill/pdf", keeper)).contains("Nakladnoy", nk1, "BY Reys", "Jami", "Qabul qildi")
                .doesNotContain("Takroriy nusxa");
        // Sozlamalar → Chop etish: yuk xati «Narxlarsiz» varianti va takroriy nusxa belgisi
        jdbc.sql("UPDATE print_setting SET invoice_variant = 'NOPRICE' WHERE id = 1").update();
        try {
            assertThat(pdfText("/api/orders/" + o1 + "/waybill/pdf", keeper)).contains(nk1, "Takroriy nusxa · 2").doesNotContain("Narx (QQS bilan)");
            jdbc.sql("UPDATE print_setting SET reprint_mark = false WHERE id = 1").update();
            assertThat(pdfText("/api/orders/" + o1 + "/waybill/pdf", keeper)).contains(nk1).doesNotContain("Takroriy nusxa");
        } finally {
            jdbc.sql("UPDATE print_setting SET invoice_variant = 'PRICE', reprint_mark = true WHERE id = 1").update();
        }
        assertThat(jdbc.sql("SELECT copies FROM print_log WHERE doc_type = 'NK' AND doc_number = :n").param("n", nk1).query(Integer.class).single())
                .isEqualTo(3);
        // Terish varag'i — server PDF (bir necha buyurtma jamlanadi)
        assertThat(pdfText("/api/orders/pick-sheet/pdf?ids=" + o1 + "," + o2, keeper)).contains("Terish varagʻi", "BY Reys", "2 buyurtma");
        mvc.perform(get("/api/orders/pick-sheet/pdf?ids=").cookie(keeper)).andExpect(status().is4xxClientError());
        // Yo'l varaqasi — server PDF
        assertThat(pdfText("/api/trips/" + t1 + "/sheet/pdf", keeper)).contains("Yoʻl varaqasi", nk1, "Haydovchi Sinov", "Shundan naqd");

        // Haydovchi band; bekor qilish → buyurtmalar qaytadi, NK saqlanadi
        long o4 = documenting(p, c, prod, 1, 1, "DELIVERY", operator, keeper, picker);
        mvc.perform(get("/api/orders/" + o4 + "/waybill/pdf").cookie(keeper))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("order.waybillNotIssued"));
        send(post("/api/trips"), keeper, body.replace("[" + o1 + "," + o2 + "]", "[" + o4 + "]"))
                .andExpect(jsonPath("$.code").value("trip.driverBusy"));
        send(post("/api/trips/" + t1 + "/cancel"), keeper, "{\"reason\":\"Mashina buzildi\"}").andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(statusOf(o1)).isEqualTo("DOCUMENTING");
        long t2 = id(send(post("/api/trips"), keeper, body.replace("[" + o1 + "," + o2 + "]", "[" + o1 + "]")).andExpect(status().isCreated())
                .andReturn());
        assertThat(jdbc.sql("SELECT waybill_number FROM sales_order WHERE id = :o").param("o", o1).query(String.class).single()).isEqualTo(nk1);

        // Reysdagi yagona buyurtma bekor qilinsa — reys ham bekor
        send(post("/api/orders/" + o1 + "/cancel"), keeper, "{\"reason\":\"Mijoz voz kechdi\"}").andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(jdbc.sql("SELECT status FROM trip WHERE id = :t").param("t", t2).query(String.class).single()).isEqualTo("CANCELLED");

        // O'zi olib ketadi — reyssiz nakladnoy
        send(post("/api/trips/pickup"), keeper, "{\"orderId\":" + o2 + "}").andExpect(jsonPath("$.code").value("trip.notPickup"));
        send(post("/api/trips/pickup"), keeper, "{\"orderId\":" + o3 + "}").andExpect(jsonPath("$.waybillNumber", matchesPattern("NK-[A-Z]{3}-\\d{6}")));
        assertThat(statusOf(o3)).isEqualTo("LOADING");
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM trip WHERE id = :t").param("t", t1).update()).hasMessageContaining("oʻchirilmaydi");
    }

    @Test
    void addAndRemoveOrdersOnPlannedTrip() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie picker = loginAs("PICKER", p.branchId());
        long prod = product(p, "BY Reys tahrir", "1000", 50, null, null);
        long o1 = documenting(p, c, prod, 1, 2, "DELIVERY", operator, keeper, picker);
        long o2 = documenting(p, c, prod, 1, 2, "DELIVERY", operator, keeper, picker);
        long o3 = documenting(p, c, prod, 1, 2, "DELIVERY", operator, keeper, picker);
        long o4 = documenting(p, c, prod, 1, 1, "PICKUP", operator, keeper, picker);
        long vehicle = jdbc.sql("INSERT INTO vehicle (branch_id, plate_number, model) VALUES (:b, :p, 'Damas') RETURNING id")
                .param("b", p.branchId()).param("p", "01" + ThreadLocalRandom.current().nextInt(100_000, 999_999)).query(Long.class).single();
        String login = "drv" + UUID.randomUUID().toString().substring(0, 8);
        long driver = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :l, 'Haydovchi Tahrir', id, :b, 'x', false FROM role WHERE code = 'DRIVER' RETURNING id""")
                .param("l", login).param("b", p.branchId()).query(Long.class).single();
        long t = id(send(post("/api/trips"), keeper,
                "{\"vehicleId\":" + vehicle + ",\"driverId\":" + driver + ",\"tripDate\":\"" + today() + "\",\"orderIds\":[" + o1 + "]}")
                .andExpect(status().isCreated()).andReturn());

        // Qo'shish: ruxsat, «O'zi olib ketadi» emas (E6: sig'im tekshiruvi yo'q)
        send(post("/api/trips/" + t + "/orders"), picker, "{\"orderIds\":[" + o2 + "]}").andExpect(status().isForbidden());
        send(post("/api/trips/" + t + "/orders"), operator, "{\"orderIds\":[" + o2 + "]}").andExpect(status().isForbidden());
        send(post("/api/trips/" + t + "/orders"), keeper, "{\"orderIds\":[" + o4 + "]}").andExpect(jsonPath("$.code").value("trip.pickupInTrip"));
        assertThat(statusOf(o2)).isEqualTo("DOCUMENTING");
        send(post("/api/trips/" + t + "/orders"), keeper, "{\"orderIds\":[" + o2 + "]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.places").value(4))
                .andExpect(jsonPath("$.stops.length()").value(2))
                .andExpect(jsonPath("$.stops[1].seq").value(2))
                .andExpect(jsonPath("$.stops[1].waybillNumber", matchesPattern("NK-[A-Z]{3}-\\d{6}")));
        assertThat(statusOf(o2)).isEqualTo("LOADING");
        // Boshqa reysdagi buyurtma qo'shilmaydi (holati «Yuklanmoqda»)
        send(post("/api/trips/" + t + "/orders"), keeper, "{\"orderIds\":[" + o2 + "]}").andExpect(status().is4xxClientError());

        // Olib tashlash: haydovchi qabul qilgan buyurtma — yo'q; qabul qilinmagan — «Hujjatlashtirilmoqda»ga, NK saqlanadi
        jdbc.sql("UPDATE trip_stop SET loaded_at = now() WHERE trip_id = :t AND order_id = :o").param("t", t).param("o", o1).update();
        send(post("/api/trips/" + t + "/orders/" + o1 + "/remove"), keeper, "{\"reason\":\"Joy yetmadi\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("trip.stopLoaded"));
        String nk2 = jdbc.sql("SELECT waybill_number FROM sales_order WHERE id = :o").param("o", o2).query(String.class).single();
        send(post("/api/trips/" + t + "/orders/" + o2 + "/remove"), keeper, "{\"reason\":\"\"}").andExpect(status().isBadRequest());
        send(post("/api/trips/" + t + "/orders/" + o2 + "/remove"), keeper, "{\"reason\":\"Mijoz ertaga oladi\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.places").value(2))
                .andExpect(jsonPath("$.stops.length()").value(1));
        assertThat(statusOf(o2)).isEqualTo("DOCUMENTING");
        assertThat(jdbc.sql("SELECT waybill_number FROM sales_order WHERE id = :o").param("o", o2).query(String.class).single()).isEqualTo(nk2);
        // Oxirgi buyurtma olib tashlanmaydi; qayta qo'shish mumkin (yangi tartib raqami)
        send(post("/api/trips/" + t + "/orders/" + o1 + "/remove"), keeper, "{\"reason\":\"x\"}").andExpect(jsonPath("$.code").value("trip.stopLoaded"));
        jdbc.sql("UPDATE trip_stop SET loaded_at = NULL WHERE trip_id = :t AND order_id = :o").param("t", t).param("o", o1).update();
        send(post("/api/trips/" + t + "/orders/" + o1 + "/remove"), keeper, "{\"reason\":\"x\"}").andExpect(jsonPath("$.code").value("trip.lastOrder"));
        send(post("/api/trips/" + t + "/orders"), keeper, "{\"orderIds\":[" + o2 + "]}")
                .andExpect(jsonPath("$.stops[1].seq").value(3)).andExpect(jsonPath("$.places").value(4));

        // Bekor qilingan reys o'zgarmaydi
        send(post("/api/trips/" + t + "/cancel"), keeper, "{\"reason\":\"Mashina buzildi\"}").andExpect(jsonPath("$.status").value("CANCELLED"));
        send(post("/api/trips/" + t + "/orders"), keeper, "{\"orderIds\":[" + o3 + "]}").andExpect(jsonPath("$.code").value("trip.notEditable"));
    }

    @Test
    void driverLoadsStartsTripAndSaleWritesStockDebtAndInvoice() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie picker = loginAs("PICKER", p.branchId());
        Cookie driverSession = loginAs("DRIVER", p.branchId());
        long driver = jdbc.sql("SELECT max(id) FROM employee WHERE full_name = 'Sinov DRIVER' AND branch_id = :b").param("b", p.branchId())
                .query(Long.class).single();
        long prod = product(p, "BY Sotuv", "1000", 20, null, null);
        long shipping = zoneOf(p.warehouseId(), "SHIPPING");
        long o1 = documenting(p, c, prod, 2, 2, "DELIVERY", operator, keeper, picker);
        long vehicle = jdbc.sql("INSERT INTO vehicle (branch_id, plate_number, model) VALUES (:b, :p, 'Labo') RETURNING id")
                .param("b", p.branchId()).param("p", "10" + ThreadLocalRandom.current().nextInt(100_000, 999_999)).query(Long.class).single();
        MvcResult t = send(post("/api/trips"), keeper, "{\"vehicleId\":" + vehicle + ",\"driverId\":" + driver + ",\"tripDate\":\"" + today()
                + "\",\"orderIds\":[" + o1 + "]}").andExpect(status().isCreated()).andReturn();
        long trip = id(t);
        long stop = ((Number) JsonPath.read(t.getResponse().getContentAsString(), "$.stops[0].id")).longValue();

        mvc.perform(get("/api/trips/mine").cookie(driverSession)).andExpect(jsonPath("$.id").value(trip));
        mvc.perform(get("/api/trips/mine").cookie(keeper)).andExpect(status().isForbidden());
        send(post("/api/trips/" + trip + "/start"), driverSession, "").andExpect(jsonPath("$.code").value("trip.notLoaded"));
        send(post("/api/trips/" + trip + "/stops/" + stop + "/load"), driverSession, "{\"places\":3}")
                .andExpect(jsonPath("$.code").value("trip.placesMismatch"));
        send(post("/api/trips/" + trip + "/stops/" + stop + "/load"), driverSession, "{\"places\":2}")
                .andExpect(jsonPath("$.stops[0].loadedAt").isNotEmpty());
        assertThat(qtyIn(shipping, prod)).isEqualTo(2);

        // Reysni boshlash: sotuv + HF, qoldiq Jo'natish zonasidan chiqadi, mijoz qarzi oshadi
        send(post("/api/trips/" + trip + "/start"), driverSession, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sales[0]", matchesPattern("SV-[A-Z]{3}-\\d{6}")));
        assertThat(statusOf(o1)).isEqualTo("IN_TRANSIT");
        mvc.perform(get("/api/orders/" + o1).cookie(keeper))
                .andExpect(jsonPath("$.holder").value("Haydovchi · Sinov DRIVER"))
                .andExpect(jsonPath("$.documents.saleStatus").value("POSTED"));
        assertThat(qtyIn(shipping, prod)).isZero();
        assertThat(qtyIn(p.main(), prod)).isEqualTo(18);
        var sale = jdbc.sql("SELECT invoice_number, total::text AS total, vat_total::text AS vat, cost_total::text AS cost FROM sale WHERE order_id = :o")
                .param("o", o1).query().singleRow();
        assertThat((String) sale.get("invoice_number")).matches("HF-[A-Z]{3}-\\d{6}");
        assertThat(sale.get("total")).isEqualTo("2000.00");
        assertThat(sale.get("vat")).isEqualTo("214.29");
        assertThat(sale.get("cost")).isEqualTo("200.00");
        assertThat(jdbc.sql("SELECT sum(amount)::text FROM party_ledger WHERE counterparty_id = :c AND side = 'CUSTOMER'").param("c", c)
                        .query(String.class).single())
                .isEqualTo("2000.00");
        assertThat(jdbc.sql("SELECT status FROM trip WHERE id = :t").param("t", trip).query(String.class).single()).isEqualTo("IN_TRANSIT");
        send(post("/api/orders/" + o1 + "/cancel"), keeper, "{\"reason\":\"Kech\"}").andExpect(status().isConflict());
        assertThatThrownBy(() -> jdbc.sql("UPDATE sale SET total = 1 WHERE order_id = :o").param("o", o1).update()).hasMessageContaining("oʻzgarmaydi");

        // Yetkazildi: rasm majburiy, naqd ≤ summa; reys yakuni — naqd bor → «Qaytish kutilmoqda»
        send(post("/api/trips/" + trip + "/stops/" + stop + "/deliver"), driverSession, "{}").andExpect(jsonPath("$.code").value("trip.photoRequired"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/trips/" + trip + "/stops/" + stop + "/photos")
                        .file(new org.springframework.mock.web.MockMultipartFile("file", "a.txt", "text/plain", new byte[] {1}))
                        .with(csrf()).cookie(driverSession))
                .andExpect(status().isBadRequest());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/trips/" + trip + "/stops/" + stop + "/photos")
                        .file(new org.springframework.mock.web.MockMultipartFile("file", "a.jpg", "image/jpeg", new byte[] {1, 2, 3}))
                        .with(csrf()).cookie(driverSession))
                .andExpect(status().isCreated());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/trips/" + trip + "/stops/" + stop + "/photos")
                        .file(new org.springframework.mock.web.MockMultipartFile("file", "imzo.png", "image/png", new byte[] {4, 5}))
                        .param("signature", "true")
                        .with(csrf()).cookie(driverSession))
                .andExpect(status().isCreated());
        send(post("/api/trips/" + trip + "/stops/" + stop + "/deliver"), driverSession, "{\"cash\":\"5000\"}")
                .andExpect(jsonPath("$.code").value("trip.cashInvalid"));
        send(post("/api/trips/" + trip + "/finish"), driverSession, "").andExpect(jsonPath("$.code").value("trip.stopsOpen"));
        send(post("/api/trips/" + trip + "/stops/" + stop + "/deliver"), driverSession, "{\"cash\":\"2000\"}")
                .andExpect(jsonPath("$.stops[0].outcome").value("DELIVERED"))
                .andExpect(jsonPath("$.stops[0].cashCollected").value("2000.00"))
                .andExpect(jsonPath("$.stops[0].photos").value(1))
                .andExpect(jsonPath("$.stops[0].signed").value(true));
        assertThat(statusOf(o1)).isEqualTo("DELIVERED");
        send(post("/api/trips/" + trip + "/finish"), driverSession, "").andExpect(jsonPath("$.status").value("RETURN_WAIT"));

        // Yetkazilmadi: sotuv bekor, qarz teskari, tovar «Qaytmoqda» → Ombor mudiri sanab Karantinga (kam kelsa — muammo)
        Cookie driver2 = loginAs("DRIVER", p.branchId());
        long driver2Id = jdbc.sql("SELECT max(id) FROM employee WHERE full_name = 'Sinov DRIVER' AND branch_id = :b").param("b", p.branchId())
                .query(Long.class).single();
        long o3 = documenting(p, c, prod, 2, 1, "DELIVERY", operator, keeper, picker);
        MvcResult t3 = send(post("/api/trips"), keeper, "{\"vehicleId\":" + vehicle + ",\"driverId\":" + driver2Id + ",\"tripDate\":\"" + today()
                + "\",\"orderIds\":[" + o3 + "]}").andExpect(status().isCreated()).andReturn();
        long trip3 = id(t3);
        long stop3 = ((Number) JsonPath.read(t3.getResponse().getContentAsString(), "$.stops[0].id")).longValue();
        send(post("/api/trips/" + trip3 + "/stops/" + stop3 + "/load"), driver2, "{\"places\":1}").andExpect(status().isOk());
        send(post("/api/trips/" + trip3 + "/start"), driver2, "").andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT sum(amount)::text FROM party_ledger WHERE counterparty_id = :c AND side = 'CUSTOMER'").param("c", c)
                        .query(String.class).single())
                .isEqualTo("4000.00");
        send(post("/api/trips/" + trip3 + "/stops/" + stop3 + "/undeliver"), driver2, "{\"reason\":\"Dorixona yopiq\"}")
                .andExpect(jsonPath("$.stops[0].outcome").value("UNDELIVERED"));
        assertThat(statusOf(o3)).isEqualTo("UNDELIVERED");
        assertThat(jdbc.sql("SELECT status FROM sale WHERE order_id = :o").param("o", o3).query(String.class).single()).isEqualTo("CANCELLED");
        assertThat(jdbc.sql("SELECT sum(amount)::text FROM party_ledger WHERE counterparty_id = :c AND side = 'CUSTOMER'").param("c", c)
                        .query(String.class).single())
                .isEqualTo("2000.00");
        send(post("/api/trips/" + trip3 + "/finish"), driver2, "").andExpect(jsonPath("$.status").value("RETURN_WAIT"));

        // «Qaytish kutilmoqda»da qotib qolgan reys (T12-audit №23): 4 soatdan keyin — Ombor mudiriga (tovar), kassirga (pul), haydovchiga
        java.time.Instant now = java.time.Instant.now();
        tripReminders.run(now);
        assertThat(jdbc.sql("SELECT count(*) FROM notification WHERE dedup_key LIKE :k").param("k", "trip-return-%-" + trip3 + "-%")
                        .query(Long.class).single())
                .isZero();
        java.time.Instant later = now.plus(java.time.Duration.ofHours(5));
        tripReminders.run(later);
        String day = java.time.LocalDate.ofInstant(later, java.time.ZoneId.of("Asia/Tashkent")).toString();
        assertThat(jdbc.sql("""
                        SELECT count(*) FROM notification n JOIN employee e ON e.id = n.employee_id JOIN role r ON r.id = e.role_id
                        WHERE n.dedup_key = :k AND r.code = 'WAREHOUSE_MANAGER' AND e.branch_id = :b""")
                        .param("k", "trip-return-goods-" + trip3 + "-" + day)
                        .param("b", p.branchId())
                        .query(Long.class).single())
                .isPositive();
        assertThat(jdbc.sql("SELECT body FROM notification WHERE dedup_key = :k AND employee_id = :d")
                        .param("k", "trip-return-cash-" + trip + "-" + day)
                        .param("d", driver)
                        .query(String.class).single())
                .contains("2.000,00 soʻm");
        assertThat(jdbc.sql("SELECT count(*) FROM notification WHERE dedup_key = :k").param("k", "trip-return-cash-" + trip3 + "-" + day)
                        .query(Long.class).single())
                .isZero();
        // Shu kunda qayta tekshiruv — takrorlanmaydi.
        tripReminders.run(later.plusSeconds(60));
        assertThat(jdbc.sql("SELECT count(*) FROM notification WHERE dedup_key = :k AND employee_id = :d")
                        .param("k", "trip-return-goods-" + trip3 + "-" + day)
                        .param("d", driver2Id)
                        .query(Long.class).single())
                .isEqualTo(1);
        long ret = jdbc.sql("SELECT id FROM sales_return_pending WHERE order_id = :o").param("o", o3).query(Long.class).single();
        mvc.perform(get("/api/orders/returns").cookie(keeper)).andExpect(jsonPath("$[*].id", hasItem((int) ret)));
        send(post("/api/orders/returns/" + ret + "/accept"), keeper, "{\"receivedQty\":3}").andExpect(status().isBadRequest());
        send(post("/api/orders/returns/" + ret + "/accept"), keeper, "{\"receivedQty\":1}").andExpect(status().isOk());
        assertThat(qtyIn(p.quarantine(), prod)).isEqualTo(1);
        assertThat(jdbc.sql("SELECT count(*) FROM sales_order_issue WHERE order_id = :o AND reason = 'SHORTAGE'").param("o", o3).query(Long.class)
                        .single())
                .isEqualTo(1);

        // O'zi olib ketadi: nakladnoy → mijoz olib chiqdi
        long o2 = documenting(p, c, prod, 1, 1, "PICKUP", operator, keeper, picker);
        send(post("/api/trips/pickup/" + o2 + "/handover"), keeper, "").andExpect(status().isConflict());
        send(post("/api/trips/pickup"), keeper, "{\"orderId\":" + o2 + "}").andExpect(status().isOk());
        send(post("/api/trips/pickup/" + o2 + "/handover"), keeper, "").andExpect(jsonPath("$.sale", matchesPattern("SV-[A-Z]{3}-\\d{6}")));
        assertThat(statusOf(o2)).isEqualTo("IN_TRANSIT");
        // «Topshirilgan» (prototip Shipping): o'zi olib ketdi — reyssiz
        mvc.perform(get("/api/trips/handed").cookie(keeper))
                .andExpect(jsonPath("$[?(@.orderId == " + o2 + ")].method").value(hasItem("PICKUP")));
        assertThat(jdbc.sql("SELECT sum(amount)::text FROM party_ledger WHERE counterparty_id = :c AND side = 'CUSTOMER'").param("c", c)
                        .query(String.class).single())
                .isEqualTo("3000.00");

        // Haydovchidagi pul → Kassir qabul qiladi: MT o'tkaziladi (eng eski qarzdan), kassaga tushadi, reys «Yakunlangan»
        Cookie cashier = loginAs("CASHIER", p.branchId());
        MvcResult accounts = mvc.perform(get("/api/money-accounts").param("branchId", String.valueOf(p.branchId())).cookie(cashier))
                .andExpect(jsonPath("$[0].kind").value("CASH"))
                .andExpect(jsonPath("$[1].kind").value("TERMINAL"))
                .andReturn();
        long kassa = ((Number) JsonPath.read(accounts.getResponse().getContentAsString(), "$[0].id")).longValue();
        long terminal = ((Number) JsonPath.read(accounts.getResponse().getContentAsString(), "$[1].id")).longValue();
        mvc.perform(get("/api/trips/cash").cookie(cashier)).andExpect(jsonPath("$[?(@.stopId == " + stop + ")].amount").value(hasItem("2000.00")));
        mvc.perform(get("/api/trips/cash").cookie(driverSession)).andExpect(status().isForbidden());
        send(post("/api/trips/cash/" + stop + "/accept"), cashier, "{\"accountId\":" + terminal + "}")
                .andExpect(jsonPath("$.code").value("payment.cashAccountRequired"));
        send(post("/api/trips/cash/" + stop + "/accept"), cashier, "{\"accountId\":" + kassa + "}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.payment", matchesPattern("MT-[A-Z]{3}-\\d{6}")));
        send(post("/api/trips/cash/" + stop + "/accept"), cashier, "{\"accountId\":" + kassa + "}")
                .andExpect(jsonPath("$.code").value("trip.cashNotFound"));
        assertThat(jdbc.sql("SELECT sum(amount)::text FROM party_ledger WHERE counterparty_id = :c AND side = 'CUSTOMER'").param("c", c)
                        .query(String.class).single())
                .isEqualTo("1000.00");
        assertThat(jdbc.sql("SELECT balance::text FROM money_account WHERE id = :a").param("a", kassa).query(String.class).single())
                .isEqualTo("2000.00");
        assertThat(jdbc.sql("SELECT status FROM trip WHERE id = :t").param("t", trip).query(String.class).single()).isEqualTo("DONE");
        // Haydovchi paneli «Yakunlangan reyslar» (SPEC 5.4): faqat o'z reyslari; faol reys (trip3 — qaytish kutilmoqda) yo'q
        mvc.perform(get("/api/trips/mine/history").cookie(driverSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(trip))
                .andExpect(jsonPath("$[0].status").value("DONE"))
                .andExpect(jsonPath("$[?(@.id == " + trip3 + ")]").isEmpty());
        mvc.perform(get("/api/trips/mine/history").cookie(driver2)).andExpect(jsonPath("$[?(@.id == " + trip + ")]").isEmpty());
        mvc.perform(get("/api/trips/mine/history").cookie(keeper)).andExpect(status().isForbidden());
    }

    @Test
    void partialDeliveryWritesReturnAtSalePriceReducesDebtAndClosesTripAfterAcceptance() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie picker = loginAs("PICKER", p.branchId());
        Cookie driverSession = loginAs("DRIVER", p.branchId());
        long driver = jdbc.sql("SELECT max(id) FROM employee WHERE full_name = 'Sinov DRIVER' AND branch_id = :b").param("b", p.branchId())
                .query(Long.class).single();
        long prod = product(p, "BY Qisman", "1000", 20, null, null);
        long o = documenting(p, c, prod, 5, 1, "DELIVERY", operator, keeper, picker);
        long vehicle = jdbc.sql("INSERT INTO vehicle (branch_id, plate_number, model) VALUES (:b, :p, 'Labo') RETURNING id")
                .param("b", p.branchId()).param("p", "20" + ThreadLocalRandom.current().nextInt(100_000, 999_999)).query(Long.class).single();
        MvcResult t = send(post("/api/trips"), keeper, "{\"vehicleId\":" + vehicle + ",\"driverId\":" + driver + ",\"tripDate\":\"" + today()
                + "\",\"orderIds\":[" + o + "]}").andExpect(status().isCreated()).andReturn();
        long trip = id(t);
        long stop = ((Number) JsonPath.read(t.getResponse().getContentAsString(), "$.stops[0].id")).longValue();
        send(post("/api/trips/" + trip + "/stops/" + stop + "/load"), driverSession, "{\"places\":1}").andExpect(status().isOk());
        send(post("/api/trips/" + trip + "/start"), driverSession, "").andExpect(status().isOk());

        MvcResult lines = mvc.perform(get("/api/trips/" + trip + "/stops/" + stop + "/lines").cookie(driverSession))
                .andExpect(jsonPath("$[0].qty").value(5))
                .andExpect(jsonPath("$[0].price").value("1000.00"))
                .andReturn();
        mvc.perform(get("/api/trips/" + trip + "/stops/" + stop + "/lines").cookie(keeper)).andExpect(status().isForbidden());
        long saleLine = ((Number) JsonPath.read(lines.getResponse().getContentAsString(), "$[0].id")).longValue();
        String path = "/api/trips/" + trip + "/stops/" + stop + "/partial";
        String two = "{\"reason\":\"2 tasini olmadi\",\"lines\":[{\"saleLineId\":" + saleLine + ",\"qty\":2}]";

        // Rasm majburiy; hammasi qaytsa — «Yetkazilmadi»; 0 — xato; ko'p — xato
        send(post(path), driverSession, two + "}").andExpect(jsonPath("$.code").value("trip.photoRequired"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/trips/" + trip + "/stops/" + stop + "/photos")
                        .file(new org.springframework.mock.web.MockMultipartFile("file", "a.jpg", "image/jpeg", new byte[] {1, 2, 3}))
                        .with(csrf()).cookie(driverSession))
                .andExpect(status().isCreated());
        send(post(path), driverSession, two.replace("\"qty\":2", "\"qty\":5") + "}").andExpect(jsonPath("$.code").value("partial.allReturned"));
        send(post(path), driverSession, two.replace("\"qty\":2", "\"qty\":0") + "}").andExpect(jsonPath("$.code").value("partial.nothingReturned"));
        send(post(path), driverSession, two.replace("\"qty\":2", "\"qty\":6") + "}").andExpect(jsonPath("$.code").value("partial.qtyInvalid"));
        send(post(path), driverSession, two.replace("" + saleLine, "" + (saleLine + 100_000)) + "}")
                .andExpect(jsonPath("$.code").value("partial.qtyInvalid"));
        // Naqd qolgan summadan (3000) ko'p — butun amal qaytadi (QM yozilmaydi)
        send(post(path), driverSession, two + ",\"cash\":\"3500\"}").andExpect(jsonPath("$.code").value("trip.cashInvalid"));
        assertThat(jdbc.sql("SELECT count(*) FROM sales_return WHERE order_id = :o").param("o", o).query(Long.class).single()).isZero();
        assertThat(statusOf(o)).isEqualTo("IN_TRANSIT");

        send(post(path), driverSession, two + ",\"cash\":\"1000\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stops[0].outcome").value("PARTIAL"))
                .andExpect(jsonPath("$.stops[0].returnNumber", matchesPattern("QM-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.stops[0].returnTotal").value("2000.00"));
        assertThat(statusOf(o)).isEqualTo("DELIVERED");
        mvc.perform(get("/api/orders/" + o).cookie(keeper))
                .andExpect(jsonPath("$.documents.waybillNumber", matchesPattern("NK-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.documents.saleNumber", matchesPattern("SV-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.documents.invoiceNumber", matchesPattern("HF-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.documents.returnNumber", matchesPattern("QM-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.documents.returnTotal").value("2000.00"))
                .andExpect(jsonPath("$.documents.tripNumber", matchesPattern("RS-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.documents.driver").value("Sinov DRIVER"))
                .andExpect(jsonPath("$.holder").value("Yakunlangan"));
        // Hisob-faktura (chop etish, SPEC 300): sotuv qatorlari QQS bilan, tannarxsiz; PDF ham
        var sv = jdbc.sql("SELECT invoice_number, total::text AS total, vat_total::text AS vat, (total - vat_total)::text AS net FROM sale "
                        + "WHERE order_id = :o").param("o", o).query().singleRow();
        mvc.perform(get("/api/orders/" + o + "/invoice").cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.invoiceNumber").value(sv.get("invoice_number")))
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.total").value(sv.get("total")))
                .andExpect(jsonPath("$.vatTotal").value(sv.get("vat")))
                .andExpect(jsonPath("$.netTotal").value(sv.get("net")))
                .andExpect(jsonPath("$.lines[0].qty").value(5))
                .andExpect(jsonPath("$.lines[0].vatRate").value("12"))
                .andExpect(jsonPath("$.lines[0].cost").doesNotExist());
        mvc.perform(get("/api/orders/" + o + "/invoice").cookie(driverSession)).andExpect(status().isForbidden());
        assertThat(pdfText("/api/orders/" + o + "/invoice/pdf", keeper)).contains("Hisob-faktura", (String) sv.get("invoice_number"), "QQS", "Jami", "Rahbar")
                .doesNotContain("Takroriy nusxa");
        assertThat(pdfText("/api/orders/" + o + "/invoice/pdf", keeper)).contains("Takroriy nusxa · 2");
        var qm = jdbc.sql("SELECT total::text AS total, vat_total::text AS vat, cost_total::text AS cost FROM sales_return WHERE order_id = :o")
                .param("o", o).query().singleRow();
        assertThat(qm.get("total")).isEqualTo("2000.00");
        assertThat(qm.get("vat")).isEqualTo("214.29");
        assertThat(qm.get("cost")).isEqualTo("200.00");
        // Sotuv o'zgarmaydi (5 000), qarz = 5 000 − 2 000
        assertThat(jdbc.sql("SELECT total::text FROM sale WHERE order_id = :o").param("o", o).query(String.class).single()).isEqualTo("5000.00");
        assertThat(jdbc.sql("SELECT sum(amount)::text FROM party_ledger WHERE counterparty_id = :c AND side = 'CUSTOMER'").param("c", c)
                        .query(String.class).single())
                .isEqualTo("3000.00");
        send(post(path), driverSession, two + "}").andExpect(jsonPath("$.code").value("trip.stopDone"));
        assertThatThrownBy(() -> jdbc.sql("UPDATE sales_return SET total = 1 WHERE order_id = :o").param("o", o).update())
                .hasMessageContaining("faqat qo");

        // Reys yakuni — qaytgan tovar kutilmoqda; Ombor mudiri sanab Karantinga qabul qilgach — «Yakunlangan»
        send(post("/api/trips/" + trip + "/finish"), driverSession, "").andExpect(jsonPath("$.status").value("RETURN_WAIT"));
        long ret = jdbc.sql("SELECT id FROM sales_return_pending WHERE order_id = :o AND return_id IS NOT NULL").param("o", o).query(Long.class).single();
        send(post("/api/orders/returns/" + ret + "/accept"), keeper, "{\"receivedQty\":2}").andExpect(status().isOk());
        assertThat(qtyIn(p.quarantine(), prod)).isEqualTo(2);
        assertThat(jdbc.sql("SELECT count(*) FROM stock_move WHERE doc_type = 'QM' AND batch_id IN (SELECT id FROM batch WHERE product_id = :p)")
                        .param("p", prod).query(Long.class).single())
                .isEqualTo(1);
        // Naqd (1 000) hali qabul qilinmagan — reys yopilmaydi
        assertThat(jdbc.sql("SELECT status FROM trip WHERE id = :t").param("t", trip).query(String.class).single()).isEqualTo("RETURN_WAIT");

        // Kassa (prototip `Cash`): reys bo'yicha qabul — kam sanalsa izoh majburiy, MT sanalgan summaga yoziladi
        Cookie cashier = loginAs("CASHIER", p.branchId());
        long kassa = jdbc.sql("INSERT INTO money_account (branch_id, kind, code, name) VALUES (:b, 'CASH', :c, 'Kassa') RETURNING id")
                .param("b", p.branchId()).param("c", "K-" + UUID.randomUUID().toString().substring(0, 8)).query(Long.class).single();
        String accept = "/api/trips/" + trip + "/cash/accept";
        send(post(accept), cashier, "{\"accountId\":" + kassa + ",\"received\":\"800\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("trip.cashNoteRequired"));
        send(post(accept), cashier, "{\"accountId\":" + kassa + ",\"received\":\"-1\"}")
                .andExpect(jsonPath("$.code").value("trip.cashReceivedInvalid"));
        send(post(accept), cashier, "{\"accountId\":" + kassa + ",\"received\":\"abc\"}")
                .andExpect(jsonPath("$.code").value("trip.cashReceivedInvalid"));
        send(post(accept), driverSession, "{\"accountId\":" + kassa + ",\"received\":\"1000\"}").andExpect(status().isForbidden());
        send(post(accept), cashier, "{\"accountId\":" + kassa + ",\"received\":\"800,00\",\"note\":\"200 soʻm kam\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.expected").value("1000.00"))
                .andExpect(jsonPath("$.received").value("800.00"))
                .andExpect(jsonPath("$.diff").value("-200.00"))
                .andExpect(jsonPath("$.payments[0]", matchesPattern("MT-[A-Z]{3}-\\d{6}")));
        send(post(accept), cashier, "{\"accountId\":" + kassa + ",\"received\":\"800\",\"note\":\"x\"}")
                .andExpect(jsonPath("$.code").value("trip.cashNotFound"));
        mvc.perform(get("/api/trips/cash").cookie(cashier)).andExpect(jsonPath("$[?(@.tripId == " + trip + ")]").isEmpty());
        assertThat(jdbc.sql("SELECT sum(amount)::text FROM party_ledger WHERE counterparty_id = :c AND side = 'CUSTOMER'").param("c", c)
                        .query(String.class).single())
                .isEqualTo("2200.00");
        assertThat(jdbc.sql("SELECT diff::text || '|' || note FROM trip_cash_accept WHERE trip_id = :t").param("t", trip).query(String.class).single())
                .isEqualTo("-200.00|200 soʻm kam");
        assertThatThrownBy(() -> jdbc.sql("UPDATE trip_cash_accept SET note = 'y' WHERE trip_id = :t").param("t", trip).update())
                .hasMessageContaining("faqat qo");
        assertThat(jdbc.sql("SELECT status FROM trip WHERE id = :t").param("t", trip).query(String.class).single()).isEqualTo("DONE");
        // Kassalar ro'yxati: bugungi kirim, mas'ul, qoldiq
        mvc.perform(get("/api/cash/overview").cookie(cashier))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.today").isNotEmpty())
                .andExpect(jsonPath("$.cards[?(@.id == " + kassa + ")].todayIn").value(hasItem("800.00")))
                .andExpect(jsonPath("$.cards[?(@.id == " + kassa + ")].todayOut").value(hasItem("0.00")))
                .andExpect(jsonPath("$.cards[?(@.id == " + kassa + ")].balance").value(hasItem("800.00")))
                .andExpect(jsonPath("$.cards[*].branchId", everyItem(is((int) p.branchId()))));
        mvc.perform(get("/api/cash/overview").param("branchId", String.valueOf(p.branchId() + 100_000)).cookie(cashier))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/cash/overview").cookie(driverSession)).andExpect(status().isForbidden());
    }

    @Test
    void batchPriceAppliesByFefoPlanWithWeightedAverage() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        long a = product(p, "BY Partiya narxi", "2000", 0, null, null);
        long[] b = new long[2];
        tx.executeWithoutResult(s -> {
            b[0] = ledger.createBatch(a, "PN-1", null, LocalDate.now().plusYears(1), Money.of("1000"), false, "BQ", null);
            b[1] = ledger.createBatch(a, "PN-2", null, LocalDate.now().plusYears(2), Money.of("1000"), false, "BQ", null);
            ledger.post(new DocRef("BQ", a, "BQ-TST-" + a), List.of(Move.in(p.main(), b[0], 2), Move.in(p.main(), b[1], 5)));
        });
        long doc = jdbc.sql("""
                INSERT INTO price_change (number, branch_id, effective_from, created_by, status)
                VALUES (:n, :b, :d, :e, 'APPROVED') RETURNING id""")
                .param("n", "NO-T-" + UUID.randomUUID().toString().substring(0, 8))
                .param("b", p.branchId())
                .param("d", java.sql.Date.valueOf(today()))
                .param("e", employee())
                .query(Long.class)
                .single();
        jdbc.sql("""
                INSERT INTO batch_price (batch_id, price_type_id, branch_id, effective_from, amount, price_change_id)
                SELECT :bt, id, :b, :d, 1500, :doc FROM price_type WHERE base""")
                .param("bt", b[0])
                .param("b", p.branchId())
                .param("d", java.sql.Date.valueOf(today()))
                .param("doc", doc)
                .update();
        // 4 dona: FEFO — 2 × 1500 (PN-1, partiya narxi) + 2 × 2000 (PN-2, mahsulot narxi) → 1750
        long order = draft(operator, order(p, c, new long[][] {{a, 4}}));
        mvc.perform(get("/api/orders/" + order).cookie(operator))
                .andExpect(jsonPath("$.total").value("7000.00"))
                .andExpect(jsonPath("$.priceChanged").value(false));
        send(post("/api/orders/" + order + "/submit"), operator, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("QUEUED"))
                .andExpect(jsonPath("$.lines[0].price").value("1750.00"))
                .andExpect(jsonPath("$.total").value("7000.00"))
                .andExpect(jsonPath("$.lines[0].reserved[0].batch").value("PN-1"));
        // 1 dona — faqat PN-1 qolmadi (zahirada) → PN-2, mahsulot narxi
        long second = draft(operator, order(p, c, new long[][] {{a, 1}}));
        mvc.perform(get("/api/orders/" + second).cookie(operator)).andExpect(jsonPath("$.total").value("2000.00"));
    }

    /** Reys orqali to'liq yetkazilgan buyurtma (DELIVERED); qaytadi — buyurtma id. */
    private long delivered(Place p, long c, long prod, int qty, Cookie operator, Cookie keeper, Cookie picker) throws Exception {
        Cookie driverSession = loginAs("DRIVER", p.branchId());
        long driver = jdbc.sql("SELECT max(id) FROM employee WHERE full_name = 'Sinov DRIVER' AND branch_id = :b").param("b", p.branchId())
                .query(Long.class).single();
        long o = documenting(p, c, prod, qty, 1, "DELIVERY", operator, keeper, picker);
        long vehicle = jdbc.sql("INSERT INTO vehicle (branch_id, plate_number, model) VALUES (:b, :p, 'Labo') RETURNING id")
                .param("b", p.branchId()).param("p", "30" + ThreadLocalRandom.current().nextInt(100_000, 999_999)).query(Long.class).single();
        MvcResult t = send(post("/api/trips"), keeper, "{\"vehicleId\":" + vehicle + ",\"driverId\":" + driver + ",\"tripDate\":\"" + today()
                + "\",\"orderIds\":[" + o + "]}").andExpect(status().isCreated()).andReturn();
        long trip = id(t);
        long stop = ((Number) JsonPath.read(t.getResponse().getContentAsString(), "$.stops[0].id")).longValue();
        send(post("/api/trips/" + trip + "/stops/" + stop + "/load"), driverSession, "{\"places\":1}").andExpect(status().isOk());
        send(post("/api/trips/" + trip + "/start"), driverSession, "").andExpect(status().isOk());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/trips/" + trip + "/stops/" + stop + "/photos")
                        .file(new org.springframework.mock.web.MockMultipartFile("file", "a.jpg", "image/jpeg", new byte[] {1, 2, 3}))
                        .with(csrf()).cookie(driverSession))
                .andExpect(status().isCreated());
        send(post("/api/trips/" + trip + "/stops/" + stop + "/deliver"), driverSession, "{}").andExpect(status().isOk());
        assertThat(statusOf(o)).isEqualTo("DELIVERED");
        return o;
    }

    private String debtOf(long customer) {
        return jdbc.sql("SELECT coalesce(sum(amount), 0)::text FROM party_ledger WHERE counterparty_id = :c AND side = 'CUSTOMER'")
                .param("c", customer).query(String.class).single();
    }

    @Test
    void customerReturnQmPendingAcceptToQuarantineReducesDebtRejectAndParallelNeverOverReturns() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie picker = loginAs("PICKER", p.branchId());
        long prod = product(p, "BY Qaytarish QM", "1000", 20, null, null);
        long o = delivered(p, c, prod, 5, operator, keeper, picker);
        long sale = jdbc.sql("SELECT id FROM sale WHERE order_id = :o").param("o", o).query(Long.class).single();
        assertThat(debtOf(c)).isEqualTo("5000.00");

        // Sotuvlar va qatorlar — faqat qm.create (Operator); Ombor mudirida yo'q
        mvc.perform(get("/api/customer-returns/sales").param("customerId", "" + c).cookie(keeper)).andExpect(status().isForbidden());
        mvc.perform(get("/api/customer-returns/sales").param("customerId", "" + c).cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value((int) sale))
                .andExpect(jsonPath("$[0].returnableLines").value(1));
        MvcResult ls = mvc.perform(get("/api/customer-returns/sales/" + sale + "/lines").cookie(operator))
                .andExpect(jsonPath("$[0].sold").value(5))
                .andExpect(jsonPath("$[0].returned").value(0))
                .andExpect(jsonPath("$[0].left").value(5))
                .andExpect(jsonPath("$[0].price").value("1000.00"))
                .andReturn();
        long saleLine = ((Number) JsonPath.read(ls.getResponse().getContentAsString(), "$[0].saleLineId")).longValue();
        String body = "{\"saleId\":" + sale + ",\"lines\":[{\"saleLineId\":" + saleLine + ",\"qty\":%d,\"reason\":\"%s\"}]}";

        // Xatolar: ko'p; «Boshqa» izohsiz; begona qator; begona filial
        send(post("/api/customer-returns"), operator, body.formatted(6, "DAMAGED")).andExpect(jsonPath("$.code").value("qm.qtyExceeds"));
        send(post("/api/customer-returns"), operator, body.formatted(1, "OTHER")).andExpect(jsonPath("$.code").value("qm.noteRequired"));
        send(post("/api/customer-returns"), operator, body.replace("" + saleLine, "" + (saleLine + 100_000)).formatted(1, "DAMAGED"))
                .andExpect(jsonPath("$.code").value("qm.lineInvalid"));
        Cookie foreign = loginAs("OPERATOR", place().branchId());
        send(post("/api/customer-returns"), foreign, body.formatted(1, "DAMAGED")).andExpect(status().isNotFound());

        // Operator yaratadi — «Qabul kutilmoqda», Ombor mudiriga bildirishnoma; qarz va qoldiq o'zgarmaydi
        MvcResult cr = send(post("/api/customer-returns"), operator, body.formatted(3, "DAMAGED"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.number", matchesPattern("QM-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.total").value("3000.00"))
                .andExpect(jsonPath("$.lines[0].reason").value("DAMAGED"))
                .andExpect(jsonPath("$.lines[0].cost").doesNotExist())
                .andReturn();
        long qm = id(cr);
        String number = JsonPath.read(cr.getResponse().getContentAsString(), "$.number");
        assertThat(jdbc.sql("SELECT count(*) FROM notification n JOIN employee e ON e.id = n.employee_id WHERE n.link = :l AND e.full_name = 'Sinov WAREHOUSE_MANAGER'")
                .param("l", "/customer-returns?open=" + qm).query(Long.class).single()).isPositive();
        assertThat(debtOf(c)).isEqualTo("5000.00");
        assertThat(qtyIn(p.quarantine(), prod)).isZero();
        mvc.perform(get("/api/customer-returns/sales/" + sale + "/lines").cookie(operator))
                .andExpect(jsonPath("$[0].returned").value(3))
                .andExpect(jsonPath("$[0].left").value(2));
        send(post("/api/customer-returns"), operator, body.formatted(3, "DAMAGED")).andExpect(jsonPath("$.code").value("qm.qtyExceeds"));
        send(post("/api/customer-returns/" + qm + "/approve"), operator, "").andExpect(status().isForbidden());

        // Ombor mudiri qabul qiladi — Karantinga 3, qarz 5 000 − 3 000, sof savdo uchun sales_return (QQS/tannarx sotuvdan)
        send(post("/api/customer-returns/" + qm + "/approve"), keeper, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.postedBy").value("Sinov WAREHOUSE_MANAGER"));
        assertThat(qtyIn(p.quarantine(), prod)).isEqualTo(3);
        assertThat(debtOf(c)).isEqualTo("2000.00");
        var sr = jdbc.sql("SELECT number, total::text AS total, vat_total::text AS vat, cost_total::text AS cost FROM sales_return WHERE sale_id = :s")
                .param("s", sale).query().singleRow();
        assertThat(sr.get("number")).isEqualTo(number);
        assertThat(sr.get("total")).isEqualTo("3000.00");
        assertThat(sr.get("vat")).isEqualTo("321.43");
        assertThat(sr.get("cost")).isEqualTo("300.00");
        assertThat(jdbc.sql("SELECT count(*) FROM stock_move WHERE doc_type = 'QM' AND doc_number = :n").param("n", number).query(Long.class).single())
                .isEqualTo(1);
        send(post("/api/customer-returns/" + qm + "/approve"), keeper, "").andExpect(jsonPath("$.code").value("qm.notPending"));
        // QM dalolatnomasi — server PDF
        assertThat(pdfText("/api/customer-returns/" + qm + "/pdf", keeper))
                .contains("Mijozdan qaytarish dalolatnomasi", number, "Shikastlangan", "Oʻtkazildi", "Qabul qildi");
        assertThatThrownBy(() -> jdbc.sql("UPDATE customer_return SET note = 'x' WHERE id = :id").param("id", qm).update())
                .hasMessageContaining("hal qilingan");

        // Qolgan 2 dona — 4 ta parallel so'rov (har biri 2): aniq bittasi yaratiladi
        var pool = java.util.concurrent.Executors.newFixedThreadPool(4);
        var start = new java.util.concurrent.CountDownLatch(1);
        var created = new java.util.concurrent.atomic.AtomicInteger();
        List<java.util.concurrent.Future<?>> futures = new java.util.ArrayList<>();
        for (int i = 0; i < 4; i++) {
            futures.add(pool.submit(() -> {
                start.await();
                int code = send(post("/api/customer-returns"), operator, body.formatted(2, "EXPIRING")).andReturn().getResponse().getStatus();
                if (code == 201) {
                    created.incrementAndGet();
                }
                return null;
            }));
        }
        start.countDown();
        for (var f : futures) {
            f.get(60, java.util.concurrent.TimeUnit.SECONDS);
        }
        pool.shutdown();
        assertThat(created.get()).isEqualTo(1);
        long pending = jdbc.sql("SELECT id FROM customer_return WHERE sale_id = :s AND status = 'PENDING'").param("s", sale).query(Long.class).single();

        // Rad etish — sabab majburiy; hech narsa o'zgarmaydi, miqdor bo'shaydi
        send(post("/api/customer-returns/" + pending + "/reject"), keeper, "{\"reason\":\"\"}").andExpect(status().isBadRequest());
        send(post("/api/customer-returns/" + pending + "/reject"), keeper, "{\"reason\":\"Tovar kelmadi\"}")
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.rejectReason").value("Tovar kelmadi"));
        assertThat(qtyIn(p.quarantine(), prod)).isEqualTo(3);
        assertThat(debtOf(c)).isEqualTo("2000.00");
        mvc.perform(get("/api/customer-returns/sales/" + sale + "/lines").cookie(operator)).andExpect(jsonPath("$[0].left").value(2));

        // Ro'yxat: holat filtri, qidiruv; begona filial ko'rmaydi
        mvc.perform(get("/api/customer-returns").param("status", "POSTED").param("q", number).cookie(keeper))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].qty").value(3))
                .andExpect(jsonPath("$.items[0].total").value("3000.00"));
        mvc.perform(get("/api/customer-returns/" + qm).cookie(foreign)).andExpect(status().isNotFound());

        // Ruxsati bor yaratuvchi (Filial rahbari) — darhol qabul qilinadi
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        send(post("/api/customer-returns"), manager, body.formatted(1, "WRONG_ITEM")).andExpect(jsonPath("$.status").value("POSTED"));
        assertThat(qtyIn(p.quarantine(), prod)).isEqualTo(4);
        assertThat(debtOf(c)).isEqualTo("1000.00");
    }

    @Test
    void customerReturnUsesReturnPriceTypeButNeverAboveSalePrice() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie picker = loginAs("PICKER", p.branchId());
        long cheap = product(p, "BY Vozvrat arzon", "1000", 20, null, null);
        long dear = product(p, "BY Vozvrat qimmat", "1000", 20, null, null);
        long o1 = delivered(p, c, cheap, 5, operator, keeper, picker);
        long o2 = delivered(p, c, dear, 5, operator, keeper, picker);
        assertThat(debtOf(c)).isEqualTo("10000.00");
        // «Vozvrat» turi: arzonida 950 (sotuvdan past) → QM shu narxda; qimmatida 1200 (sotuvdan yuqori) → sotuv narxi 1000
        setTypePrice(p, cheap, "RETURN", "950");
        setTypePrice(p, dear, "RETURN", "1200");
        long s1 = jdbc.sql("SELECT id FROM sale WHERE order_id = :o").param("o", o1).query(Long.class).single();
        long s2 = jdbc.sql("SELECT id FROM sale WHERE order_id = :o").param("o", o2).query(Long.class).single();
        MvcResult l1 = mvc.perform(get("/api/customer-returns/sales/" + s1 + "/lines").cookie(operator))
                .andExpect(jsonPath("$[0].price").value("950.00"))
                .andReturn();
        mvc.perform(get("/api/customer-returns/sales/" + s2 + "/lines").cookie(operator)).andExpect(jsonPath("$[0].price").value("1000.00"));

        long saleLine = ((Number) JsonPath.read(l1.getResponse().getContentAsString(), "$[0].saleLineId")).longValue();
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        send(post("/api/customer-returns"), manager,
                "{\"saleId\":" + s1 + ",\"lines\":[{\"saleLineId\":" + saleLine + ",\"qty\":2,\"reason\":\"EXPIRING\"}]}")
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.total").value("1900.00"))
                .andExpect(jsonPath("$.lines[0].price").value("950.00"));
        assertThat(debtOf(c)).isEqualTo("8100.00");
        assertThat(qtyIn(p.quarantine(), cheap)).isEqualTo(2);
    }

    @Test
    void postedCustomerReturnCancelRestoresDebtStockAndReturnableButBlockedWhenQuarantineMovedOut() throws Exception {
        Place p = place();
        long c = customer(p.branchId(), null);
        Cookie operator = loginAs("OPERATOR", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie picker = loginAs("PICKER", p.branchId());
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        Cookie director = loginAs("DIRECTOR", null);
        long prod = product(p, "BY QM bekor", "1000", 20, null, null);
        long o = delivered(p, c, prod, 5, operator, keeper, picker);
        long sale = jdbc.sql("SELECT id FROM sale WHERE order_id = :o").param("o", o).query(Long.class).single();
        long saleLine = jdbc.sql("SELECT id FROM sale_line WHERE sale_id = :s").param("s", sale).query(Long.class).single();
        long batch = jdbc.sql("SELECT batch_id FROM sale_line WHERE id = :l").param("l", saleLine).query(Long.class).single();
        String body = "{\"saleId\":" + sale + ",\"lines\":[{\"saleLineId\":" + saleLine + ",\"qty\":%d,\"reason\":\"DAMAGED\"}]}";

        long qm = id(send(post("/api/customer-returns"), manager, body.formatted(3)).andExpect(jsonPath("$.status").value("POSTED")).andReturn());
        String number = jdbc.sql("SELECT number FROM customer_return WHERE id = :id").param("id", qm).query(String.class).single();
        assertThat(debtOf(c)).isEqualTo("2000.00");
        assertThat(qtyIn(p.quarantine(), prod)).isEqualTo(3);

        // Ruxsat: faqat qm.cancelPosted (Direktor); sabab majburiy
        send(post("/api/customer-returns/" + qm + "/cancel"), manager, "{\"reason\":\"Xato\"}").andExpect(status().isForbidden());
        send(post("/api/customer-returns/" + qm + "/cancel"), director, "{\"reason\":\" \"}").andExpect(status().isBadRequest());

        send(post("/api/customer-returns/" + qm + "/cancel"), director, "{\"reason\":\"Notoʻgʻri kiritilgan\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.cancelReason").value("Notoʻgʻri kiritilgan"))
                .andExpect(jsonPath("$.cancelledBy").isNotEmpty());
        assertThat(debtOf(c)).isEqualTo("5000.00");
        assertThat(qtyIn(p.quarantine(), prod)).isZero();
        assertThat(jdbc.sql("SELECT cancelled_at IS NOT NULL FROM sales_return WHERE number = :n").param("n", number).query(Boolean.class).single())
                .isTrue();
        mvc.perform(get("/api/customer-returns/sales/" + sale + "/lines").cookie(operator))
                .andExpect(jsonPath("$[0].returned").value(0))
                .andExpect(jsonPath("$[0].left").value(5));
        send(post("/api/customer-returns/" + qm + "/cancel"), director, "{\"reason\":\"Yana\"}")
                .andExpect(jsonPath("$.code").value("qm.notPosted"));
        // Bekor qilingan QM va sales_return o'zgarmaydi
        assertThatThrownBy(() -> jdbc.sql("UPDATE sales_return SET total = 1 WHERE number = :n").param("n", number).update())
                .hasStackTraceContaining("faqat qoʻshiladi");

        // Yangi QM 2 dona; Karantindan 1 dona keyingi hujjat bilan chiqarildi → bekor qilib bo'lmaydi
        long qm2 = id(send(post("/api/customer-returns"), manager, body.formatted(2)).andExpect(jsonPath("$.status").value("POSTED")).andReturn());
        tx.executeWithoutResult(s -> ledger.post(new DocRef("HC", qm2, "HC-TST-" + qm2), List.of(Move.out(p.quarantine(), batch, 1))));
        send(post("/api/customer-returns/" + qm2 + "/cancel"), director, "{\"reason\":\"Xato\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("qm.cancelBlocked"))
                .andExpect(jsonPath("$.detail", containsString("HC-TST-" + qm2)));
        assertThat(debtOf(c)).isEqualTo("3000.00");
        assertThat(qtyIn(p.quarantine(), prod)).isEqualTo(1);
    }

    /** Buyurtma bo'yicha bildirishnoma olgan, berilgan roldagi xodimlar soni. */
    private int notified(String kind, long orderId, String role) {
        return jdbc.sql("""
                SELECT count(*) FROM notification n JOIN employee e ON e.id = n.employee_id JOIN role r ON r.id = e.role_id
                WHERE n.kind = :k AND n.link = :l AND r.code = :r""")
                .param("k", kind)
                .param("l", "/orders?open=" + orderId)
                .param("r", role)
                .query(Integer.class)
                .single();
    }
}
