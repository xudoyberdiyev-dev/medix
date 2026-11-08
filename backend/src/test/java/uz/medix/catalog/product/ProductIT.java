package uz.medix.catalog.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.util.UUID;
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

/** Mahsulotlar: kod, qidiruv (lotin/kirill, kod, shtrix-kod), tahrirlash, kod tarixi, nofaol qilish, ruxsatlar. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ProductIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private Cookie loginAs(String role) throws Exception {
        String login = "prd" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, must_change_password)
                SELECT :login, 'Sinov', id, :hash, false FROM role WHERE code = :role""")
                .param("login", login)
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

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, Cookie session, String body) {
        return b.with(csrf()).cookie(session).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private long unitId() {
        return jdbc.sql("SELECT id FROM unit WHERE short_name = 'dona'").query(Long.class).single();
    }

    private long manufacturer(String name) {
        return jdbc.sql("INSERT INTO manufacturer (name) VALUES (:n) RETURNING id").param("n", name).query(Long.class).single();
    }

    private static String uniq() {
        return UUID.randomUUID().toString().substring(0, 6);
    }

    private String body(String name, Long manufacturerId, String barcode) {
        return "{\"name\":\"" + name + "\",\"unitId\":" + unitId() + (manufacturerId == null ? "" : ",\"manufacturerId\":" + manufacturerId)
                + (barcode == null ? "" : ",\"barcodes\":[\"" + barcode + "\"]")
                + ",\"controlled\":false,\"marked\":true,\"prescription\":false,\"vatRate\":\"12\",\"minQty\":2,\"maxQty\":100}";
    }

    private static long id(MvcResult r) throws Exception {
        return Long.parseLong(r.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));
    }

    @Test
    void createSearchAndEdit() throws Exception {
        Cookie purchaser = loginAs("PURCHASER");
        String tag = uniq();
        long m = manufacturer("Berlin-Chemie " + tag);
        String barcode = "478" + System.nanoTime() % 10_000_000_000L;
        MvcResult created = mvc.perform(json(post("/api/products"), purchaser, body("Paracetamol " + tag + " 500 mg", m, barcode)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(matchesPattern("^[1-9][0-9]{7}$")))
                .andExpect(jsonPath("$.vatRate").value("12.00"))
                .andExpect(jsonPath("$.manufacturer.name").value("Berlin-Chemie " + tag))
                .andExpect(jsonPath("$.barcodes[0]").value(barcode))
                .andReturn();
        long id = id(created);
        String code = created.getResponse().getContentAsString().replaceAll(".*\"code\":\"(\\d{8})\".*", "$1");

        Cookie operator = loginAs("OPERATOR");
        // Kirillda qidiruv
        mvc.perform(get("/api/products").param("q", "парацетамол " + tag).cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].unit").value("dona"))
                .andExpect(jsonPath("$.items[0].match").doesNotExist());
        // Kod va shtrix-kod bo'yicha; shtrix-kod jadvalda ko'rinmaydi — «topilgan joy» qaytadi
        mvc.perform(get("/api/products").param("q", code).cookie(operator))
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].match").doesNotExist());
        mvc.perform(get("/api/products").param("q", barcode).cookie(operator))
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].match.field").value("BARCODE"))
                .andExpect(jsonPath("$.items[0].match.value").value(barcode));
        // Ishlab chiqaruvchi bo'yicha filtr
        mvc.perform(get("/api/products").param("manufacturerId", String.valueOf(m)).cookie(operator))
                .andExpect(jsonPath("$.items", hasSize(1)));
        // Operator yarata olmaydi
        mvc.perform(json(post("/api/products"), operator, body("X " + tag, null, null))).andExpect(status().isForbidden());

        // Shu shtrix-kod boshqa mahsulotga berilmaydi
        mvc.perform(json(post("/api/products"), purchaser, body("Boshqa " + tag, null, barcode)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("product.barcodeTaken"));
        // min > max
        mvc.perform(json(post("/api/products"), purchaser, body("Min " + tag, null, null).replace("\"minQty\":2", "\"minQty\":500")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("product.minMax"));

        // Tahrirlash: nom o'zgaradi, shtrix-kod olib tashlanadi
        mvc.perform(json(put("/api/products/" + id), purchaser, body("Paracetamol " + tag + " 200 mg", m, null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Paracetamol " + tag + " 200 mg"))
                .andExpect(jsonPath("$.barcodes", hasSize(0)));

        // Ishlab chiqaruvchi nomi o'zgarsa — qidiruv yangilanadi
        mvc.perform(json(put("/api/dictionaries/MANUFACTURER/" + m), purchaser, "{\"name\":\"Menarini " + tag + "\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/products").param("q", "менарини " + tag).cookie(operator)).andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void listColumnsViewsAndFacets() throws Exception {
        Cookie purchaser = loginAs("PURCHASER");
        String tag = uniq();
        long m1 = manufacturer("Gedeon " + tag);
        long m2 = manufacturer("KRKA " + tag);
        String extra = ",\"dosageForm\":\"CAPSULE\",\"dose\":\"20 mg\",\"packQty\":30,\"perPack\":10,\"note\":\"Tender " + tag + "\"}";
        long a = id(mvc.perform(json(post("/api/products"), purchaser, body("Omez " + tag, m1, null).replaceFirst("}$", extra)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.dosageForm").value("CAPSULE"))
                .andExpect(jsonPath("$.perPack").value(10))
                .andReturn());
        long b = id(mvc.perform(json(post("/api/products"), purchaser, body("Nolpaza " + tag, m2, null).replace("\"controlled\":false", "\"controlled\":true")))
                .andExpect(status().isCreated()).andReturn());
        mvc.perform(json(post("/api/products/" + b + "/deactivate"), purchaser, "{\"reason\":\"Sinov\"}")).andExpect(status().isOk());

        // Yorliqlar soni qidiruv bo'yicha; variantlar — yorliq bo'yicha, soni bilan
        mvc.perform(get("/api/products").param("q", tag).param("status", "ALL").param("facets", "true").cookie(purchaser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.views.all").value(2))
                .andExpect(jsonPath("$.views.active").value(1))
                .andExpect(jsonPath("$.views.controlled").value(1))
                .andExpect(jsonPath("$.views.marked").value(2))
                .andExpect(jsonPath("$.views.inactive").value(1))
                .andExpect(jsonPath("$.facets.manufacturers", hasSize(2)))
                .andExpect(jsonPath("$.facets.active").value(1))
                .andExpect(jsonPath("$.facets.inactive").value(1));
        // Bir nechta qiymatli filtr («yoki») va yorliq
        mvc.perform(get("/api/products").param("q", tag).param("status", "ALL").param("manufacturerIds", m1 + "," + m2).cookie(purchaser))
                .andExpect(jsonPath("$.total").value(2));
        mvc.perform(get("/api/products").param("q", tag).param("status", "ALL").param("view", "CONTROLLED").cookie(purchaser))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(b));
        // Jadval ustunlari: dori shakli, doza, qadoq, izoh, qoldiq (0), narx (berilmagan — null)
        mvc.perform(get("/api/products").param("q", tag).param("sort", "STOCK").param("desc", "true").cookie(purchaser))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(a))
                .andExpect(jsonPath("$.items[0].dosageForm").value("CAPSULE"))
                .andExpect(jsonPath("$.items[0].dose").value("20 mg"))
                .andExpect(jsonPath("$.items[0].packQty").value(30))
                .andExpect(jsonPath("$.items[0].note").value("Tender " + tag))
                .andExpect(jsonPath("$.items[0].stock").value(0))
                .andExpect(jsonPath("$.items[0].price").doesNotExist())
                .andExpect(jsonPath("$.views").doesNotExist());
        // Kartochka: tarix (yaratish, nofaol qilish), qoldiq (yo'q), narx tarixi (yo'q)
        mvc.perform(get("/api/products/" + b + "/history").cookie(purchaser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].action").value("product.deactivate"))
                .andExpect(jsonPath("$[0].reason").value("Sinov"))
                .andExpect(jsonPath("$[1].action").value("product.create"));
        mvc.perform(get("/api/stock/product-card/" + a).cookie(purchaser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0))
                .andExpect(jsonPath("$.lines", hasSize(0)))
                .andExpect(jsonPath("$.moves", hasSize(0)));
        mvc.perform(get("/api/stock/product-card/999999999").cookie(purchaser)).andExpect(status().isNotFound());
        mvc.perform(get("/api/prices/history").param("productId", String.valueOf(a)).cookie(loginAs("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows", hasSize(0)));
    }

    @Test
    void codeChangeIsHistoricalAndUnique() throws Exception {
        Cookie admin = loginAs("ADMIN");
        String tag = uniq();
        long a = id(mvc.perform(json(post("/api/products"), admin, body("Kod A " + tag, null, null))).andExpect(status().isCreated()).andReturn());
        long b = id(mvc.perform(json(post("/api/products"), admin, body("Kod B " + tag, null, null))).andExpect(status().isCreated()).andReturn());
        String oldCode = jdbc.sql("SELECT code FROM product WHERE id = :id").param("id", a).query(String.class).single();
        String bCode = jdbc.sql("SELECT code FROM product WHERE id = :id").param("id", b).query(String.class).single();
        String newCode = String.valueOf(10_000_000 + (int) (Math.random() * 89_999_999));

        mvc.perform(json(put("/api/products/" + a + "/code"), admin, "{\"code\":\"" + bCode + "\",\"reason\":\"Sinov\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("product.codeTaken"));
        mvc.perform(json(put("/api/products/" + a + "/code"), admin, "{\"code\":\"01234567\",\"reason\":\"Sinov\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(json(put("/api/products/" + a + "/code"), admin, "{\"code\":\"" + newCode + "\",\"reason\":\"SmartUp kodi bilan moslash\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(newCode))
                .andExpect(jsonPath("$.codeHistory[0].oldCode").value(oldCode))
                .andExpect(jsonPath("$.codeHistory[0].reason").value("SmartUp kodi bilan moslash"));
        // Eski kod boshqa mahsulotga berilmaydi
        mvc.perform(json(put("/api/products/" + b + "/code"), admin, "{\"code\":\"" + oldCode + "\",\"reason\":\"Sinov\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void deactivatedProductHiddenByDefault() throws Exception {
        Cookie admin = loginAs("ADMIN");
        String tag = uniq();
        long id = id(mvc.perform(json(post("/api/products"), admin, body("Nofaol " + tag, null, null))).andExpect(status().isCreated()).andReturn());
        mvc.perform(json(post("/api/products/" + id + "/deactivate"), admin, "{\"reason\":\"Ishlab chiqarilmaydi\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
        mvc.perform(get("/api/products").param("q", "nofaol " + tag).cookie(admin)).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/products").param("q", "nofaol " + tag).param("status", "ALL").cookie(admin))
                .andExpect(jsonPath("$.total").value(1));
        long audits = jdbc.sql("SELECT count(*) FROM audit_log WHERE entity_type = 'product' AND entity_id = :id")
                .param("id", String.valueOf(id))
                .query(Long.class)
                .single();
        assertThat(audits).isEqualTo(2);
    }

    @Test
    void employeeLookupHidesSensitiveFields() throws Exception {
        Cookie purchaser = loginAs("ADMIN");
        mvc.perform(get("/api/employee-lookup").cookie(purchaser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].fullName").exists())
                .andExpect(jsonPath("$[0].login").doesNotExist());
    }

    @Test
    void formPresetCodeDuplicatesAndVatExempt() throws Exception {
        Cookie admin = loginAs("ADMIN");
        String tag = uniq();
        long m = manufacturer("Gedeon " + tag);
        String code = mvc.perform(get("/api/products/new-code").cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(matchesPattern("^[1-9][0-9]{7}$")))
                .andReturn().getResponse().getContentAsString().replaceAll(".*\"code\":\"(\\d{8})\".*", "$1");
        String barcode = "479" + System.nanoTime() % 10_000_000_000L;
        String withCode = body("Omeprazol " + tag, m, barcode).replace("\"vatRate\":\"12\"", "\"vatRate\":\"0\",\"vatExempt\":true,\"code\":\"" + code + "\"");
        long id = id(mvc.perform(json(post("/api/products"), admin, withCode))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.vatExempt").value(true))
                .andExpect(jsonPath("$.hasMovements").value(false))
                .andReturn());
        // Band kod bilan yana — 409
        mvc.perform(json(post("/api/products"), admin, body("Boshqa " + tag, null, null).replace("}", ",\"code\":\"" + code + "\"}")))
                .andExpect(status().isConflict());
        // Ozod, lekin stavka 12 — 400
        mvc.perform(json(post("/api/products"), admin, body("Ozod " + tag, null, null).replace("}", ",\"vatExempt\":true}")))
                .andExpect(status().isBadRequest());
        // Dublikatlar: nom (registrsiz) + ishlab chiqaruvchi, kod, shtrix-kod; o'zi chiqarib tashlanadi
        mvc.perform(get("/api/products/duplicates").cookie(admin).param("name", "OMEPRAZOL " + tag).param("manufacturerId", String.valueOf(m))
                        .param("code", code).param("barcodes", barcode, "4780000000000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sameName.id").value(id))
                .andExpect(jsonPath("$.codeOwner.id").value(id))
                .andExpect(jsonPath("$.barcodes", hasSize(1)))
                .andExpect(jsonPath("$.barcodes[0].barcode").value(barcode));
        mvc.perform(get("/api/products/duplicates").cookie(admin).param("name", "Omeprazol " + tag).param("manufacturerId", String.valueOf(m))
                        .param("code", code).param("barcodes", barcode).param("excludeId", String.valueOf(id)))
                .andExpect(jsonPath("$.sameName").doesNotExist())
                .andExpect(jsonPath("$.codeOwner").doesNotExist())
                .andExpect(jsonPath("$.barcodes", hasSize(0)));
        // Operator — shakl tekshiruviga ruxsat yo'q
        mvc.perform(get("/api/products/new-code").cookie(loginAs("OPERATOR"))).andExpect(status().isForbidden());
    }

    @Test
    void editFormChangesCodeAndLocksAfterMovements() throws Exception {
        Cookie admin = loginAs("ADMIN");
        String tag = uniq();
        long id = id(mvc.perform(json(post("/api/products"), admin, body("Qulf " + tag, null, null))).andExpect(status().isCreated()).andReturn());
        String newCode = mvc.perform(get("/api/products/new-code").cookie(admin)).andReturn().getResponse().getContentAsString()
                .replaceAll(".*\"code\":\"(\\d{8})\".*", "$1");
        // Shaklda kod o'zgarsa — tarixga yoziladi
        mvc.perform(json(put("/api/products/" + id), admin, body("Qulf " + tag, null, null).replace("}", ",\"code\":\"" + newCode + "\"}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(newCode))
                .andExpect(jsonPath("$.codeHistory", hasSize(1)));
        // Ombor harakati paydo bo'ladi
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = java.util.concurrent.ThreadLocalRandom.current();
        long br = jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'Mahsulot sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)))
                .param("t", String.valueOf(300_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .single();
        long wh = jdbc.sql("INSERT INTO warehouse (branch_id, name) VALUES (:b, 'Asosiy') RETURNING id").param("b", br).query(Long.class).single();
        long zone = jdbc.sql("INSERT INTO zone (warehouse_id, type, name) VALUES (:w, 'MAIN', 'Asosiy zona') RETURNING id").param("w", wh)
                .query(Long.class).single();
        long[] loc = {zone, wh, br};
        long batch = jdbc.sql("""
                INSERT INTO batch (product_id, number, expiry_date, cost, source_type) VALUES (:p, 'B1', :x, 1, 'TST') RETURNING id""")
                .param("p", id).param("x", java.sql.Date.valueOf(java.time.LocalDate.now().plusYears(1))).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO stock_move (branch_id, warehouse_id, zone_id, product_id, batch_id, qty, doc_type, doc_id, doc_number)
                VALUES (:b, :w, :z, :p, :bt, 5, 'TST', 1, 'TST')""")
                .param("b", loc[2]).param("w", loc[1]).param("z", loc[0]).param("p", id).param("bt", batch).update();
        mvc.perform(get("/api/products/" + id).cookie(admin)).andExpect(jsonPath("$.hasMovements").value(true));
        // Markirovkani o'chirish — 409; nom o'zgarishi — mumkin
        mvc.perform(json(put("/api/products/" + id), admin, body("Qulf " + tag, null, null).replace("\"marked\":true", "\"marked\":false")))
                .andExpect(status().isConflict());
        mvc.perform(json(put("/api/products/" + id), admin, body("Qulf yangi " + tag, null, null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Qulf yangi " + tag));
    }
}
