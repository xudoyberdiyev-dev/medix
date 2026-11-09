package uz.medix.pricing;

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
import uz.medix.TestcontainersConfig;

/** Narx turlari jadvali: statistika, tahrirlash (nom, muqobil nom, faollik), cheklovlar, tarix. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class PriceTypeIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "ptp" + UUID.randomUUID().toString().substring(0, 8);
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

    @Test
    void overviewEditAndHistory() throws Exception {
        long branch = branch();
        Cookie director = loginAs("DIRECTOR", branch);
        long promo = jdbc.sql("SELECT id FROM price_type WHERE code = 'PROMO'").query(Long.class).single();
        long base = jdbc.sql("SELECT id FROM price_type WHERE code = 'BASE'").query(Long.class).single();
        mvc.perform(get("/api/price-types/overview").param("branchId", String.valueOf(branch)).cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("BASE"))
                .andExpect(jsonPath("$[0].priced").value(0))
                .andExpect(jsonPath("$[0].customers").value(0));
        mvc.perform(get("/api/price-types/overview").param("branchId", String.valueOf(branch())).cookie(loginAs("OPERATOR", branch)))
                .andExpect(status().isNotFound());

        mvc.perform(put("/api/price-types/" + promo).param("branchId", String.valueOf(branch)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Promo narx\",\"altName\":\"Промо\",\"active\":true}").with(csrf()).cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Promo narx"))
                .andExpect(jsonPath("$.altName").value("Промо"));
        mvc.perform(put("/api/price-types/" + promo).param("branchId", String.valueOf(branch)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Narx\",\"active\":true}").with(csrf()).cookie(director))
                .andExpect(status().isConflict());
        mvc.perform(put("/api/price-types/" + base).param("branchId", String.valueOf(branch)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Narx\",\"active\":false}").with(csrf()).cookie(director))
                .andExpect(status().isConflict());
        mvc.perform(get("/api/price-types/" + promo + "/history").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].action").value("priceType.update"));
        // Operator tahrirlay olmaydi
        mvc.perform(put("/api/price-types/" + promo).param("branchId", String.valueOf(branch)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"active\":true}").with(csrf()).cookie(loginAs("OPERATOR", branch)))
                .andExpect(status().isForbidden());
        // Asl holatga
        mvc.perform(put("/api/price-types/" + promo).param("branchId", String.valueOf(branch)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Promo\",\"active\":true}").with(csrf()).cookie(director))
                .andExpect(status().isOk());
    }

    /** E10: yangi narx turi, «Partiyaga bogʻliq» / «Bazaviy» almashtirish, Vozvrat saqlanadi. */
    @Test
    void createSwitchBaseAndBatch() throws Exception {
        long branch = branch();
        Cookie director = loginAs("DIRECTOR", branch);
        String b = String.valueOf(branch);
        long base = jdbc.sql("SELECT id FROM price_type WHERE code = 'BASE'").query(Long.class).single();
        long ret = jdbc.sql("SELECT id FROM price_type WHERE code = 'RETURN'").query(Long.class).single();
        String name = "Klinika " + UUID.randomUUID().toString().substring(0, 6);
        MvcResult created = mvc.perform(post("/api/price-types").param("branchId", b).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"batch\":true,\"base\":false}").with(csrf()).cookie(director))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value(name))
                .andExpect(jsonPath("$.batch").value(true))
                .andExpect(jsonPath("$.base").value(false))
                .andExpect(jsonPath("$.active").value(true))
                .andReturn();
        long id = ((Number) com.jayway.jsonpath.JsonPath.read(created.getResponse().getContentAsString(), "$.id")).longValue();
        // Nom band, bazaviy + partiya — mumkin emas, Operator — ruxsat yoʻq
        mvc.perform(post("/api/price-types").param("branchId", b).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"batch\":false,\"base\":false}").with(csrf()).cookie(director))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("priceType.duplicate"));
        mvc.perform(post("/api/price-types").param("branchId", b).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X" + name + "\",\"batch\":true,\"base\":true}").with(csrf()).cookie(director))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("priceType.baseBatch"));
        mvc.perform(post("/api/price-types").param("branchId", b).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Y" + name + "\",\"batch\":false,\"base\":false}").with(csrf())
                        .cookie(loginAs("OPERATOR", branch)))
                .andExpect(status().isForbidden());

        // Narxi yoʻq — partiyadan ajratish mumkin; bazaviy qilinsa eski bazaviy oddiy turga oʻtadi
        mvc.perform(put("/api/price-types/" + id).param("branchId", b).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"active\":true,\"batch\":false,\"base\":true}").with(csrf()).cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.batch").value(false))
                .andExpect(jsonPath("$.base").value(true));
        try {
            org.junit.jupiter.api.Assertions.assertEquals(1L,
                    jdbc.sql("SELECT count(*) FROM price_type WHERE base").query(Long.class).single());
            org.junit.jupiter.api.Assertions.assertFalse(
                    jdbc.sql("SELECT base FROM price_type WHERE id = :id").param("id", base).query(Boolean.class).single());
            mvc.perform(put("/api/price-types/" + id).param("branchId", b).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"" + name + "\",\"active\":true,\"batch\":true}").with(csrf()).cookie(director))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("priceType.baseBatch"));
        } finally {
            // Asl bazaviy turga qaytarish
            mvc.perform(put("/api/price-types/" + base).param("branchId", b).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"Narx\",\"active\":true,\"base\":true}").with(csrf()).cookie(director))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.base").value(true));
        }
        org.junit.jupiter.api.Assertions.assertFalse(
                jdbc.sql("SELECT base FROM price_type WHERE id = :id").param("id", id).query(Boolean.class).single());

        // Narxi bor turda «Partiyaga bogʻliq» almashtirilmaydi (bazaviy turda narxlar bor)
        long withPrices = jdbc.sql("SELECT price_type_id FROM price LIMIT 1").query(Long.class).optional().orElse(-1L);
        if (withPrices > 0 && withPrices != base) {
            String n = jdbc.sql("SELECT name FROM price_type WHERE id = :id").param("id", withPrices).query(String.class).single();
            mvc.perform(put("/api/price-types/" + withPrices).param("branchId", b).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"" + n + "\",\"active\":true,\"batch\":true}").with(csrf()).cookie(director))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("priceType.hasPrices"));
        }
        // Vozvrat — nofaol qilinmaydi
        mvc.perform(put("/api/price-types/" + ret).param("branchId", b).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Vozvrat\",\"active\":false}").with(csrf()).cookie(director))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("priceType.returnKept"));
    }
}
