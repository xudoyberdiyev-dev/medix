package uz.medix.identity.role;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
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
import uz.medix.TestcontainersConfig;

/** Rollar va ruxsatlar matritsasi: ko'rish, rol nusxasi, ruxsatlarni o'zgartirish, Direktor himoyasi, kirishda kuchga kirishi. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class RoleMatrixIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private String employee(String roleCode) {
        String login = "rol" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, must_change_password)
                SELECT :login, 'Sinov', id, :hash, false FROM role WHERE code = :role""")
                .param("login", login)
                .param("hash", encoder.encode(PASSWORD))
                .param("role", roleCode)
                .update();
        return login;
    }

    private Cookie login(String login) throws Exception {
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

    @Test
    void copyEditAndEffect() throws Exception {
        Cookie admin = login(employee("ADMIN"));
        mvc.perform(get("/api/roles/matrix").cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.permissions", hasSize(133)))
                .andExpect(jsonPath("$.grants.DRIVER", hasSize(1)));

        String name = "Katta operator " + UUID.randomUUID().toString().substring(0, 4);
        MvcResult copy = mvc.perform(post("/api/roles/OPERATOR/copy").with(csrf()).cookie(admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.system").value(false))
                .andReturn();
        String code = copy.getResponse().getContentAsString().replaceAll(".*\"code\":\"([A-Z0-9_]+)\".*", "$1");
        mvc.perform(post("/api/roles/OPERATOR/copy").with(csrf()).cookie(admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isConflict());

        // Nusxaga narx o'rnatish ruxsati qo'shiladi
        mvc.perform(put("/api/roles/" + code + "/permissions").with(csrf()).cookie(admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"permissions\":[\"orders.create\",\"prices.view\",\"prices.create\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.grants." + code, hasSize(3)));
        Cookie custom = login(employee(code));
        mvc.perform(get("/api/auth/me").cookie(custom))
                .andExpect(jsonPath("$.permissions", hasItem("prices.create")))
                .andExpect(jsonPath("$.permissions", not(hasItem("clients.create"))));

        mvc.perform(put("/api/roles/" + code + "/permissions").with(csrf()).cookie(admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"permissions\":[\"nope.key\"]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("role.unknownPermission"));
        mvc.perform(put("/api/roles/DIRECTOR/permissions").with(csrf()).cookie(admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"permissions\":[]}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("role.directorProtected"));
        mvc.perform(put("/api/roles/ADMIN/permissions").with(csrf()).cookie(admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"permissions\":[\"staff.view\"]}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("role.adminNeedsRoles"));

        Cookie manager = login(employee("BRANCH_MANAGER"));
        mvc.perform(get("/api/roles/matrix").cookie(manager)).andExpect(status().isForbidden());
    }

    private String draft(String code, String name, String scope, String home, boolean active, String perms) {
        return "{\"roles\":[{\"code\":" + (code == null ? "null" : "\"" + code + "\"") + ",\"name\":\"" + name
                + "\",\"description\":\"Sinov\",\"scope\":\"" + scope + "\",\"home\":\"" + home + "\",\"active\":" + active
                + ",\"permissions\":[" + perms + "],\"copiedFrom\":\"OPERATOR\"}]}";
    }

    @Test
    void matrixSaveCreatesRoleWithScopeHomeAndDependencies() throws Exception {
        Cookie admin = login(employee("ADMIN"));
        mvc.perform(get("/api/roles/matrix").cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.permissions[?(@.key == 'orders.create')].group", hasItem("sales")))
                .andExpect(jsonPath("$.permissions[?(@.key == 'orders.create')].page", hasItem("orders")))
                .andExpect(jsonPath("$.permissions[?(@.key == 'approvals.director')].lock", hasItem("dir")))
                .andExpect(jsonPath("$.roles[?(@.code == 'DIRECTOR')].scope", hasItem("all")))
                .andExpect(jsonPath("$.roles[?(@.code == 'WAREHOUSE_MANAGER')].home", hasItem("keeper")))
                .andExpect(jsonPath("$.defaults.DRIVER", hasSize(1)));

        String name = "Narxchi " + UUID.randomUUID().toString().substring(0, 4);
        // Rol doirasi «Barcha filiallar» — faqat Direktor (E14): Bosh administrator yaratolmaydi
        mvc.perform(put("/api/roles/matrix").with(csrf()).cookie(admin).contentType(MediaType.APPLICATION_JSON)
                        .content(draft(null, name, "all", "purchase", true, "\"prices.create\"")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("role.scopeDirectorOnly"));
        Cookie director = login(employee("DIRECTOR"));
        mvc.perform(put("/api/roles/matrix").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content(draft(null, name, "all", "purchase", true, "\"prices.create\"")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles[?(@.name == '" + name + "')].scope", hasItem("all")))
                .andExpect(jsonPath("$.lastChange.at").exists());
        String code = jdbc.sql("SELECT code FROM role WHERE name = :n").param("n", name).query(String.class).single();
        // Amal yoqilsa — sahifani ko'rish ham avtomatik
        mvc.perform(get("/api/roles/matrix").cookie(admin))
                .andExpect(jsonPath("$.grants." + code, hasSize(2)))
                .andExpect(jsonPath("$.grants." + code, hasItem("prices.view")));

        Cookie custom = login(employee(code));
        mvc.perform(get("/api/auth/me").cookie(custom))
                .andExpect(jsonPath("$.role.home").value("purchase"))
                .andExpect(jsonPath("$.allBranches").value(true));

        mvc.perform(put("/api/roles/matrix").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content(draft(code, name, "own", "purchase", true, "\"approvals.director\"")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("role.directorOnly"));
        mvc.perform(put("/api/roles/matrix").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content(draft(code, name, "own", "purchase", false, "")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("role.hasEmployees"));
        mvc.perform(put("/api/roles/matrix").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content(draft(null, "Operator", "own", "operator", true, "")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("role.nameTaken"));
        mvc.perform(put("/api/roles/matrix").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content(draft(code, name, "own", "nowhere", true, "")))
                .andExpect(status().isBadRequest());

        // Avvaldan bor standart to'plam o'zgarmaydi (Haydovchi — Jo'natish sahifasisiz)
        mvc.perform(put("/api/roles/matrix").with(csrf()).cookie(admin).contentType(MediaType.APPLICATION_JSON)
                        .content(draft("DRIVER", "Haydovchi", "own", "driver", true, "\"trip.driver\"")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.grants.DRIVER", hasSize(1)));

        // Doira «o'z filiali» ga qaytsa — keyingi kirishda barcha filiallar yo'q; Bosh administrator oʻzgartirolmaydi
        mvc.perform(put("/api/roles/matrix").with(csrf()).cookie(admin).contentType(MediaType.APPLICATION_JSON)
                        .content(draft(code, name, "own", "operator", true, "\"orders.view\"")))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/roles/matrix").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content(draft(code, name, "own", "operator", true, "\"orders.view\"")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").cookie(login(employee(code))))
                .andExpect(jsonPath("$.role.home").value("operator"))
                .andExpect(jsonPath("$.allBranches").value(false));
    }
}
