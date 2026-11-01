package uz.medix.identity.setup;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
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
import org.springframework.transaction.annotation.Transactional;
import uz.medix.TestcontainersConfig;

/** Sozlash ustasi: kompaniya → filial → ombor (zonalar) → xodim → yakun; faqat CEO; yakundan keyin yopiq. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
@Transactional
class SetupIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private Cookie loginAs(String roleCode) throws Exception {
        String login = "s" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, must_change_password)
                SELECT :login, 'Sinov', id, :hash, false FROM role WHERE code = :role""")
                .param("login", login)
                .param("hash", encoder.encode(PASSWORD))
                .param("role", roleCode)
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

    @Test
    void fullWizardFlow() throws Exception {
        Cookie ceo = loginAs("DIRECTOR");

        mvc.perform(get("/api/setup").cookie(ceo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.completed").value(false))
                .andExpect(jsonPath("$.blockers").isNotEmpty());

        mvc.perform(post("/api/setup/complete").with(csrf()).cookie(ceo))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("setup.incomplete"));

        mvc.perform(json(put("/api/setup/company"), ceo, "{\"name\":\"Medix Group\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Medix Group"));

        mvc.perform(json(post("/api/setup/branches"), ceo,
                        "{\"code\":\"TS\",\"name\":\"Toshkent\",\"legalName\":\"Medix TSH MChJ\",\"tin\":\"12345\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.code").isNotEmpty())
                .andExpect(jsonPath("$.errors.tin").isNotEmpty());

        MvcResult branch = mvc.perform(json(post("/api/setup/branches"), ceo,
                        "{\"code\":\"tsh\",\"name\":\"Toshkent\",\"legalName\":\"Medix TSH MChJ\",\"tin\":\"301234567\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("TSH"))
                .andReturn();
        String branchId = branch.getResponse().getContentAsString().replaceAll(".*\"id\":(\\d+).*", "$1");

        mvc.perform(json(post("/api/setup/branches"), ceo,
                        "{\"code\":\"TSH\",\"name\":\"Ikkinchi\",\"legalName\":\"X\",\"tin\":\"309999999\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("branch.duplicate"));

        mvc.perform(get("/api/setup").cookie(ceo))
                .andExpect(jsonPath("$.blockers[0]").value(containsString("Toshkent")));

        mvc.perform(json(post("/api/setup/warehouses"), ceo,
                        "{\"branchId\":" + branchId + ",\"name\":\"Markaziy ombor\",\"extraZones\":[\"COLD\"]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.zones", hasSize(5)))
                .andExpect(jsonPath("$.zones[?(@.type == 'QUARANTINE')].sellable").value(false))
                .andExpect(jsonPath("$.zones[?(@.type == 'COLD')].sellable").value(true));

        mvc.perform(json(post("/api/setup/warehouses"), ceo,
                        "{\"branchId\":" + branchId + ",\"name\":\"Boshqa\",\"extraZones\":[\"MAIN\"]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("warehouse.extraZones"));

        mvc.perform(json(post("/api/setup/employees"), ceo,
                        "{\"login\":\"Operator.1\",\"fullName\":\"Dilshod Aliyev\",\"roleCode\":\"OPERATOR\",\"branchId\":"
                                + branchId + ",\"temporaryPassword\":\"Vaqtincha-123\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.login").value("operator.1"))
                .andExpect(jsonPath("$.mustChangePassword").value(true));

        mvc.perform(json(post("/api/setup/employees"), ceo,
                        "{\"login\":\"operator.1\",\"fullName\":\"X\",\"roleCode\":\"OPERATOR\",\"temporaryPassword\":\"Vaqtincha-123\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("employee.loginTaken"));

        mvc.perform(post("/api/setup/complete").with(csrf()).cookie(ceo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.completed").value(true));

        mvc.perform(json(put("/api/setup/company"), ceo, "{\"name\":\"Boshqa nom\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("setup.completed"));
    }

    @Test
    void onlyDirectorCanUseWizard() throws Exception {
        Cookie operator = loginAs("OPERATOR");
        mvc.perform(get("/api/setup").cookie(operator))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("auth.forbidden"));
    }
}
