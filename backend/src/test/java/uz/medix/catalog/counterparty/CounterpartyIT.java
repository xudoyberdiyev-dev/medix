package uz.medix.catalog.counterparty;

import static org.hamcrest.Matchers.hasSize;
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

/** Kontragentlar: bitta STIR — bitta karta, qidiruv (kirill, telefon), bloklash, litsenziya, shartnoma, filial shartlari. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class CounterpartyIT {

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
    void cardSearchAndBlock() throws Exception {
        Cookie accountant = loginAs("ACCOUNTANT", null);
        String tin = tin();
        String tag = UUID.randomUUID().toString().substring(0, 5);
        long id = id(mvc.perform(json(post("/api/counterparties"), accountant,
                        "{\"tin\":\"" + tin + "\",\"name\":\"Dorixona Shifo " + tag + "\",\"customer\":true,\"supplier\":false,"
                                + "\"phone\":\"+998 90 111 22 33\",\"bankAccount\":\"20208000900100200300\",\"bankMfo\":\"00450\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.customer").value(true))
                .andReturn());

        mvc.perform(json(post("/api/counterparties"), accountant,
                        "{\"tin\":\"" + tin + "\",\"name\":\"Takror\",\"customer\":false,\"supplier\":true}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("counterparty.tinTaken"));
        mvc.perform(json(post("/api/counterparties"), accountant,
                        "{\"tin\":\"" + tin() + "\",\"name\":\"Rolsiz\",\"customer\":false,\"supplier\":false}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("counterparty.roleRequired"));
        mvc.perform(json(post("/api/counterparties"), accountant, "{\"tin\":\"12345\",\"name\":\"X\",\"customer\":true,\"supplier\":false}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.tin").isNotEmpty());

        Cookie operator = loginAs("OPERATOR", null);
        mvc.perform(get("/api/counterparties").param("q", "шифо " + tag).cookie(operator))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(id));
        mvc.perform(get("/api/counterparties").param("q", "901112233").cookie(operator)).andExpect(jsonPath("$.items[?(@.id == " + id + ")]", hasSize(1)));
        mvc.perform(get("/api/counterparties").param("q", tin).param("role", "SUPPLIER").cookie(operator)).andExpect(jsonPath("$.total").value(0));
        mvc.perform(json(post("/api/counterparties/" + id + "/block"), operator, "{\"reason\":\"X\"}")).andExpect(status().isForbidden());

        mvc.perform(json(post("/api/counterparties/" + id + "/block"), accountant, "{\"reason\":\"Qarzi muddati o'tgan\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blocked").value(true))
                .andExpect(jsonPath("$.blockedReason").value("Qarzi muddati o'tgan"));
        mvc.perform(get("/api/counterparties").param("q", tin).cookie(operator)).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/counterparties").param("q", tin).param("status", "BLOCKED").cookie(operator)).andExpect(jsonPath("$.total").value(1));
        mvc.perform(post("/api/counterparties/" + id + "/unblock").with(csrf()).cookie(accountant))
                .andExpect(jsonPath("$.blocked").value(false));
    }

    @Test
    void licensesContractsAndBranchTerms() throws Exception {
        long own = branch();
        long other = branch();
        Cookie admin = loginAs("ADMIN", null);
        long id = id(mvc.perform(json(post("/api/counterparties"), admin,
                        "{\"tin\":\"" + tin() + "\",\"name\":\"Pharm Plus\",\"customer\":true,\"supplier\":true}"))
                .andExpect(status().isCreated())
                .andReturn());

        mvc.perform(json(post("/api/counterparties/" + id + "/licenses"), admin,
                        "{\"number\":\"L-0001\",\"kind\":\"Farmatsevtika faoliyati\",\"issuedOn\":\"2025-01-10\",\"validUntil\":\"2030-01-10\",\"controlledAllowed\":true}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.licenses[0].validUntil").value("2030-01-10"));
        mvc.perform(json(post("/api/counterparties/" + id + "/licenses"), admin,
                        "{\"number\":\"L-2\",\"kind\":\"X\",\"issuedOn\":\"2030-01-10\",\"validUntil\":\"2025-01-10\",\"controlledAllowed\":false}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("counterparty.datesOrder"));

        mvc.perform(json(post("/api/counterparties/" + id + "/contracts"), admin,
                        "{\"branchId\":" + own + ",\"number\":\"12/2026\",\"signedOn\":\"2026-01-05\"}"))
                .andExpect(status().isCreated());
        mvc.perform(json(post("/api/counterparties/" + id + "/contracts"), admin,
                        "{\"branchId\":" + other + ",\"number\":\"7/2026\"}"))
                .andExpect(status().isCreated());

        long priceType = jdbc.sql("SELECT id FROM price_type WHERE code = 'PROMO'").query(Long.class).single();
        Cookie manager = loginAs("BRANCH_MANAGER", own);
        mvc.perform(json(put("/api/counterparties/" + id + "/terms/" + own), manager,
                        "{\"creditLimit\":\"15000000\",\"paymentDays\":30,\"priceTypeId\":" + priceType
                                + ",\"minShelfLifeDays\":180,\"supplierPaymentDays\":45,\"defaultPaymentType\":\"TRANSFER\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.terms", hasSize(1)))
                .andExpect(jsonPath("$.terms[0].creditLimit").value("15000000.00"))
                .andExpect(jsonPath("$.terms[0].priceType.name").value("Promo"))
                .andExpect(jsonPath("$.contracts", hasSize(1)));
        // Boshqa filial shartlari — yopiq
        mvc.perform(json(put("/api/counterparties/" + id + "/terms/" + other), manager, "{\"paymentDays\":10}"))
                .andExpect(status().isNotFound());
        mvc.perform(json(put("/api/counterparties/" + id + "/terms/" + own), manager, "{\"creditLimit\":\"12,5\"}"))
                .andExpect(status().isBadRequest());
        // Qayta saqlash — yangilanadi (upsert)
        mvc.perform(json(put("/api/counterparties/" + id + "/terms/" + own), manager, "{\"creditLimit\":\"20000000.50\"}"))
                .andExpect(jsonPath("$.terms[0].creditLimit").value("20000000.50"))
                .andExpect(jsonPath("$.terms[0].paymentDays").doesNotExist());
        // Admin ikkala filialni ko'radi
        mvc.perform(get("/api/counterparties/" + id).cookie(admin))
                .andExpect(jsonPath("$.contracts", hasSize(2)));
        mvc.perform(get("/api/price-types").cookie(manager))
                .andExpect(jsonPath("$", hasSize(8)))
                .andExpect(jsonPath("$[0].base").value(true));
    }
}
