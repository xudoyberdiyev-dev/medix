package uz.medix.inventory.transfer;

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

/** ZK: darhol o'tkazish, karantin → tasdiq, zahira ko'chirilmaydi, filial doirasi, bazadagi himoya, qarama-qarshi parallel ko'chirishlar. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ZoneTransferIT {

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
    ZoneTransfers transfers;

    @Autowired
    TransactionTemplate tx;

    private record Place(long branchId, long warehouseId, long main, long quarantine, long safe, long otherWarehouseMain) {}

    private Place place() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        Long branch = jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'ZK sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(600_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElse(null);
        if (branch == null) {
            return place();
        }
        long b = branch;
        Warehouses.Warehouse w = tx.execute(s -> warehouses.create(b, "ZK ombor " + code, null, Set.of(ZoneType.SAFE)));
        Warehouses.Warehouse w2 = tx.execute(s -> warehouses.create(b, "ZK ombor 2 " + code, null, Set.of()));
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
        long p = product(name);
        long b = tx.execute(s -> ledger.createBatch(p, "ZK-" + UUID.randomUUID().toString().substring(0, 6), null, LocalDate.of(2029, 1, 1),
                Money.of("1000.00"), false, "BQ", null));
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 1, "BQ-ZKT-000001"), List.of(Move.in(zone, b, qty))));
        return b;
    }

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "zk" + UUID.randomUUID().toString().substring(0, 8);
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

    private static String doc(long from, long to, long batch, int qty) {
        return "{\"fromZoneId\":" + from + ",\"toZoneId\":" + to + ",\"note\":null,\"lines\":[{\"batchId\":" + batch + ",\"qty\":" + qty + "}]}";
    }

    private int bal(long zone, long batch) {
        return ledger.balance(zone, batch);
    }

    @Test
    void sellableToSellableIsPostedImmediately() throws Exception {
        Place p = place();
        long b = stocked(p.main(), "ZK darhol", 10);
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());

        long id = id(send(post("/api/zone-transfers"), keeper, doc(p.main(), p.safe(), b, 4))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(matchesPattern("ZK-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.needsApproval").value(false))
                .andExpect(jsonPath("$.totalQty").value(4))
                .andReturn());
        assertThat(bal(p.main(), b)).isEqualTo(6);
        assertThat(bal(p.safe(), b)).isEqualTo(4);
        assertThat(jdbc.sql("SELECT count(*) FROM stock_move WHERE doc_type = 'ZK' AND doc_id = :id").param("id", id).query(Long.class).single())
                .isEqualTo(2);

        // Yetmaydi — hech narsa yozilmaydi
        send(post("/api/zone-transfers"), keeper, doc(p.main(), p.safe(), b, 7))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("transfer.zk.notEnough"));
        assertThat(bal(p.main(), b)).isEqualTo(6);
        // Boshqa ombor, bir xil zona
        send(post("/api/zone-transfers"), keeper, doc(p.main(), p.otherWarehouseMain(), b, 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("transfer.zk.otherWarehouse"));
        send(post("/api/zone-transfers"), keeper, doc(p.main(), p.main(), b, 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("transfer.zk.sameZone"));

        mvc.perform(get("/api/zone-transfers/zone-stock").param("zoneId", String.valueOf(p.main())).cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].batchId").value(b))
                .andExpect(jsonPath("$[0].free").value(6));
    }

    @Test
    void quarantineToSellableNeedsApproval() throws Exception {
        Place p = place();
        long b = stocked(p.quarantine(), "ZK karantin", 5);
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());

        long id = id(send(post("/api/zone-transfers"), keeper, doc(p.quarantine(), p.main(), b, 5))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.needsApproval").value(true))
                .andReturn());
        assertThat(bal(p.quarantine(), b)).isEqualTo(5);
        assertThat(bal(p.main(), b)).isZero();

        send(post("/api/zone-transfers/" + id + "/approve"), keeper, "{}").andExpect(status().isForbidden());
        send(post("/api/zone-transfers/" + id + "/approve"), manager, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.postedBy").value("Sinov"));
        assertThat(bal(p.quarantine(), b)).isZero();
        assertThat(bal(p.main(), b)).isEqualTo(5);
        send(post("/api/zone-transfers/" + id + "/reject"), manager, "{\"reason\":\"kech\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("transfer.zk.notPending"));

        // Rad etish — tovar joyida qoladi; tasdiq ruxsati bor xodim yaratsa — darhol o'tadi
        long b2 = stocked(p.quarantine(), "ZK karantin 2", 3);
        long id2 = id(send(post("/api/zone-transfers"), keeper, doc(p.quarantine(), p.main(), b2, 3)).andReturn());
        send(post("/api/zone-transfers/" + id2 + "/reject"), manager, "{\"reason\":\"Sifat hujjati yo'q\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.rejectReason").value("Sifat hujjati yo'q"));
        assertThat(bal(p.quarantine(), b2)).isEqualTo(3);
        send(post("/api/zone-transfers"), manager, doc(p.quarantine(), p.main(), b2, 3))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("POSTED"));
        assertThat(bal(p.main(), b2)).isEqualTo(3);

        // Sotuvga ochiq zonadan karantinga — tasdiqsiz
        send(post("/api/zone-transfers"), keeper, doc(p.main(), p.quarantine(), b2, 1))
                .andExpect(jsonPath("$.status").value("POSTED"));
    }

    @Test
    void reservedStockIsNotMoved() throws Exception {
        Place p = place();
        long b = stocked(p.main(), "ZK zahira", 10);
        long product = jdbc.sql("SELECT product_id FROM batch WHERE id = :b").param("b", b).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO stock_reservation (doc_type, doc_id, doc_line_id, doc_number, zone_id, batch_id, product_id, warehouse_id, qty)
                VALUES ('BY', 1, 1, 'BY-ZKT-000001', :z, :b, :p, :w, 7)""")
                .param("z", p.main())
                .param("b", b)
                .param("p", product)
                .param("w", p.warehouseId())
                .update();
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        send(post("/api/zone-transfers"), keeper, doc(p.main(), p.safe(), b, 4))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("transfer.zk.notEnough"));
        send(post("/api/zone-transfers"), keeper, doc(p.main(), p.safe(), b, 3)).andExpect(status().isCreated());
        assertThat(bal(p.main(), b)).isEqualTo(7);
    }

    @Test
    void branchScopeAndPermissions() throws Exception {
        Place p = place();
        Place other = place();
        long b = stocked(p.main(), "ZK doira", 2);
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        long id = id(send(post("/api/zone-transfers"), keeper, doc(p.main(), p.safe(), b, 1)).andReturn());

        Cookie otherKeeper = loginAs("WAREHOUSE_MANAGER", other.branchId());
        mvc.perform(get("/api/zone-transfers/" + id).cookie(otherKeeper)).andExpect(status().isNotFound());
        send(post("/api/zone-transfers"), otherKeeper, doc(p.main(), p.safe(), b, 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("stock.zoneUnknown"));
        Cookie operator = loginAs("OPERATOR", p.branchId());
        send(post("/api/zone-transfers"), operator, doc(p.main(), p.safe(), b, 1)).andExpect(status().isForbidden());
        Cookie accountant = loginAs("ACCOUNTANT", null);
        mvc.perform(get("/api/zone-transfers").param("branchId", String.valueOf(p.branchId())).cookie(accountant))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].from.type").value("MAIN"))
                .andExpect(jsonPath("$.items[0].to.type").value("SAFE"));
    }

    @Test
    void postedDocumentIsProtectedInDatabase() throws Exception {
        Place p = place();
        long b = stocked(p.main(), "ZK himoya", 2);
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        long id = id(send(post("/api/zone-transfers"), keeper, doc(p.main(), p.safe(), b, 1)).andReturn());
        assertThatThrownBy(() -> jdbc.sql("UPDATE zone_transfer SET note = 'x' WHERE id = :id").param("id", id).update())
                .hasMessageContaining("yakunlangan");
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM zone_transfer_line WHERE transfer_id = :id").param("id", id).update())
                .hasMessageContaining("o'chirilmaydi");
        assertThatThrownBy(() -> jdbc.sql("UPDATE zone_transfer_line SET qty = 2 WHERE transfer_id = :id").param("id", id).update())
                .hasMessageContaining("o'zgarmaydi");
    }

    /** Qarama-qarshi yo'nalishdagi parallel ko'chirishlar: deadlock yo'q, qoldiq manfiy emas, jami saqlanadi. */
    @Test
    void oppositeParallelTransfersKeepTotals() throws Exception {
        Place p = place();
        long b = stocked(p.main(), "ZK parallel", 20);
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 2, "BQ-ZKT-000002"), List.of(Move.in(p.safe(), b, 20))));
        long actor = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :l, 'Parallel', id, :b, 'x', false FROM role WHERE code = 'WAREHOUSE_MANAGER' RETURNING id""")
                .param("l", "zkp" + UUID.randomUUID().toString().substring(0, 8))
                .param("b", p.branchId())
                .query(Long.class)
                .single();
        var a = new uz.medix.shared.security.Actor(actor, p.branchId(), false);
        ExecutorService pool = Executors.newFixedThreadPool(8);
        List<Future<Boolean>> results = new ArrayList<>();
        for (int i = 0; i < 16; i++) {
            boolean forward = i % 2 == 0;
            Callable<Boolean> job = () -> {
                try {
                    transfers.create(a, new ZoneTransferModels.ZoneTransferRequest(forward ? p.main() : p.safe(), forward ? p.safe() : p.main(),
                            null, List.of(new ZoneTransferModels.ZoneTransferLineRequest(b, 3))), false);
                    return true;
                } catch (RuntimeException e) {
                    if (e.getMessage() != null && e.getMessage().contains("deadlock")) {
                        throw e;
                    }
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
        assertThat(ok).isPositive();
        assertThat(bal(p.main(), b) + bal(p.safe(), b)).isEqualTo(40);
        assertThat(bal(p.main(), b)).isNotNegative();
        assertThat(bal(p.safe(), b)).isNotNegative();
        long journal = jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_move WHERE batch_id = :b AND zone_id = :z")
                .param("b", b)
                .param("z", p.main())
                .query(Long.class)
                .single();
        assertThat(journal).isEqualTo(bal(p.main(), b));
    }
}
