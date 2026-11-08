package uz.medix.identity.setup;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.TestcontainersConfig;

/** Sozlash ustasi: kompaniya → filial → ombor (zonalar) → xodim → yakun; faqat CEO; yakundan keyin yopiq. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
@Transactional
@Order(1)
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

        MvcResult wh = mvc.perform(json(post("/api/setup/warehouses"), ceo,
                        "{\"branchId\":" + branchId + ",\"name\":\"Markaziy ombor\",\"extraZones\":[\"COLD\"]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("NORMAL"))
                .andExpect(jsonPath("$.zones", hasSize(5)))
                .andExpect(jsonPath("$.zones[?(@.type == 'QUARANTINE')].sellable").value(false))
                .andExpect(jsonPath("$.zones[?(@.type == 'COLD')].sellable").value(true))
                .andReturn();

        mvc.perform(json(post("/api/setup/warehouses"), ceo,
                        "{\"branchId\":" + branchId + ",\"name\":\"Boshqa\",\"extraZones\":[\"MAIN\"]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("warehouse.extraZones"));

        // Ombor kartasi (prototip WarehousePanel): tur, zona nomlari, ixtiyoriy zonalar almashadi, masʼul tekshiriladi
        String whId = wh.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1");
        String card = "{\"branchId\":" + branchId + ",\"name\":\"Markaziy ombor\",\"kind\":\"COLD\",\"extraZones\":[\"SAFE\"],"
                + "\"zoneNames\":{\"MAIN\":\"Qabul\",\"RECEIVING\":\"Asosiy saqlash\"}}";
        mvc.perform(json(put("/api/setup/warehouses/" + whId), ceo, card))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("COLD"))
                .andExpect(jsonPath("$.zones", hasSize(5)))
                .andExpect(jsonPath("$.zones[?(@.type == 'COLD')]").isEmpty())
                .andExpect(jsonPath("$.zones[?(@.type == 'SAFE')].sellable").value(true))
                .andExpect(jsonPath("$.zones[?(@.type == 'MAIN')].name").value("Qabul"))
                .andExpect(jsonPath("$.zones[?(@.type == 'RECEIVING')].name").value("Asosiy saqlash"));
        mvc.perform(json(put("/api/setup/warehouses/" + whId), ceo,
                        "{\"branchId\":" + branchId + ",\"name\":\"Markaziy ombor\",\"zoneNames\":{\"MAIN\":\"Karantin\"}}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("warehouse.zoneDuplicateName"));
        mvc.perform(json(put("/api/setup/warehouses/" + whId), ceo,
                        "{\"branchId\":" + branchId + ",\"name\":\"Markaziy ombor\",\"keeperId\":999999}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("warehouse.keeperInvalid"));
        MvcResult spare = mvc.perform(json(post("/api/setup/warehouses"), ceo,
                        "{\"branchId\":" + branchId + ",\"name\":\"Zaxira ombor\",\"zoneNames\":{\"MAIN\":\"Javonlar\"}}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.zones[?(@.type == 'MAIN')].name").value("Javonlar"))
                .andReturn();
        String spareId = spare.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1");
        mvc.perform(delete("/api/setup/warehouses/" + spareId).with(csrf()).cookie(ceo))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/setup").cookie(ceo))
                .andExpect(jsonPath("$.warehouses", hasSize(1)));

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

    private MockMultipartHttpServletRequestBuilder logo(Cookie session, byte[] bytes) {
        return multipart(HttpMethod.PUT, "/api/setup/company/logo")
                .file(new MockMultipartFile("file", "logo", "application/octet-stream", bytes))
                .with(csrf())
                .cookie(session);
    }

    @Test
    void companyLocaleAndLogo() throws Exception {
        Cookie ceo = loginAs("DIRECTOR");
        mvc.perform(json(put("/api/setup/company"), ceo, "{\"name\":\"Medix Group\",\"defaultLocale\":\"ru\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.defaultLocale").value("ru"))
                .andExpect(jsonPath("$.logoVersion").doesNotExist());
        // Til berilmasa — oʻzgarmaydi
        mvc.perform(json(put("/api/setup/company"), ceo, "{\"name\":\"Medix Group\"}"))
                .andExpect(jsonPath("$.defaultLocale").value("ru"));
        mvc.perform(json(put("/api/setup/company"), ceo, "{\"name\":\"Medix Group\",\"defaultLocale\":\"de\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.defaultLocale").value("Tilni roʻyxatdan tanlang."));

        byte[] png = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0, 0, 0, 13};
        mvc.perform(logo(ceo, png)).andExpect(status().isOk()).andExpect(jsonPath("$.logoVersion").isNumber());
        mvc.perform(get("/api/company/logo").cookie(ceo))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().bytes(png));

        // Skriptli SVG, boshqa tur va 2 MB dan katta — rad etiladi
        mvc.perform(logo(ceo, "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".getBytes()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("setup.logoType"));
        mvc.perform(logo(ceo, "GIF89a".getBytes())).andExpect(jsonPath("$.code").value("setup.logoType"));
        byte[] big = new byte[2 * 1024 * 1024 + 1];
        System.arraycopy(png, 0, big, 0, png.length);
        mvc.perform(logo(ceo, big)).andExpect(jsonPath("$.code").value("setup.logoTooBig"));

        byte[] svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 8 8\"><rect width=\"8\" height=\"8\"/></svg>".getBytes();
        mvc.perform(logo(ceo, svg)).andExpect(status().isOk());
        mvc.perform(get("/api/company/logo").cookie(ceo))
                .andExpect(header().string("Content-Type", "image/svg+xml"))
                .andExpect(header().string("Content-Security-Policy", containsString("sandbox")));

        mvc.perform(delete("/api/setup/company/logo").with(csrf()).cookie(ceo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logoVersion").doesNotExist());
        mvc.perform(get("/api/company/logo").cookie(ceo)).andExpect(status().isNotFound());
    }

    @Test
    void rolesListedForDirector() throws Exception {
        Cookie ceo = loginAs("DIRECTOR");
        mvc.perform(get("/api/roles").cookie(ceo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.system == true)]", hasSize(11)))
                .andExpect(jsonPath("$[0].code").value("DIRECTOR"));
    }

    @Test
    void onlyDirectorCanUseWizard() throws Exception {
        Cookie operator = loginAs("OPERATOR");
        mvc.perform(get("/api/setup").cookie(operator))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("auth.forbidden"));
    }
}
