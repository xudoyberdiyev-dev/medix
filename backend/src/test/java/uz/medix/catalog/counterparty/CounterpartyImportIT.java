package uz.medix.catalog.counterparty;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import uz.medix.TestcontainersConfig;

/** Kontragentlar import ustasi (prototip ImportWizard «cust» / «sup»): tekshirish, takror STIR, yaratish, shartlar, ruxsatlar. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class CounterpartyImportIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "im" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :login, 'Sinov', id, :b, :hash, false FROM role WHERE code = :role""")
                .param("login", login)
                .param("b", branchId)
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

    private long branch() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        return jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'Filial ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(500_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private static String tin() {
        return String.valueOf(200_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L));
    }

    private org.springframework.test.web.servlet.ResultActions check(Cookie who, String body, boolean apply) throws Exception {
        return mvc.perform(post("/api/counterparties/import/check").param("apply", String.valueOf(apply)).cookie(who).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String row(int n, String values) {
        return "{\"row\":" + n + ",\"values\":{" + values + "}}";
    }

    @Test
    void customersAreCheckedThenCreatedWithBranchTerms() throws Exception {
        long b = branch();
        Cookie director = loginAs("DIRECTOR", null);
        String region = "Hudud " + UUID.randomUUID().toString().substring(0, 6);
        jdbc.sql("INSERT INTO region (name) VALUES (:n)").param("n", region).update();
        String taken = tin();
        jdbc.sql("INSERT INTO counterparty (tin, name, is_customer, is_supplier) VALUES (:t, 'Bor Dorixona', true, false)").param("t", taken).update();
        String t1 = tin();
        String t2 = tin();
        String body = "{\"role\":\"CUSTOMER\",\"branchId\":" + b + ",\"rows\":["
                + row(1, "\"stir\":\"" + t1.substring(0, 3) + " " + t1.substring(3) + "\",\"cname\":\"Shifo " + t1 + "\",\"ctype\":\"Dorixona\","
                        + "\"region\":\"" + region.toUpperCase() + "\",\"phone\":\"+998 90 123 45 67\",\"limit\":\"15 000 000,50\",\"days\":\"15\"") + ","
                + row(2, "\"stir\":\"" + t2 + "\",\"cname\":\"Yangi " + t2 + "\",\"ctype\":\"Nomaʼlum\",\"region\":\"Yoʻq hudud\"") + ","
                + row(3, "\"stir\":\"" + taken + "\",\"cname\":\"Takror\"") + ","
                + row(4, "\"stir\":\"" + t1 + "\",\"cname\":\"Fayl ichida takror\"") + ","
                + row(5, "\"stir\":\"12345\",\"cname\":\"\",\"days\":\"900\",\"limit\":\"abc\"") + "]}";
        check(director, body, false)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(false))
                .andExpect(jsonPath("$.ok").value(1))
                .andExpect(jsonPath("$.warn").value(1))
                .andExpect(jsonPath("$.error").value(3))
                .andExpect(jsonPath("$.rows[0].status").value("OK"))
                .andExpect(jsonPath("$.rows[0].tin").value(t1))
                .andExpect(jsonPath("$.rows[1].messages[*].key", org.hamcrest.Matchers.containsInAnyOrder("cKindUnknown", "cRegionUnknown")))
                .andExpect(jsonPath("$.rows[2].messages[0].key").value("cTinTaken"))
                .andExpect(jsonPath("$.rows[2].messages[0].params.n").value("Bor Dorixona"))
                .andExpect(jsonPath("$.rows[3].messages[0].key").value("cTinDupFile"))
                .andExpect(jsonPath("$.rows[3].messages[0].params.r").value("1"))
                .andExpect(jsonPath("$.rows[4].messages[*].key",
                        org.hamcrest.Matchers.containsInAnyOrder("cReq", "cTinBad", "cMoneyBad", "cDaysBad")));
        assertThat(jdbc.sql("SELECT count(*) FROM counterparty WHERE tin IN (:a, :b)").param("a", t1).param("b", t2).query(Long.class).single())
                .isZero();

        check(director, body, true)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(true))
                .andExpect(jsonPath("$.created").value(2))
                .andExpect(jsonPath("$.rows[0].createdId").isNumber())
                .andExpect(jsonPath("$.rows[2].createdId").doesNotExist());
        long id = jdbc.sql("SELECT id FROM counterparty WHERE tin = :t AND is_customer AND NOT is_supplier AND kind = 'PHARMACY' AND region_id IS NOT NULL")
                .param("t", t1).query(Long.class).single();
        assertThat(jdbc.sql("SELECT credit_limit::text || '/' || payment_days FROM counterparty_branch_terms WHERE counterparty_id = :c AND branch_id = :b")
                .param("c", id).param("b", b).query(String.class).single()).isEqualTo("15000000.50/15");
        assertThat(jdbc.sql("SELECT count(*) FROM audit_log WHERE action = 'counterparty.import'").query(Long.class).single()).isPositive();
        // Qayta yuklash — endi hammasi «allaqachon bor»
        check(director, body, false).andExpect(jsonPath("$.rows[0].messages[0].key").value("cTinTaken"));
    }

    @Test
    void suppliersUseOwnFieldsAndPermissions() throws Exception {
        long b = branch();
        Cookie director = loginAs("DIRECTOR", null);
        Cookie manager = loginAs("BRANCH_MANAGER", b);
        Cookie picker = loginAs("PICKER", b);
        String t = tin();
        String body = "{\"role\":\"SUPPLIER\",\"branchId\":" + b + ",\"rows\":["
                + row(1, "\"stir\":\"" + t + "\",\"cname\":\"Pharm YB " + t + "\",\"days\":\"30\",\"lead\":\"3\",\"limit\":\"999\"") + "]}";
        // Filial rahbarida suppliers.create yoʻq; yigʻuvchida — hech biri
        check(manager, body, false).andExpect(status().isForbidden());
        check(picker, body.replace("SUPPLIER", "CUSTOMER"), false).andExpect(status().isForbidden());
        mvc.perform(multipart("/api/counterparties/import/read")
                        .file(new MockMultipartFile("file", "a.csv", "text/csv", "STIR;Nomi\n1;2".getBytes(StandardCharsets.UTF_8)))
                        .cookie(picker).with(csrf()))
                .andExpect(status().isForbidden());
        check(director, body.replace("\"role\":\"SUPPLIER\"", "\"role\":\"ALL\""), false).andExpect(status().isBadRequest());

        check(director, body, true)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(1))
                .andExpect(jsonPath("$.rows[0].status").value("OK"));
        long id = jdbc.sql("SELECT id FROM counterparty WHERE tin = :t AND is_supplier AND NOT is_customer").param("t", t).query(Long.class).single();
        assertThat(jdbc.sql("""
                SELECT coalesce(credit_limit::text, '-') || '/' || supplier_payment_days || '/' || supplier_delivery_days
                FROM counterparty_branch_terms WHERE counterparty_id = :c AND branch_id = :b""")
                .param("c", id).param("b", b).query(String.class).single()).isEqualTo("-/30/3");

        // Fayl oʻqish (CSV) va profil
        mvc.perform(multipart("/api/counterparties/import/read")
                        .file(new MockMultipartFile("file", "yb.csv", "text/csv", "STIR;Nomi\n123456789;Pharm".getBytes(StandardCharsets.UTF_8)))
                        .cookie(director).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sheets[0].rows", hasSize(2)))
                .andExpect(jsonPath("$.sheets[0].rows[1][1]").value("Pharm"));
        mvc.perform(put("/api/counterparties/import/profile").param("role", "SUPPLIER").cookie(director).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"SMARTUP · YB\",\"mapping\":{\"stir\":\"STIR\",\"cname\":\"Nomi\",\"limit\":\"Limit\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mapping.stir").value("STIR"))
                .andExpect(jsonPath("$.mapping.limit").doesNotExist());
        mvc.perform(get("/api/counterparties/import/profile").param("role", "SUPPLIER").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("SMARTUP · YB"));
        mvc.perform(get("/api/counterparties/import/profile").param("role", "SUPPLIER").cookie(manager)).andExpect(status().isForbidden());
    }
}
