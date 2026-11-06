package uz.medix.reporting;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
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
import uz.medix.TestcontainersConfig;
import uz.medix.shared.text.SearchText;

/** Ctrl+K qidiruv: lotin/kirill farqsiz, STIR bo'yicha aniq, guruhlar ruxsat bo'yicha, qisqa so'rov — bo'sh. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class GlobalSearchIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private long branch() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        return jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'Qidiruv sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(300_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private Cookie login(String role, long branchId, String fullName) throws Exception {
        String login = "qs" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :login, :name, id, :b, :hash, false FROM role WHERE code = :role""")
                .param("login", login)
                .param("name", fullName)
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

    @Test
    void searchesProductsCounterpartiesAndEmployeesByPermission() throws Exception {
        long b = branch();
        var rnd = ThreadLocalRandom.current();
        String tag = "zq" + Long.toString(rnd.nextLong(1_000_000L, 9_999_999L));
        String productName = "Kordiamin " + tag;
        String code = Long.toString(rnd.nextLong(10_000_000L, 99_999_999L));
        jdbc.sql("""
                INSERT INTO product (unit_id, code, name, search_text) SELECT id, :c, :n, :s FROM unit ORDER BY id LIMIT 1""")
                .param("c", code)
                .param("n", productName)
                .param("s", SearchText.of(productName, code))
                .update();
        String tin = Long.toString(rnd.nextLong(200_000_000L, 299_999_999L));
        String customer = "Shifo " + tag;
        jdbc.sql("INSERT INTO counterparty (tin, name, is_customer, search_text) VALUES (:t, :n, true, :s)")
                .param("t", tin)
                .param("n", customer)
                .param("s", SearchText.of(customer, tin))
                .update();

        Cookie operator = login("OPERATOR", b, "Operator " + tag);
        Cookie director = login("DIRECTOR", b, "Direktor " + tag);

        // Kirillda yozilgan so'rov lotin nomini topadi; har so'z bo'lishi shart.
        mvc.perform(get("/api/search").param("q", "кордиамин " + tag).cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hits[?(@.kind == 'PRODUCT')].title", hasItem(productName)))
                .andExpect(jsonPath("$.hits[?(@.kind == 'PRODUCT')].link", hasItem("/products?q=Kordiamin%20" + tag)));
        // Mahsulot kodi bo'yicha aniq.
        mvc.perform(get("/api/search").param("q", code).cookie(operator))
                .andExpect(jsonPath("$.hits[?(@.kind == 'PRODUCT')].title", hasItem(productName)));
        // STIR bo'yicha — mijoz, havola Mijozlar sahifasiga.
        mvc.perform(get("/api/search").param("q", tin).cookie(operator))
                .andExpect(jsonPath("$.hits[?(@.kind == 'CUSTOMER')].title", hasItem(customer)))
                .andExpect(jsonPath("$.hits[?(@.kind == 'CUSTOMER')].link", hasItem("/customers?q=" + tin)));

        // Xodimlar — faqat staff.view bilan.
        mvc.perform(get("/api/search").param("q", tag).cookie(director))
                .andExpect(jsonPath("$.hits[?(@.kind == 'EMPLOYEE')].title", hasItem("Operator " + tag)));
        mvc.perform(get("/api/search").param("q", tag).cookie(operator))
                .andExpect(jsonPath("$.hits[*].kind", not(hasItem("EMPLOYEE"))))
                .andExpect(jsonPath("$.hits[*].kind", not(hasItem("RECEIPT"))));

        // Juda qisqa so'rov — bo'sh.
        mvc.perform(get("/api/search").param("q", "k").cookie(operator)).andExpect(jsonPath("$.hits.length()").value(0));
    }

    @Test
    void searchRequiresLogin() throws Exception {
        mvc.perform(get("/api/search").param("q", "kordiamin")).andExpect(status().isUnauthorized());
    }
}
