package uz.medix.catalog;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
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

/** Kichik ma'lumotnomalar, mashinalar (filial doirasi), xarajat moddalari. Filiallar yaratiladi — alohida baza. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class CatalogDictionariesIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "cat" + UUID.randomUUID().toString().substring(0, 8);
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
                .param("t", String.valueOf(400_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, Cookie session, String body) {
        return b.with(csrf()).cookie(session).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static long id(MvcResult r) throws Exception {
        return Long.parseLong(r.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));
    }

    @Test
    void seededAndReadableByEveryone() throws Exception {
        Cookie operator = loginAs("OPERATOR", branch());
        mvc.perform(get("/api/dictionaries/REGION").cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(14))));
        mvc.perform(get("/api/dictionaries/COUNTRY").cookie(operator))
                .andExpect(jsonPath("$[?(@.shortName == 'UZ')].name").value("Oʻzbekiston"));
        mvc.perform(get("/api/dictionaries/NOPE").cookie(operator))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("error.request"));
        mvc.perform(json(post("/api/dictionaries/MANUFACTURER"), operator, "{\"name\":\"Berlin-Chemie\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void dictionaryLifecycle() throws Exception {
        Cookie purchaser = loginAs("PURCHASER", branch());
        String name = "Gedeon Richter " + UUID.randomUUID().toString().substring(0, 4);
        long id = id(mvc.perform(json(post("/api/dictionaries/MANUFACTURER"), purchaser, "{\"name\":\"" + name + "\",\"shortName\":\"GR\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.shortName").doesNotExist())
                .andReturn());
        mvc.perform(json(post("/api/dictionaries/MANUFACTURER"), purchaser, "{\"name\":\"" + name.toUpperCase() + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("dictionary.duplicate"));
        mvc.perform(json(put("/api/dictionaries/MANUFACTURER/" + id), purchaser, "{\"name\":\"" + name + " Plc\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value(name + " Plc"));
        mvc.perform(post("/api/dictionaries/MANUFACTURER/" + id + "/deactivate").with(csrf()).cookie(purchaser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
        // Boshqa tur jadvalidagi id — topilmaydi
        mvc.perform(json(put("/api/dictionaries/CATEGORY/" + id), purchaser, "{\"name\":\"X\"}"))
                .andExpect(status().isNotFound());

        mvc.perform(json(post("/api/dictionaries/COUNTRY"), purchaser, "{\"name\":\"Yaponiya " + UUID.randomUUID().toString().substring(0, 4) + "\",\"shortName\":\"jp\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.shortName").value("JP"));
        mvc.perform(json(post("/api/dictionaries/COUNTRY"), purchaser, "{\"name\":\"Xato davlat\",\"shortName\":\"J1\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("dictionary.countryCode"));
    }

    @Test
    void vehiclesAreBranchScoped() throws Exception {
        long own = branch();
        long other = branch();
        Cookie manager = loginAs("BRANCH_MANAGER", own);
        String plate = "01 a " + ThreadLocalRandom.current().nextInt(100, 999) + " bc";
        long vid = id(mvc.perform(json(post("/api/vehicles"), manager,
                        "{\"branchId\":" + own + ",\"plateNumber\":\"" + plate + "\",\"model\":\"Damas\",\"hasRefrigerator\":true}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.hasRefrigerator").value(true))
                .andExpect(jsonPath("$.plateNumber").value(plate.toUpperCase()))
                .andReturn());
        mvc.perform(json(post("/api/vehicles"), manager,
                        "{\"branchId\":" + own + ",\"plateNumber\":\"" + plate.replace(" ", "") + "\",\"model\":\"Labo\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("vehicle.duplicate"));
        mvc.perform(json(post("/api/vehicles"), manager,
                        "{\"branchId\":" + other + ",\"plateNumber\":\"10 B 555 CC\",\"model\":\"Labo\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(json(post("/api/vehicles"), manager, "{\"branchId\":" + own + ",\"plateNumber\":\"01-A\",\"model\":\"Labo\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("vehicle.plate"));

        Cookie admin = loginAs("ADMIN", null);
        String otherPlate = "10 B " + ThreadLocalRandom.current().nextInt(100, 999) + " CC";
        long otherVehicle = id(mvc.perform(json(post("/api/vehicles"), admin,
                        "{\"branchId\":" + other + ",\"plateNumber\":\"" + otherPlate + "\",\"model\":\"Isuzu\"}"))
                .andExpect(status().isCreated())
                .andReturn());
        mvc.perform(post("/api/vehicles/" + otherVehicle + "/deactivate").with(csrf()).cookie(manager))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/vehicles").cookie(manager))
                .andExpect(jsonPath("$[?(@.branchId == " + other + ")]", hasSize(0)))
                .andExpect(jsonPath("$[?(@.id == " + vid + ")]", hasSize(1)));
        mvc.perform(post("/api/vehicles/" + vid + "/deactivate").with(csrf()).cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
    }

    @Test
    void systemExpenseItemsAreProtected() throws Exception {
        Cookie accountant = loginAs("ACCOUNTANT", null);
        long system = jdbc.sql("SELECT id FROM expense_item WHERE system AND name = 'Ijara'").query(Long.class).single();
        mvc.perform(json(put("/api/expense-items/" + system), accountant, "{\"name\":\"Ijara haqi\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("expenseItem.system"));
        String name = "Reklama " + UUID.randomUUID().toString().substring(0, 4);
        long id = id(mvc.perform(json(post("/api/expense-items"), accountant, "{\"direction\":\"EXPENSE\",\"name\":\"" + name + "\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.system").value(false))
                .andReturn());
        mvc.perform(post("/api/expense-items/" + id + "/deactivate").with(csrf()).cookie(accountant))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
        mvc.perform(get("/api/expense-items").cookie(accountant))
                .andExpect(jsonPath("$[?(@.direction == 'INCOME')]", hasSize(greaterThanOrEqualTo(3))));
    }
}
