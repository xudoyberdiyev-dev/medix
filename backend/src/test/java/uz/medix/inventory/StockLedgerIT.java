package uz.medix.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
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
import org.springframework.transaction.support.TransactionTemplate;
import uz.medix.TestcontainersConfig;
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;

/** Ombor jurnali: qoldiq = jurnal yig'indisi, manfiy bo'lmaydi, hujjat — hammasi yoki hech narsa, parallel chiqimlar. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class StockLedgerIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    StockLedger ledger;

    @Autowired
    Warehouses warehouses;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    TransactionTemplate tx;

    @Autowired
    MockMvc mvc;

    @Autowired
    PasswordEncoder encoder;

    private record Place(long branchId, long mainZone, long quarantineZone) {}

    private Place place() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        Long branch = jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'Ombor sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(700_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElse(null);
        if (branch == null) {
            return place();
        }
        long b = branch;
        Warehouses.Warehouse w = tx.execute(s -> warehouses.create(b, "Ombor " + code, null, Set.of()));
        long main = w.zones().stream().filter(z -> z.type() == ZoneType.MAIN).findFirst().orElseThrow().id();
        long quarantine = w.zones().stream().filter(z -> z.type() == ZoneType.QUARANTINE).findFirst().orElseThrow().id();
        return new Place(b, main, quarantine);
    }

    private long product(String name) {
        return jdbc.sql("""
                INSERT INTO product (code, name, unit_id, search_text) SELECT :c, :n, id, lower(:n) FROM unit WHERE short_name = 'dona' RETURNING id""")
                .param("c", String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999)))
                .param("n", name)
                .query(Long.class)
                .single();
    }

    private long batch(long product, String number, boolean bonus) {
        return tx.execute(s -> ledger.createBatch(product, number, null, LocalDate.of(2028, 5, 1), Money.of("12500.50"), bonus, "BQ", null));
    }

    private long journalSum(long zone, long batch) {
        return jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_move WHERE zone_id = :z AND batch_id = :b")
                .param("z", zone)
                .param("b", batch)
                .query(Long.class)
                .single();
    }

    @Test
    void documentIsAllOrNothingAndBalanceMatchesJournal() {
        Place p = place();
        long prod = product("Ledger sinov");
        long b = batch(prod, "L-1", false);
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 1, "BQ-TST-000001"), List.of(Move.in(p.mainZone(), b, 10))));
        tx.executeWithoutResult(s -> ledger.post(new DocRef("SV", 2, "SV-TST-000001"), List.of(Move.out(p.mainZone(), b, 3))));
        assertThat(ledger.balance(p.mainZone(), b)).isEqualTo(7);

        // Ko'chirish: Asosiy → Karantin 2 ta, keyin yetmaydigan chiqim — butun hujjat qaytadi
        assertThatThrownBy(() -> tx.executeWithoutResult(s -> ledger.post(new DocRef("ZK", 3, "ZK-TST-000001"), List.of(
                        Move.out(p.mainZone(), b, 2), Move.in(p.quarantineZone(), b, 2), Move.out(p.mainZone(), b, 6)))))
                .isInstanceOf(MedixException.class)
                .hasFieldOrPropertyWithValue("code", "stock.insufficient");
        assertThat(ledger.balance(p.mainZone(), b)).isEqualTo(7);
        assertThat(ledger.balance(p.quarantineZone(), b)).isZero();

        tx.executeWithoutResult(s -> ledger.post(new DocRef("ZK", 4, "ZK-TST-000002"), List.of(
                Move.out(p.mainZone(), b, 2), Move.in(p.quarantineZone(), b, 2))));
        assertThat(ledger.balance(p.mainZone(), b)).isEqualTo(5).isEqualTo((int) journalSum(p.mainZone(), b));
        assertThat(ledger.balance(p.quarantineZone(), b)).isEqualTo(2).isEqualTo((int) journalSum(p.quarantineZone(), b));
    }

    @Test
    void protectedInDatabase() {
        Place p = place();
        long b = batch(product("Himoya sinov"), "H-1", false);
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 5, "BQ-TST-000002"), List.of(Move.in(p.mainZone(), b, 1))));
        assertThatThrownBy(() -> jdbc.sql("UPDATE stock_move SET qty = 100 WHERE batch_id = :b").param("b", b).update())
                .hasMessageContaining("faqat qo'shiladigan");
        assertThatThrownBy(() -> jdbc.sql("UPDATE stock_balance SET qty = -1 WHERE batch_id = :b").param("b", b).update())
                .hasMessageContaining("stock_balance_qty_check");
        assertThatThrownBy(() -> jdbc.sql("UPDATE batch SET cost = 1 WHERE id = :b").param("b", b).update())
                .hasMessageContaining("faqat qo'shiladigan");
    }

    @Test
    void bonusBatchHasZeroCostAndSuffix() {
        long b = batch(product("Bonus sinov"), "A-77", true);
        assertThat(jdbc.sql("SELECT number || '|' || cost FROM batch WHERE id = :b").param("b", b).query(String.class).single())
                .isEqualTo("A-77-B|0.00");
    }

    @Test
    void parallelWithdrawalsNeverGoNegative() throws Exception {
        Place p = place();
        long b = batch(product("Parallel sinov"), "P-1", false);
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 6, "BQ-TST-000003"), List.of(Move.in(p.mainZone(), b, 10))));
        int threads = 24;
        ExecutorService pool = Executors.newFixedThreadPool(8);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger ok = new AtomicInteger();
        AtomicInteger insufficient = new AtomicInteger();
        List<Future<?>> futures = new java.util.ArrayList<>();
        for (int i = 0; i < threads; i++) {
            int n = i;
            futures.add(pool.submit(() -> {
                start.await();
                try {
                    tx.executeWithoutResult(s -> ledger.post(new DocRef("SV", 100 + n, "SV-TST-" + (100 + n)), List.of(Move.out(p.mainZone(), b, 1))));
                    ok.incrementAndGet();
                } catch (MedixException e) {
                    insufficient.incrementAndGet();
                }
                return null;
            }));
        }
        start.countDown();
        for (Future<?> f : futures) {
            f.get(60, TimeUnit.SECONDS);
        }
        pool.shutdown();
        assertThat(ok.get()).isEqualTo(10);
        assertThat(insufficient.get()).isEqualTo(threads - 10);
        assertThat(ledger.balance(p.mainZone(), b)).isZero();
        assertThat(journalSum(p.mainZone(), b)).isZero();
    }

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "stk" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :login, 'Sinov', id, :b, :hash, false FROM role WHERE code = :role""")
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

    @Test
    void stockApiHidesCostWithoutPermission() throws Exception {
        Place p = place();
        Place other = place();
        long prod = product("Qoldiq API sinov");
        long b = batch(prod, "Q-1", false);
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 7, "BQ-TST-000004"), List.of(Move.in(p.mainZone(), b, 4))));
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 8, "BQ-TST-000005"), List.of(Move.in(other.mainZone(), b, 9))));

        Cookie admin = loginAs("ADMIN", null);
        mvc.perform(get("/api/stock").param("q", "qoldiq api sinov").param("branchId", String.valueOf(p.branchId())).cookie(admin))
                .andDo(r -> {
                    if (r.getResponse().getStatus() >= 500) {
                        throw new AssertionError("500: " + r.getResolvedException(), r.getResolvedException());
                    }
                })
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.totalQty").value(4))
                .andExpect(jsonPath("$.items[0].cost").value("12500.50"))
                .andExpect(jsonPath("$.items[0].sellable").value(true));

        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        mvc.perform(get("/api/stock").param("q", "qoldiq api sinov").cookie(keeper))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].qty").value(4))
                .andExpect(jsonPath("$.items[0].cost").doesNotExist());
        mvc.perform(get("/api/stock").param("expiringWithinDays", "30").param("q", "qoldiq api sinov").cookie(keeper))
                .andExpect(jsonPath("$.total").value(0));

        // Eksport: filtr va filial doirasi bir xil; tannarx ustuni faqat ruxsat bilan
        byte[] keeperFile = mvc.perform(get("/api/stock/export").param("q", "qoldiq api sinov").cookie(keeper))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        try (var wb = org.apache.poi.ss.usermodel.WorkbookFactory.create(new java.io.ByteArrayInputStream(keeperFile))) {
            var sheet = wb.getSheetAt(0);
            assertThat(sheet.getLastRowNum()).isEqualTo(1);
            assertThat(sheet.getRow(0).getLastCellNum()).isEqualTo((short) 11);
            assertThat(sheet.getRow(1).getCell(10).getNumericCellValue()).isEqualTo(4);
        }
        byte[] adminFile = mvc.perform(get("/api/stock/export").param("q", "qoldiq api sinov").param("branchId", String.valueOf(p.branchId()))
                        .cookie(admin))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        try (var wb = org.apache.poi.ss.usermodel.WorkbookFactory.create(new java.io.ByteArrayInputStream(adminFile))) {
            var row = wb.getSheetAt(0).getRow(1);
            assertThat(row.getCell(11).getStringCellValue()).isEqualTo("12.500,50");
            assertThat(row.getCell(12).getStringCellValue()).isEqualTo("50.002,00");
        }

        Cookie accountant = loginAs("ACCOUNTANT", null);
        mvc.perform(get("/api/stock").cookie(accountant)).andExpect(status().isForbidden());
        mvc.perform(get("/api/stock/export").cookie(accountant)).andExpect(status().isForbidden());
    }

    @Test
    void stockApiSorting() throws Exception {
        Place p = place();
        String tag = "srt" + java.util.UUID.randomUUID().toString().substring(0, 5);
        long a = product("Alfa qoldiq " + tag);
        long b = product("Beta qoldiq " + tag);
        long ba = batch(a, "SA-1", false);
        long bb = batch(b, "SB-1", false);
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 900_000 + ThreadLocalRandom.current().nextInt(99_999), "BQ-TST-" + tag), List.of(Move.in(p.mainZone(), ba, 7), Move.in(p.mainZone(), bb, 2))));
        Cookie admin = loginAs("ADMIN", null);
        String branch = String.valueOf(p.branchId());
        mvc.perform(get("/api/stock").param("q", tag).param("branchId", branch).cookie(admin))
                .andExpect(jsonPath("$.items[*].productId").value(org.hamcrest.Matchers.contains((int) a, (int) b)));
        mvc.perform(get("/api/stock").param("q", tag).param("branchId", branch).param("sort", "NAME").param("desc", "true").cookie(admin))
                .andExpect(jsonPath("$.items[*].productId").value(org.hamcrest.Matchers.contains((int) b, (int) a)));
        mvc.perform(get("/api/stock").param("q", tag).param("branchId", branch).param("sort", "QTY").cookie(admin))
                .andExpect(jsonPath("$.items[*].qty").value(org.hamcrest.Matchers.contains(2, 7)));
        for (String sort : List.of("CODE", "EXPIRY", "WAREHOUSE")) {
            mvc.perform(get("/api/stock").param("q", tag).param("branchId", branch).param("sort", sort).cookie(admin))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(2));
        }
        byte[] file = mvc.perform(get("/api/stock/export").param("q", tag).param("branchId", branch).param("sort", "QTY").param("desc", "true")
                        .cookie(admin))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        try (var wb = org.apache.poi.ss.usermodel.WorkbookFactory.create(new java.io.ByteArrayInputStream(file))) {
            assertThat(wb.getSheetAt(0).getRow(1).getCell(1).getStringCellValue()).isEqualTo("Alfa qoldiq " + tag);
        }
    }

    @Test
    void productViewAggregatesReservedClosedAndSummary() throws Exception {
        Place p = place();
        long prod = product("Jamlanma qoldiq sinov");
        long b1 = batch(prod, "J-1", false);
        LocalDate soon = LocalDate.now(java.time.ZoneId.of("Asia/Tashkent")).plusDays(10);
        long b2 = tx.execute(s -> ledger.createBatch(prod, "J-2", null, soon, Money.of("1000.00"), false, "BQ", null));
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 21, "BQ-TST-000021"),
                List.of(Move.in(p.mainZone(), b1, 5), Move.in(p.quarantineZone(), b2, 3))));
        jdbc.sql("""
                INSERT INTO stock_reservation (doc_type, doc_id, doc_line_id, doc_number, zone_id, batch_id, product_id, warehouse_id, qty)
                SELECT 'BY', 1, 1, 'BY-TST-1', z.id, :b, :p, z.warehouse_id, 2 FROM zone z WHERE z.id = :z""")
                .param("b", b1)
                .param("p", prod)
                .param("z", p.mainZone())
                .update();
        String br = String.valueOf(p.branchId());
        Cookie admin = loginAs("ADMIN", null);
        mvc.perform(get("/api/stock/products").param("q", "jamlanma qoldiq").param("branchId", br).cookie(admin))
                .andDo(r -> {
                    if (r.getResponse().getStatus() >= 500) {
                        throw new AssertionError("500: " + r.getResolvedException(), r.getResolvedException());
                    }
                })
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.totalQty").value(8))
                .andExpect(jsonPath("$.items[0].total").value(8))
                .andExpect(jsonPath("$.items[0].reserved").value(2))
                .andExpect(jsonPath("$.items[0].available").value(3))
                .andExpect(jsonPath("$.items[0].closed").value(3))
                .andExpect(jsonPath("$.items[0].batches").value(2))
                .andExpect(jsonPath("$.items[0].nearestDays").value(10))
                .andExpect(jsonPath("$.items[0].costSum").value("65502.50"))
                .andExpect(jsonPath("$.items[0].saleSum").value("0.00"));
        mvc.perform(get("/api/stock/products").param("q", "jamlanma qoldiq").param("branchId", br).param("zoneType", "QUARANTINE").cookie(admin))
                .andExpect(jsonPath("$.items[0].total").value(3));
        mvc.perform(get("/api/stock/products").param("q", "jamlanma qoldiq").param("branchId", br).param("expiry", "D0_30", "EXPIRED")
                        .cookie(admin))
                .andExpect(jsonPath("$.items[0].total").value(3));
        mvc.perform(get("/api/stock/products").param("q", "J-2").param("branchId", br).cookie(admin))
                .andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/stock/products").param("q", "jamlanma qoldiq").param("branchId", br).param("stock", "ALL_RESERVED").cookie(admin))
                .andExpect(jsonPath("$.total").value(0));
        // Partiya bo'yicha: zona × partiya qatorlari, standart saralash — yaroqlilik (FEFO), jamilar filtr bo'yicha
        mvc.perform(get("/api/stock/batches").param("q", "jamlanma qoldiq").param("branchId", br).cookie(admin))
                .andDo(r -> {
                    if (r.getResponse().getStatus() >= 500) {
                        throw new AssertionError("500: " + r.getResolvedException(), r.getResolvedException());
                    }
                })
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.totalQty").value(8))
                .andExpect(jsonPath("$.reservedQty").value(2))
                .andExpect(jsonPath("$.availableQty").value(3))
                .andExpect(jsonPath("$.costSum").value("65502.50"))
                .andExpect(jsonPath("$.saleSum").value("0.00"))
                .andExpect(jsonPath("$.items[0].daysLeft").value(10))
                .andExpect(jsonPath("$.items[0].branchCode").exists());
        mvc.perform(get("/api/stock/batches").param("q", "jamlanma qoldiq").param("branchId", br).param("zoneType", "QUARANTINE").cookie(admin))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].batchNumber").value("J-2"))
                .andExpect(jsonPath("$.items[0].available").value(0));
        mvc.perform(get("/api/stock/batches").param("q", "J-1").param("branchId", br).param("sort", "QTY").param("desc", "true").cookie(admin))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].reserved").value(2))
                .andExpect(jsonPath("$.items[0].available").value(3))
                .andExpect(jsonPath("$.items[0].receiptNumber").doesNotExist());
        mvc.perform(get("/api/stock/batches").param("q", "jamlanma qoldiq").param("branchId", br).param("stock", "ZERO").cookie(admin))
                .andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/stock").param("q", "J-1").param("branchId", br).cookie(admin))
                .andExpect(jsonPath("$.items[0].reserved").value(2))
                .andExpect(jsonPath("$.items[0].sourceType").value("BQ"))
                .andExpect(jsonPath("$.items[0].receiptNumber").doesNotExist());
        mvc.perform(get("/api/stock/summary").param("branchId", br).cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.products").value(1))
                .andExpect(jsonPath("$.near").value(1))
                .andExpect(jsonPath("$.quarantine").value(1))
                .andExpect(jsonPath("$.expired").value(0))
                .andExpect(jsonPath("$.value").value("65502.50"))
                .andExpect(jsonPath("$.warehouses[0].count").value(2))
                .andExpect(jsonPath("$.suppliers[0].id").value(0));

        mvc.perform(get("/api/stock/tree").param("branchId", br).cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].level").value("BRANCH"))
                .andExpect(jsonPath("$[0].qty").value(8))
                .andExpect(jsonPath("$[0].value").value("65502.50"))
                .andExpect(jsonPath("$[1].level").value("WAREHOUSE"))
                .andExpect(jsonPath("$[1].products").value(1))
                .andExpect(jsonPath("$[2].level").value("ZONE"));
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        mvc.perform(get("/api/stock/products").param("q", "jamlanma qoldiq").cookie(keeper))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].costSum").doesNotExist())
                .andExpect(jsonPath("$.costSum").doesNotExist());
        mvc.perform(get("/api/stock/batches").param("q", "jamlanma qoldiq").cookie(keeper))
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[0].cost").doesNotExist())
                .andExpect(jsonPath("$.items[0].costSum").doesNotExist())
                .andExpect(jsonPath("$.costSum").doesNotExist());
        mvc.perform(get("/api/stock/summary").cookie(keeper)).andExpect(jsonPath("$.value").doesNotExist());
        mvc.perform(get("/api/stock/tree").cookie(keeper)).andExpect(jsonPath("$[0].value").doesNotExist());
        mvc.perform(get("/api/stock/batch").param("batchId", String.valueOf(b1)).param("zoneId", String.valueOf(p.mainZone())).cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.batchNumber").value("J-1"))
                .andExpect(jsonPath("$.zoneType").value("MAIN"))
                .andExpect(jsonPath("$.qty").value(5))
                .andExpect(jsonPath("$.reserved").value(2))
                .andExpect(jsonPath("$.available").value(3))
                .andExpect(jsonPath("$.closed").value(0))
                .andExpect(jsonPath("$.cost").exists())
                .andExpect(jsonPath("$.moves.length()").value(1))
                .andExpect(jsonPath("$.moves[0].docNumber").value("BQ-TST-000021"))
                .andExpect(jsonPath("$.moves[0].qty").value(5))
                .andExpect(jsonPath("$.moves[0].balance").value(5));
        mvc.perform(get("/api/stock/batch").param("batchId", String.valueOf(b2)).param("zoneId", String.valueOf(p.quarantineZone())).cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.closed").value(3))
                .andExpect(jsonPath("$.available").value(0))
                .andExpect(jsonPath("$.cost").doesNotExist());
        mvc.perform(get("/api/stock/batch").param("batchId", String.valueOf(b2)).param("zoneId", String.valueOf(p.mainZone())).cookie(admin))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/stock/expiry-groups").param("branchId", br).cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].group").value("EXPIRED"))
                .andExpect(jsonPath("$[0].batches").value(0))
                .andExpect(jsonPath("$[1].group").value("D30"))
                .andExpect(jsonPath("$[1].batches").value(1))
                .andExpect(jsonPath("$[1].qty").value(3))
                .andExpect(jsonPath("$[1].value").value("3000.00"))
                .andExpect(jsonPath("$[2].batches").value(0));
        mvc.perform(get("/api/stock/expiry-groups").param("branchId", br).cookie(keeper)).andExpect(jsonPath("$[1].value").doesNotExist());
        mvc.perform(get("/api/stock").param("branchId", br).param("q", "jamlanma qoldiq").param("expiringWithinDays", "30")
                        .param("minDaysLeft", "0").cookie(admin))
                .andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/stock").param("branchId", br).param("q", "jamlanma qoldiq").param("expiringWithinDays", "-1").cookie(admin))
                .andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/stock").param("branchId", br).param("q", "jamlanma qoldiq").param("expiringWithinDays", "90")
                        .param("minDaysLeft", "31").cookie(admin))
                .andExpect(jsonPath("$.total").value(0));
        Cookie accountant = loginAs("ACCOUNTANT", null);
        mvc.perform(get("/api/stock/products").cookie(accountant)).andExpect(status().isForbidden());
    }
}
