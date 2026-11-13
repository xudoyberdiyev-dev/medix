package uz.medix.catalog.saleszone;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import uz.medix.TestcontainersConfig;

/** O6 (egasi 13.11.2026): savdo zonalari — filial filtri, unikal nom, faolsizlantirish, mijozga biriktirish (majburiy). */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class SalesZoneIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "cp" + UUID.randomUUID().toString().substring(0, 8);
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
                .param("t", String.valueOf(500_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private static String tin() {
        return String.valueOf(200_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L));
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, Cookie session, String body) {
        return b.with(csrf()).cookie(session).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static long id(MvcResult r) throws Exception {
        return Long.parseLong(r.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));
    }

    @Test
    void zonesAreBranchScopedUniqueAndDeactivatable() throws Exception {
        long own = branch();
        long other = branch();
        Cookie manager = loginAs("BRANCH_MANAGER", own);
        Cookie operator = loginAs("OPERATOR", own);
        Cookie director = loginAs("DIRECTOR", null);

        long z = id(mvc.perform(json(post("/api/sales-zones"), manager, "{\"branchId\":" + own + ",\"name\":\"  Chilonzor  \",\"note\":\"Gʻarb\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Chilonzor"))
                .andExpect(jsonPath("$.customers").value(0))
                .andReturn());
        // Nom filial ichida unikal (katta-kichik harf farqsiz)
        mvc.perform(json(post("/api/sales-zones"), manager, "{\"branchId\":" + own + ",\"name\":\"chilonzor\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("salesZone.duplicate"));
        // Boshqa filialga — ruxsat yo'q; Direktor boshqa filialda xuddi shu nom bilan yarata oladi
        mvc.perform(json(post("/api/sales-zones"), manager, "{\"branchId\":" + other + ",\"name\":\"Yunusobod\"}"))
                .andExpect(status().isBadRequest());
        long zOther = id(mvc.perform(json(post("/api/sales-zones"), director, "{\"branchId\":" + other + ",\"name\":\"Chilonzor\"}"))
                .andExpect(status().isCreated())
                .andReturn());
        // Operator — faqat ko'radi
        mvc.perform(json(post("/api/sales-zones"), operator, "{\"branchId\":" + own + ",\"name\":\"Sergeli\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/sales-zones").cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + z + ")]").exists())
                .andExpect(jsonPath("$[?(@.id == " + zOther + ")]").doesNotExist());
        mvc.perform(get("/api/sales-zones/" + zOther + "/customers").cookie(manager)).andExpect(status().isNotFound());

        // Mijoz: filialda faol zona bor — zonasiz saqlab bo'lmaydi; boshqa filial zonasi — xato
        long c = id(mvc.perform(json(post("/api/counterparties"), manager,
                        "{\"tin\":\"" + tin() + "\",\"name\":\"Zona dorixona " + UUID.randomUUID().toString().substring(0, 5)
                                + "\",\"customer\":true,\"supplier\":false}"))
                .andExpect(status().isCreated())
                .andReturn());
        mvc.perform(json(put("/api/counterparties/" + c + "/terms/" + own), manager, "{\"paymentDays\":10}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("salesZone.required"));
        mvc.perform(json(put("/api/counterparties/" + c + "/terms/" + own), manager, "{\"paymentDays\":10,\"salesZoneId\":" + zOther + "}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("salesZone.invalid"));
        mvc.perform(json(put("/api/counterparties/" + c + "/terms/" + own), manager, "{\"paymentDays\":10,\"salesZoneId\":" + z + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.terms[0].salesZone.id").value(z))
                .andExpect(jsonPath("$.terms[0].salesZone.name").value("Chilonzor"));
        mvc.perform(get("/api/sales-zones?branchId=" + own).cookie(manager))
                .andExpect(jsonPath("$[?(@.id == " + z + ")].customers").value(1));
        mvc.perform(get("/api/sales-zones/" + z + "/customers").cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(c));

        // Mijozi bor zona: filiali o'zgarmaydi, o'chirilmaydi — faolsizlantiriladi; mijoz zonasi saqlanadi
        mvc.perform(json(put("/api/sales-zones/" + z), director, "{\"branchId\":" + other + ",\"name\":\"Chilonzor 2\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("salesZone.branchLocked"));
        mvc.perform(json(post("/api/sales-zones/" + z + "/deactivate"), manager, ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
        mvc.perform(get("/api/sales-zones?activeOnly=true&branchId=" + own).cookie(manager))
                .andExpect(jsonPath("$[?(@.id == " + z + ")]").doesNotExist());
        // Avval biriktirilgan nofaol zona bilan qayta saqlash mumkin; filialda faol zona qolmagani uchun zonasiz ham mumkin
        mvc.perform(json(put("/api/counterparties/" + c + "/terms/" + own), manager, "{\"paymentDays\":12,\"salesZoneId\":" + z + "}"))
                .andExpect(status().isOk());
        mvc.perform(json(put("/api/counterparties/" + c + "/terms/" + own), manager, "{\"paymentDays\":12}"))
                .andExpect(status().isOk());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.sql("DELETE FROM sales_zone WHERE id = :z").param("z", z).update())
                .hasMessageContaining("taqiqlangan");
    }
}
