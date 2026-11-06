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
}
