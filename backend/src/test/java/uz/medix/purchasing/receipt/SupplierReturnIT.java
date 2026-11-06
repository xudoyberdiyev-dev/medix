package uz.medix.purchasing.receipt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
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
import uz.medix.inventory.Warehouses;
import uz.medix.inventory.ZoneType;
import uz.medix.shared.security.Actor;

/** QY: tasdiq oqimi, YB qarzi (KR ga qo'llanadi), bonus partiya, summa ruxsati, tekshiruvlar, kirimni bekor qilish, himoya, parallel. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class SupplierReturnIT {

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
    TransactionTemplate tx;

    @Autowired
    SupplierReturns returns;

    private record Place(long branchId, long warehouseId, long receiving, long main, long quarantine, long safe) {}

    private Place place() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        Long branch = jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'QY sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(400_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElse(null);
        if (branch == null) {
            return place();
        }
        long b = branch;
        Warehouses.Warehouse w = tx.execute(s -> warehouses.create(b, "QY ombor " + code, null, Set.of(ZoneType.SAFE)));
        return new Place(b, w.id(), zone(w, ZoneType.RECEIVING), zone(w, ZoneType.MAIN), zone(w, ZoneType.QUARANTINE), zone(w, ZoneType.SAFE));
    }

    private static long zone(Warehouses.Warehouse w, ZoneType t) {
        return w.zones().stream().filter(z -> z.type() == t).findFirst().orElseThrow().id();
    }

    private long supplier(long branchId, Integer days) {
        long id = jdbc.sql("INSERT INTO counterparty (tin, name, is_supplier) VALUES (:t, :n, true) RETURNING id")
                .param("t", String.valueOf(200_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .param("n", "YB " + UUID.randomUUID().toString().substring(0, 6))
                .query(Long.class)
                .single();
        if (days != null) {
            jdbc.sql("INSERT INTO counterparty_branch_terms (counterparty_id, branch_id, supplier_payment_days) VALUES (:c, :b, :d)")
                    .param("c", id)
                    .param("b", branchId)
                    .param("d", days)
                    .update();
        }
        return id;
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

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "qy" + UUID.randomUUID().toString().substring(0, 8);
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

    private BigDecimal debt(long branch, long supplier) {
        return jdbc.sql("SELECT coalesce(sum(amount), 0) FROM party_ledger WHERE branch_id = :b AND counterparty_id = :c AND side = 'SUPPLIER'")
                .param("b", branch).param("c", supplier).query(BigDecimal.class).single();
    }

    private int bal(long zone, long batch) {
        return jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_balance WHERE zone_id = :z AND batch_id = :b")
                .param("z", zone).param("b", batch).query(Integer.class).single();
    }

    /** O'tkazilgan kirim: bitta qator (qty dona, bonus dona, narx), hammasi Asosiy zonaga. Natija: kirim id, partiya, bonus partiya. */
    private record Posted(long receiptId, long batch, Long bonusBatch) {}

    private Posted postedReceipt(Place p, long sup, long product, int qty, int bonus, String price, Cookie purchaser, Cookie keeper,
            Cookie manager) throws Exception {
        String line = "{\"productId\":" + product + ",\"batchNumber\":\"QY-" + UUID.randomUUID().toString().substring(0, 5)
                + "\",\"expiryDate\":\"2028-06-30\",\"zoneId\":" + p.main() + ",\"qty\":" + qty + ",\"bonusQty\":" + bonus + ",\"price\":\""
                + price + "\"}";
        String doc = "{\"warehouseId\":" + p.warehouseId() + ",\"supplierId\":" + sup + ",\"receiptDate\":\"" + today()
                + "\",\"invoiceNumber\":\"F-QY\",\"paymentType\":\"TRANSFER\",\"prepaid\":false,\"lines\":[" + line + "]}";
        long r = id(send(post("/api/receipts"), purchaser, doc).andExpect(status().isCreated()).andReturn());
        long lineId = jdbc.sql("SELECT id FROM receipt_line WHERE receipt_id = :r").param("r", r).query(Long.class).single();
        send(post("/api/receipts/" + r + "/accept"), keeper,
                "{\"lines\":[{\"lineId\":" + lineId + ",\"receivedQty\":" + qty + ",\"damagedQty\":0}]}").andExpect(status().isOk());
        send(post("/api/receipts/" + r + "/post"), manager, "{}").andExpect(status().isOk());
        record B(long batch, Long bonus) {}
        B b = jdbc.sql("SELECT batch_id, bonus_batch_id FROM receipt_line WHERE id = :l").param("l", lineId)
                .query((rs, n) -> new B(rs.getLong("batch_id"), (Long) rs.getObject("bonus_batch_id"))).single();
        return new Posted(r, b.batch(), b.bonus());
    }

    private static String qy(long receipt, long zone, String reason, String note, String... lines) {
        return "{\"receiptId\":" + receipt + ",\"zoneId\":" + zone + ",\"reason\":\"" + reason + "\",\"note\":"
                + (note == null ? "null" : "\"" + note + "\"") + ",\"lines\":[" + String.join(",", lines) + "]}";
    }

    private static String ln(long batch, int qty) {
        return "{\"batchId\":" + batch + ",\"qty\":" + qty + "}";
    }

    @Test
    void pendingApproveReducesStockAndDebt() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), 30);
        long prod = product("QY Paratsetamol", false);
        Cookie purchaser = loginAs("PURCHASER", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        Posted kr = postedReceipt(p, sup, prod, 10, 0, "12500.50", purchaser, keeper, manager);
        BigDecimal before = debt(p.branchId(), sup);

        // Partiyalar ro'yxati: Xarid narxni ko'radi, Ombor mudiri — yo'q
        mvc.perform(get("/api/supplier-returns/receipt-stock").param("receiptId", String.valueOf(kr.receiptId())).cookie(purchaser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].free").value(10))
                .andExpect(jsonPath("$[0].price").value("12500.50"));
        mvc.perform(get("/api/supplier-returns/receipt-stock").param("receiptId", String.valueOf(kr.receiptId())).cookie(keeper))
                .andExpect(jsonPath("$[0].price").doesNotExist());

        // Xarid (qy.approve yo'q) — «Tasdiqda», tovar joyida, tasdiqlovchiga bildirishnoma
        MvcResult created = send(post("/api/supplier-returns"), purchaser, qy(kr.receiptId(), p.main(), "QUALITY", null, ln(kr.batch(), 4)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.number").value(org.hamcrest.Matchers.matchesPattern("^QY-[A-Z]{3}-\\d{6}$")))
                .andExpect(jsonPath("$.totalAmount").value("50002.00"))
                .andReturn();
        long doc = id(created);
        assertThat(bal(p.main(), kr.batch())).isEqualTo(10);
        assertThat(debt(p.branchId(), sup)).isEqualByComparingTo(before);
        assertThat(jdbc.sql("SELECT count(*) FROM notification WHERE dedup_key = :d").param("d", "qy.approval:" + doc)
                .query(Integer.class).single()).isPositive();

        // Xarid tasdiqlay olmaydi; Ombor mudiri tasdiqlaydi (summa ko'rinmaydi)
        send(post("/api/supplier-returns/" + doc + "/approve"), purchaser, "{}").andExpect(status().isForbidden());
        send(post("/api/supplier-returns/" + doc + "/approve"), keeper, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.totalAmount").doesNotExist())
                .andExpect(jsonPath("$.lines[0].price").doesNotExist());
        assertThat(bal(p.main(), kr.batch())).isEqualTo(6);
        assertThat(debt(p.branchId(), sup)).isEqualByComparingTo(before.subtract(new BigDecimal("50002.00")));
        // Qarz yozuvi kirimga qo'llanadi
        assertThat(jdbc.sql("""
                SELECT applies_doc_id FROM party_ledger WHERE doc_type = 'QY' AND doc_id = :d""").param("d", doc).query(Long.class).single())
                .isEqualTo(kr.receiptId());
        // Yuk xati PDF
        byte[] pdf = mvc.perform(get("/api/supplier-returns/" + doc + "/pdf").cookie(keeper))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        try (var d = org.apache.pdfbox.Loader.loadPDF(pdf)) {
            String text = new org.apache.pdfbox.text.PDFTextStripper().getText(d);
            assertThat(text).contains("qaytarish yuk xati").contains("QY Paratsetamol").doesNotContain("12 500,50").doesNotContain("Kirim narxi");
        }
        // Ikkinchi marta — yo'q
        send(post("/api/supplier-returns/" + doc + "/approve"), keeper, "{}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("qy.notPending"));
        // Bazada himoya: o'tkazilgan QY o'zgarmaydi
        assertThatThrownBy(() -> jdbc.sql("UPDATE supplier_return SET note = 'x' WHERE id = :d").param("d", doc).update())
                .hasMessageContaining("yakunlangan");
        // Kirim endi bekor qilinmaydi (partiyadan qaytarilgan)
        send(post("/api/receipts/" + kr.receiptId() + "/cancel"), loginAs("DIRECTOR", p.branchId()), "{\"reason\":\"Xato\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("receipt.batchUsed"));
    }

    @Test
    void managerPostsImmediatelyAndBonusBatchHasNoDebt() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), 30);
        long prod = product("QY Bonusli", false);
        Cookie purchaser = loginAs("PURCHASER", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        Posted kr = postedReceipt(p, sup, prod, 5, 2, "1000", purchaser, keeper, manager);
        assertThat(kr.bonusBatch()).isNotNull();
        BigDecimal before = debt(p.branchId(), sup);

        send(post("/api/supplier-returns"), manager, qy(kr.receiptId(), p.main(), "SURPLUS", null, ln(kr.bonusBatch(), 2), ln(kr.batch(), 1)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.totalAmount").value("1000.00"))
                .andExpect(jsonPath("$.lines[0].bonus").value(true))
                .andExpect(jsonPath("$.lines[0].amount").value("0.00"));
        assertThat(bal(p.main(), kr.bonusBatch())).isZero();
        assertThat(bal(p.main(), kr.batch())).isEqualTo(4);
        assertThat(debt(p.branchId(), sup)).isEqualByComparingTo(before.subtract(new BigDecimal("1000.00")));
    }

    @Test
    void validationAndReject() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), 30);
        long prod = product("QY Tekshiruv", false);
        Cookie purchaser = loginAs("PURCHASER", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        Posted kr = postedReceipt(p, sup, prod, 3, 0, "500", purchaser, keeper, manager);
        Posted other = postedReceipt(p, sup, prod, 3, 0, "500", purchaser, keeper, manager);

        send(post("/api/supplier-returns"), purchaser, qy(kr.receiptId(), p.main(), "QUALITY", null, ln(other.batch(), 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("qy.batchNotInReceipt"));
        send(post("/api/supplier-returns"), purchaser, qy(kr.receiptId(), p.main(), "OTHER", " ", ln(kr.batch(), 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("qy.noteRequired"));
        send(post("/api/supplier-returns"), purchaser, qy(kr.receiptId(), p.main(), "QUALITY", null, ln(kr.batch(), 4)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("qy.notEnough"));
        send(post("/api/supplier-returns"), purchaser, qy(kr.receiptId(), p.main(), "QUALITY", null, ln(kr.batch(), 1), ln(kr.batch(), 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("qy.duplicateBatch"));
        // Boshqa filial xodimi kirimni ko'rmaydi
        Place q = place();
        send(post("/api/supplier-returns"), loginAs("BRANCH_MANAGER", q.branchId()), qy(kr.receiptId(), p.main(), "QUALITY", null, ln(kr.batch(), 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("qy.receiptUnknown"));

        long doc = id(send(post("/api/supplier-returns"), purchaser, qy(kr.receiptId(), p.main(), "OTHER", "Qadoq ezilgan", ln(kr.batch(), 2)))
                .andExpect(status().isCreated()).andReturn());
        send(post("/api/supplier-returns/" + doc + "/reject"), manager, "{\"reason\":\"YB qabul qilmaydi\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.rejectReason").value("YB qabul qilmaydi"));
        assertThat(bal(p.main(), kr.batch())).isEqualTo(3);
        mvc.perform(get("/api/supplier-returns").param("receiptId", String.valueOf(kr.receiptId())).cookie(keeper))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].totalAmount").doesNotExist());
    }

    @Test
    void parallelApprovalsNeverGoNegative() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), 30);
        long prod = product("QY parallel", false);
        Cookie purchaser = loginAs("PURCHASER", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        Posted kr = postedReceipt(p, sup, prod, 10, 0, "100", purchaser, keeper, manager);
        BigDecimal before = debt(p.branchId(), sup);
        List<Long> docs = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            docs.add(id(send(post("/api/supplier-returns"), purchaser, qy(kr.receiptId(), p.main(), "QUALITY", null, ln(kr.batch(), 4)))
                    .andExpect(status().isCreated()).andReturn()));
        }
        long approver = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :l, 'Parallel', id, :b, 'x', false FROM role WHERE code = 'BRANCH_MANAGER' RETURNING id""")
                .param("l", "qyp" + UUID.randomUUID().toString().substring(0, 8))
                .param("b", p.branchId())
                .query(Long.class)
                .single();
        Actor a = new Actor(approver, p.branchId(), false);
        ExecutorService pool = Executors.newFixedThreadPool(5);
        List<Future<Boolean>> results = new ArrayList<>();
        List<String> errors = java.util.Collections.synchronizedList(new ArrayList<>());
        for (long d : docs) {
            Callable<Boolean> job = () -> {
                try {
                    returns.approve(a, d);
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
        assertThat(ok).as("xatolar: %s", errors).isEqualTo(2);
        assertThat(bal(p.main(), kr.batch())).isEqualTo(2);
        assertThat(debt(p.branchId(), sup)).isEqualByComparingTo(before.subtract(new BigDecimal("800.00")));
    }
}
