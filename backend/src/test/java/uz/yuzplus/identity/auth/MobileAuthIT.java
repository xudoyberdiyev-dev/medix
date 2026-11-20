package uz.yuzplus.identity.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
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
import uz.yuzplus.TestcontainersConfig;

/** M2: haydovchi mobil ilovasi qurilma tokeni — faqat DRIVER, sessiyasiz, CSRF'siz, bekor qilish va eskirish. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class MobileAuthIT {

    private static final String PASSWORD = "Boshlangich-123";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private String newEmployee(String role, boolean mustChange) {
        String login = "m" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, status, must_change_password)
                SELECT :login, 'Sinov Haydovchi', id, :hash, 'ACTIVE', :must FROM role WHERE code = :role""")
                .param("login", login)
                .param("hash", encoder.encode(PASSWORD))
                .param("must", mustChange)
                .param("role", role)
                .update();
        return login;
    }

    private static String body(String login, String password) {
        return "{\"login\":\"" + login + "\",\"password\":\"" + password + "\",\"device\":\"Sinov telefon\"}";
    }

    private String token(String login) throws Exception {
        String json = mvc.perform(post("/api/mobile/auth/login").contentType(MediaType.APPLICATION_JSON).content(body(login, PASSWORD)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return JsonPath.read(json, "$.token");
    }

    private long tokens(String login) {
        return jdbc.sql("SELECT count(*) FROM mobile_device_token t JOIN employee e ON e.id = t.employee_id WHERE e.login = :l")
                .param("l", login)
                .query(Long.class)
                .single();
    }

    @Test
    void driverGetsTokenWithoutSessionOrCsrf() throws Exception {
        String login = newEmployee("DRIVER", false);
        var result = mvc.perform(post("/api/mobile/auth/login").contentType(MediaType.APPLICATION_JSON).content(body(login, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.me.login").value(login))
                .andExpect(jsonPath("$.me.role.code").value("DRIVER"))
                .andReturn();
        assertThat(result.getResponse().getHeaders("Set-Cookie")).noneMatch(h -> h.startsWith("YUZPLUS_SESSION=") && !h.startsWith("YUZPLUS_SESSION=;"));
        String token = JsonPath.read(result.getResponse().getContentAsString(), "$.token");
        assertThat(token).hasSizeGreaterThanOrEqualTo(40);

        // Bazada token emas — faqat xesh
        String hash = jdbc.sql("SELECT t.token_hash FROM mobile_device_token t JOIN employee e ON e.id = t.employee_id WHERE e.login = :l")
                .param("l", login).query(String.class).single();
        assertThat(hash).hasSize(64).isNotEqualTo(token);
        assertThat(jdbc.sql("SELECT count(*) FROM audit_log WHERE action = 'mobile.tokenIssued' AND employee_id = (SELECT id FROM employee WHERE login = :l)")
                .param("l", login).query(Long.class).single()).isEqualTo(1);

        var me = mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.login").value(login))
                .andReturn();
        assertThat(me.getResponse().getHeaders("Set-Cookie")).noneMatch(h -> h.startsWith("YUZPLUS_SESSION=") && !h.startsWith("YUZPLUS_SESSION=;"));
    }

    @Test
    void nonDriverIsRefused() throws Exception {
        String login = newEmployee("OPERATOR", false);
        mvc.perform(post("/api/mobile/auth/login").contentType(MediaType.APPLICATION_JSON).content(body(login, PASSWORD)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("mobile.driverOnly"));
        assertThat(tokens(login)).isZero();
    }

    @Test
    void wrongPasswordAndTemporaryPasswordGiveNoToken() throws Exception {
        String login = newEmployee("DRIVER", false);
        mvc.perform(post("/api/mobile/auth/login").contentType(MediaType.APPLICATION_JSON).content(body(login, "Notogri-parol-1")))
                .andExpect(status().is4xxClientError());
        String temp = newEmployee("DRIVER", true);
        mvc.perform(post("/api/mobile/auth/login").contentType(MediaType.APPLICATION_JSON).content(body(temp, PASSWORD)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("mobile.passwordChangeRequired"));
        assertThat(tokens(login) + tokens(temp)).isZero();
    }

    @Test
    void invalidTokenIsUnauthorized() throws Exception {
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer yoq-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("mobile.tokenInvalid"));
    }

    @Test
    void logoutRevokesOnlyThisDevice() throws Exception {
        String login = newEmployee("DRIVER", false);
        String phone1 = token(login);
        String phone2 = token(login);
        mvc.perform(post("/api/mobile/auth/logout").header("Authorization", "Bearer " + phone1)).andExpect(status().isNoContent());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + phone1)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + phone2)).andExpect(status().isOk());
    }

    @Test
    void blockedRoleChangedOrIdleTokenStopsWorking() throws Exception {
        String blocked = newEmployee("DRIVER", false);
        String t1 = token(blocked);
        jdbc.sql("UPDATE employee SET status = 'BLOCKED' WHERE login = :l").param("l", blocked).update();
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + t1)).andExpect(status().isUnauthorized());

        String moved = newEmployee("DRIVER", false);
        String t2 = token(moved);
        jdbc.sql("UPDATE employee SET role_id = (SELECT id FROM role WHERE code = 'OPERATOR') WHERE login = :l").param("l", moved).update();
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + t2)).andExpect(status().isUnauthorized());

        String idle = newEmployee("DRIVER", false);
        String t3 = token(idle);
        jdbc.sql("""
                UPDATE mobile_device_token SET last_used_at = now() - interval '31 days'
                WHERE employee_id = (SELECT id FROM employee WHERE login = :l)""").param("l", idle).update();
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + t3)).andExpect(status().isUnauthorized());
    }
}
