package uz.medix.identity.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.time.ZoneId;
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
import uz.medix.shared.settings.SettingKey;
import uz.medix.shared.settings.SystemSettings;

/** Sozlamalar: ko'rish, saqlash (oraliq, doira, audit), QQS tarixi (kelajak, takror), chop etish imzochilari. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class SettingsIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    SystemSettings settings;

    private Cookie loginAs(String role) throws Exception {
        String login = "set" + UUID.randomUUID().toString().substring(0, 6);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, must_change_password)
                SELECT :login, 'Sozlama Sinov', id, :hash, false FROM role WHERE code = :role""")
                .param("login", login)
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

    private void putSettings(Cookie c, String json, int expected) throws Exception {
        mvc.perform(put("/api/settings").with(csrf()).cookie(c).contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().is(expected));
    }

    @Test
    void viewAndSaveWithScopeAndAudit() throws Exception {
        Cookie director = loginAs("DIRECTOR");
        mvc.perform(get("/api/settings").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.values.length()").value(SettingKey.values().length))
                .andExpect(jsonPath("$.values[0].key").value("expiryWarnDays"))
                .andExpect(jsonPath("$.values[0].section").value("wh"))
                .andExpect(jsonPath("$.values[0].min").value(1))
                .andExpect(jsonPath("$.canDirector").value(true))
                .andExpect(jsonPath("$.canSecurity").value(true))
                .andExpect(jsonPath("$.docs[0].prefix").value("BY"))
                .andExpect(jsonPath("$.print.nakVariant").value("price"));

        putSettings(director, "{\"changes\":{\"expiryWarnDays\":\"0\"}}", 400);
        putSettings(director, "{\"changes\":{\"cashBranchApprove\":\"0\"}}", 400);
        putSettings(director, "{\"changes\":{\"nope\":\"5\"}}", 400);

        try {
            mvc.perform(put("/api/settings").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"changes\":{\"expiryWarnDays\":\"60\",\"ivDirApprove\":\"7.500.000,00\"}}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.values[0].value").value("60"))
                    .andExpect(jsonPath("$.values[0].updatedBy").value("Sozlama Sinov"));
            assertThat(settings.intValue(SettingKey.expiryWarnDays)).isEqualTo(60);
            assertThat(settings.money(SettingKey.ivDirApprove)).isEqualByComparingTo("7500000.00");
            assertThat(jdbc.sql("SELECT count(*) FROM audit_log WHERE action = 'settings.change' AND entity_id IN ('expiryWarnDays', 'ivDirApprove')")
                    .query(Long.class).single()).isGreaterThanOrEqualTo(2L);

            Cookie admin = loginAs("ADMIN");
            mvc.perform(get("/api/settings").cookie(admin))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.canDirector").value(false))
                    .andExpect(jsonPath("$.canSecurity").value(true));
            mvc.perform(put("/api/settings").with(csrf()).cookie(admin).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"changes\":{\"expiryWarnDays\":\"45\"}}"))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("settings.directorOnly"));
            putSettings(admin, "{\"changes\":{\"sessionMin\":\"45\"}}", 200);
            assertThat(settings.intValue(SettingKey.sessionMin)).isEqualTo(45);

            Cookie operator = loginAs("OPERATOR");
            mvc.perform(get("/api/settings").cookie(operator)).andExpect(status().isForbidden());
        } finally {
            jdbc.sql("UPDATE system_setting SET value = '90' WHERE key = 'expiryWarnDays'").update();
            jdbc.sql("UPDATE system_setting SET value = '5000000.00' WHERE key = 'ivDirApprove'").update();
            jdbc.sql("UPDATE system_setting SET value = '30' WHERE key = 'sessionMin'").update();
        }
    }

    @Test
    void vatHistoryFutureOnly() throws Exception {
        Cookie director = loginAs("DIRECTOR");
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Tashkent"));
        mvc.perform(post("/api/settings/vat").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rate\":15,\"validFrom\":\"" + today + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("settings.vatFuture"));
        String from = today.plusYears(5).withDayOfYear(1).toString();
        mvc.perform(post("/api/settings/vat").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rate\":15,\"validFrom\":\"" + from + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.vat.current").value("12"))
                .andExpect(jsonPath("$.vat.history[0].rate").value("15"))
                .andExpect(jsonPath("$.vat.history[0].status").value("FUTURE"))
                .andExpect(jsonPath("$.vat.history[1].status").value("ACTIVE"));
        mvc.perform(post("/api/settings/vat").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rate\":16,\"validFrom\":\"" + from + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("settings.vatDuplicate"));
        Cookie admin = loginAs("ADMIN");
        mvc.perform(post("/api/settings/vat").with(csrf()).cookie(admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rate\":16,\"validFrom\":\"" + today.plusYears(6) + "\"}"))
                .andExpect(status().isForbidden());
        jdbc.sql("DELETE FROM vat_rate WHERE valid_from > :d").param("d", java.sql.Date.valueOf(today)).update();
    }

    @Test
    void printSigners() throws Exception {
        Cookie director = loginAs("DIRECTOR");
        long branch = jdbc.sql("SELECT id FROM branch WHERE active ORDER BY code LIMIT 1").query(Long.class).single();
        long head = jdbc.sql("SELECT id FROM employee WHERE full_name = 'Sozlama Sinov' ORDER BY id DESC LIMIT 1").query(Long.class).single();
        long operator = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, must_change_password)
                SELECT :l, 'Operator Imzo', id, 'x', false FROM role WHERE code = 'OPERATOR' RETURNING id""")
                .param("l", "imz" + UUID.randomUUID().toString().substring(0, 6)).query(Long.class).single();
        mvc.perform(put("/api/settings/print").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"signers\":[{\"branchId\":" + branch + ",\"headEmployeeId\":" + operator + "}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("settings.signerInvalid"));
        mvc.perform(put("/api/settings/print").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nakVariant\":\"noprice\",\"reprint\":false,\"signers\":[{\"branchId\":" + branch + ",\"headEmployeeId\":" + head + "}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.print.nakVariant").value("noprice"))
                .andExpect(jsonPath("$.print.reprint").value(false))
                .andExpect(jsonPath("$.print.signers[0].headEmployeeId").value(head));
        mvc.perform(put("/api/settings/print").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nakVariant\":\"x\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/settings/print").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nakVariant\":\"price\",\"reprint\":true,\"signers\":[{\"branchId\":" + branch + "}]}"))
                .andExpect(status().isOk());
    }
}
