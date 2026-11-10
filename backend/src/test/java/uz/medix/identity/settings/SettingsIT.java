package uz.medix.identity.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.math.BigDecimal;
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

/** Prototip Settings: chegaralar (Direktor), xavfsizlik (Direktor + Admin), QQS tarixi, chop etish, audit. */
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
        String login = "st" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, must_change_password)
                SELECT :login, 'Sinov ' || :role, id, :hash, false FROM role WHERE code = :role""")
                .param("login", login)
                .param("hash", encoder.encode(PASSWORD))
                .param("role", role)
                .update();
        MvcResult r = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
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

    private String json(String s) {
        return s;
    }

    @Test
    void thresholdsAndSecurityWithAuditAndScope() throws Exception {
        Cookie director = loginAs("DIRECTOR");
        Cookie admin = loginAs("ADMIN");
        Cookie picker = loginAs("PICKER");
        BigDecimal expiry = settings.value(SettingKey.expiryWarnDays);
        BigDecimal pw = settings.value(SettingKey.pwMin);

        mvc.perform(get("/api/settings").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canEdit").value(true))
                .andExpect(jsonPath("$.canSecurity").value(true))
                .andExpect(jsonPath("$.values.length()").value(SettingKey.values().length))
                .andExpect(jsonPath("$.values[?(@.key == 'cashBranchApprove')].value").value("2000000.00"))
                .andExpect(jsonPath("$.vatRate").value("12"))
                .andExpect(jsonPath("$.docs.length()").isNumber());
        mvc.perform(get("/api/settings").cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canEdit").value(false))
                .andExpect(jsonPath("$.canSecurity").value(true));
        mvc.perform(get("/api/settings").cookie(picker)).andExpect(status().isForbidden());

        try {
            // Oraliqdan tashqari — 400; admin Direktor bo'limini o'zgartira olmaydi — 403
            mvc.perform(put("/api/settings").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                    .content(json("{\"values\":{\"expiryWarnDays\":\"0\"}}"))).andExpect(status().isBadRequest());
            mvc.perform(put("/api/settings").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                    .content(json("{\"values\":{\"cashBranchApprove\":\"0\"}}"))).andExpect(status().isBadRequest());
            mvc.perform(put("/api/settings").with(csrf()).cookie(admin).contentType(MediaType.APPLICATION_JSON)
                    .content(json("{\"values\":{\"expiryWarnDays\":\"60\"}}"))).andExpect(status().isForbidden());

            mvc.perform(put("/api/settings").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                            .content(json("{\"values\":{\"expiryWarnDays\":\"60\"}}")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.values[?(@.key == 'expiryWarnDays')].value").value("60"))
                    .andExpect(jsonPath("$.values[?(@.key == 'expiryWarnDays')].updatedBy").value("Sinov DIRECTOR"));
            assertThat(settings.intValue(SettingKey.expiryWarnDays)).isEqualTo(60);
            assertThat(jdbc.sql("""
                    SELECT new_value->>'value' FROM audit_log WHERE action = 'settings.update' AND entity_id = 'expiryWarnDays'
                    ORDER BY id DESC LIMIT 1""").query(String.class).single()).isEqualTo("60");

            mvc.perform(put("/api/settings").with(csrf()).cookie(admin).contentType(MediaType.APPLICATION_JSON)
                            .content(json("{\"values\":{\"pwMin\":\"10\"}}")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.values[?(@.key == 'pwMin')].value").value("10"));
        } finally {
            jdbc.sql("UPDATE app_setting SET value = :v WHERE key = 'expiryWarnDays'").param("v", expiry).update();
            jdbc.sql("UPDATE app_setting SET value = :v WHERE key = 'pwMin'").param("v", pw).update();
        }
    }

    @Test
    void vatHistoryFutureOnly() throws Exception {
        Cookie director = loginAs("DIRECTOR");
        Cookie admin = loginAs("ADMIN");
        try {
            mvc.perform(post("/api/settings/vat").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"rate\":\"15\",\"validFrom\":\"2020-06-01\"}")).andExpect(status().isBadRequest());
            mvc.perform(post("/api/settings/vat").with(csrf()).cookie(admin).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"rate\":\"15\",\"validFrom\":\"2098-01-01\"}")).andExpect(status().isForbidden());
            mvc.perform(post("/api/settings/vat").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"rate\":\"15\",\"validFrom\":\"2098-01-01\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.vatRate").value("12"))
                    .andExpect(jsonPath("$.vatHistory[0].rate").value("15"))
                    .andExpect(jsonPath("$.vatHistory[0].status").value("FUTURE"))
                    .andExpect(jsonPath("$.vatHistory[?(@.rate == '12')].status").value("ACTIVE"));
            mvc.perform(post("/api/settings/vat").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"rate\":\"16\",\"validFrom\":\"2098-01-01\"}")).andExpect(status().isConflict());
        } finally {
            jdbc.sql("DELETE FROM vat_rate WHERE valid_from = DATE '2098-01-01'").update();
        }
    }

    @Test
    void printSettingsAndSigners() throws Exception {
        Cookie director = loginAs("DIRECTOR");
        long branch = jdbc.sql("SELECT id FROM branch WHERE active ORDER BY id LIMIT 1").query(Long.class).single();
        long picker = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, must_change_password)
                SELECT :l, 'Yigʻuvchi', id, 'x', false FROM role WHERE code = 'PICKER' RETURNING id""")
                .param("l", "sp" + UUID.randomUUID().toString().substring(0, 8)).query(Long.class).single();
        long acc = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, must_change_password)
                SELECT :l, 'Bosh hisobchi Sinov', id, 'x', false FROM role WHERE code = 'ACCOUNTANT' RETURNING id""")
                .param("l", "sa" + UUID.randomUUID().toString().substring(0, 8)).query(Long.class).single();

        mvc.perform(put("/api/settings/print").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"invoiceVariant\":\"NOPRICE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.print.invoiceVariant").value("NOPRICE"))
                .andExpect(jsonPath("$.print.reprintMark").value(true));
        mvc.perform(put("/api/settings/print/signers/" + branch).with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                .content("{\"headId\":null,\"accountantId\":" + picker + "}")).andExpect(status().isBadRequest());
        mvc.perform(put("/api/settings/print/signers/" + branch).with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"headId\":null,\"accountantId\":" + acc + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.print.signers[?(@.branchId == " + branch + ")].accountantId").value((int) acc));
        assertThat(jdbc.sql("SELECT count(*) FROM audit_log WHERE action IN ('settings.print', 'settings.signers')").query(Long.class).single())
                .isGreaterThanOrEqualTo(2);
        jdbc.sql("UPDATE print_setting SET invoice_variant = 'PRICE'").update();
    }
}
