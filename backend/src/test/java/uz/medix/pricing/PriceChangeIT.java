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
}
