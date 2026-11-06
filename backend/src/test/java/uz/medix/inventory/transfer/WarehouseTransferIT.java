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

/** OK: qoralama → jo'natish → qabul (kamomad bilan), zahira, filial doirasi va ruxsatlar, bazadagi himoya, parallel jo'natish. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class WarehouseTransferIT {

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
    WarehouseTransfers transfers;

    @Autowired
    TransactionTemplate tx;

    private record Place(long branchId, long warehouseId, long main, long target, long targetReceiving, long targetMain) {}

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
        Warehouses.Warehouse w = tx.execute(s -> warehouses.create(b, "OK ombor " + code, null, Set.of(ZoneType.SAFE)));
        Warehouses.Warehouse w2 = tx.execute(s -> warehouses.create(b, "OK ombor 2 " + code, null, Set.of()));
        return new Place(b, w.id(), zone(w, ZoneType.MAIN), w2.id(), zone(w2, ZoneType.RECEIVING), zone(w2, ZoneType.MAIN));
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
        long b = tx.execute(s -> ledger.createBatch(p, "OK-" + UUID.randomUUID().toString().substring(0, 6), null, LocalDate.of(2029, 1, 1),
                Money.of("1000.00"), false, "BQ", null));
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 1, "BQ-OKT-000001"), List.of(Move.in(zone, b, qty))));
        return b;
    }

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "ok" + UUID.randomUUID().toString().substring(0, 8);
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

    private static String doc(long fromZone, long toWarehouse, long batch, int qty) {
        return "{\"fromZoneId\":" + fromZone + ",\"toWarehouseId\":" + toWarehouse + ",\"note\":null,\"lines\":[{\"batchId\":" + batch
                + ",\"qty\":" + qty + "}]}";
    }

    private int bal(long zone, long batch) {
        return ledger.balance(zone, batch);
    }

    private long lineId(long transferId) {
        return jdbc.sql("SELECT id FROM warehouse_transfer_line WHERE transfer_id = :t").param("t", transferId).query(Long.class).single();
    }

    @Test
    void draftSendReceiveFull() throws Exception {
        Place p = place();
        long b = stocked(p.main(), "OK toliq", 10);
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());

        long id = id(send(post("/api/warehouse-transfers"), manager, doc(p.main(), p.target(), b, 4))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(matchesPattern("OK-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.totalQty").value(4))
                .andReturn());
        assertThat(bal(p.main(), b)).isEqualTo(10);
        // Ombor mudirida transfer.ok yo'q — qoralama tuzmaydi, lekin jo'natadi
        send(post("/api/warehouse-transfers"), keeper, doc(p.main(), p.target(), b, 1)).andExpect(status().isForbidden());
        send(post("/api/warehouse-transfers/" + id + "/receive"), keeper, "{\"toZoneId\":" + p.targetReceiving() + "}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("transfer.ok.badStatus"));

        send(post("/api/warehouse-transfers/" + id + "/send"), keeper, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_TRANSIT"))
                .andExpect(jsonPath("$.sentBy").value("Sinov"));
        assertThat(bal(p.main(), b)).isEqualTo(6);
        assertThat(jdbc.sql("SELECT count(*) FROM notification WHERE dedup_key = :k").param("k", "transfer.ok.sent:" + id)
                .query(Long.class).single()).isPositive();
        // Yo'ldagini bekor qilib bo'lmaydi
        send(post("/api/warehouse-transfers/" + id + "/cancel"), manager, "{}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("transfer.ok.badStatus"));
        // Boshqa ombor zonasiga qabul qilinmaydi
        send(post("/api/warehouse-transfers/" + id + "/receive"), keeper, "{\"toZoneId\":" + p.main() + "}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("transfer.ok.zoneNotInTarget"));

        send(post("/api/warehouse-transfers/" + id + "/receive"), keeper, "{\"toZoneId\":" + p.targetReceiving() + "}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RECEIVED"))
                .andExpect(jsonPath("$.shortageQty").value(0))
                .andExpect(jsonPath("$.toZone.type").value("RECEIVING"))
                .andExpect(jsonPath("$.lines[0].receivedQty").value(4));
        assertThat(bal(p.targetReceiving(), b)).isEqualTo(4);
        long journal = jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_move WHERE doc_type = 'OK' AND doc_id = :id").param("id", id)
                .query(Long.class).single();
        assertThat(journal).isZero();

        mvc.perform(get("/api/warehouse-transfers").param("warehouseId", String.valueOf(p.target())).cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].fromZone.type").value("MAIN"));
    }

    @Test
    void shortageIsRecordedAndNeedsNote() throws Exception {
        Place p = place();
        long b = stocked(p.main(), "OK kamomad", 10);
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        long id = id(send(post("/api/warehouse-transfers"), manager, doc(p.main(), p.target(), b, 10)).andReturn());
        send(post("/api/warehouse-transfers/" + id + "/send"), manager, "{}").andExpect(status().isOk());
        long line = lineId(id);

        send(post("/api/warehouse-transfers/" + id + "/receive"), manager,
                "{\"toZoneId\":" + p.targetMain() + ",\"lines\":[{\"lineId\":" + line + ",\"receivedQty\":11}]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("transfer.ok.surplus"));
        send(post("/api/warehouse-transfers/" + id + "/receive"), manager,
                "{\"toZoneId\":" + p.targetMain() + ",\"lines\":[{\"lineId\":" + line + ",\"receivedQty\":8}]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("transfer.ok.shortageNote"));
        assertThat(bal(p.targetMain(), b)).isZero();

        send(post("/api/warehouse-transfers/" + id + "/receive"), manager,
                "{\"toZoneId\":" + p.targetMain() + ",\"note\":\"2 quti shikastlangan\",\"lines\":[{\"lineId\":" + line
                        + ",\"receivedQty\":8}]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.shortageQty").value(2))
                .andExpect(jsonPath("$.receiveNote").value("2 quti shikastlangan"));
        assertThat(bal(p.main(), b)).isZero();
        assertThat(bal(p.targetMain(), b)).isEqualTo(8);
        assertThat(jdbc.sql("SELECT count(*) FROM notification WHERE dedup_key = :k").param("k", "transfer.ok.shortage:" + id)
                .query(Long.class).single()).isPositive();
    }

    @Test
    void reservedStockAndValidation() throws Exception {
        Place p = place();
        long b = stocked(p.main(), "OK zahira", 10);
        long product = jdbc.sql("SELECT product_id FROM batch WHERE id = :b").param("b", b).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO stock_reservation (doc_type, doc_id, doc_line_id, doc_number, zone_id, batch_id, product_id, warehouse_id, qty)
                VALUES ('BY', 1, 1, 'BY-OKT-000001', :z, :b, :p, :w, 7)""")
                .param("z", p.main())
                .param("b", b)
                .param("p", product)
                .param("w", p.warehouseId())
                .update();
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        send(post("/api/warehouse-transfers"), manager, doc(p.main(), p.target(), b, 4))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("transfer.zk.notEnough"));
        send(post("/api/warehouse-transfers"), manager, doc(p.main(), p.warehouseId(), b, 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("transfer.ok.sameWarehouse"));
        long id = id(send(post("/api/warehouse-transfers"), manager, doc(p.main(), p.target(), b, 3)).andExpect(status().isCreated())
                .andReturn());
        send(post("/api/warehouse-transfers/" + id + "/cancel"), manager, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        send(post("/api/warehouse-transfers/" + id + "/send"), manager, "{}").andExpect(status().isConflict());
        assertThat(bal(p.main(), b)).isEqualTo(10);
    }

    @Test
    void branchScopeAndPermissions() throws Exception {
        Place p = place();
        Place other = place();
        long b = stocked(p.main(), "OK doira", 2);
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        long id = id(send(post("/api/warehouse-transfers"), manager, doc(p.main(), p.target(), b, 1)).andReturn());

        Cookie otherManager = loginAs("BRANCH_MANAGER", other.branchId());
        mvc.perform(get("/api/warehouse-transfers/" + id).cookie(otherManager)).andExpect(status().isNotFound());
        send(post("/api/warehouse-transfers/" + id + "/send"), otherManager, "{}").andExpect(status().isNotFound());
        send(post("/api/warehouse-transfers"), otherManager, doc(p.main(), p.target(), b, 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("stock.zoneUnknown"));
        send(post("/api/warehouse-transfers"), manager, doc(p.main(), other.target(), b, 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("transfer.ok.warehouseUnknown"));
        Cookie operator = loginAs("OPERATOR", p.branchId());
        mvc.perform(get("/api/warehouse-transfers").cookie(operator)).andExpect(status().isForbidden());
        Cookie purchaser = loginAs("PURCHASER", p.branchId());
        send(post("/api/warehouse-transfers/" + id + "/send"), purchaser, "{}").andExpect(status().isForbidden());
        // Xarid bo'limi qoralama tuzadi — manba zona partiyalarini ko'radi (transfer.ok), bo'sh = qoldiq − qoralama emas, qoldiq
        mvc.perform(get("/api/warehouse-transfers/zone-stock").param("zoneId", String.valueOf(p.main())).cookie(purchaser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].free").value(2));
        Cookie director = loginAs("DIRECTOR", null);
        // Direktor barcha filiallarni ko'radi; boshqa filial omboriga OK — FS kerak
        send(post("/api/warehouse-transfers"), director, doc(p.main(), other.target(), b, 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("transfer.ok.otherBranch"));
    }

    @Test
    void finishedDocumentIsProtectedInDatabase() throws Exception {
        Place p = place();
        long b = stocked(p.main(), "OK himoya", 2);
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        long id = id(send(post("/api/warehouse-transfers"), manager, doc(p.main(), p.target(), b, 1)).andReturn());
        send(post("/api/warehouse-transfers/" + id + "/send"), manager, "{}").andExpect(status().isOk());
        assertThatThrownBy(() -> jdbc.sql("UPDATE warehouse_transfer SET status = 'CANCELLED' WHERE id = :id").param("id", id).update())
                .hasMessageContaining("faqat qabul");
        assertThatThrownBy(() -> jdbc.sql("UPDATE warehouse_transfer_line SET qty = 2 WHERE transfer_id = :id").param("id", id).update())
                .hasMessageContaining("o'zgarmaydi");
        send(post("/api/warehouse-transfers/" + id + "/receive"), manager, "{\"toZoneId\":" + p.targetReceiving() + "}")
                .andExpect(status().isOk());
        assertThatThrownBy(() -> jdbc.sql("UPDATE warehouse_transfer SET note = 'x' WHERE id = :id").param("id", id).update())
                .hasMessageContaining("yakunlangan");
        assertThatThrownBy(() -> jdbc.sql("UPDATE warehouse_transfer_line SET received_qty = 0 WHERE transfer_id = :id").param("id", id)
                .update()).hasMessageContaining("o'zgarmaydi");
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM warehouse_transfer_line WHERE transfer_id = :id").param("id", id).update())
                .hasMessageContaining("o'chirilmaydi");
    }

    /** Bitta partiyadan parallel jo'natishlar: qoldiq manfiy bo'lmaydi, jurnal = qoldiq. */
    @Test
    void parallelSendsNeverOversell() throws Exception {
        Place p = place();
        long b = stocked(p.main(), "OK parallel", 20);
        long actor = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :l, 'Parallel', id, :b, 'x', false FROM role WHERE code = 'BRANCH_MANAGER' RETURNING id""")
                .param("l", "okp" + UUID.randomUUID().toString().substring(0, 8))
                .param("b", p.branchId())
                .query(Long.class)
                .single();
        var a = new uz.medix.shared.security.Actor(actor, p.branchId(), false);
        List<Long> ids = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            ids.add(transfers.create(a, new WarehouseTransferModels.WarehouseTransferRequest(p.main(), p.target(), null,
                    List.of(new WarehouseTransferModels.WarehouseTransferLineRequest(b, 3)))));
        }
        ExecutorService pool = Executors.newFixedThreadPool(8);
        List<Future<Boolean>> results = new ArrayList<>();
        for (long id : ids) {
            results.add(pool.submit(() -> {
                try {
                    transfers.send(a, id);
                    return true;
                } catch (RuntimeException e) {
                    if (e.getMessage() != null && e.getMessage().contains("deadlock")) {
                        throw e;
                    }
                    return false;
                }
            }));
        }
        int ok = 0;
        for (Future<Boolean> f : results) {
            if (f.get()) {
                ok++;
            }
        }
        pool.shutdown();
        assertThat(ok).isEqualTo(6);
        assertThat(bal(p.main(), b)).isEqualTo(2);
        long journal = jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_move WHERE batch_id = :b AND zone_id = :z")
                .param("b", b)
                .param("z", p.main())
                .query(Long.class)
                .single();
        assertThat(journal).isEqualTo(2);
    }
}
