package uz.medix.pricing;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.time.ZoneId;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import uz.medix.TestcontainersConfig;

/** NO: qoralama → o'tkazish → narx kuchga kiradi; tarix, 20% ogohlantirish, yakunlangan hujjat o'zgarmaydi, ustama. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class PriceChangeIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    uz.medix.inventory.Warehouses warehouses;

    @Autowired
    uz.medix.inventory.StockLedger ledger;

    @Autowired
    org.springframework.transaction.support.TransactionTemplate tx;

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "nar" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :login, 'Sinov', id, :b, :hash, false FROM role WHERE code = :role""")
                .param("login", login)
                .param("b", branchId)
                .param("hash", encoder.encode(PASSWORD))
                .param("role", role)
                .update();
        MvcResult r = mvc.perform(post("/api/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
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

    private long branch() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        return jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'Filial ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(600_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private long product(String name) {
        String code = String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999));
        return jdbc.sql("INSERT INTO product (code, name, unit_id, search_text) SELECT :c, :n, id, lower(:n) FROM unit WHERE short_name = 'dona' RETURNING id")
                .param("c", code)
                .param("n", name)
                .query(Long.class)
                .single();
    }

    private long type(String code) {
        return jdbc.sql("SELECT id FROM price_type WHERE code = :c").param("c", code).query(Long.class).single();
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, Cookie session, String body) {
        return b.with(csrf()).cookie(session).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static long id(MvcResult r) throws Exception {
        return Long.parseLong(r.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));
    }

    private static String today() {
        return LocalDate.now(ZoneId.of("Asia/Tashkent")).toString();
    }

    @Test
    void draftSubmitAppliesPricesWithHistory() throws Exception {
        long branch = branch();
        long p = product("Nimesil NO sinov");
        long base = type("BASE");
        long promo = type("PROMO");
        Cookie purchaser = loginAs("PURCHASER", branch);

        String body = "{\"branchId\":" + branch + ",\"effectiveFrom\":\"" + today() + "\",\"lines\":[{\"productId\":" + p + ",\"priceTypeId\":" + base
                + ",\"newPrice\":\"10000\"},{\"productId\":" + p + ",\"priceTypeId\":" + promo + ",\"newPrice\":\"9500.50\"}]}";
        MvcResult created = mvc.perform(json(post("/api/price-changes"), purchaser, body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(matchesPattern("^NO-[A-Z]{3}-\\d{6}$")))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.lines", hasSize(2)))
                .andReturn();
        long doc = id(created);

        // Qoralama narxga ta'sir qilmaydi
        mvc.perform(get("/api/prices").param("branchId", String.valueOf(branch)).param("q", "nimesil no sinov").cookie(purchaser))
                .andExpect(jsonPath("$.items[0].code").exists())
                .andExpect(jsonPath("$.items[0].prices['" + base + "']").doesNotExist());

        mvc.perform(post("/api/price-changes/" + doc + "/submit").with(csrf()).cookie(purchaser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));
        mvc.perform(get("/api/prices").param("branchId", String.valueOf(branch)).param("q", "nimesil no sinov").cookie(purchaser))
                .andExpect(jsonPath("$.items[0].prices['" + base + "']").value("10000.00"))
                .andExpect(jsonPath("$.items[0].prices['" + promo + "']").value("9500.50"));

        // Yakunlangan NO o'zgarmaydi — API ham, baza ham
        mvc.perform(json(put("/api/price-changes/" + doc), purchaser, body)).andExpect(status().isConflict());
        assertThatThrownBy(() -> jdbc.sql("UPDATE price_change SET note = 'x' WHERE id = :id").param("id", doc).update())
                .hasMessageContaining("yakunlangan");
        assertThatThrownBy(() -> jdbc.sql("UPDATE price SET amount = 1 WHERE price_change_id = :id").param("id", doc).update())
                .hasMessageContaining("faqat qo'shiladigan");

        // Ikkinchi NO: +30% — ogohlantirish, eski narx yoziladi
        long doc2 = id(mvc.perform(json(post("/api/price-changes"), purchaser,
                        "{\"branchId\":" + branch + ",\"effectiveFrom\":\"" + today() + "\",\"lines\":[{\"productId\":" + p + ",\"priceTypeId\":" + base
                                + ",\"newPrice\":\"13000\"}]}"))
                .andExpect(jsonPath("$.lines[0].oldPrice").value("10000.00"))
                .andExpect(jsonPath("$.lines[0].changePercent").value("30.00"))
                .andExpect(jsonPath("$.lines[0].bigChange").value(true))
                .andExpect(jsonPath("$.bigChanges").value(1))
                .andReturn());
        mvc.perform(post("/api/price-changes/" + doc2 + "/submit").with(csrf()).cookie(purchaser)).andExpect(jsonPath("$.status").value("APPROVED"));
        mvc.perform(get("/api/prices").param("branchId", String.valueOf(branch)).param("q", "nimesil no sinov").cookie(purchaser))
                .andExpect(jsonPath("$.items[0].prices['" + base + "']").value("13000.00"));
        // Tarix: oldingi kun bo'yicha so'rov — narx hali yo'q
        mvc.perform(get("/api/prices").param("branchId", String.valueOf(branch)).param("q", "nimesil no sinov")
                        .param("at", LocalDate.parse(today()).minusDays(1).toString()).cookie(purchaser))
                .andExpect(jsonPath("$.items[0].code").exists())
                .andExpect(jsonPath("$.items[0].prices['" + base + "']").doesNotExist());

        // Ommaviy ustama: bazaviy narxdan +15%, 500 ga yaxlitlash → Promo
        mvc.perform(json(post("/api/price-changes/markup"), purchaser,
                        "{\"branchId\":" + branch + ",\"productIds\":[" + p + "],\"priceTypeId\":" + promo
                                + ",\"base\":\"BASE_PRICE\",\"percent\":15,\"rounding\":500}"))
                .andExpect(jsonPath("$[0].basePrice").value("13000.00"))
                .andExpect(jsonPath("$[0].oldPrice").value("9500.50"))
                .andExpect(jsonPath("$[0].newPrice").value("15000.00"));
    }

    @Test
    void validationsAndCancel() throws Exception {
        long branch = branch();
        long other = branch();
        long p = product("Validatsiya NO");
        long base = type("BASE");
        Cookie manager = loginAs("BRANCH_MANAGER", branch);
        String line = "[{\"productId\":" + p + ",\"priceTypeId\":" + base + ",\"newPrice\":\"5000\"}]";

        mvc.perform(json(post("/api/price-changes"), manager, "{\"branchId\":" + branch + ",\"effectiveFrom\":\"2020-01-01\",\"lines\":" + line + "}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("priceChange.pastDate"));
        mvc.perform(json(post("/api/price-changes"), manager, "{\"branchId\":" + other + ",\"effectiveFrom\":\"" + today() + "\",\"lines\":" + line + "}"))
                .andExpect(status().isBadRequest());
        mvc.perform(json(post("/api/price-changes"), manager, "{\"branchId\":" + branch + ",\"effectiveFrom\":\"" + today() + "\",\"lines\":[]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(json(post("/api/price-changes"), manager, "{\"branchId\":" + branch + ",\"effectiveFrom\":\"" + today()
                        + "\",\"lines\":[{\"productId\":" + p + ",\"priceTypeId\":" + base + ",\"newPrice\":\"5000\"},{\"productId\":" + p
                        + ",\"priceTypeId\":" + base + ",\"newPrice\":\"6000\"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("priceChange.duplicateLine"));

        long doc = id(mvc.perform(json(post("/api/price-changes"), manager,
                        "{\"branchId\":" + branch + ",\"effectiveFrom\":\"" + today() + "\",\"lines\":" + line + "}"))
                .andExpect(status().isCreated())
                .andReturn());
        // Tasdiq faqat Direktor tasdig'ida turgan hujjatga
        Cookie director = loginAs("DIRECTOR", null);
        mvc.perform(json(post("/api/price-changes/" + doc + "/approve"), director, "{\"pin\":\"4826\"}")).andExpect(status().isConflict());
        mvc.perform(json(post("/api/price-changes/" + doc + "/approve"), manager, "{\"pin\":\"4826\"}")).andExpect(status().isForbidden());
        mvc.perform(json(post("/api/price-changes/" + doc + "/cancel"), manager, "{\"reason\":\"Xato kiritildi\"}"))
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.decisionReason").value("Xato kiritildi"));
        mvc.perform(post("/api/price-changes/" + doc + "/submit").with(csrf()).cookie(manager)).andExpect(status().isConflict());
        Cookie operator = loginAs("OPERATOR", branch);
        mvc.perform(json(post("/api/price-changes"), operator, "{\"branchId\":" + branch + ",\"effectiveFrom\":\"" + today() + "\",\"lines\":" + line + "}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/price-changes").param("branchId", String.valueOf(branch)).cookie(operator))
                .andExpect(jsonPath("$.items[0].status").value("CANCELLED"));
    }

    @Test
    void belowCostNeedsDirector() throws Exception {
        long branch = branch();
        long p = product("Tannarx NO sinov");
        long base = type("BASE");
        var w = tx.execute(st -> warehouses.create(branch, "NO ombor " + branch, null, java.util.Set.of()));
        long main = w.zones().stream().filter(z -> z.type() == uz.medix.inventory.ZoneType.MAIN).findFirst().orElseThrow().id();
        tx.executeWithoutResult(st -> {
            long b = ledger.createBatch(p, "T-1", null, LocalDate.of(2029, 1, 31), uz.medix.shared.money.Money.of("12000"), false, "KR", null);
            long bonus = ledger.createBatch(p, "T-1", null, LocalDate.of(2029, 1, 31), uz.medix.shared.money.Money.ZERO, true, "KR", null);
            ledger.post(new uz.medix.inventory.StockLedger.DocRef("KR", 1, "KR-TST-000001"),
                    java.util.List.of(uz.medix.inventory.StockLedger.Move.in(main, b, 5), uz.medix.inventory.StockLedger.Move.in(main, bonus, 1)));
        });
        Cookie purchaser = loginAs("PURCHASER", branch);
        String body = "{\"branchId\":" + branch + ",\"effectiveFrom\":\"" + today() + "\",\"lines\":[{\"productId\":" + p + ",\"priceTypeId\":" + base
                + ",\"newPrice\":\"PRICE\"}]}";
        // Tannarxdan past (bonus partiya 0 hisobga olinmaydi) — Direktor tasdig'iga
        long low = id(mvc.perform(json(post("/api/price-changes"), purchaser, body.replace("PRICE", "11999.99"))).andReturn());
        mvc.perform(post("/api/price-changes/" + low + "/submit").with(csrf()).cookie(purchaser))
                .andExpect(jsonPath("$.status").value("PENDING_APPROVAL"));
        mvc.perform(get("/api/prices").param("branchId", String.valueOf(branch)).param("q", "tannarx no sinov").cookie(purchaser))
                .andExpect(jsonPath("$.items[0].prices['" + base + "']").doesNotExist());
        Cookie director = loginAs("DIRECTOR", null);
        mvc.perform(json(post("/api/price-changes/" + low + "/reject"), director, "{\"reason\":\"Tannarxdan past\"}"))
                .andExpect(jsonPath("$.status").value("REJECTED"));
        // Ommaviy ustama kirim narxidan (+10%): Xarid tannarxni ko'rmaydi — faqat natija
        for (String kind : new String[] {"AVG_RECEIPT", "LAST_RECEIPT"}) {
            mvc.perform(json(post("/api/price-changes/markup"), purchaser, "{\"branchId\":" + branch + ",\"productIds\":[" + p
                            + "],\"priceTypeId\":" + base + ",\"base\":\"" + kind + "\",\"percent\":10,\"rounding\":100}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].basePrice").doesNotExist())
                    .andExpect(jsonPath("$[0].newPrice").value("13200.00"));
        }
        // Tannarxga teng — darhol kuchga kiradi
        long ok = id(mvc.perform(json(post("/api/price-changes"), purchaser, body.replace("PRICE", "12000"))).andReturn());
        mvc.perform(post("/api/price-changes/" + ok + "/submit").with(csrf()).cookie(purchaser)).andExpect(jsonPath("$.status").value("APPROVED"));
    }

    @Autowired
    PriceBook priceBook;

    private long receipt(long branch, long warehouse, String status) {
        long supplier = jdbc.sql("INSERT INTO counterparty (tin, name, is_supplier) VALUES (:t, :n, true) RETURNING id")
                .param("t", String.valueOf(700_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .param("n", "Ta'minotchi " + UUID.randomUUID().toString().substring(0, 6))
                .query(Long.class)
                .single();
        boolean posted = "POSTED".equals(status);
        return jdbc.sql("""
                INSERT INTO receipt (number, branch_id, warehouse_id, supplier_id, receipt_date, payment_type, prepaid, status,
                                     accepted_at, posted_at, debt_amount, created_by)
                VALUES (:n, :b, :w, :s, CURRENT_DATE, 'TRANSFER', true, :st, CASE WHEN :p THEN now() END, CASE WHEN :p THEN now() END,
                        CASE WHEN :p THEN 0 END, (SELECT min(id) FROM employee)) RETURNING id""")
                .param("n", "KR-T-" + UUID.randomUUID().toString().substring(0, 8))
                .param("b", branch)
                .param("w", warehouse)
                .param("s", supplier)
                .param("st", status)
                .param("p", posted)
                .query(Long.class)
                .single();
    }

    @Test
    void receiptModeSetsBatchPricesAndWeightedAverage() throws Exception {
        long branch = branch();
        long p = product("Kirimnarx sinov");
        long other = product("Boshqa kirim sinov");
        long base = type("BASE");
        var w = tx.execute(st -> warehouses.create(branch, "KB ombor " + branch, null, java.util.Set.of()));
        long main = w.zones().stream().filter(z -> z.type() == uz.medix.inventory.ZoneType.MAIN).findFirst().orElseThrow().id();
        long rc = receipt(branch, w.id(), "POSTED");
        long draftRc = receipt(branch, w.id(), "DRAFT");
        long[] b = new long[3];
        tx.executeWithoutResult(st -> {
            b[0] = ledger.createBatch(p, "KB-1", null, LocalDate.of(2028, 1, 31), uz.medix.shared.money.Money.of("1000"), false, "KR", rc);
            b[1] = ledger.createBatch(p, "KB-2", null, LocalDate.of(2029, 1, 31), uz.medix.shared.money.Money.of("1000"), false, "KR", rc);
            b[2] = ledger.createBatch(other, "KB-3", null, LocalDate.of(2029, 1, 31), uz.medix.shared.money.Money.of("500"), false, "KR", draftRc);
            ledger.post(new uz.medix.inventory.StockLedger.DocRef("KR", rc, "KR-TST-" + rc),
                    java.util.List.of(uz.medix.inventory.StockLedger.Move.in(main, b[0], 3), uz.medix.inventory.StockLedger.Move.in(main, b[1], 7)));
        });
        Cookie purchaser = loginAs("PURCHASER", branch);
        // Bazaviy mahsulot narxi 1200
        long plain = id(mvc.perform(json(post("/api/price-changes"), purchaser, "{\"branchId\":" + branch + ",\"effectiveFrom\":\"" + today()
                + "\",\"lines\":[{\"productId\":" + p + ",\"priceTypeId\":" + base + ",\"newPrice\":\"1200\"}]}")).andReturn());
        mvc.perform(post("/api/price-changes/" + plain + "/submit").with(csrf()).cookie(purchaser)).andExpect(jsonPath("$.status").value("APPROVED"));

        String head = "{\"branchId\":" + branch + ",\"effectiveFrom\":\"" + today() + "\",\"receiptId\":RC,\"lines\":[";
        String line = "{\"productId\":P,\"priceTypeId\":" + base + ",\"newPrice\":\"PRICE\",\"batchId\":B}";
        // O'tkazilmagan kirim — rad
        mvc.perform(json(post("/api/price-changes"), purchaser, head.replace("RC", "" + draftRc)
                        + line.replace("P", "" + other).replace("PRICE", "600").replace("B", "" + b[2]) + "]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("priceChange.receiptNotPosted"));
        // Boshqa kirim partiyasi — rad
        mvc.perform(json(post("/api/price-changes"), purchaser, head.replace("RC", "" + rc)
                        + line.replace("P", "" + other).replace("PRICE", "600").replace("B", "" + b[2]) + "]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("priceChange.batchNotInReceipt"));
        // Rejimsiz partiya — rad
        mvc.perform(json(post("/api/price-changes"), purchaser, "{\"branchId\":" + branch + ",\"effectiveFrom\":\"" + today() + "\",\"lines\":["
                        + line.replace("P", "" + p).replace("PRICE", "600").replace("B", "" + b[0]) + "]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("priceChange.batchWithoutReceipt"));
        // Partiyalarga narx: KB-1 → 1000 (tannarxga teng), KB-2 → 1100
        MvcResult created = mvc.perform(json(post("/api/price-changes"), purchaser, head.replace("RC", "" + rc)
                        + line.replace("P", "" + p).replace("PRICE", "1000").replace("B", "" + b[0]) + ","
                        + line.replace("P", "" + p).replace("PRICE", "1100").replace("B", "" + b[1]) + "]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.receiptId").value(rc))
                .andExpect(jsonPath("$.lines", hasSize(2)))
                .andExpect(jsonPath("$.lines[0].batchNumber").value("KB-1"))
                .andExpect(jsonPath("$.lines[0].oldPrice").value("1200.00"))
                .andReturn();
        long doc = id(created);
        mvc.perform(post("/api/price-changes/" + doc + "/submit").with(csrf()).cookie(purchaser)).andExpect(jsonPath("$.status").value("APPROVED"));
        mvc.perform(get("/api/price-changes").param("branchId", String.valueOf(branch)).cookie(purchaser))
                .andExpect(jsonPath("$.items[0].receiptNumber").value(matchesPattern("^KR-T-.*")));
        // Mahsulot narxi o'zgarmaydi; partiya narxlari alohida
        mvc.perform(get("/api/prices").param("branchId", String.valueOf(branch)).param("q", "kirimnarx sinov").cookie(purchaser))
                .andExpect(jsonPath("$.items[0].prices['" + base + "']").value("1200.00"));
        mvc.perform(get("/api/price-changes/receipt-batches/" + rc).cookie(purchaser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[0].qty").value(3))
                .andExpect(jsonPath("$.items[0].cost").doesNotExist())
                .andExpect(jsonPath("$.items[1].batchPrices['" + base + "']").value("1100.00"))
                .andExpect(jsonPath("$.items[1].productPrices['" + base + "']").value("1200.00"));
        mvc.perform(get("/api/price-changes/receipt-batches/" + draftRc).cookie(purchaser)).andExpect(status().isBadRequest());

        // Narx tanlash: partiya narxi ustun; bir necha partiya — o'rtacha tortilgan; partiyasiz qism — mahsulot narxida
        LocalDate t = LocalDate.parse(today());
        var q = priceBook.quotes(branch, null, java.util.Map.of(p, java.util.List.of(new PriceBook.BatchShare(b[0], 3),
                new PriceBook.BatchShare(b[1], 7))), t).get(p);
        org.assertj.core.api.Assertions.assertThat(q.price()).isEqualTo(uz.medix.shared.money.Money.of("1070"));
        org.assertj.core.api.Assertions.assertThat(q.batchPriced()).isTrue();
        var mixed = priceBook.quotes(branch, null, java.util.Map.of(p, java.util.List.of(new PriceBook.BatchShare(b[1], 1),
                new PriceBook.BatchShare(null, 1))), t).get(p);
        org.assertj.core.api.Assertions.assertThat(mixed.price()).isEqualTo(uz.medix.shared.money.Money.of("1150"));
        var none = priceBook.quotes(branch, null, java.util.Map.of(p, java.util.List.of(new PriceBook.BatchShare(null, 5))), t).get(p);
        org.assertj.core.api.Assertions.assertThat(none.price()).isEqualTo(uz.medix.shared.money.Money.of("1200"));
        org.assertj.core.api.Assertions.assertThat(none.batchPriced()).isFalse();

        // Partiya tannarxidan past — Direktor tasdig'iga
        long low = id(mvc.perform(json(post("/api/price-changes"), purchaser, head.replace("RC", "" + rc)
                        + line.replace("P", "" + p).replace("PRICE", "999.99").replace("B", "" + b[0]) + "]}")).andReturn());
        mvc.perform(post("/api/price-changes/" + low + "/submit").with(csrf()).cookie(purchaser))
                .andExpect(jsonPath("$.status").value("PENDING_APPROVAL"));
    }
}
