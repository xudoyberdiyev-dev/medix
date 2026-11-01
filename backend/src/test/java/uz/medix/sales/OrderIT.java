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
        send(post("/api/orders/" + o2 + "/pick/finish"), picker, "{\"lines\":[{\"lineId\":" + line2 + ",\"batchId\":" + batches[1] + "}]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fefoDeviation").value(true));
        assertThat(qtyIn(shipping, prod)).isEqualTo(7);
        assertThat(jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_balance WHERE batch_id = :b AND zone_id = :z").param("b", batches[1])
                        .param("z", p.main()).query(Long.class).single())
                .isEqualTo(7);

        // Hisobdan o'tkazish bosqichida bekor qilish — tovar olingan zonaga qaytadi
        send(post("/api/orders/" + o1 + "/cancel"), keeper, "{\"reason\":\"Mijoz voz kechdi\"}").andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(qtyIn(shipping, prod)).isEqualTo(3);
        assertThat(qtyIn(p.main(), prod)).isEqualTo(17);
    }
}
