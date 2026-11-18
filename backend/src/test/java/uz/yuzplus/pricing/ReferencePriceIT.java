package uz.yuzplus.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;
import uz.yuzplus.TestcontainersConfig;

/** O14: referent narx bilan solishtirish — moslash tartibi, ruxsat etilgan farq, eslab qolish, tannarx yashirilishi, kirim ogohlantirishi. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ReferencePriceIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    uz.yuzplus.inventory.Warehouses warehouses;

    @Autowired
    TransactionTemplate tx;

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "rfp" + UUID.randomUUID().toString().substring(0, 8);
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
            if (h.startsWith("YUZPLUS_SESSION=")) {
                return new Cookie("YUZPLUS_SESSION", h.substring("YUZPLUS_SESSION=".length(), h.indexOf(';')));
            }
        }
        throw new AssertionError("sessiya yo'q");
    }

    private long branch() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Shifo Dori' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
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

    private long product(String name, String ikpu, String maker) {
        String code = String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999));
        Long makerId = maker == null ? null : jdbc.sql("INSERT INTO manufacturer (name) VALUES (:n) ON CONFLICT DO NOTHING RETURNING id")
                .param("n", maker).query(Long.class).optional()
                .orElseGet(() -> jdbc.sql("SELECT id FROM manufacturer WHERE lower(name) = lower(:n)").param("n", maker).query(Long.class).single());
        return jdbc.sql("""
                INSERT INTO product (code, name, unit_id, search_text, ikpu, manufacturer_id)
                SELECT :c, :n, id, lower(:n), :ik, :m FROM unit WHERE short_name = 'dona' RETURNING id""")
                .param("c", code)
                .param("n", name)
                .param("ik", ikpu)
                .param("m", makerId)
                .query(Long.class)
                .single();
    }

    private static String rnd(int digits) {
        StringBuilder b = new StringBuilder("4");
        for (int i = 1; i < digits; i++) {
            b.append(ThreadLocalRandom.current().nextInt(10));
        }
        return b.toString();
    }

    private void barcode(long product, String code) {
        jdbc.sql("INSERT INTO product_barcode (product_id, barcode) VALUES (:p, :b)").param("p", product).param("b", code).update();
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, Cookie session, String body) {
        return b.with(csrf()).cookie(session).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private long baseType() {
        return jdbc.sql("SELECT id FROM price_type WHERE base").query(Long.class).single();
    }

    private void price(Cookie purchaser, long branch, long product, String amount) throws Exception {
        MvcResult r = mvc.perform(json(post("/api/price-changes"), purchaser, "{\"branchId\":" + branch + ",\"effectiveFrom\":\""
                        + LocalDate.now(ZoneId.of("Asia/Tashkent")) + "\",\"lines\":[{\"productId\":" + product + ",\"priceTypeId\":" + baseType()
                        + ",\"newPrice\":\"" + amount + "\"}]}"))
                .andExpect(status().isCreated())
                .andReturn();
        long id = Long.parseLong(r.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));
        mvc.perform(post("/api/price-changes/" + id + "/submit").with(csrf()).cookie(purchaser))
                .andExpect(jsonPath("$.status").value("APPROVED"));
    }

    private static String row(int n, String name, String barcode, String ikpu, String maker, String price) {
        StringBuilder b = new StringBuilder("{\"row\":" + n + ",\"values\":{\"name\":\"" + name + "\",\"price\":\"" + price + "\"");
        if (barcode != null) {
            b.append(",\"barcode\":\"").append(barcode).append('"');
        }
        if (ikpu != null) {
            b.append(",\"ikpu\":\"").append(ikpu).append('"');
        }
        if (maker != null) {
            b.append(",\"manufacturer\":\"").append(maker).append('"');
        }
        return b.append("}}").toString();
    }

    private static long compareId(MvcResult r) throws Exception {
        return Long.parseLong(r.getResponse().getContentAsString().replaceAll("^\\{\"summary\":\\{\"id\":(\\d+).*", "$1"));
    }

    @Test
    void saleCompareMatchesClassifiesAndRemembersManualMatch() throws Exception {
        long branch = branch();
        String tag = UUID.randomUUID().toString().substring(0, 6).replaceAll("[^a-z]", "q");
        String bc = rnd(13);
        String ikpu = rnd(17);
        String maker = "Sinov Farm " + tag;
        long p1 = product("Shtrixli dori " + tag, null, null);
        barcode(p1, bc);
        long p2 = product("Mxikli dori " + tag, ikpu, null);
        long p3 = product("Paratsetamol " + tag + " 500 mg tab", null, maker);
        product("Narxsiz " + tag + " dori", null, null);
        Cookie purchaser = loginAs("PURCHASER", branch);
        price(purchaser, branch, p1, "10000");
        price(purchaser, branch, p2, "20000");
        price(purchaser, branch, p3, "5000");
        Cookie director = loginAs("DIRECTOR", branch);
        jdbc.sql("UPDATE app_setting SET value = 1 WHERE key = 'refPriceTolPct'").update();
        try {
            String body = "{\"fileName\":\"referent.xlsx\",\"mode\":\"SALE\",\"priceTypeId\":" + baseType() + ",\"rows\":["
                    + row(1, "Boshqa nom", bc, null, null, "9 000") + ","
                    + row(2, "Mxik boyicha", null, ikpu, null, "20100,00") + ","
                    + row(3, "PARATSETAMOL " + tag + " 500 mg tab", null, null, maker, "6000") + ","
                    + row(4, "Narxsiz " + tag + " dori", null, null, null, "100") + ","
                    + row(5, "Qwzx " + tag + " yoqnarsa", null, null, null, "100") + ","
                    + row(6, "", null, null, null, "100") + "]}";
            MvcResult r = mvc.perform(json(post("/api/reference-prices/compare"), director, body))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.summary.dearer").value(1))
                    .andExpect(jsonPath("$.summary.cheaper").value(1))
                    .andExpect(jsonPath("$.summary.matched").value(1))
                    .andExpect(jsonPath("$.summary.notFound").value(2))
                    .andExpect(jsonPath("$.summary.tolerancePct").value("1"))
                    .andExpect(jsonPath("$.skippedRows[0]").value(6))
                    .andExpect(jsonPath("$.lines[0].matchBy").value("BARCODE"))
                    .andExpect(jsonPath("$.lines[0].status").value("DEARER"))
                    .andExpect(jsonPath("$.lines[0].diff").value("1000.00"))
                    .andExpect(jsonPath("$.lines[0].diffPct").value("11.11"))
                    .andExpect(jsonPath("$.lines[1].matchBy").value("IKPU"))
                    .andExpect(jsonPath("$.lines[1].status").value("MATCH"))
                    .andExpect(jsonPath("$.lines[2].matchBy").value("NAME"))
                    .andExpect(jsonPath("$.lines[2].productId").value(p3))
                    .andExpect(jsonPath("$.lines[2].confident").value(true))
                    .andExpect(jsonPath("$.lines[2].status").value("CHEAPER"))
                    .andExpect(jsonPath("$.lines[3].status").value("NO_PRICE"))
                    .andExpect(jsonPath("$.lines[4].status").value("NOT_FOUND"))
                    .andReturn();
            long id = compareId(r);

            // Qo'lda moslash → eslab qolinadi
            mvc.perform(json(put("/api/reference-prices/" + id + "/lines/5/match"), director, "{\"productId\":" + p1 + "}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.lines[4].matchBy").value("MANUAL"))
                    .andExpect(jsonPath("$.lines[4].status").value("DEARER"))
                    .andExpect(jsonPath("$.summary.dearer").value(2))
                    .andExpect(jsonPath("$.summary.notFound").value(1));
            mvc.perform(json(post("/api/reference-prices/compare"), director, "{\"fileName\":\"keyingi.csv\",\"mode\":\"SALE\",\"priceTypeId\":"
                            + baseType() + ",\"rows\":[" + row(1, "qwzx " + tag + " yoqnarsa", null, null, null, "10000") + "]}"))
                    .andExpect(jsonPath("$.lines[0].matchBy").value("MEMORY"))
                    .andExpect(jsonPath("$.lines[0].productId").value(p1))
                    .andExpect(jsonPath("$.lines[0].status").value("MATCH"));

            // Tarix va Excel
            mvc.perform(get("/api/reference-prices").param("branchId", "" + branch).cookie(director))
                    .andExpect(jsonPath("$.length()").value(2))
                    .andExpect(jsonPath("$[1].fileName").value("referent.xlsx"));
            byte[] xlsx = mvc.perform(get("/api/reference-prices/" + id + "/export").cookie(director))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsByteArray();
            try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
                assertThat(wb.getNumberOfSheets()).isEqualTo(4);
                assertThat(wb.getSheet("Qimmat").getLastRowNum()).isEqualTo(2);
                assertThat(wb.getSheet("Topilmadi").getRow(1).getCell(11).getStringCellValue()).isEqualTo("Narx yoʻq");
            }
        } finally {
            jdbc.sql("UPDATE app_setting SET value = 0 WHERE key = 'refPriceTolPct'").update();
        }
    }

    @Test
    void readsCsvAndHidesPurchaseFromUsersWithoutCost() throws Exception {
        long branch = branch();
        Cookie operator = loginAs("OPERATOR", branch);
        MockMultipartFile csv = new MockMultipartFile("file", "ref.csv", "text/csv",
                "Nomi;Shtrix-kod;Narx\nAnalgin;478000;1 250,50\n".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/api/reference-prices/read").file(csv).with(csrf()).cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sheets[0].rows[1][2]").value("1 250,50"));
        mvc.perform(json(post("/api/reference-prices/compare"), operator, "{\"fileName\":\"r.csv\",\"mode\":\"PURCHASE\",\"rows\":["
                        + row(1, "Analgin", null, null, null, "1000") + "]}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("referencePrice.costHidden"));
        mvc.perform(json(post("/api/reference-prices/compare"), operator, "{\"fileName\":\"r.csv\",\"mode\":\"SALE\",\"rows\":["
                        + row(1, "Analgin", null, null, null, "1000") + "]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("referencePrice.priceTypeRequired"));
        mvc.perform(json(put("/api/reference-prices/profile"), operator,
                        "{\"name\":\"Davlat\",\"mapping\":{\"name\":\"Nomi\",\"price\":\"Narx\",\"bogus\":\"X\"}}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/reference-prices/profile").cookie(operator))
                .andExpect(jsonPath("$.mapping.price").value("Narx"))
                .andExpect(jsonPath("$.mapping.bogus").doesNotExist());
        Cookie storekeeper = loginAs("WAREHOUSE_MANAGER", branch);
        mvc.perform(get("/api/reference-prices").cookie(storekeeper)).andExpect(status().isForbidden());
    }

    @Test
    void purchaseCompareUsesReceiptAndWarnsOnReceiptCard() throws Exception {
        long branch = branch();
        String bc = rnd(13);
        long p = product("Kirim referent " + UUID.randomUUID().toString().substring(0, 6), null, null);
        barcode(p, bc);
        var w = tx.execute(st -> warehouses.create(branch, "RF ombor " + branch, null, java.util.Set.of()));
        long zone = w.zones().stream().filter(z -> z.type() == uz.yuzplus.inventory.ZoneType.MAIN).findFirst().orElseThrow().id();
        long supplier = jdbc.sql("INSERT INTO counterparty (tin, name, is_supplier) VALUES (:t, :n, true) RETURNING id")
                .param("t", String.valueOf(700_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .param("n", "YB " + UUID.randomUUID().toString().substring(0, 6))
                .query(Long.class)
                .single();
        String number = "KR-RF-" + UUID.randomUUID().toString().substring(0, 8);
        long rc = jdbc.sql("""
                INSERT INTO receipt (number, branch_id, warehouse_id, supplier_id, receipt_date, payment_type, prepaid, status,
                                     accepted_at, posted_at, debt_amount, created_by)
                VALUES (:n, :b, :w, :s, CURRENT_DATE, 'TRANSFER', true, 'DRAFT', NULL, NULL, NULL, (SELECT min(id) FROM employee)) RETURNING id""")
                .param("n", number)
                .param("b", branch)
                .param("w", w.id())
                .param("s", supplier)
                .query(Long.class)
                .single();
        jdbc.sql("""
                INSERT INTO receipt_line (receipt_id, line_no, product_id, batch_number, expiry_date, zone_id, qty, price)
                VALUES (:r, 1, :p, 'RF-1', DATE '2030-01-31', :z, 2, 12000)""")
                .param("r", rc)
                .param("p", p)
                .param("z", zone)
                .update();
        jdbc.sql("UPDATE receipt SET status = 'POSTED', accepted_at = now(), posted_at = now(), debt_amount = 0 WHERE id = :r")
                .param("r", rc).update();
        Cookie director = loginAs("DIRECTOR", branch);
        // Hali referent narx yo'q — ogohlantirish yo'q
        mvc.perform(get("/api/reference-prices/receipt/" + rc).cookie(director)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(json(post("/api/reference-prices/compare"), director, "{\"fileName\":\"davlat.xlsx\",\"mode\":\"PURCHASE\",\"receiptId\":" + rc
                        + ",\"rows\":[" + row(1, "Nomi boshqa", bc, null, null, "10000") + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.receiptNumber").value(number))
                .andExpect(jsonPath("$.lines[0].ourPrice").value("12000.00"))
                .andExpect(jsonPath("$.lines[0].source").value(number))
                .andExpect(jsonPath("$.lines[0].status").value("DEARER"));
        mvc.perform(get("/api/reference-prices/receipt/" + rc).cookie(director))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].productId").value(p))
                .andExpect(jsonPath("$[0].diffPct").value("20.00"));
        // Oxirgi o'tkazilgan kirim narxi (kirim tanlanmagan)
        mvc.perform(json(post("/api/reference-prices/compare"), director, "{\"fileName\":\"d2.xlsx\",\"mode\":\"PURCHASE\",\"rows\":["
                        + row(1, "x", bc, null, null, "12000") + "]}"))
                .andExpect(jsonPath("$.lines[0].status").value("MATCH"))
                .andExpect(jsonPath("$.summary.receiptId").doesNotExist());
    }
}
