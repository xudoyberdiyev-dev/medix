package uz.medix.inventory.count;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.RepeatedTest;
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

/**
 * IN: to'liq oqim (qoralama → sanoq → tekshirish → tasdiq), qulf (ivLock), topilgan partiya, Direktor chegarasi va nazoratdagi tovar,
 * ko'r sanoq va tannarx ruxsati, bitta faol hujjat, bazadagi himoya, sanoqni ochish va parallel ombor harakatlari.
 */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class InventoryCountIT {

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
    InventoryCounts counts;

    @Autowired
    TransactionTemplate tx;

    private record Place(long branchId, long warehouseId, long main, long quarantine, long safe, long otherWarehouseMain) {}

    private Place place() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        Long branch = jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'IN sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(600_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElse(null);
        if (branch == null) {
            return place();
        }
        long b = branch;
        Warehouses.Warehouse w = tx.execute(s -> warehouses.create(b, "IN ombor " + code, null, Set.of(ZoneType.SAFE)));
        Warehouses.Warehouse w2 = tx.execute(s -> warehouses.create(b, "IN ombor 2 " + code, null, Set.of()));
        return new Place(b, w.id(), zone(w, ZoneType.MAIN), zone(w, ZoneType.QUARANTINE), zone(w, ZoneType.SAFE), zone(w2, ZoneType.MAIN));
    }

    private static long zone(Warehouses.Warehouse w, ZoneType t) {
        return w.zones().stream().filter(z -> z.type() == t).findFirst().orElseThrow().id();
    }

    private long product(String name) {
        return product(name, false);
    }

    private long product(String name, boolean controlled) {
        return jdbc.sql("""
                INSERT INTO product (code, name, unit_id, search_text, controlled)
                SELECT :c, :n, id, lower(:n), :ctl FROM unit WHERE short_name = 'dona' RETURNING id""")
                .param("c", String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999)))
                .param("n", name)
                .param("ctl", controlled)
                .query(Long.class)
                .single();
    }

    /** Partiya va zonada boshlang'ich qoldiq. */
    private long stocked(long zone, String name, int qty) {
        return stocked(zone, name, qty, "1000.00");
    }

    private long stocked(long zone, String name, int qty, String cost) {
        return stocked(zone, product(name), qty, cost);
    }

    private long stocked(long zone, long p, int qty, String cost) {
        long b = tx.execute(s -> ledger.createBatch(p, "IN-" + UUID.randomUUID().toString().substring(0, 6), null, LocalDate.of(2029, 1, 1),
                Money.of(cost), false, "BQ", null));
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 1, "BQ-INT-000001"), List.of(Move.in(zone, b, qty))));
        return b;
    }

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "in" + UUID.randomUUID().toString().substring(0, 8);
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

    private ResultActions send(MockHttpServletRequestBuilder b, Cookie session, String body) throws Exception {
        return mvc.perform(b.with(csrf()).cookie(session).contentType(MediaType.APPLICATION_JSON).content(body))
                .andDo(r -> {
                    if (r.getResponse().getStatus() >= 500) {
                        throw new AssertionError("500: " + r.getResolvedException(), r.getResolvedException());
                    }
                });
    }

    private static long id(MvcResult r) throws Exception {
        return Long.parseLong(r.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));
    }

    private static long id(MvcResult r) throws Exception {
        return Long.parseLong(r.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));
    }

    private static String create(long warehouse, Long zone, boolean blind) {
        return "{\"warehouseId\":" + warehouse + ",\"zoneId\":" + zone + ",\"blind\":" + blind + ",\"commission\":\"Komissiya\"}";
    }

    private long lineId(long count, long zone, long batch) {
        return jdbc.sql("SELECT id FROM inventory_count_line WHERE count_id = :c AND zone_id = :z AND batch_id = :b")
                .param("c", count)
                .param("z", zone)
                .param("b", batch)
                .query(Long.class)
                .single();
    }

    private static String entry(long line, int qty) {
        return "{\"entries\":[{\"lineId\":" + line + ",\"countedQty\":" + qty + "}]}";
    }

    private int bal(long zone, long batch) {
        return ledger.balance(zone, batch);
    }

    @Test
    void fullFlowWithLockShortageSurplusAndFoundBatch() throws Exception {
        Place p = place();
        long a = stocked(p.main(), "IN kamomad", 10, "1000.00");
        long b = stocked(p.main(), "IN ortiqcha", 5, "200.00");
        long q = stocked(p.quarantine(), "IN karantin", 3, "50.00");
        long found = stocked(p.otherWarehouseMain(), "IN topilgan", 1, "300.00");
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());

        long id = id(send(post("/api/inventory-counts"), manager, create(p.warehouseId(), null, false))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(matchesPattern("IN-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.lines.length()").value(0))
                .andReturn());
        // Qoralama qulflamaydi
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 2, "BQ-INT-000002"), List.of(Move.in(p.main(), a, 2))));
        assertThat(bal(p.main(), a)).isEqualTo(12);

        send(post("/api/inventory-counts/" + id + "/start"), manager, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COUNTING"))
                .andExpect(jsonPath("$.lines.length()").value(3));
        // Sanoq davomida qamrovdagi zonada harakat yo'q, boshqa omborda — bor
        assertThatThrownBy(() -> tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 3, "BQ-INT-000003"),
                List.of(Move.out(p.quarantine(), q, 1))))).hasMessageContaining("stock.inventoryLock");
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 4, "BQ-INT-000004"), List.of(Move.in(p.otherWarehouseMain(), found, 1))));

        // Sanalmagan qator bor — tekshiruvga yuborilmaydi
        send(put("/api/inventory-counts/" + id + "/counts"), manager, entry(lineId(id, p.main(), a), 9)).andExpect(status().isOk());
        send(post("/api/inventory-counts/" + id + "/submit"), manager, "")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("inventory.notCounted"));
        send(put("/api/inventory-counts/" + id + "/counts"), manager, "{\"entries\":[{\"lineId\":" + lineId(id, p.main(), b)
                + ",\"countedQty\":7},{\"lineId\":" + lineId(id, p.quarantine(), q) + ",\"countedQty\":3},{\"zoneId\":" + p.main()
                + ",\"batchId\":" + found + ",\"countedQty\":2}]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines.length()").value(4))
                .andExpect(jsonPath("$.counted").value(4));
        // Qamrovdan tashqari zona
        send(put("/api/inventory-counts/" + id + "/counts"), manager, "{\"entries\":[{\"zoneId\":" + p.otherWarehouseMain()
                + ",\"batchId\":" + found + ",\"countedQty\":2}]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("inventory.zoneOutOfScope"));

        send(post("/api/inventory-counts/" + id + "/submit"), manager, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CHECK"))
                .andExpect(jsonPath("$.shortageQty").value(3))
                .andExpect(jsonPath("$.shortageCost").value("3000.00"))
                .andExpect(jsonPath("$.surplusQty").value(4))
                .andExpect(jsonPath("$.surplusCost").value("1000.00"))
                .andExpect(jsonPath("$.needsDirector").value(false));
        // Tekshiruvda ham qulf
        assertThatThrownBy(() -> tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 5, "BQ-INT-000005"),
                List.of(Move.in(p.main(), a, 1))))).hasMessageContaining("stock.inventoryLock");

        send(post("/api/inventory-counts/" + id + "/approve"), manager, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("POSTED"));
        assertThat(bal(p.main(), a)).isEqualTo(9);
        assertThat(bal(p.main(), b)).isEqualTo(7);
        assertThat(bal(p.quarantine(), q)).isEqualTo(3);
        assertThat(bal(p.main(), found)).isEqualTo(2);
        assertThat(jdbc.sql("SELECT count(*) FROM stock_move WHERE doc_type = 'IN' AND doc_id = :id").param("id", id).query(Long.class).single())
                .isEqualTo(3);
        // Qulf yechildi
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 6, "BQ-INT-000006"), List.of(Move.out(p.quarantine(), q, 1))));
        assertThat(bal(p.quarantine(), q)).isEqualTo(2);

        // Bazadagi himoya: tasdiqlangan o'zgarmaydi, qatorlar o'chirilmaydi
        assertThatThrownBy(() -> jdbc.sql("UPDATE inventory_count SET note = 'x' WHERE id = :id").param("id", id).update())
                .hasMessageContaining("yakunlangan");
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM inventory_count_line WHERE count_id = :id").param("id", id).update())
                .hasMessageContaining("o'chirilmaydi");
        assertThatThrownBy(() -> jdbc.sql("UPDATE inventory_count_line SET counted_qty = 1 WHERE count_id = :id").param("id", id).update())
                .hasMessageContaining("sanoqda");
    }

    @Test
    void directorLevelForLargeShortageAndControlledDiff() throws Exception {
        Place p = place();
        long big = stocked(p.main(), "IN qimmat", 10, "600000.00");
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        Cookie director = loginAs("DIRECTOR", null);

        long id = id(send(post("/api/inventory-counts"), manager, create(p.warehouseId(), p.main(), false)).andReturn());
        send(post("/api/inventory-counts/" + id + "/start"), manager, "").andExpect(status().isOk());
        // 9 × 600 000 = 5 400 000 > 5 000 000
        send(put("/api/inventory-counts/" + id + "/counts"), manager, entry(lineId(id, p.main(), big), 1)).andExpect(status().isOk());
        send(post("/api/inventory-counts/" + id + "/submit"), manager, "")
                .andExpect(jsonPath("$.needsDirector").value(true))
                .andExpect(jsonPath("$.shortageCost").value("5400000.00"));
        send(post("/api/inventory-counts/" + id + "/approve"), manager, "")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("inventory.directorRequired"));
        assertThat(bal(p.main(), big)).isEqualTo(10);
        // Qayta sanash — 8 × 600 000 = 4 800 000, chegaradan past
        send(post("/api/inventory-counts/" + id + "/recount"), manager, "").andExpect(jsonPath("$.status").value("COUNTING"));
        send(put("/api/inventory-counts/" + id + "/counts"), manager, entry(lineId(id, p.main(), big), 2)).andExpect(status().isOk());
        send(post("/api/inventory-counts/" + id + "/submit"), manager, "").andExpect(jsonPath("$.needsDirector").value(false));
        send(post("/api/inventory-counts/" + id + "/approve"), manager, "").andExpect(jsonPath("$.status").value("POSTED"));
        assertThat(bal(p.main(), big)).isEqualTo(2);

        // Nazoratdagi tovarda 1 dona farq ham — Direktor
        long ctl = stocked(p.safe(), product("IN nazoratdagi", true), 4, "10.00");
        long id2 = id(send(post("/api/inventory-counts"), manager, create(p.warehouseId(), p.safe(), false)).andReturn());
        send(post("/api/inventory-counts/" + id2 + "/start"), manager, "").andExpect(status().isOk());
        send(put("/api/inventory-counts/" + id2 + "/counts"), manager, entry(lineId(id2, p.safe(), ctl), 5)).andExpect(status().isOk());
        send(post("/api/inventory-counts/" + id2 + "/submit"), manager, "").andExpect(jsonPath("$.needsDirector").value(true));
        send(post("/api/inventory-counts/" + id2 + "/approve"), manager, "").andExpect(status().isForbidden());
        send(post("/api/inventory-counts/" + id2 + "/approve"), director, "").andExpect(jsonPath("$.status").value("POSTED"));
        assertThat(bal(p.safe(), ctl)).isEqualTo(5);
    }

    @Test
    void blindCountHidesBookAndCostIsPermissionBound() throws Exception {
        Place p = place();
        long a = stocked(p.main(), "IN ko'r", 6, "100.00");
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());

        // Ombor mudiri yaratmaydi, sanoqni ochmaydi
        send(post("/api/inventory-counts"), keeper, create(p.warehouseId(), null, true)).andExpect(status().isForbidden());
        long id = id(send(post("/api/inventory-counts"), manager, create(p.warehouseId(), null, true)).andReturn());
        send(post("/api/inventory-counts/" + id + "/start"), keeper, "").andExpect(status().isForbidden());
        send(post("/api/inventory-counts/" + id + "/start"), manager, "").andExpect(status().isOk());

        mvc.perform(get("/api/inventory-counts/" + id).cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bookHidden").value(true))
                .andExpect(jsonPath("$.lines[0].bookQty").doesNotExist())
                .andExpect(jsonPath("$.lines[0].cost").doesNotExist());
        mvc.perform(get("/api/inventory-counts/" + id).cookie(manager))
                .andExpect(jsonPath("$.bookHidden").value(false))
                .andExpect(jsonPath("$.lines[0].bookQty").value(6))
                .andExpect(jsonPath("$.lines[0].cost").value("100.00"));
        send(put("/api/inventory-counts/" + id + "/counts"), keeper, entry(lineId(id, p.main(), a), 5))
                .andExpect(jsonPath("$.lines[0].countedQty").value(5))
                .andExpect(jsonPath("$.lines[0].diff").doesNotExist());
        send(post("/api/inventory-counts/" + id + "/submit"), keeper, "")
                .andExpect(jsonPath("$.status").value("CHECK"))
                .andExpect(jsonPath("$.lines[0].bookQty").value(6))
                .andExpect(jsonPath("$.lines[0].diff").value(-1))
                .andExpect(jsonPath("$.shortageCost").doesNotExist());
        mvc.perform(get("/api/inventory-counts").cookie(keeper))
                .andExpect(jsonPath("$.items[0].shortageQty").value(1))
                .andExpect(jsonPath("$.items[0].shortageCost").doesNotExist());
        send(post("/api/inventory-counts/" + id + "/approve"), keeper, "").andExpect(status().isForbidden());

        // Boshqa filial xodimi ko'rmaydi
        Place other = place();
        Cookie stranger = loginAs("BRANCH_MANAGER", other.branchId());
        mvc.perform(get("/api/inventory-counts/" + id).cookie(stranger)).andExpect(status().isNotFound());
    }

    @Test
    void oneActivePerWarehouseAndCancelReleasesLock() throws Exception {
        Place p = place();
        long a = stocked(p.main(), "IN bekor", 4);
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());

        long id = id(send(post("/api/inventory-counts"), manager, create(p.warehouseId(), p.main(), false)).andReturn());
        send(post("/api/inventory-counts"), manager, create(p.warehouseId(), p.quarantine(), false))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("inventory.alreadyActive"));
        send(post("/api/inventory-counts/" + id + "/start"), manager, "").andExpect(status().isOk());
        send(post("/api/inventory-counts/" + id + "/cancel"), manager, "{\"reason\":\"Xato ochildi\"}")
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.cancelReason").value("Xato ochildi"));
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 7, "BQ-INT-000007"), List.of(Move.out(p.main(), a, 1))));
        assertThat(bal(p.main(), a)).isEqualTo(3);
        send(post("/api/inventory-counts/" + id + "/cancel"), manager, "{\"reason\":\"yana\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("inventory.finished"));
        send(post("/api/inventory-counts"), manager, create(p.warehouseId(), null, false)).andExpect(status().isCreated());
    }

    /**
     * Sanoqni ochish va parallel ombor harakatlari: har bir harakat yo surat olinishidan oldin to'liq yoziladi (suratda bor), yo qulf
     * bilan rad etiladi — surat (book_qty) doim haqiqiy qoldiqqa teng.
     */
    @RepeatedTest(3)
    void startSnapshotIsConsistentUnderParallelMoves() throws Exception {
        Place p = place();
        long a = stocked(p.main(), "IN parallel", 100);
        long actor = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :l, 'Parallel', id, :b, 'x', false FROM role WHERE code = 'BRANCH_MANAGER' RETURNING id""")
                .param("l", "inp" + UUID.randomUUID().toString().substring(0, 8))
                .param("b", p.branchId())
                .query(Long.class)
                .single();
        var who = new uz.medix.shared.security.Actor(actor, p.branchId(), false);
        long id = counts.create(who, new InventoryCountModels.CountRequest(p.warehouseId(), null, false, null, null));
        ExecutorService pool = Executors.newFixedThreadPool(3);
        List<Future<Boolean>> results = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            int n = i;
            Callable<Boolean> job = () -> {
                try {
                    tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 100 + n, "BQ-INP-" + n), List.of(Move.out(p.main(), a, 1))));
                    return true;
                } catch (RuntimeException e) {
                    if (e.getMessage() == null || !e.getMessage().contains("stock.inventoryLock")) {
                        throw e;
                    }
                    return false;
                }
            };
            results.add(pool.submit(job));
            if (i == 5) {
                results.add(pool.submit(() -> {
                    counts.start(who, id);
                    return null;
                }));
            }
        }
        for (Future<Boolean> f : results) {
            f.get();
        }
        pool.shutdown();
        int book = jdbc.sql("SELECT book_qty FROM inventory_count_line WHERE count_id = :c").param("c", id).query(Integer.class).single();
        assertThat(book).isEqualTo(bal(p.main(), a));
    }
}
