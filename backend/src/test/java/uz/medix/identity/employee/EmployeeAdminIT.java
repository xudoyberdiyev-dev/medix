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
import uz.medix.TestcontainersConfig;

/**
 * Xodimni bloklash (sessiyasi tugaydi), blokdan chiqarish, vaqtinchalik parol, audit jurnali.
 * {@code @Transactional} emas: Spring Session o'z (REQUIRES_NEW) tranzaksiyasida ishlaydi — test tranzaksiyasi
 * sessiya qatorini qulflab qo'ysa, keyingi so'rov o'zini kutib qoladi.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
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
        mvc.perform(get("/api/branches").cookie(operator)).andExpect(status().isOk());

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

    private long branch() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = java.util.concurrent.ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        return jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'Filial ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(400_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder allBranches(long id, Cookie c, boolean on) {
        return post("/api/employees/" + id + "/all-branches").with(csrf()).cookie(c).contentType(MediaType.APPLICATION_JSON)
                .content("{\"enabled\":" + on + "}");
    }

    /** E3 (07.11.2026): Buxgalter standart holatda faqat o'z filiali; barcha filiallar — faqat Direktor bergan belgi bilan. */
    @Test
    void accountantSeesOwnBranchUnlessDirectorGrants() throws Exception {
        long own = branch();
        String accLogin = uniq("acc");
        long accId = employee(accLogin, "ACCOUNTANT");
        jdbc.sql("UPDATE employee SET branch_id = :b WHERE id = :id").param("b", own).param("id", accId).update();
        String dirLogin = uniq("dir");
        employee(dirLogin, "DIRECTOR");
        String admLogin = uniq("adm");
        employee(admLogin, "ADMIN");
        String opLogin = uniq("op");
        long opId = employee(opLogin, "OPERATOR");
        jdbc.sql("UPDATE employee SET branch_id = :b WHERE id = :id").param("b", own).param("id", opId).update();

        Cookie acc = login(accLogin);
        mvc.perform(get("/api/auth/me").cookie(acc)).andExpect(jsonPath("$.allBranches").value(false));

        // Faqat Direktor beradi (Bosh administrator ham emas); faqat Buxgalterga
        Cookie admin = login(admLogin);
        mvc.perform(allBranches(accId, admin, true)).andExpect(status().isForbidden());
        Cookie director = login(dirLogin);
        mvc.perform(allBranches(opId, director, true))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("employee.allBranchesOnlyAccountant"));
        mvc.perform(allBranches(accId, director, true)).andExpect(status().isOk()).andExpect(jsonPath("$.allBranches").value(true));
        // Eski sessiya tugaydi; qayta kirganda — barcha filiallar
        mvc.perform(get("/api/auth/me").cookie(acc)).andExpect(status().isUnauthorized());
        acc = login(accLogin);
        mvc.perform(get("/api/auth/me").cookie(acc)).andExpect(jsonPath("$.allBranches").value(true));
        // Audit
        mvc.perform(get("/api/audit").param("entityType", "employee").param("size", "100").cookie(director))
                .andExpect(jsonPath("$.items[?(@.action == 'employee.allBranches')]").exists());
        // Olib qo'yish
        mvc.perform(allBranches(accId, director, false)).andExpect(jsonPath("$.allBranches").value(false));
        acc = login(accLogin);
        mvc.perform(get("/api/auth/me").cookie(acc)).andExpect(jsonPath("$.allBranches").value(false));
        // Baza himoyasi: belgi faqat Buxgalterda saqlanadi
        jdbc.sql("UPDATE employee SET all_branches = true WHERE id = :id").param("id", opId).update();
        org.assertj.core.api.Assertions.assertThat(jdbc.sql("SELECT all_branches FROM employee WHERE id = :id").param("id", opId)
                .query(Boolean.class).single()).isFalse();
    }
}
