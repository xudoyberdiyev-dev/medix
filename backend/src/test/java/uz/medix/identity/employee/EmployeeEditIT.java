package uz.medix.identity.employee;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import uz.medix.TestcontainersConfig;

/** Prototip WizStaff: ism qismlari, ombor/kassa biriktirish, tahrirlash, login taklifi, oʻrinlar. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class EmployeeEditIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    Employees employees;

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

    private long warehouse(long branch) {
        return jdbc.sql("INSERT INTO warehouse (branch_id, name) VALUES (:b, :n) RETURNING id")
                .param("b", branch)
                .param("n", "Ombor " + uniq(""))
                .query(Long.class)
                .single();
    }

    private long cash(long branch) {
        return jdbc.sql("INSERT INTO money_account (branch_id, kind, code, name) VALUES (:b, 'CASH', :c, 'Kassa') RETURNING id")
                .param("b", branch)
                .param("c", uniq("K"))
                .query(Long.class)
                .single();
    }

    private static String uniq(String prefix) {
        return prefix + UUID.randomUUID().toString().substring(0, 6);
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, Cookie s, String body) {
        return b.with(csrf()).cookie(s).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    @Test
    void createWithNamePartsWarehousesAndEdit() throws Exception {
        long b = branch();
        long w1 = warehouse(b);
        long w2 = warehouse(b);
        long otherWh = warehouse(branch());
        String dir = uniq("dir");
        employee(dir, "DIRECTOR", null);
        Cookie s = login(dir);
        String login = uniq("k.");

        MvcResult created = mvc.perform(json(post("/api/employees"), s, """
                        {"login":"%s","lastName":"Aliyev","firstName":"Sanjar","middleName":"Olimovich","phone":"+998 93 410 27 65",
                         "roleCode":"WAREHOUSE_MANAGER","branchId":%d,"temporaryPassword":"Abcdefgh23","warehouseIds":[%d,%d]}"""
                        .formatted(login, b, w1, w2)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fullName").value("Sanjar Aliyev"))
                .andExpect(jsonPath("$.lastName").value("Aliyev"))
                .andExpect(jsonPath("$.middleName").value("Olimovich"))
                .andExpect(jsonPath("$.lastLoginAt").value(nullValue()))
                .andExpect(jsonPath("$.warehouseIds", contains((int) w1, (int) w2)))
                .andExpect(jsonPath("$.cashAccountIds", empty()))
                .andReturn();
        long id = ((Number) JsonPath.read(created.getResponse().getContentAsString(), "$.id")).longValue();

        // Boshqa filial ombori — xato
        mvc.perform(json(put("/api/employees/" + id), s, """
                        {"login":"%s","lastName":"Aliyev","firstName":"Sanjar","roleCode":"WAREHOUSE_MANAGER","branchId":%d,
                         "warehouseIds":[%d]}""".formatted(login, b, otherWh)))
                .andExpect(status().isBadRequest());

        // Tahrirlash: bitta ombor qoldi, login oʻzgardi
        String login2 = uniq("s.");
        mvc.perform(json(put("/api/employees/" + id), s, """
                        {"login":"%s","lastName":"Aliyev","firstName":"Sanjar","roleCode":"WAREHOUSE_MANAGER","branchId":%d,
                         "warehouseIds":[%d]}""".formatted(login2, b, w2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.login").value(login2))
                .andExpect(jsonPath("$.middleName").value(nullValue()))
                .andExpect(jsonPath("$.warehouseIds", contains((int) w2)));
        Long keeper1 = jdbc.sql("SELECT keeper_id FROM warehouse WHERE id = :id").param("id", w1).query(Long.class).optional().orElse(null);
        org.junit.jupiter.api.Assertions.assertNull(keeper1);

        // Rol kassirga oʻzgardi — omborlar boʻshaydi, kassa biriktiriladi
        long k = cash(b);
        mvc.perform(json(put("/api/employees/" + id), s, """
                        {"login":"%s","lastName":"Aliyev","firstName":"Sanjar","roleCode":"CASHIER","branchId":%d,
                         "warehouseIds":[%d],"cashAccountIds":[%d]}""".formatted(login2, b, w2, k)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roleCode").value("CASHIER"))
                .andExpect(jsonPath("$.warehouseIds", empty()))
                .andExpect(jsonPath("$.cashAccountIds", contains((int) k)));

        // Audit
        Long audits = jdbc.sql("SELECT count(*) FROM audit_log WHERE action = 'employee.update' AND entity_id = :id")
                .param("id", String.valueOf(id))
                .query(Long.class)
                .optional()
                .orElse(0L);
        org.junit.jupiter.api.Assertions.assertTrue(audits >= 2);
    }

    @Test
    void loginSuggestionAvoidsTakenAndTransliterates() throws Exception {
        String dir = uniq("dir");
        employee(dir, "DIRECTOR", null);
        Cookie s = login(dir);
        String last = "zz" + uniq("").replaceAll("[^a-z]", "x");
        MvcResult r = mvc.perform(get("/api/employees/login-check").cookie(s).param("firstName", "Шерзод").param("lastName", last))
                .andExpect(status().isOk())
                .andReturn();
        org.junit.jupiter.api.Assertions.assertEquals("s." + last, JsonPath.read(r.getResponse().getContentAsString(), "$.suggested"));
        employee("s." + last, "OPERATOR", null);
        mvc.perform(get("/api/employees/login-check").cookie(s).param("firstName", "Sherzod").param("lastName", last)
                        .param("login", "s." + last))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggested").value("s." + last + "2"))
                .andExpect(jsonPath("$.available").value(false));
        mvc.perform(get("/api/employees/seats").cookie(s))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limit").value(nullValue()));
    }

    @Test
    void limitBlocksNewEmployeeWithClearMessage() throws Exception {
        String dir = uniq("dir");
        employee(dir, "DIRECTOR", null);
        Cookie s = login(dir);
        Object target = AopTestUtils.getTargetObject(employees);
        long used = employees.seats().used();
        try {
            ReflectionTestUtils.setField(target, "limit", (int) used);
            mvc.perform(get("/api/employees/seats").cookie(s))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.used").value((int) used))
                    .andExpect(jsonPath("$.limit").value((int) used));
            mvc.perform(json(post("/api/employees"), s, """
                            {"login":"%s","lastName":"Karimov","firstName":"Jasur","roleCode":"OPERATOR","branchId":%d,
                             "temporaryPassword":"Abcdefgh23"}""".formatted(uniq("lim"), branch())))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("employee.limit"));
            ReflectionTestUtils.setField(target, "limit", (int) used + 1);
            mvc.perform(json(post("/api/employees"), s, """
                            {"login":"%s","lastName":"Karimov","firstName":"Jasur","roleCode":"OPERATOR","branchId":%d,
                             "temporaryPassword":"Abcdefgh23"}""".formatted(uniq("lim"), branch())))
                    .andExpect(status().isCreated());
        } finally {
            ReflectionTestUtils.setField(target, "limit", 0);
        }
    }

    @Test
    void cannotChangeOwnRole() throws Exception {
        String adm = uniq("adm");
        long id = employee(adm, "DIRECTOR", null);
        Cookie s = login(adm);
        mvc.perform(json(put("/api/employees/" + id), s, """
                        {"login":"%s","lastName":"Sinov","firstName":"Admin","roleCode":"OPERATOR"}""".formatted(adm)))
                .andExpect(status().isBadRequest());
    }
}
