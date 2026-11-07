package uz.medix.inventory.transfer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.math.BigDecimal;
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

/**
 * FS: qoralama → jo'natish (qoldiq −, tannarx narxi, QQS, HF, filiallararo qarz) → qabul (xaridor qoldig'i +, partiya o'sha),
 * kamomad, filial doirasi, tannarx yashirinligi, bazadagi himoya, parallel jo'natish.
 */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class BranchSaleIT {

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
    BranchSales sales;

    @Autowired
    TransactionTemplate tx;

    private record Place(long branchId, long warehouseId, long main, long receiving) {}

    private Place place() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        Long branch = jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'FS sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(600_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElse(null);
        if (branch == null) {
            return place();
        }
        long b = branch;
        Warehouses.Warehouse w = tx.execute(s -> warehouses.create(b, "FS ombor " + code, null, Set.of()));
        return new Place(b, w.id(), zone(w, ZoneType.MAIN), zone(w, ZoneType.RECEIVING));
    }

    private static long zone(Warehouses.Warehouse w, ZoneType t) {
        return w.zones().stream().filter(z -> z.type() == t).findFirst().orElseThrow().id();
    }

    /** Partiya (tannarx 1 000,00, QQS 12%) va zonada boshlang'ich qoldiq. */
    private long stocked(long zone, String name, int qty) {
        long p = jdbc.sql("""
                INSERT INTO product (code, name, unit_id, search_text) SELECT :c, :n, id, lower(:n) FROM unit WHERE short_name = 'dona' RETURNING id""")
                .param("c", String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999)))
                .param("n", name)
                .query(Long.class)
                .single();
        long b = tx.execute(s -> ledger.createBatch(p, "FS-" + UUID.randomUUID().toString().substring(0, 6), null, LocalDate.of(2029, 1, 1),
                Money.of("1000.00"), false, "BQ", null));
        tx.executeWithoutResult(s -> ledger.post(new DocRef("BQ", 1, "BQ-FST-000001"), List.of(Move.in(zone, b, qty))));
        return b;
    }

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "fs" + UUID.randomUUID().toString().substring(0, 8);
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

    private static String doc(long fromZone, long toWarehouse, long batch, int qty) {
        return "{\"fromZoneId\":" + fromZone + ",\"toWarehouseId\":" + toWarehouse + ",\"lines\":[{\"batchId\":" + batch + ",\"qty\":" + qty
                + "}]}";
    }

    private int bal(long zone, long batch) {
        return ledger.balance(zone, batch);
    }

    private BigDecimal debt(long debtor, long creditor) {
        return jdbc.sql("SELECT coalesce(sum(amount), 0) FROM branch_ledger WHERE debtor_branch_id = :d AND creditor_branch_id = :c")
                .param("d", debtor)
                .param("c", creditor)
                .query(BigDecimal.class)
                .single();
    }

    @Test
    void sendAtCostWithInvoiceVatAndDebtThenReceive() throws Exception {
        Place seller = place();
        Place buyer = place();
        long b = stocked(seller.main(), "FS toliq", 10);
        Cookie manager = loginAs("BRANCH_MANAGER", seller.branchId());

        mvc.perform(get("/api/branch-sales/targets").param("sellerBranchId", String.valueOf(seller.branchId())).cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + buyer.warehouseId() + ")]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.id == " + seller.warehouseId() + ")]").isEmpty());
        send(post("/api/branch-sales"), manager, doc(seller.main(), seller.warehouseId(), b, 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("transfer.fs.sameBranch"));

        long id = id(send(post("/api/branch-sales"), manager, doc(seller.main(), buyer.warehouseId(), b, 4))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(matchesPattern("FS-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.buyer.id").value(buyer.branchId()))
                .andExpect(jsonPath("$.total").value(nullValue()))
                .andReturn());
        assertThat(bal(seller.main(), b)).isEqualTo(10);

        send(post("/api/branch-sales/" + id + "/send"), manager, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_TRANSIT"))
                .andExpect(jsonPath("$.invoiceNumber").value(matchesPattern("HF-[A-Z]{3}-\\d{6}")))
                .andExpect(jsonPath("$.total").value("4000.00"))
                .andExpect(jsonPath("$.vatTotal").value("428.57"))
                .andExpect(jsonPath("$.lines[0].unitCost").value("1000.00"))
                .andExpect(jsonPath("$.lines[0].vatRate").value("12"));
        assertThat(bal(seller.main(), b)).isEqualTo(6);
        assertThat(debt(buyer.branchId(), seller.branchId())).isEqualByComparingTo("4000.00");
        mvc.perform(get("/api/branch-sales/balances").cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.debtor.id == " + buyer.branchId() + ")].amount").value(org.hamcrest.Matchers.hasItem("4000.00")));
        byte[] bytes = mvc.perform(get("/api/branch-sales/" + id + "/pdf").cookie(manager))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        try (var pdf = org.apache.pdfbox.Loader.loadPDF(bytes)) {
            String text = new org.apache.pdfbox.text.PDFTextStripper().getText(pdf);
            assertThat(text).contains("Filiallararo savdo").contains("Hisob-faktura").contains("4.000,00").contains("428,57");
        }
        // Guruh ichidagi qarz mijoz / YB qarzi jurnaliga yozilmaydi
        assertThat(jdbc.sql("SELECT count(*) FROM party_ledger WHERE doc_id = :id AND doc_type = 'FS'").param("id", id).query(Long.class)
                .single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM notification WHERE dedup_key = :k").param("k", "transfer.fs.sent:" + id)
                .query(Long.class).single()).isPositive();

        // Sotuvchi filial xodimi xaridor nomidan qabul qila olmaydi
        send(post("/api/branch-sales/" + id + "/receive"), manager, "{\"toZoneId\":" + buyer.receiving() + "}")
                .andExpect(status().isNotFound());
        // Xaridor ombor mudiri: special.cost yo'q — summalar ko'rinmaydi
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", buyer.branchId());
        mvc.perform(get("/api/branch-sales").cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].total").value(nullValue()));
        mvc.perform(get("/api/branch-sales/balances").cookie(keeper)).andExpect(status().isForbidden());
        send(post("/api/branch-sales/" + id + "/receive"), keeper, "{\"toZoneId\":" + seller.receiving() + "}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("transfer.ok.zoneNotInTarget"));
        send(post("/api/branch-sales/" + id + "/receive"), keeper, "{\"toZoneId\":" + buyer.receiving() + "}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RECEIVED"))
                .andExpect(jsonPath("$.shortageQty").value(0))
                .andExpect(jsonPath("$.lines[0].receivedQty").value(4))
                .andExpect(jsonPath("$.lines[0].unitCost").value(nullValue()));
        // O'sha partiya (tannarx o'zgarmaydi) xaridor zonasida
        assertThat(bal(buyer.receiving(), b)).isEqualTo(4);
        long journal = jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_move WHERE doc_type = 'FS' AND doc_id = :id").param("id", id)
                .query(Long.class).single();
        assertThat(journal).isZero();
    }

    @Test
    void shortageNeedsNoteAndDebtStays() throws Exception {
        Place seller = place();
        Place buyer = place();
        long b = stocked(seller.main(), "FS kamomad", 5);
        Cookie director = loginAs("DIRECTOR", null);
        long id = id(send(post("/api/branch-sales"), director, doc(seller.main(), buyer.warehouseId(), b, 5)).andReturn());
        send(post("/api/branch-sales/" + id + "/send"), director, "{}").andExpect(status().isOk());
        long line = jdbc.sql("SELECT id FROM branch_sale_line WHERE sale_id = :t").param("t", id).query(Long.class).single();

        send(post("/api/branch-sales/" + id + "/receive"), director,
                "{\"toZoneId\":" + buyer.main() + ",\"lines\":[{\"lineId\":" + line + ",\"receivedQty\":3}]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("transfer.ok.shortageNote"));
        send(post("/api/branch-sales/" + id + "/receive"), director,
                "{\"toZoneId\":" + buyer.main() + ",\"note\":\"2 quti yo'q\",\"lines\":[{\"lineId\":" + line + ",\"receivedQty\":3}]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.shortageQty").value(2));
        assertThat(bal(buyer.main(), b)).isEqualTo(3);
        assertThat(debt(buyer.branchId(), seller.branchId())).isEqualByComparingTo("5000.00");
    }

    /** FS: 5 dona jo'natildi (5 000,00), 3 tasi qabul qilindi — kamomad 2 (2 000,00). */
    private long shortageSale(Place seller, Place buyer, long batch, Cookie director) throws Exception {
        long id = id(send(post("/api/branch-sales"), director, doc(seller.main(), buyer.warehouseId(), batch, 5)).andReturn());
        send(post("/api/branch-sales/" + id + "/send"), director, "{}").andExpect(status().isOk());
        long line = jdbc.sql("SELECT id FROM branch_sale_line WHERE sale_id = :t").param("t", id).query(Long.class).single();
        send(post("/api/branch-sales/" + id + "/receive"), director,
                "{\"toZoneId\":" + buyer.main() + ",\"note\":\"2 quti yo'q\",\"lines\":[{\"lineId\":" + line + ",\"receivedQty\":3}]}")
                .andExpect(status().isOk());
        return id;
    }

    @Test
    void shortageReturnedToSellerReducesBuyerDebt() throws Exception {
        Place seller = place();
        Place buyer = place();
        long b = stocked(seller.main(), "FS qaytarish", 5);
        long id = shortageSale(seller, buyer, b, loginAs("DIRECTOR", null));
        assertThat(bal(seller.main(), b)).isZero();

        Cookie buyerManager = loginAs("BRANCH_MANAGER", buyer.branchId());
        mvc.perform(get("/api/branch-sales/" + id + "/shortage").cookie(buyerManager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.open").value(true))
                .andExpect(jsonPath("$.shortageQty").value(2))
                .andExpect(jsonPath("$.amount").value("2000.00"))
                .andExpect(jsonPath("$.canResolveAsBuyer").value(true))
                .andExpect(jsonPath("$.canResolveAsSeller").value(false));
        // Tovar sotuvchi omborida topildi — faqat sotuvchi filial qaytaradi
        send(post("/api/branch-sales/" + id + "/shortage/resolve"), buyerManager, "{\"kind\":\"RETURN\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("transfer.fs.sellerOnly"));
        Cookie sellerManager = loginAs("BRANCH_MANAGER", seller.branchId());
        send(post("/api/branch-sales/" + id + "/shortage/resolve"), sellerManager, "{\"kind\":\"RETURN\",\"note\":\"Yuklanmay qolgan\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.open").value(false))
                .andExpect(jsonPath("$.history[0].bearer").value("SELLER"))
                .andExpect(jsonPath("$.history[0].debtChange").value("-2000.00"));
        assertThat(bal(seller.main(), b)).isEqualTo(2);
        assertThat(bal(buyer.main(), b)).isEqualTo(3);
        assertThat(debt(buyer.branchId(), seller.branchId())).isEqualByComparingTo("3000.00");
        send(post("/api/branch-sales/" + id + "/shortage/resolve"), sellerManager, "{\"kind\":\"RETURN\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("transfer.shortage.notOpen"));
        // Tannarx ruxsatisiz — summa yo'q
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", seller.branchId());
        mvc.perform(get("/api/branch-sales/" + id + "/shortage").cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amount").value(nullValue()))
                .andExpect(jsonPath("$.history[0].debtChange").value(nullValue()));
    }

    @Test
    void shortageWriteOffBearerDecidesDebtAndRejectReopens() throws Exception {
        Place seller = place();
        Place buyer = place();
        long b = stocked(seller.main(), "FS HC", 5);
        Cookie director = loginAs("DIRECTOR", null);
        long id = shortageSale(seller, buyer, b, director);
        send(post("/api/branch-sales/" + id + "/shortage/resolve"), director, "{\"kind\":\"WRITE_OFF\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("transfer.fs.bearerRequired"));

        // Sotuvchi zimmasida, hc.approve yo'q — HC tasdiq kutadi, qarz darhol kamayadi
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", seller.branchId());
        send(post("/api/branch-sales/" + id + "/shortage/resolve"), keeper, "{\"kind\":\"WRITE_OFF\",\"bearer\":\"SELLER\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.open").value(false))
                .andExpect(jsonPath("$.history[0].writeOffStatus").value("PENDING"));
        assertThat(debt(buyer.branchId(), seller.branchId())).isEqualByComparingTo("3000.00");
        long hc = jdbc.sql("SELECT id FROM write_off WHERE source_branch_sale_id = :s").param("s", id).query(Long.class).single();
        assertThat(jdbc.sql("SELECT zone_id FROM write_off WHERE id = :h").param("h", hc).query(Long.class).single()).isEqualTo(seller.main());

        Cookie sellerManager = loginAs("BRANCH_MANAGER", seller.branchId());
        send(post("/api/write-offs/" + hc + "/reject"), sellerManager, "{\"reason\":\"Xaridor omborida tekshirilsin\"}")
                .andExpect(status().isOk());
        mvc.perform(get("/api/branch-sales/" + id + "/shortage").cookie(sellerManager))
                .andExpect(jsonPath("$.open").value(true));

        // Qayta: xaridor zimmasida — HC xaridor zonasida, qoldiq harakatisiz; qarz asl holiga qaytadi
        Cookie buyerManager = loginAs("BRANCH_MANAGER", buyer.branchId());
        send(post("/api/branch-sales/" + id + "/shortage/resolve"), buyerManager,
                "{\"kind\":\"WRITE_OFF\",\"bearer\":\"BUYER\",\"note\":\"Yo'lda yo'qoldi\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.open").value(false))
                .andExpect(jsonPath("$.history[0].writeOffStatus").value("POSTED"))
                .andExpect(jsonPath("$.history[0].debtChange").value("2000.00"));
        assertThat(debt(buyer.branchId(), seller.branchId())).isEqualByComparingTo("5000.00");
        assertThat(bal(buyer.main(), b)).isEqualTo(3);
        assertThat(bal(seller.main(), b)).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM branch_ledger WHERE doc_type = 'FSK' AND doc_id = :s").param("s", id).query(Integer.class)
                .single()).isEqualTo(2);
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM branch_sale_resolution WHERE sale_id = :s").param("s", id).update())
                .hasMessageContaining("faqat qo");
    }

    @Test
    void scopePermissionsAndCancel() throws Exception {
        Place seller = place();
        Place buyer = place();
        Place stranger = place();
        long b = stocked(seller.main(), "FS doira", 3);
        Cookie manager = loginAs("BRANCH_MANAGER", seller.branchId());
        long id = id(send(post("/api/branch-sales"), manager, doc(seller.main(), buyer.warehouseId(), b, 1)).andReturn());

        Cookie strangerManager = loginAs("BRANCH_MANAGER", stranger.branchId());
        mvc.perform(get("/api/branch-sales/" + id).cookie(strangerManager)).andExpect(status().isNotFound());
        send(post("/api/branch-sales"), strangerManager, doc(seller.main(), buyer.warehouseId(), b, 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("stock.zoneUnknown"));
        // Xaridor filial rahbari ko'radi, lekin jo'nata / bekor qila olmaydi
        Cookie buyerManager = loginAs("BRANCH_MANAGER", buyer.branchId());
        mvc.perform(get("/api/branch-sales/" + id).cookie(buyerManager)).andExpect(status().isOk());
        send(post("/api/branch-sales/" + id + "/send"), buyerManager, "{}").andExpect(status().isNotFound());
        send(post("/api/branch-sales/" + id + "/cancel"), buyerManager, "{}").andExpect(status().isNotFound());
        Cookie operator = loginAs("OPERATOR", seller.branchId());
        mvc.perform(get("/api/branch-sales").cookie(operator)).andExpect(status().isForbidden());

        send(post("/api/branch-sales/" + id + "/cancel"), manager, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        send(post("/api/branch-sales/" + id + "/send"), manager, "{}").andExpect(status().isConflict());
        assertThat(bal(seller.main(), b)).isEqualTo(3);
        assertThat(debt(buyer.branchId(), seller.branchId())).isZero();
    }

    @Test
    void sentDocumentIsProtectedInDatabase() throws Exception {
        Place seller = place();
        Place buyer = place();
        long b = stocked(seller.main(), "FS himoya", 2);
        Cookie director = loginAs("DIRECTOR", null);
        long id = id(send(post("/api/branch-sales"), director, doc(seller.main(), buyer.warehouseId(), b, 1)).andReturn());
        send(post("/api/branch-sales/" + id + "/send"), director, "{}").andExpect(status().isOk());
        assertThatThrownBy(() -> jdbc.sql("UPDATE branch_sale SET total = 1 WHERE id = :id").param("id", id).update())
                .hasMessageContaining("summasi o'zgarmaydi");
        assertThatThrownBy(() -> jdbc.sql("UPDATE branch_sale_line SET amount = 1 WHERE sale_id = :id").param("id", id).update())
                .hasMessageContaining("o'zgarmaydi");
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM branch_ledger WHERE doc_id = :id AND doc_type = 'FS'").param("id", id).update())
                .isInstanceOf(RuntimeException.class);
        send(post("/api/branch-sales/" + id + "/receive"), director, "{\"toZoneId\":" + buyer.receiving() + "}").andExpect(status().isOk());
        assertThatThrownBy(() -> jdbc.sql("UPDATE branch_sale SET note = 'x' WHERE id = :id").param("id", id).update())
                .hasMessageContaining("yakunlangan");
    }

    /** Bitta partiyadan parallel jo'natishlar: qoldiq manfiy bo'lmaydi, qarz faqat muvaffaqiyatlilar bo'yicha. */
    @Test
    void parallelSendsNeverOversell() throws Exception {
        Place seller = place();
        Place buyer = place();
        long b = stocked(seller.main(), "FS parallel", 20);
        long actor = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :l, 'Parallel', id, :b, 'x', false FROM role WHERE code = 'BRANCH_MANAGER' RETURNING id""")
                .param("l", "fsp" + UUID.randomUUID().toString().substring(0, 8))
                .param("b", seller.branchId())
                .query(Long.class)
                .single();
        var a = new uz.medix.shared.security.Actor(actor, seller.branchId(), false);
        List<Long> ids = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            ids.add(sales.create(a, new BranchSaleModels.BranchSaleRequest(seller.main(), buyer.warehouseId(), null,
                    List.of(new BranchSaleModels.BranchSaleLineRequest(b, 3)))));
        }
        ExecutorService pool = Executors.newFixedThreadPool(8);
        List<Future<Boolean>> results = new ArrayList<>();
        for (long id : ids) {
            results.add(pool.submit(() -> {
                try {
                    sales.send(a, id);
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
        assertThat(bal(seller.main(), b)).isEqualTo(2);
        assertThat(debt(buyer.branchId(), seller.branchId())).isEqualByComparingTo("18000.00");
    }
}
