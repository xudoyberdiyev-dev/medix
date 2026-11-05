package uz.medix.sales;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
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
                SELECT :p, id, :b, :d, :a, :doc FROM price_type WHERE base""")
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
                .andExpect(jsonPath("$.lines[0].available").value(50))
                .andExpect(jsonPath("$.credit.creditLimit").value("100000.00"))
                .andExpect(jsonPath("$.credit.limitLeft").value("100000.00"))
                .andExpect(jsonPath("$.issues.length()").value(0))
                .andReturn();
        long doc = id(created);
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
        // Qoralamada narx o'zgarsa — ogohlantirish
        setPrice(p, a, "2600");
        mvc.perform(get("/api/orders/" + doc).cookie(operator))
                .andExpect(jsonPath("$.priceChanged").value(true))
                .andExpect(jsonPath("$.issues[*].code", hasItem("order.priceChanged")))
                .andExpect(jsonPath("$.total").value("26000.00"));

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

        // +50% — Direktor; rad etish va qoralamaga qaytarish
        long big = draft(operator, order(p, c, new long[][] {{a, 150}}));
        send(post("/api/orders/" + big + "/submit"), operator, "").andExpect(jsonPath("$.approvalLevel").value("DIRECTOR"));
        send(post("/api/orders/" + big + "/approve"), manager, "")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("order.directorOnly"));
        send(post("/api/orders/" + big + "/return"), operator, "").andExpect(jsonPath("$.status").value("DRAFT"));
        send(post("/api/orders/" + big + "/submit"), operator, "").andExpect(jsonPath("$.status").value("PENDING_APPROVAL"));
        send(post("/api/orders/" + big + "/reject"), director, "{\"reason\":\"Avval qarzni yopsin\"}")
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.decisionReason").value("Avval qarzni yopsin"));

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
                .andExpect(jsonPath("$.items[0].status").value("CANCELLED"));
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
                .andExpect(jsonPath("$[*].id", hasItem((int) o1)));

        // Bitta faol yig'ish
        send(post("/api/orders/" + o1 + "/pick/start"), picker, "").andExpect(jsonPath("$.status").value("PICKING"));
        send(post("/api/orders/" + o2 + "/pick/start"), picker, "")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("order.pickerBusy"));
        Cookie otherPicker = loginAs("PICKER", p.branchId());
        send(post("/api/orders/" + o1 + "/pick/finish"), otherPicker, "{}").andExpect(status().isForbidden());

        // «Ha, shundan oldim» — FEFO zahira (Y-EARLY) Jo'natish zonasiga
        send(post("/api/orders/" + o1 + "/pick/finish"), picker, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CHECKING"))
                .andExpect(jsonPath("$.fefoDeviation").value(false));
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

        // Hisobdan o'tkazish: barcha qatorlar va joylar soni
        send(post("/api/orders/" + o2 + "/check"), keeper, "{\"checkedLines\":[],\"places\":2}").andExpect(status().isBadRequest());
        send(post("/api/orders/" + o2 + "/check"), picker, "{\"checkedLines\":[" + line2 + "],\"places\":2}").andExpect(status().isForbidden());
        send(post("/api/orders/" + o2 + "/check"), keeper, "{\"checkedLines\":[" + line2 + "],\"places\":2}")
                .andExpect(jsonPath("$.status").value("DOCUMENTING"))
                .andExpect(jsonPath("$.places").value(2));

        // Yig'ishga qaytarish: tovar joyiga, zahira qayta; qayta yig'ilgach bekor qilinsa — sof miqdor qaytadi
        send(post("/api/orders/" + o1 + "/return-to-pick"), keeper, "{\"reason\":\"Partiya aralashgan\"}")
                .andExpect(jsonPath("$.status").value("QUEUED"))
                .andExpect(jsonPath("$.lines[0].reserved[0].qty").value(4))
                .andExpect(jsonPath("$.pickMinutes").value(15));
        assertThat(qtyIn(shipping, prod)).isEqualTo(3);
        assertThat(qtyIn(p.main(), prod)).isEqualTo(17);
        send(post("/api/orders/" + o1 + "/pick/start"), picker, "").andExpect(status().isOk());
        send(post("/api/orders/" + o1 + "/pick/finish"), picker, "{}").andExpect(jsonPath("$.status").value("CHECKING"));
        assertThat(qtyIn(shipping, prod)).isEqualTo(7);
        send(post("/api/orders/" + o1 + "/cancel"), keeper, "{\"reason\":\"Mijoz voz kechdi\"}").andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(qtyIn(shipping, prod)).isEqualTo(3);
        assertThat(qtyIn(p.main(), prod)).isEqualTo(17);
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

    /** Buyurtmani «Hujjatlashtirilmoqda»gacha olib boradi (joylar soni bilan). */
    private long documenting(Place p, long c, long prod, int qty, int places, String delivery, Cookie operator, Cookie keeper, Cookie picker)
            throws Exception {
        long o = draft(operator, order(p, c, new long[][] {{prod, qty}}).replace("\"DELIVERY\"", "\"" + delivery + "\""));
        send(post("/api/orders/" + o + "/submit"), operator, "").andExpect(jsonPath("$.status").value("QUEUED"));
        send(post("/api/orders/" + o + "/time"), keeper, "{\"pickMinutes\":10}").andExpect(status().isOk());
        send(post("/api/orders/" + o + "/pick/start"), picker, "").andExpect(status().isOk());
        send(post("/api/orders/" + o + "/pick/finish"), picker, "{}").andExpect(jsonPath("$.status").value("CHECKING"));
        long line = jdbc.sql("SELECT id FROM sales_order_line WHERE order_id = :o").param("o", o).query(Long.class).single();
        send(post("/api/orders/" + o + "/check"), keeper, "{\"checkedLines\":[" + line + "],\"places\":" + places + "}")
                .andExpect(jsonPath("$.status").value("DOCUMENTING"));
        return o;
    }

    private String statusOf(long order) {
        return jdbc.sql("SELECT status FROM sales_order WHERE id = :o").param("o", order).query(String.class).single();
    }

    @Test
    void tripCapacityWaybillCancelAndPickup() throws Exception {
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
        long vehicle = jdbc.sql("INSERT INTO vehicle (branch_id, plate_number, model, capacity_boxes) VALUES (:b, :p, 'Damas', 3) RETURNING id")
                .param("b", p.branchId()).param("p", plate).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :l, 'Haydovchi Sinov', id, :b, 'x', false FROM role WHERE code = 'DRIVER'""")
                .param("l", "drv" + UUID.randomUUID().toString().substring(0, 8)).param("b", p.branchId()).update();
        long driver = jdbc.sql("SELECT id FROM employee WHERE full_name = 'Haydovchi Sinov' AND branch_id = :b").param("b", p.branchId())
                .query(Long.class).single();

        mvc.perform(get("/api/trips/ready").cookie(keeper)).andExpect(jsonPath("$[*].id", hasItem((int) o1)));
        mvc.perform(get("/api/trips/options").param("branchId", String.valueOf(p.branchId())).cookie(keeper))
                .andExpect(jsonPath("$.vehicles[0].capacityBoxes").value(3))
                .andExpect(jsonPath("$.drivers[0].fullName").value("Haydovchi Sinov"));
        String body = "{\"vehicleId\":" + vehicle + ",\"driverId\":" + driver + ",\"tripDate\":\"" + today() + "\",\"orderIds\":[" + o1 + "," + o2 + "]}";
        send(post("/api/trips"), picker, body).andExpect(status().isForbidden());
        // Sig'im: 2 + 2 = 4 joy > 3
        send(post("/api/trips"), keeper, body).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("trip.overCapacity"));
        send(post("/api/trips"), keeper, body.replace("[" + o1 + "," + o2 + "]", "[" + o1 + "," + o3 + "]"))
                .andExpect(jsonPath("$.code").value("trip.pickupInTrip"));
        jdbc.sql("UPDATE vehicle SET capacity_boxes = 5 WHERE id = :v").param("v", vehicle).update();
        MvcResult trip = send(post("/api/trips"), keeper, body)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number", matchesPattern("RS-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.status").value("PLANNED"))
                .andExpect(jsonPath("$.places").value(4))
                .andExpect(jsonPath("$.stops[0].waybillNumber", matchesPattern("NK-[A-Z]{3}-\\d{6}")))
                .andReturn();
        long t1 = id(trip);
        assertThat(statusOf(o1)).isEqualTo("LOADING");
        String nk1 = jdbc.sql("SELECT waybill_number FROM sales_order WHERE id = :o").param("o", o1).query(String.class).single();
        // Nakladnoy — server PDF (raqam, mahsulot, miqdor, imzolar)
        assertThat(pdfText("/api/orders/" + o1 + "/waybill/pdf", keeper)).contains("Nakladnoy", nk1, "BY Reys", "Jami", "Qabul qildi");
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
        long vehicle = jdbc.sql("INSERT INTO vehicle (branch_id, plate_number, model, capacity_boxes) VALUES (:b, :p, 'Damas', 5) RETURNING id")
                .param("b", p.branchId()).param("p", "01" + ThreadLocalRandom.current().nextInt(100_000, 999_999)).query(Long.class).single();
        String login = "drv" + UUID.randomUUID().toString().substring(0, 8);
        long driver = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :l, 'Haydovchi Tahrir', id, :b, 'x', false FROM role WHERE code = 'DRIVER' RETURNING id""")
                .param("l", login).param("b", p.branchId()).query(Long.class).single();
        long t = id(send(post("/api/trips"), keeper,
                "{\"vehicleId\":" + vehicle + ",\"driverId\":" + driver + ",\"tripDate\":\"" + today() + "\",\"orderIds\":[" + o1 + "]}")
                .andExpect(status().isCreated()).andReturn());

        // Qo'shish: ruxsat, «O'zi olib ketadi» emas, sig'im (2 + 2 + 2 = 6 > 5)
        send(post("/api/trips/" + t + "/orders"), picker, "{\"orderIds\":[" + o2 + "]}").andExpect(status().isForbidden());
        send(post("/api/trips/" + t + "/orders"), keeper, "{\"orderIds\":[" + o4 + "]}").andExpect(jsonPath("$.code").value("trip.pickupInTrip"));
        send(post("/api/trips/" + t + "/orders"), keeper, "{\"orderIds\":[" + o2 + "," + o3 + "]}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("trip.overCapacity"));
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
        send(post("/api/trips/" + trip + "/stops/" + stop + "/deliver"), driverSession, "{\"cash\":\"5000\"}")
                .andExpect(jsonPath("$.code").value("trip.cashInvalid"));
        send(post("/api/trips/" + trip + "/finish"), driverSession, "").andExpect(jsonPath("$.code").value("trip.stopsOpen"));
        send(post("/api/trips/" + trip + "/stops/" + stop + "/deliver"), driverSession, "{\"cash\":\"2000\"}")
                .andExpect(jsonPath("$.stops[0].outcome").value("DELIVERED"))
                .andExpect(jsonPath("$.stops[0].cashCollected").value("2000.00"))
                .andExpect(jsonPath("$.stops[0].photos").value(1));
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

        send(post(path), driverSession, two + "}")
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
        assertThat(jdbc.sql("SELECT status FROM trip WHERE id = :t").param("t", trip).query(String.class).single()).isEqualTo("DONE");
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
}
