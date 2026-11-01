package uz.medix.identity.auth;

import static org.assertj.core.api.Assertions.assertThat;
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

/** Kirish, sessiya (Spring Session JDBC), CSRF, bloklangan xodim, birinchi kirishda parol almashtirish. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class AuthIT {

    private static final String PASSWORD = "Boshlangich-123";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private String newEmployee(String status, boolean mustChange) {
        String login = "u" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, status, must_change_password)
                SELECT :login, 'Sinov Xodim', id, :hash, :status, :must FROM role WHERE code = 'OPERATOR'""")
                .param("login", login)
                .param("hash", encoder.encode(PASSWORD))
                .param("status", status)
                .param("must", mustChange)
                .update();
        return login;
    }

    private static String json(String login, String password) {
        return "{\"login\":\"" + login + "\",\"password\":\"" + password + "\"}";
    }

    /** Spring Session cookie'ni Set-Cookie sarlavhasi orqali yozadi. */
    private static Cookie sessionCookie(MvcResult result) {
        for (String header : result.getResponse().getHeaders("Set-Cookie")) {
            if (header.startsWith("MEDIX_SESSION=")) {
                String value = header.substring("MEDIX_SESSION=".length(), header.indexOf(';'));
                return new Cookie("MEDIX_SESSION", value);
            }
        }
        throw new AssertionError("MEDIX_SESSION cookie yo'q");
    }

    private Cookie login(String login) throws Exception {
        MvcResult result = mvc.perform(post("/api/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(login, PASSWORD)))
                .andExpect(status().isOk())
                .andReturn();
        return sessionCookie(result);
    }

    @Test
    void loginCreatesSessionAndMeWorks() throws Exception {
        String login = newEmployee("ACTIVE", false);
        MvcResult result = mvc.perform(post("/api/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(login.toUpperCase(), PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.login").value(login))
                .andExpect(jsonPath("$.role.code").value("OPERATOR"))
                .andExpect(jsonPath("$.mustChangePassword").value(false))
                .andReturn();

        String setCookie = String.join("\n", result.getResponse().getHeaders("Set-Cookie"));
        assertThat(setCookie).contains("MEDIX_SESSION=").contains("HttpOnly").containsIgnoringCase("SameSite=Lax");

        mvc.perform(get("/api/auth/me").cookie(sessionCookie(result)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Sinov Xodim"));

        Integer sessions = jdbc.sql("SELECT count(*) FROM spring_session")
                .query(Integer.class)
                .single();
        assertThat(sessions).isPositive();

        Long lastLogin = jdbc.sql("SELECT count(*) FROM employee WHERE login = :l AND last_login_at IS NOT NULL")
                .param("l", login)
                .query(Long.class)
                .single();
        assertThat(lastLogin).isEqualTo(1L);
    }

    @Test
    void unauthenticatedRequestGets401Problem() throws Exception {
        mvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("auth.unauthorized"))
                .andExpect(jsonPath("$.detail").isNotEmpty());
    }

    @Test
    void wrongPasswordIsCountedAndRejected() throws Exception {
        String login = newEmployee("ACTIVE", false);
        mvc.perform(post("/api/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(login, "noto'g'ri-parol")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("auth.badCredentials"));
        Integer failed = jdbc.sql("SELECT failed_login_count FROM employee WHERE login = :l")
                .param("l", login)
                .query(Integer.class)
                .single();
        assertThat(failed).isEqualTo(1);

        mvc.perform(post("/api/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("mavjud-emas", PASSWORD)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("auth.badCredentials"));
    }

    @Test
    void blockedEmployeeCannotLogin() throws Exception {
        String login = newEmployee("BLOCKED", false);
        mvc.perform(post("/api/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(login, PASSWORD)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("auth.blocked"));
    }

    @Test
    void loginWithoutCsrfIsRejected() throws Exception {
        String login = newEmployee("ACTIVE", false);
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(json(login, PASSWORD)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("auth.csrf"));
    }

    @Test
    void csrfEndpointIssuesCookie() throws Exception {
        // MockMvc'da spring-security-test CSRF repozitoriysini o'zining test repozitoriysi bilan o'raydi,
        // shuning uchun bu yerda faqat token berilishi tekshiriladi (cookie nomi — e2e testda).
        mvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.headerName").isNotEmpty())
                .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void validationErrorsAreFieldMapped() throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json("", "")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation.failed"))
                .andExpect(jsonPath("$.errors.login").isNotEmpty())
                .andExpect(jsonPath("$.errors.password").isNotEmpty());
    }

    @Test
    void firstLoginRequiresPasswordChange() throws Exception {
        String login = newEmployee("ACTIVE", true);
        Cookie session = login(login);

        // Parol almashtirilmaguncha boshqa API yopiq.
        mvc.perform(get("/api/boshqa").cookie(session))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("auth.passwordChangeRequired"));

        mvc.perform(post("/api/auth/password")
                        .with(csrf())
                        .cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"xato\",\"newPassword\":\"Yangi-parol-2026\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("auth.currentPasswordWrong"));

        mvc.perform(post("/api/auth/password")
                        .with(csrf())
                        .cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"qisqa\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.newPassword").isNotEmpty());

        mvc.perform(post("/api/auth/password")
                        .with(csrf())
                        .cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"Yangi-parol-2026\"}"))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/auth/me").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(false));

        // Endi boshqa API ochiq (mavjud bo'lmagan yo'l — 404, 403 emas).
        mvc.perform(get("/api/boshqa").cookie(session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("error.notFound"));
    }

    @Test
    void logoutEndsSession() throws Exception {
        String login = newEmployee("ACTIVE", false);
        Cookie session = login(login);
        mvc.perform(post("/api/auth/logout").with(csrf()).cookie(session)).andExpect(status().isNoContent());
        mvc.perform(get("/api/auth/me").cookie(session)).andExpect(status().isUnauthorized());
    }
}
