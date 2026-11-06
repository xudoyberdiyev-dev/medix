package uz.medix.inventory.writeoff;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

/** HC: darhol o'tkazish, tasdiq, Direktor chegarasi (5 000 000), tannarx ruxsati, zahira, filial doirasi, bazadagi himoya, parallel. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class WriteOffIT {

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
    WriteOffs writeOffs;

    @Autowired
    TransactionTemplate tx;

    private record Place(long branchId, long warehouseId, long main, long quarantine, long safe, long otherWarehouseMain) {}

    private Place place() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        Long branch = jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'HC sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(600_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElse(null);
        if (branch == null) {
            return place();
        }
        long b = branch;
        Warehouses.Warehouse w = tx.execute(s -> warehouses.create(b, "HC ombor " + code, null, Set.of(ZoneType.SAFE)));
        Warehouses.Warehouse w2 = tx.execute(s -> warehouses.create(b, "HC ombor 2 " + code, null, Set.of()));
        return new Place(b, w.id(), zone(w, ZoneType.MAIN), zone(w, ZoneType.QUARANTINE), zone(w, ZoneType.SAFE), zone(w2, ZoneType.MAIN));
    }

    private static long zone(Warehouses.Warehouse w, ZoneType t) {
        return w.zones().stream().filter(z -> z.type() == t).findFirst().orElseThrow().id();
    }

    private long product(String name) {
        return jdbc.sql("""
                INSERT INTO product (code, name, unit_id, search_text) SELECT :c, :n, id, lower(:n) FROM unit WHERE short_name = 'dona' RETURNING id""")
                .param("c", String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999)))
                .param("n", name)
                .query(Long.class)
                .single();
    }

    /** Partiya va zonada boshlang'ich qoldiq. */
    private long stocked(long zone, String name, int qty) {
        return stocked(zone, name, qty, "1000.00");
    }

    private long stocked(long zone, String name, int qty, String cost) {
        long p = product(name);
        long b = tx.execute(s -> ledger.createBatch(p, "HC-" + UUID.randomUUID().toString().substring(0, 6), null, LocalDate.of(2029, 1, 1),
                Money.of(cost), false, "BQ", null));
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 1, "BQ-HCT-000001"), List.of(Move.in(zone, b, qty))));
        return b;
    }

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "hc" + UUID.randomUUID().toString().substring(0, 8);
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

    private static String doc(long zone, String reason, String note, long batch, int qty) {
        return "{\"zoneId\":" + zone + ",\"reason\":\"" + reason + "\",\"actNo\":\"A-1\",\"commission\":\"Komissiya\",\"note\":"
                + (note == null ? "null" : "\"" + note + "\"") + ",\"lines\":[{\"batchId\":" + batch + ",\"qty\":" + qty + "}]}";
    }

    private int bal(long zone, long batch) {
        return ledger.balance(zone, batch);
    }

    @Test
    void managerPostsImmediately() throws Exception {
        Place p = place();
        long b = stocked(p.quarantine(), "HC darhol", 10, "1250.50");
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());

        long id = id(send(post("/api/write-offs"), manager, doc(p.quarantine(), "EXPIRED", null, b, 4))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(matchesPattern("HC-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.reason").value("EXPIRED"))
                .andExpect(jsonPath("$.needsDirector").value(false))
                .andExpect(jsonPath("$.totalCost").value("5002.00"))
                .andExpect(jsonPath("$.lines[0].cost").value("1250.50"))
                .andExpect(jsonPath("$.actNo").value("A-1"))
                .andExpect(jsonPath("$.totalQty").value(4))
                .andReturn());
        assertThat(bal(p.quarantine(), b)).isEqualTo(6);
        assertThat(jdbc.sql("SELECT sum(qty) FROM stock_move WHERE doc_type = 'HC' AND doc_id = :id").param("id", id).query(Long.class).single())
                .isEqualTo(-4);

        // Yetmaydi — hech narsa yozilmaydi
        send(post("/api/write-offs"), manager, doc(p.quarantine(), "DAMAGED", null, b, 7))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("hc.notEnough"));
        assertThat(bal(p.quarantine(), b)).isEqualTo(6);
        // «Boshqa» — izohsiz bo'lmaydi
        send(post("/api/write-offs"), manager, doc(p.quarantine(), "OTHER", null, b, 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("hc.noteRequired"));
        send(post("/api/write-offs"), manager, doc(p.quarantine(), "OTHER", "Kemiruvchi", b, 1))
                .andExpect(jsonPath("$.status").value("POSTED"));
        assertThat(bal(p.quarantine(), b)).isEqualTo(5);

        mvc.perform(get("/api/write-offs/zone-stock").param("zoneId", String.valueOf(p.quarantine())).cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].batchId").value(b))
                .andExpect(jsonPath("$[0].free").value(5))
                .andExpect(jsonPath("$[0].expired").value(false));
    }

    @Test
    void keeperCreatesPendingWithoutCostThenManagerApproves() throws Exception {
        Place p = place();
        long b = stocked(p.quarantine(), "HC tasdiq", 5);
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());

        long id = id(send(post("/api/write-offs"), keeper, doc(p.quarantine(), "DAMAGED", null, b, 5))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.totalCost").doesNotExist())
                .andExpect(jsonPath("$.lines[0].cost").doesNotExist())
                .andReturn());
        assertThat(bal(p.quarantine(), b)).isEqualTo(5);
        assertThat(jdbc.sql("SELECT count(*) FROM notification WHERE dedup_key = :k").param("k", "hc.approval:" + id)
                .query(Long.class).single()).isPositive();
        mvc.perform(get("/api/write-offs").param("status", "PENDING").cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].totalCost").doesNotExist());

        send(post("/api/write-offs/" + id + "/approve"), keeper, "{}").andExpect(status().isForbidden());
        send(post("/api/write-offs/" + id + "/approve"), manager, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.postedBy").value("Sinov"))
                .andExpect(jsonPath("$.totalCost").value("5000.00"));
        assertThat(bal(p.quarantine(), b)).isZero();
        send(post("/api/write-offs/" + id + "/reject"), manager, "{\"reason\":\"kech\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("hc.notPending"));

        // Rad etish — tovar joyida qoladi
        long b2 = stocked(p.quarantine(), "HC rad", 3);
        long id2 = id(send(post("/api/write-offs"), keeper, doc(p.quarantine(), "EXPIRED", null, b2, 3)).andReturn());
        send(post("/api/write-offs/" + id2 + "/reject"), manager, "{\"reason\":\"Akt yo'q\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.rejectReason").value("Akt yo'q"));
        assertThat(bal(p.quarantine(), b2)).isEqualTo(3);
    }

    @Test
    void aboveLimitNeedsDirector() throws Exception {
        Place p = place();
        long b = stocked(p.main(), "HC katta", 20, "1000000.00");
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        Cookie director = loginAs("DIRECTOR", null);

        // Aynan 5 000 000 — chegaradan katta emas, Filial rahbari darhol o'tkazadi
        send(post("/api/write-offs"), manager, doc(p.main(), "DAMAGED", null, b, 5))
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.needsDirector").value(false));
        long id = id(send(post("/api/write-offs"), manager, doc(p.main(), "DAMAGED", null, b, 6))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.needsDirector").value(true))
                .andExpect(jsonPath("$.totalCost").value("6000000.00"))
                .andReturn());
        assertThat(bal(p.main(), b)).isEqualTo(15);
        send(post("/api/write-offs/" + id + "/approve"), manager, "{}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("hc.directorRequired"));
        send(post("/api/write-offs/" + id + "/reject"), manager, "{\"reason\":\"x\"}")
                .andExpect(status().isForbidden());
        send(post("/api/write-offs/" + id + "/approve"), director, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("POSTED"));
        assertThat(bal(p.main(), b)).isEqualTo(9);
    }

    @Test
    void reservedStockScopeAndPermissions() throws Exception {
        Place p = place();
        Place other = place();
        long b = stocked(p.main(), "HC zahira", 10);
        long product = jdbc.sql("SELECT product_id FROM batch WHERE id = :b").param("b", b).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO stock_reservation (doc_type, doc_id, doc_line_id, doc_number, zone_id, batch_id, product_id, warehouse_id, qty)
                VALUES ('BY', 1, 1, 'BY-HCT-000001', :z, :b, :p, :w, 7)""")
                .param("z", p.main())
                .param("b", b)
                .param("p", product)
                .param("w", p.warehouseId())
                .update();
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        send(post("/api/write-offs"), manager, doc(p.main(), "DAMAGED", null, b, 4))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("hc.notEnough"));
        long id = id(send(post("/api/write-offs"), manager, doc(p.main(), "DAMAGED", null, b, 3)).andExpect(status().isCreated()).andReturn());
        assertThat(bal(p.main(), b)).isEqualTo(7);

        Cookie otherManager = loginAs("BRANCH_MANAGER", other.branchId());
        mvc.perform(get("/api/write-offs/" + id).cookie(otherManager)).andExpect(status().isNotFound());
        send(post("/api/write-offs"), otherManager, doc(p.main(), "DAMAGED", null, b, 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("stock.zoneUnknown"));
        Cookie operator = loginAs("OPERATOR", p.branchId());
        send(post("/api/write-offs"), operator, doc(p.main(), "DAMAGED", null, b, 1)).andExpect(status().isForbidden());
        mvc.perform(get("/api/write-offs").cookie(operator)).andExpect(status().isForbidden());

        // Bazadagi himoya: o'tkazilgan hujjat o'zgarmaydi
        assertThatThrownBy(() -> jdbc.sql("UPDATE write_off SET note = 'x' WHERE id = :id").param("id", id).update())
                .hasMessageContaining("yakunlangan");
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM write_off_line WHERE write_off_id = :id").param("id", id).update())
                .hasMessageContaining("o'chirilmaydi");
        assertThatThrownBy(() -> jdbc.sql("UPDATE write_off_line SET qty = 2 WHERE write_off_id = :id").param("id", id).update())
                .hasMessageContaining("o'zgarmaydi");
    }

    /** Parallel hisobdan chiqarishlar: 20 donadan 3 tadan — aniq 6 tasi o'tadi, qoldiq manfiy emas, jurnal = qoldiq. */
    @Test
    void parallelWriteOffsNeverGoNegative() throws Exception {
        Place p = place();
        long b = stocked(p.quarantine(), "HC parallel", 20);
        long actor = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :l, 'Parallel', id, :b, 'x', false FROM role WHERE code = 'BRANCH_MANAGER' RETURNING id""")
                .param("l", "hcp" + UUID.randomUUID().toString().substring(0, 8))
                .param("b", p.branchId())
                .query(Long.class)
                .single();
        var a = new uz.medix.shared.security.Actor(actor, p.branchId(), false);
        ExecutorService pool = Executors.newFixedThreadPool(8);
        List<Future<Boolean>> results = new ArrayList<>();
        List<String> errors = java.util.Collections.synchronizedList(new ArrayList<>());
        for (int i = 0; i < 10; i++) {
            Callable<Boolean> job = () -> {
                try {
                    writeOffs.create(a, new WriteOffModels.WriteOffRequest(p.quarantine(), WriteOffModels.Reason.EXPIRED, null, null, null,
                            List.of(new WriteOffModels.WriteOffLineRequest(b, 3))), new WriteOffs.Approver(true, false));
                    return true;
                } catch (RuntimeException e) {
                    if (e.getMessage() != null && e.getMessage().contains("deadlock")) {
                        throw e;
                    }
                    errors.add(e.getClass().getSimpleName() + ": " + e.getMessage());
                    return false;
                }
            };
            results.add(pool.submit(job));
        }
        int ok = 0;
        for (Future<Boolean> f : results) {
            if (f.get()) {
                ok++;
            }
        }
        pool.shutdown();
        assertThat(ok).as("xatolar: %s", errors).isEqualTo(6);
        assertThat(bal(p.quarantine(), b)).isEqualTo(2);
        long journal = jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_move WHERE batch_id = :b AND zone_id = :z")
                .param("b", b)
                .param("z", p.quarantine())
                .query(Long.class)
                .single();
        assertThat(journal).isEqualTo(2);
    }
}
