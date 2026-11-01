package uz.medix.identity.organization;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import uz.medix.TestcontainersConfig;

/**
 * Boshqaruv → Filiallar, Omborlar va zonalar: qo'shish, tahrirlash, nofaol qilish, filial doirasi, audit.
 * Alohida kontekst (alohida baza): sozlash ustasi testi «filiallar yo'q» holatidan boshlanadi.
 */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class BranchWarehouseAdminIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @BeforeEach
    void company() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
    }

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = role.toLowerCase().replace('_', '-') + UUID.randomUUID().toString().substring(0, 6);
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

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, Cookie session, String body) {
        return b.with(csrf()).cookie(session).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static String code() {
        var rnd = java.util.concurrent.ThreadLocalRandom.current();
        return "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
    }

    private static String tin() {
        return String.valueOf(300_000_000L + (long) (Math.random() * 99_999_999L));
    }

    private static long id(MvcResult r) throws Exception {
        return Long.parseLong(r.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));
    }

    private long branch(Cookie admin) throws Exception {
        return id(mvc.perform(json(post("/api/branches"), admin,
                        "{\"code\":\"" + code() + "\",\"name\":\"Filial\",\"legalName\":\"Filial MChJ\",\"tin\":\"" + tin() + "\"}"))
                .andExpect(status().isCreated())
                .andReturn());
    }

    @Test
    void branchLifecycle() throws Exception {
        Cookie admin = loginAs("ADMIN", null);
        String code = code();
        MvcResult created = mvc.perform(json(post("/api/branches"), admin,
                        "{\"code\":\"" + code.toLowerCase() + "\",\"name\":\"Samarqand\",\"legalName\":\"Medix SMQ MChJ\",\"tin\":\"" + tin() + "\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.active").value(true))
                .andReturn();
        long id = id(created);

        mvc.perform(json(put("/api/branches/" + id), admin,
                        "{\"name\":\"Samarqand filiali\",\"legalName\":\"Medix SMQ MChJ\",\"tin\":\"" + tin() + "\",\"phone\":\"+998 66 000 00 00\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Samarqand filiali"))
                .andExpect(jsonPath("$.code").value(code));

        mvc.perform(json(post("/api/branches/" + id + "/deactivate"), admin, "{\"reason\":\"\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(json(post("/api/branches/" + id + "/deactivate"), admin, "{\"reason\":\"Yopildi\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));

        // Nofaol filialga ombor qo'shilmaydi
        mvc.perform(json(post("/api/warehouses"), admin, "{\"branchId\":" + id + ",\"name\":\"Ombor\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("employee.branchUnknown"));

        mvc.perform(post("/api/branches/" + id + "/activate").with(csrf()).cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(true));

        long audits = jdbc.sql("SELECT count(*) FROM audit_log WHERE entity_type = 'branch' AND entity_id = :id")
                .param("id", String.valueOf(id))
                .query(Long.class)
                .single();
        org.assertj.core.api.Assertions.assertThat(audits).isEqualTo(4);
    }

    @Test
    void lastActiveBranchCannotBeDeactivated() throws Exception {
        Cookie admin = loginAs("ADMIN", null);
        long id = branch(admin);
        jdbc.sql("UPDATE branch SET active = false WHERE id <> :id").param("id", id).update();
        try {
            mvc.perform(json(post("/api/branches/" + id + "/deactivate"), admin, "{\"reason\":\"Sinov\"}"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("branch.lastActive"));
        } finally {
            jdbc.sql("UPDATE branch SET active = true").update();
        }
    }

    @Test
    void onlyDirectorAndAdminManageBranches() throws Exception {
        Cookie admin = loginAs("ADMIN", null);
        long id = branch(admin);
        Cookie manager = loginAs("BRANCH_MANAGER", id);
        mvc.perform(json(post("/api/branches"), manager,
                        "{\"code\":\"" + code() + "\",\"name\":\"X\",\"legalName\":\"X\",\"tin\":\"" + tin() + "\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/branches").cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(id));
    }

    @Test
    void warehouseLifecycleAndBranchScope() throws Exception {
        Cookie admin = loginAs("ADMIN", null);
        long own = branch(admin);
        long other = branch(admin);
        Cookie manager = loginAs("BRANCH_MANAGER", own);

        MvcResult w = mvc.perform(json(post("/api/warehouses"), manager, "{\"branchId\":" + own + ",\"name\":\"Markaziy\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.zones", hasSize(4)))
                .andReturn();
        long wid = id(w);

        mvc.perform(json(post("/api/warehouses"), manager, "{\"branchId\":" + own + ",\"name\":\"markaziy\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("warehouse.duplicateName"));

        // Boshqa filialga — ruxsat yo'q
        mvc.perform(json(post("/api/warehouses"), manager, "{\"branchId\":" + other + ",\"name\":\"Begona\"}"))
                .andExpect(status().isBadRequest());
        long otherWarehouse = id(mvc.perform(json(post("/api/warehouses"), admin, "{\"branchId\":" + other + ",\"name\":\"Begona\"}"))
                .andExpect(status().isCreated())
                .andReturn());
        mvc.perform(json(put("/api/warehouses/" + otherWarehouse), manager, "{\"name\":\"Meniki\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/warehouses").cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.branchId == " + other + ")]", hasSize(0)))
                .andExpect(jsonPath("$[?(@.branchId == " + own + ")]", hasSize(1)));

        mvc.perform(json(put("/api/warehouses/" + wid), manager, "{\"name\":\"Markaziy ombor\",\"address\":\"Chilonzor 5\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Markaziy ombor"))
                .andExpect(jsonPath("$.address").value("Chilonzor 5"));

        mvc.perform(json(post("/api/warehouses/" + wid + "/zones"), manager, "{\"type\":\"COLD\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.zones", hasSize(5)))
                .andExpect(jsonPath("$.zones[?(@.type == 'COLD')].sellable").value(true));
        mvc.perform(json(post("/api/warehouses/" + wid + "/zones"), manager, "{\"type\":\"COLD\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("warehouse.zoneExists"));
        mvc.perform(json(post("/api/warehouses/" + wid + "/zones"), manager, "{\"type\":\"MAIN\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("warehouse.extraZones"));

        long zoneId = jdbc.sql("SELECT id FROM zone WHERE warehouse_id = :w AND type = 'COLD'").param("w", wid).query(Long.class).single();
        mvc.perform(json(put("/api/warehouses/" + wid + "/zones/" + zoneId), manager, "{\"name\":\"Muzlatkich\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.zones[?(@.type == 'COLD')].name").value("Muzlatkich"));
        mvc.perform(json(put("/api/warehouses/" + wid + "/zones/" + zoneId), manager, "{\"name\":\"karantin\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("warehouse.zoneDuplicateName"));

        mvc.perform(json(post("/api/warehouses/" + wid + "/deactivate"), manager, "{\"reason\":\"Ta'mirlash\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
        mvc.perform(post("/api/warehouses/" + wid + "/activate").with(csrf()).cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(true));

        Cookie operator = loginAs("OPERATOR", own);
        mvc.perform(get("/api/warehouses").cookie(operator)).andExpect(status().isOk());
        mvc.perform(json(put("/api/warehouses/" + wid), operator, "{\"name\":\"X\"}"))
                .andExpect(status().isForbidden());
    }
}
