package uz.yuzplus.identity.security;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.util.List;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import uz.yuzplus.TestcontainersConfig;
import uz.yuzplus.shared.error.SystemErrors;

/** P1: panel rollari (Haydovchi, Yig'uvchi, Markirovkachi) katalog, narx, mijoz va eksport API'larini ololmaydi; qobiq API'lari ishlaydi. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class EndpointPermissionsIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    /** Tannarx/narx/mijoz ma'lumoti — panel rollariga yopiq. */
    private static final List<String> CLOSED = List.of(
            "/api/counterparties", "/api/counterparties?role=SUPPLIER", "/api/counterparties/export", "/api/counterparties/1",
            "/api/products", "/api/products/export", "/api/products/import-template", "/api/products/1", "/api/products/1/history",
            "/api/dictionaries/MANUFACTURER", "/api/vehicles", "/api/expense-items", "/api/employee-lookup", "/api/branches/stats",
            "/api/stock/product-card/1", "/api/warehouses/overview", "/api/price-types", "/api/prices/history?productId=1",
            "/api/prices?branchId=1", "/api/prices/export?branchId=1", "/api/price-changes", "/api/price-changes/1",
            "/api/price-changes/1/pdf", "/api/setup-checklist", "/api/settings/system-status");

    /** Qobiq (har rol): filiallar, omborlar, profil, bildirishnomalar, qidiruv, o'zim. */
    private static final List<String> OPEN = List.of("/api/branches", "/api/warehouses", "/api/profile", "/api/notifications",
            "/api/search?q=ab", "/api/auth/me");

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    SystemErrors systemErrors;

    private long branch() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Shifo Dori' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        return jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'Filial ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(300000000 + rnd.nextInt(99999999)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private Cookie loginAs(String role, long branchId) throws Exception {
        String login = "ep" + UUID.randomUUID().toString().substring(0, 8);
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
            if (h.startsWith("YUZPLUS_SESSION=")) {
                return new Cookie("YUZPLUS_SESSION", h.substring("YUZPLUS_SESSION=".length(), h.indexOf(';')));
            }
        }
        throw new AssertionError("sessiya yo'q");
    }

    @Test
    void panelRolesCannotReadCatalogPricesOrCustomers() throws Exception {
        long b = branch();
        for (String role : List.of("DRIVER", "PICKER", "MARKER")) {
            Cookie c = loginAs(role, b);
            for (String url : CLOSED) {
                mvc.perform(get(url).cookie(c)).andExpect(result -> {
                    if (result.getResponse().getStatus() != 403) {
                        throw new AssertionError(role + " " + url + " → " + result.getResponse().getStatus() + " (403 kutilgan)");
                    }
                });
            }
            for (String url : OPEN) {
                mvc.perform(get(url).cookie(c)).andExpect(result -> {
                    if (result.getResponse().getStatus() != 200) {
                        throw new AssertionError(role + " " + url + " → " + result.getResponse().getStatus() + " (200 kutilgan)");
                    }
                });
            }
        }
    }

    @Test
    void cashierSeesBothSidesAndOperatorListsCustomers() throws Exception {
        long b = branch();
        mvc.perform(get("/api/counterparties").param("role", "ALL").cookie(loginAs("CASHIER", b))).andExpect(status().isOk());
        Cookie operator = loginAs("OPERATOR", b);
        mvc.perform(get("/api/counterparties").param("role", "CUSTOMER").cookie(operator)).andExpect(status().isOk());
        mvc.perform(get("/api/products").cookie(operator)).andExpect(status().isOk());
        mvc.perform(get("/api/price-types").cookie(operator)).andExpect(status().isOk());
    }

    @Test
    void securityHeaders() throws Exception {
        mvc.perform(get("/api/auth/me").cookie(loginAs("PICKER", branch())))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"));
    }

    @Test
    void systemStatusForSecuritySettingsOnly() throws Exception {
        String path = "/api/p4-sinov/" + UUID.randomUUID();
        systemErrors.record("GET", path, new IllegalStateException("sinov"));
        long b = branch();
        mvc.perform(get("/api/settings/system-status").cookie(loginAs("DIRECTOR", b)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.last24h").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.recent[0].path").value(path))
                .andExpect(jsonPath("$.recent[0].exception").value("java.lang.IllegalStateException"));
        mvc.perform(get("/api/settings/system-status").cookie(loginAs("OPERATOR", b))).andExpect(status().isForbidden());
    }

    @Test
    void setupChecklistForDirector() throws Exception {
        long b = branch();
        mvc.perform(get("/api/setup-checklist").cookie(loginAs("DIRECTOR", b)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(8))
                .andExpect(jsonPath("$.items[1].step").value("BRANCHES"))
                .andExpect(jsonPath("$.items[1].done").value(true));
        mvc.perform(get("/api/setup-checklist").cookie(loginAs("OPERATOR", b))).andExpect(status().isForbidden());
    }

    @Test
    void navFavoritesAreSavedInProfile() throws Exception {
        Cookie c = loginAs("OPERATOR", branch());
        mvc.perform(put("/api/profile/favorites").with(csrf()).cookie(c).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[\"orders\",\"customers\",\"orders\"]}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/profile").cookie(c))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.favorites.length()").value(2))
                .andExpect(jsonPath("$.favorites[0]").value("orders"));
        mvc.perform(put("/api/profile/favorites").with(csrf()).cookie(c).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[\"<script>\"]}"))
                .andExpect(status().isBadRequest());
    }
}
