package uz.medix.catalog.refprice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
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
import uz.medix.TestcontainersConfig;

/** O14: referent narx — moslash tartibi (GTIN, MXIK, nom, qo'lda → xotira), chegara, kirim narxi ruxsati, Excel. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class RefPriceIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "rp" + UUID.randomUUID().toString().substring(0, 8);
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

    private long product(Cookie purchaser, String name, String barcode, String ikpu) throws Exception {
        long unit = jdbc.sql("SELECT id FROM unit WHERE short_name = 'dona'").query(Long.class).single();
        String body = "{\"name\":\"" + name + "\",\"unitId\":" + unit + (barcode == null ? "" : ",\"barcodes\":[\"" + barcode + "\"]")
                + (ikpu == null ? "" : ",\"ikpu\":\"" + ikpu + "\"")
                + ",\"controlled\":false,\"marked\":false,\"prescription\":false,\"vatRate\":\"12\"}";
        MvcResult r = mvc.perform(post("/api/products").with(csrf()).cookie(purchaser).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn();
        return Long.parseLong(r.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));
    }

    private void basePrice(long branch, long product, String amount) {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Tashkent"));
        long emp = jdbc.sql("SELECT min(id) FROM employee").query(Long.class).single();
        long doc = jdbc.sql("""
                INSERT INTO price_change (number, branch_id, effective_from, created_by, status)
                VALUES (:n, :b, :d, :e, 'APPROVED') RETURNING id""")
                .param("n", "NO-R-" + UUID.randomUUID().toString().substring(0, 8))
                .param("b", branch)
                .param("d", java.sql.Date.valueOf(today.minusDays(1)))
                .param("e", emp)
                .query(Long.class)
                .single();
        jdbc.sql("""
                INSERT INTO price (product_id, price_type_id, branch_id, effective_from, amount, price_change_id)
                SELECT :p, id, :b, :d, :a, :doc FROM price_type WHERE base""")
                .param("p", product)
                .param("b", branch)
                .param("d", java.sql.Date.valueOf(today.minusDays(1)))
                .param("a", new BigDecimal(amount))
                .param("doc", doc)
                .update();
    }

    private static String row(int no, String name, String barcode, String ikpu, String price) {
        return "{\"row\":" + no + ",\"name\":\"" + name + "\"" + (barcode == null ? "" : ",\"barcode\":\"" + barcode + "\"")
                + (ikpu == null ? "" : ",\"ikpu\":\"" + ikpu + "\"") + ",\"price\":\"" + price + "\"}";
    }

    @Test
    void matchCompareToleranceAndPermissions() throws Exception {
        long b = branch();
        Cookie purchaser = loginAs("PURCHASER", b);
        Cookie director = loginAs("DIRECTOR", b);
        Cookie operator = loginAs("OPERATOR", b);
        String tag = UUID.randomUUID().toString().substring(0, 6);
        var rnd = ThreadLocalRandom.current();
        String bc = "47" + (10_000_000_000L + rnd.nextLong(89_999_999_999L));
        String ikpu = String.valueOf(10_000_000_000_000_000L + rnd.nextLong(89_999_999_999_999_999L));
        long a = product(purchaser, "Refbar" + tag + " Analgin", bc, null);
        long bName = product(purchaser, "Refnom" + tag + " Ketorol tabletka", null, null);
        long c = product(purchaser, "Refmxik" + tag + " Sitramon", null, ikpu);
        basePrice(b, a, "1000");
        basePrice(b, bName, "2000");
        basePrice(b, c, "500");
        jdbc.sql("UPDATE app_setting SET value = 1 WHERE key = 'refPriceTolPct'").update();

        String body = "{\"fileName\":\"referent.xlsx\",\"rows\":["
                + row(1, "Boshqa nom", "0" + bc, null, "900") + ","
                + row(2, "Refnom" + tag + " Ketorol tabletka", null, null, "2 010,00") + ","
                + row(3, "Sitramon", null, ikpu, "600") + ","
                + row(4, "Mutlaqo nomalum " + tag + " qqq", null, null, "100") + ","
                + row(5, "Narxsiz", null, null, "abc") + "]}";
        MvcResult up = mvc.perform(post("/api/reference-prices").with(csrf()).cookie(operator).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.rows").value(4))
                .andExpect(jsonPath("$.skipped[0]").value(5))
                .andReturn();
        long list = Long.parseLong(up.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));

        mvc.perform(get("/api/reference-prices/" + list + "/compare").cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tolerancePct").value("1"))
                .andExpect(jsonPath("$.counts.expensive").value(1))
                .andExpect(jsonPath("$.counts.cheap").value(1))
                .andExpect(jsonPath("$.counts.match").value(1))
                .andExpect(jsonPath("$.counts.notFound").value(1))
                .andExpect(jsonPath("$.rows[?(@.rowNo == 1)].matchKind").value("BARCODE"))
                .andExpect(jsonPath("$.rows[?(@.rowNo == 1)].diffPct").value("11.11"))
                .andExpect(jsonPath("$.rows[?(@.rowNo == 1)].status").value("EXPENSIVE"))
                .andExpect(jsonPath("$.rows[?(@.rowNo == 2)].matchKind").value("NAME"))
                .andExpect(jsonPath("$.rows[?(@.rowNo == 2)].refPrice").value("2010.00"))
                .andExpect(jsonPath("$.rows[?(@.rowNo == 2)].status").value("MATCH"))
                .andExpect(jsonPath("$.rows[?(@.rowNo == 3)].matchKind").value("IKPU"))
                .andExpect(jsonPath("$.rows[?(@.rowNo == 3)].status").value("CHEAP"))
                .andExpect(jsonPath("$.rows[?(@.rowNo == 4)].matchKind").value("NONE"));

        // Kirim narxi — faqat tannarx huquqi bilan
        mvc.perform(get("/api/reference-prices/" + list + "/compare").param("mode", "RECEIPT").cookie(operator))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/reference-prices/" + list + "/compare").param("mode", "RECEIPT").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("RECEIPT"));
        // Ruxsatsiz rol
        mvc.perform(get("/api/reference-prices").cookie(loginAs("PICKER", b))).andExpect(status().isForbidden());

        // Qo'lda moslash eslab qolinadi — keyingi faylda ALIAS
        long row4 = jdbc.sql("SELECT id FROM ref_price_row WHERE list_id = :l AND row_no = 4").param("l", list).query(Long.class).single();
        mvc.perform(put("/api/reference-prices/" + list + "/rows/" + row4 + "/product").with(csrf()).cookie(operator)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"productId\":" + a + "}"))
                .andExpect(status().isOk());
        MvcResult up2 = mvc.perform(post("/api/reference-prices").with(csrf()).cookie(operator).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileName\":\"ikkinchi.csv\",\"rows\":[" + row(1, "Mutlaqo nomalum " + tag + " qqq", null, null, "1000") + "]}"))
                .andExpect(status().isCreated())
                .andReturn();
        long list2 = Long.parseLong(up2.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));
        assertThat(jdbc.sql("SELECT match_kind || ':' || product_id FROM ref_price_row WHERE list_id = :l").param("l", list2)
                .query(String.class).single()).isEqualTo("ALIAS:" + a);

        mvc.perform(get("/api/reference-prices").cookie(operator))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + list + ")].matched").value(4));
        mvc.perform(get("/api/reference-prices/" + list + "/export").param("status", "EXPENSIVE").cookie(operator))
                .andExpect(status().isOk())
                .andExpect(content().contentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        jdbc.sql("UPDATE app_setting SET value = 0 WHERE key = 'refPriceTolPct'").update();
    }

    @Test
    void parsePrice() {
        assertThat(RefPrices.parsePrice("1 250 000,50")).isEqualByComparingTo("1250000.50");
        assertThat(RefPrices.parsePrice("1,250,000.50")).isEqualByComparingTo("1250000.50");
        assertThat(RefPrices.parsePrice("1.250.000,5")).isEqualByComparingTo("1250000.50");
        assertThat(RefPrices.parsePrice("12500 so'm")).isEqualByComparingTo("12500");
        assertThat(RefPrices.parsePrice("0")).isNull();
        assertThat(RefPrices.parsePrice("abc")).isNull();
        assertThat(RefPrices.status(new BigDecimal("1.00"), BigDecimal.ONE)).isEqualTo(RefPriceModels.RowStatus.MATCH);
        assertThat(RefPrices.status(new BigDecimal("-1.01"), BigDecimal.ONE)).isEqualTo(RefPriceModels.RowStatus.CHEAP);
    }
}
