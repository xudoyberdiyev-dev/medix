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
                .andExpect(jsonPath("$.permissions", hasSize(132)))
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
}
