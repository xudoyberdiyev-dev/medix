package uz.medix.identity.organization;

import static org.assertj.core.api.Assertions.assertThat;
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

/** Prototip AdminOrg «Kompaniya»: guruh nomi va tizim holati; tahrirlash — company.edit, audit bilan. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class CompanyIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private Cookie loginAs(String role) throws Exception {
        String login = "co" + UUID.randomUUID().toString().substring(0, 8);
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

    @Test
    void overviewAndRenameWithAudit() throws Exception {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        String before = jdbc.sql("SELECT name FROM company").query(String.class).single();
        long branches = jdbc.sql("SELECT count(*) FROM branch WHERE active").query(Long.class).single();
        Cookie director = loginAs("DIRECTOR");
        Cookie picker = loginAs("PICKER");

        mvc.perform(get("/api/company").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value(before))
                .andExpect(jsonPath("$.branches").value((int) branches))
                .andExpect(jsonPath("$.employees").isNumber());
        mvc.perform(get("/api/company").cookie(picker)).andExpect(status().isForbidden());
        mvc.perform(put("/api/company").with(csrf()).cookie(picker).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"X\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/company").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"  \"}"))
                .andExpect(status().isBadRequest());

        try {
            mvc.perform(put("/api/company").with(csrf()).cookie(director).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"  Medix Group Yangi \"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Medix Group Yangi"));
            assertThat(jdbc.sql("SELECT new_value->>'name' FROM audit_log WHERE action = 'company.update' ORDER BY id DESC LIMIT 1")
                            .query(String.class).single())
                    .isEqualTo("Medix Group Yangi");
        } finally {
            jdbc.sql("UPDATE company SET name = :n").param("n", before).update();
        }
    }
}
