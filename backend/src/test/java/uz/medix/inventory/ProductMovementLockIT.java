package uz.medix.inventory;

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

/** Mahsulot shakli: kod o'zgarishi va ombor harakati bo'lsa qulf (filial/ombor yaratiladi — sozlash testlaridan keyin ishlaydi). */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ProductMovementLockIT {

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
