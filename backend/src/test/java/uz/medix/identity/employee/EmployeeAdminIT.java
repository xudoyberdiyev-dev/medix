package uz.medix.identity.employee;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
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
import org.springframework.transaction.annotation.Transactional;
import uz.medix.TestcontainersConfig;

/** Xodimni bloklash (sessiyasi tugaydi), blokdan chiqarish, vaqtinchalik parol, audit jurnali. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
@Transactional
class EmployeeAdminIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private long employee(String login, String role) {
        return jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, must_change_password)
                SELECT :login, 'Sinov ' || :login, id, :hash, false FROM role WHERE code = :role RETURNING id""")
                .param("login", login)
                .param("hash", encoder.encode(PASSWORD))
                .param("role", role)
                .query(Long.class)
                .single();
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

    private static String uniq(String prefix) {
        return prefix + UUID.randomUUID().toString().substring(0, 6);
    }

    @Test
    void blockEndsSessionsAndIsAudited() throws Exception {
        String adminLogin = uniq("adm");
        long adminId = employee(adminLogin, "ADMIN");
        String opLogin = uniq("op");
        long opId = employee(opLogin, "OPERATOR");
        Cookie admin = login(adminLogin);
        Cookie operator = login(opLogin);

        mvc.perform(get("/api/employees").cookie(admin)).andExpect(status().isOk());

        mvc.perform(post("/api/employees/" + opId + "/block")
                        .with(csrf())
                        .cookie(admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Ishdan ketdi\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("BLOCKED"));

        mvc.perform(get("/api/auth/me").cookie(operator)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"login\":\"" + opLogin + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("auth.blocked"));

        mvc.perform(post("/api/employees/" + adminId + "/block")
                        .with(csrf())
                        .cookie(admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"x\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("employee.cannotBlockSelf"));

        mvc.perform(post("/api/employees/" + opId + "/unblock").with(csrf()).cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        mvc.perform(post("/api/employees/" + opId + "/reset-password")
                        .with(csrf())
                        .cookie(admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"temporaryPassword\":\"Vaqtincha-777\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(true));

        mvc.perform(get("/api/audit").param("entityType", "employee").param("size", "100").cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total", greaterThanOrEqualTo(3)))
                .andExpect(jsonPath("$.items[?(@.action == 'employee.block' && @.reason == 'Ishdan ketdi')]").exists());
    }

    @Test
    void operatorCannotManageEmployees() throws Exception {
        String opLogin = uniq("op");
        employee(opLogin, "OPERATOR");
        Cookie operator = login(opLogin);
        mvc.perform(get("/api/employees").cookie(operator)).andExpect(status().isForbidden());
        mvc.perform(get("/api/audit").cookie(operator)).andExpect(status().isForbidden());
    }
}
