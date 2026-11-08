package uz.medix.identity.employee;

import static org.hamcrest.Matchers.nullValue;
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

/** Prototip AdminStaff: xodim kartasi — kirishlar, harakatlar, sessiyalarni tugatish, PIN bekor qilish. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class EmployeeCardIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private long employee(String login, String role, Long branch) {
        return jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :login, 'Sinov ' || :login, id, :b, :hash, false FROM role WHERE code = :role RETURNING id""")
                .param("login", login)
                .param("b", branch)
                .param("hash", encoder.encode(PASSWORD))
                .param("role", role)
                .query(Long.class)
                .single();
    }

    private Cookie login(String login) throws Exception {
        MvcResult r = mvc.perform(post("/api/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("User-Agent", "Chrome 130 · Windows")
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

    private static String uniq(String prefix) {
        return prefix + UUID.randomUUID().toString().substring(0, 6);
    }

    @Test
    void journalEndSessionsAndResetPin() throws Exception {
        String dir = uniq("dir");
        employee(dir, "DIRECTOR", null);
        String op = uniq("op");
        long opId = employee(op, "DIRECTOR", null);
        Cookie s = login(dir);
        login(op);
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"login\":\"" + op + "\",\"password\":\"notoʻgʻri-parol-1\"}"));
        jdbc.sql("UPDATE employee SET pin_hash = 'x', pin_set_at = now() WHERE id = :id").param("id", opId).update();

        mvc.perform(get("/api/employees/" + opId + "/journal").cookie(s))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logins[0].result").value("FAILED"))
                .andExpect(jsonPath("$.logins[1].result").value("OK"))
                .andExpect(jsonPath("$.logins[1].device").value("Chrome 130 · Windows"))
                .andExpect(jsonPath("$.sessions").value(1))
                .andExpect(jsonPath("$.pinSet").value(true));

        mvc.perform(post("/api/employees/" + opId + "/end-sessions").with(csrf()).cookie(s))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ended").value(1));
        mvc.perform(post("/api/employees/" + opId + "/reset-pin").with(csrf()).cookie(s)).andExpect(status().isOk());

        mvc.perform(get("/api/employees/" + opId + "/journal").cookie(s))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessions").value(0))
                .andExpect(jsonPath("$.pinSet").value(false))
                .andExpect(jsonPath("$.pinSetAt").value(nullValue()));
        // Direktorning oʻz harakatlari kartasida koʻrinadi
        long dirId = jdbc.sql("SELECT id FROM employee WHERE login = :l").param("l", dir).query(Long.class).single();
        mvc.perform(get("/api/employees/" + dirId + "/journal").cookie(s))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.actions[0].action").value("employee.resetPin"))
                .andExpect(jsonPath("$.actions[1].action").value("employee.endSessions"));
    }
}
