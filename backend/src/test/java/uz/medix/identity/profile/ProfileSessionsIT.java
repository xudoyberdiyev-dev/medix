package uz.medix.identity.profile;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

/** Profil (prototip Profile): faol sessiyalarim (qurilma, joriysi), boshqalarini tugatish, mening harakatlarim. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ProfileSessionsIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private String employee() {
        String login = "sess" + UUID.randomUUID().toString().substring(0, 6);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, must_change_password)
                SELECT :login, 'Sessiya Sinov', id, :hash, false FROM role WHERE code = 'OPERATOR'""")
                .param("login", login)
                .param("hash", encoder.encode(PASSWORD))
                .update();
        return login;
    }

    private Cookie login(String login, String userAgent) throws Exception {
        MvcResult r = mvc.perform(post("/api/auth/login")
                        .with(csrf())
                        .header("User-Agent", userAgent)
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
    void sessionsEndOthersAndActions() throws Exception {
        String login = employee();
        Cookie laptop = login(login, "Chrome 130 · Windows");
        Cookie phone = login(login, "Safari · iPhone");
        mvc.perform(get("/api/profile/sessions").cookie(laptop))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].current").value(true))
                .andExpect(jsonPath("$[0].device").value("Chrome 130 · Windows"))
                .andExpect(jsonPath("$[0].ip").isNotEmpty())
                .andExpect(jsonPath("$[1].current").value(false))
                .andExpect(jsonPath("$[1].device").value("Safari · iPhone"))
                .andExpect(jsonPath("$[0].id").doesNotExist());
        mvc.perform(post("/api/profile/sessions/end-others").with(csrf()).cookie(laptop))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ended").value(1));
        mvc.perform(get("/api/auth/me").cookie(phone)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/profile/sessions").cookie(laptop))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].current").value(true));
        mvc.perform(get("/api/audit/mine").cookie(laptop))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].action").value("employee.endSessions"));
        mvc.perform(get("/api/profile/sessions")).andExpect(status().isUnauthorized());
    }
}
