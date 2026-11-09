package uz.medix.catalog.counterparty;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
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

/** Kontragentlar: bitta STIR — bitta karta, qidiruv (kirill, telefon), bloklash, litsenziya, shartnoma, filial shartlari. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class CounterpartyIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "cp" + UUID.randomUUID().toString().substring(0, 8);
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

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, Cookie session, String body) {
        return b.with(csrf()).cookie(session).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static long id(MvcResult r) throws Exception {
        return Long.parseLong(r.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));
    }

    @Test
    void cardSearchAndBlock() throws Exception {
        Cookie accountant = loginAs("BRANCH_MANAGER", null);
        String tin = tin();
        String tag = UUID.randomUUID().toString().substring(0, 5);
        long id = id(mvc.perform(json(post("/api/counterparties"), accountant,
                        "{\"tin\":\"" + tin + "\",\"name\":\"Dorixona Shifo " + tag + "\",\"customer\":true,\"supplier\":false,"
                                + "\"phone\":\"+998 90 111 22 33\",\"contactPerson\":\"Gʻaybullayev " + tag + "\","
                                + "\"bankAccount\":\"20208000900100200300\",\"bankMfo\":\"00450\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.customer").value(true))
                .andReturn());

        mvc.perform(json(post("/api/counterparties"), accountant,
                        "{\"tin\":\"" + tin + "\",\"name\":\"Takror\",\"customer\":true,\"supplier\":false}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("counterparty.tinTaken"));
        mvc.perform(json(post("/api/counterparties"), accountant,
                        "{\"tin\":\"" + tin() + "\",\"name\":\"Rolsiz\",\"customer\":false,\"supplier\":false}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("counterparty.roleRequired"));
        mvc.perform(json(post("/api/counterparties"), accountant, "{\"tin\":\"12345\",\"name\":\"X\",\"customer\":true,\"supplier\":false}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.tin").isNotEmpty());

        Cookie operator = loginAs("OPERATOR", null);
        mvc.perform(get("/api/counterparties").param("q", "шифо " + tag).cookie(operator))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].match").doesNotExist());
        // Aloqa shaxsi jadvalda ko'rinmaydi — «topilgan joy» qator ostida
        mvc.perform(get("/api/counterparties").param("q", "gaybullayev " + tag).cookie(operator))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].match.field").value("CONTACT_PERSON"))
                .andExpect(jsonPath("$.items[0].match.value").value("Gʻaybullayev " + tag));
        mvc.perform(get("/api/counterparties").param("q", "901112233").cookie(operator)).andExpect(jsonPath("$.items[?(@.id == " + id + ")]", hasSize(1)));
        mvc.perform(get("/api/counterparties").param("q", tin).param("role", "SUPPLIER").cookie(operator)).andExpect(jsonPath("$.total").value(0));
        mvc.perform(json(post("/api/counterparties/" + id + "/block"), operator, "{\"reason\":\"X\"}")).andExpect(status().isForbidden());
        // Xarid mijoz kartasini yarata olmaydi (clients.create yo'q), YB kartasini — oladi
        Cookie purchaser = loginAs("PURCHASER", null);
        mvc.perform(json(post("/api/counterparties"), purchaser, "{\"tin\":\"" + tin() + "\",\"name\":\"X\",\"customer\":true,\"supplier\":false}"))
                .andExpect(status().isForbidden());
        mvc.perform(json(post("/api/counterparties"), purchaser, "{\"tin\":\"" + tin() + "\",\"name\":\"YB " + tag + "\",\"customer\":false,\"supplier\":true}"))
                .andExpect(status().isCreated());

        mvc.perform(json(post("/api/counterparties/" + id + "/block"), accountant, "{\"reason\":\"Qarzi muddati o'tgan\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blocked").value(true))
                .andExpect(jsonPath("$.blockedReason").value("Qarzi muddati o'tgan"));
        mvc.perform(get("/api/counterparties").param("q", tin).cookie(operator)).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/counterparties").param("q", tin).param("status", "BLOCKED").cookie(operator)).andExpect(jsonPath("$.total").value(1));
        mvc.perform(post("/api/counterparties/" + id + "/unblock").with(csrf()).cookie(accountant))
                .andExpect(jsonPath("$.blocked").value(false));
    }

    @Test
    void licensesContractsAndBranchTerms() throws Exception {
        long own = branch();
        long other = branch();
        Cookie admin = loginAs("ADMIN", null);
        long id = id(mvc.perform(json(post("/api/counterparties"), admin,
                        "{\"tin\":\"" + tin() + "\",\"name\":\"Pharm Plus\",\"customer\":true,\"supplier\":true}"))
                .andExpect(status().isCreated())
                .andReturn());

        mvc.perform(json(post("/api/counterparties/" + id + "/licenses"), admin,
                        "{\"number\":\"L-0001\",\"kind\":\"Farmatsevtika faoliyati\",\"issuedOn\":\"2025-01-10\",\"validUntil\":\"2030-01-10\",\"controlledAllowed\":true}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.licenses[0].validUntil").value("2030-01-10"));
        mvc.perform(json(post("/api/counterparties/" + id + "/licenses"), admin,
                        "{\"number\":\"L-2\",\"kind\":\"X\",\"issuedOn\":\"2030-01-10\",\"validUntil\":\"2025-01-10\",\"controlledAllowed\":false}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("counterparty.datesOrder"));

        mvc.perform(json(post("/api/counterparties/" + id + "/contracts"), admin,
                        "{\"branchId\":" + own + ",\"number\":\"12/2026\",\"signedOn\":\"2026-01-05\"}"))
                .andExpect(status().isCreated());
        mvc.perform(json(post("/api/counterparties/" + id + "/contracts"), admin,
                        "{\"branchId\":" + other + ",\"number\":\"7/2026\"}"))
                .andExpect(status().isCreated());

        long priceType = jdbc.sql("SELECT id FROM price_type WHERE code = 'PROMO'").query(Long.class).single();
        Cookie manager = loginAs("BRANCH_MANAGER", own);
        mvc.perform(json(put("/api/counterparties/" + id + "/terms/" + own), manager,
                        "{\"creditLimit\":\"15000000\",\"paymentDays\":30,\"priceTypeId\":" + priceType
                                + ",\"minShelfLifeDays\":180,\"supplierPaymentDays\":45,\"defaultPaymentType\":\"TRANSFER\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.terms", hasSize(1)))
                .andExpect(jsonPath("$.terms[0].creditLimit").value("15000000.00"))
                .andExpect(jsonPath("$.terms[0].priceType.name").value("Promo"))
                .andExpect(jsonPath("$.contracts", hasSize(1)));
        // Boshqa filial shartlari — yopiq
        mvc.perform(json(put("/api/counterparties/" + id + "/terms/" + other), manager, "{\"paymentDays\":10}"))
                .andExpect(status().isNotFound());
        mvc.perform(json(put("/api/counterparties/" + id + "/terms/" + own), manager, "{\"creditLimit\":\"12,5\"}"))
                .andExpect(status().isBadRequest());
        // Qayta saqlash — yangilanadi (upsert)
        mvc.perform(json(put("/api/counterparties/" + id + "/terms/" + own), manager, "{\"creditLimit\":\"20000000.50\"}"))
                .andExpect(jsonPath("$.terms[0].creditLimit").value("20000000.50"))
                .andExpect(jsonPath("$.terms[0].paymentDays").doesNotExist());
        // Admin ikkala filialni ko'radi
        mvc.perform(get("/api/counterparties/" + id).cookie(admin))
                .andExpect(jsonPath("$.contracts", hasSize(2)));
        mvc.perform(get("/api/price-types").cookie(manager))
                .andExpect(jsonPath("$", hasSize(8)))
                .andExpect(jsonPath("$[0].base").value(true));
    }

    @Test
    void attachCustomersToPriceType() throws Exception {
        long own = branch();
        long other = branch();
        Cookie admin = loginAs("ADMIN", null);
        String tag = UUID.randomUUID().toString().substring(0, 6);
        long a = id(mvc.perform(json(post("/api/counterparties"), admin, "{\"tin\":\"" + tin() + "\",\"name\":\"Biriktir A " + tag
                + "\",\"customer\":true}")).andExpect(status().isCreated()).andReturn());
        long b = id(mvc.perform(json(post("/api/counterparties"), admin, "{\"tin\":\"" + tin() + "\",\"name\":\"Biriktir B " + tag
                + "\",\"customer\":true}")).andExpect(status().isCreated()).andReturn());
        long supplier = id(mvc.perform(json(post("/api/counterparties"), admin, "{\"tin\":\"" + tin() + "\",\"name\":\"Biriktir YB " + tag
                + "\",\"supplier\":true}")).andExpect(status().isCreated()).andReturn());
        long promo = jdbc.sql("SELECT id FROM price_type WHERE code = 'PROMO'").query(Long.class).single();
        Cookie manager = loginAs("BRANCH_MANAGER", own);
        String body = "{\"branchId\":" + own + ",\"priceTypeId\":" + promo + ",\"attach\":ATT,\"detach\":DET}";
        // Biriktirish: A — shart yo'q edi (yaratiladi), B — ham
        mvc.perform(json(put("/api/counterparties/price-type-customers"), manager, body.replace("ATT", "[" + a + "," + b + "]").replace("DET", "[]")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.changed").value(2));
        mvc.perform(get("/api/counterparties/price-type-customers").param("branchId", String.valueOf(own))
                        .param("priceTypeId", String.valueOf(promo)).param("q", "biriktir " + tag).cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.attached").value(2))
                .andExpect(jsonPath("$.items[0].priceType").value("Promo"));
        // Qayta biriktirish — o'zgarish yo'q; B ni olib tashlash — bazaviyga (NULL)
        mvc.perform(json(put("/api/counterparties/price-type-customers"), manager, body.replace("ATT", "[" + a + "]").replace("DET", "[" + b + "]")))
                .andExpect(jsonPath("$.changed").value(1));
        assertThat(jdbc.sql("SELECT count(*) FROM counterparty_branch_terms WHERE counterparty_id = :c AND branch_id = :b AND price_type_id IS NULL")
                .param("c", b).param("b", own).query(Integer.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT count(*) FROM audit_log WHERE action = 'counterparty.terms' AND entity_id = :c")
                .param("c", String.valueOf(a)).query(Integer.class).single()).isEqualTo(1);
        // Kredit limiti va boshqa shartlar saqlanadi
        mvc.perform(json(put("/api/counterparties/" + a + "/terms/" + own), manager, "{\"creditLimit\":\"500000\",\"priceTypeId\":" + promo + "}"))
                .andExpect(status().isOk());
        long base = jdbc.sql("SELECT id FROM price_type WHERE base").query(Long.class).single();
        mvc.perform(json(put("/api/counterparties/price-type-customers"), manager, "{\"branchId\":" + own + ",\"priceTypeId\":" + base
                        + ",\"attach\":[" + a + "],\"detach\":[]}"))
                .andExpect(jsonPath("$.changed").value(1));
        mvc.perform(get("/api/counterparties/" + a).cookie(manager))
                .andExpect(jsonPath("$.terms[0].creditLimit").value("500000.00"));
        // YB mijoz emas; boshqa filial — yopiq; ruxsatsiz — 403
        mvc.perform(json(put("/api/counterparties/price-type-customers"), manager, body.replace("ATT", "[" + supplier + "]").replace("DET", "[]")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("counterparty.notCustomer"));
        mvc.perform(json(put("/api/counterparties/price-type-customers"), manager,
                        body.replace("\"branchId\":" + own, "\"branchId\":" + other).replace("ATT", "[" + a + "]").replace("DET", "[]")))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/counterparties/price-type-customers").param("branchId", String.valueOf(own))
                        .param("priceTypeId", String.valueOf(promo)).cookie(loginAs("CASHIER", own)))
                .andExpect(status().isForbidden());
    }

    @Test
    void sortingAndExcelExport() throws Exception {
        Cookie admin = loginAs("ADMIN", null);
        String tag = "srt" + UUID.randomUUID().toString().substring(0, 5);
        String[] tins = {tin(), tin(), tin()};
        String[] names = {"Beta " + tag, "Alfa " + tag, "Gamma " + tag};
        for (int i = 0; i < 3; i++) {
            mvc.perform(json(post("/api/counterparties"), admin, "{\"tin\":\"" + tins[i] + "\",\"name\":\"" + names[i]
                            + "\",\"customer\":" + (i < 2) + ",\"supplier\":" + (i > 0) + ",\"phone\":\"+998 90 000 00 0" + i + "\"}"))
                    .andExpect(status().isCreated());
        }
        mvc.perform(get("/api/counterparties").param("q", tag).param("sort", "NAME").param("desc", "true").cookie(admin))
                .andExpect(jsonPath("$.items[*].name").value(contains(names[2], names[0], names[1])));
        mvc.perform(get("/api/counterparties").param("q", tag).cookie(admin))
                .andExpect(jsonPath("$.items[*].name").value(contains(names[1], names[0], names[2])));
        List<String> byTin = new ArrayList<>(List.of(tins));
        byTin.sort(null);
        mvc.perform(get("/api/counterparties").param("q", tag).param("sort", "TIN").cookie(admin))
                .andExpect(jsonPath("$.items[*].tin").value(contains(byTin.toArray())));
        mvc.perform(get("/api/counterparties").param("q", tag).param("sortByTin", "true").cookie(admin))
                .andExpect(jsonPath("$.items[*].tin").value(contains(byTin.toArray())));
        mvc.perform(get("/api/counterparties").param("q", tag).param("sort", "LICENSE").cookie(admin)).andExpect(status().isOk());
        mvc.perform(get("/api/counterparties").param("q", tag).param("sort", "REGION").param("desc", "true").cookie(admin))
                .andExpect(status().isOk());

        // Operator: mijozlar (clients.contact bor) — telefon ustuni bilan; jami qatori
        Cookie operator = loginAs("OPERATOR", null);
        MvcResult res = mvc.perform(get("/api/counterparties/export").param("q", tag).param("role", "CUSTOMER").cookie(operator))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Disposition", org.hamcrest.Matchers.containsString("mijozlar.xlsx")))
                .andReturn();
        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(res.getResponse().getContentAsByteArray()))) {
            Sheet sheet = wb.getSheetAt(0);
            assertThat(sheet.getRow(0).getCell(5).getStringCellValue()).isEqualTo("Telefon");
            assertThat(sheet.getRow(1).getCell(1).getStringCellValue()).isEqualTo(names[1]);
            assertThat(sheet.getRow(1).getCell(3).getStringCellValue()).isEqualTo("Mijoz, YB");
            assertThat(sheet.getRow(2).getCell(1).getStringCellValue()).isEqualTo(names[0]);
            assertThat(sheet.getRow(2).getCell(3).getStringCellValue()).isEqualTo("Mijoz");
            Row total = sheet.getRow(3);
            assertThat(total.getCell(0).getStringCellValue()).isEqualTo("Jami");
            assertThat(total.getCell(1).getNumericCellValue()).isEqualTo(2.0);
        }
        // Kassir: ikkala tomon ko'rinadi, lekin kontakt ruxsati yo'q — telefon ustuni yo'q
        Cookie cashier = loginAs("CASHIER", null);
        MvcResult all = mvc.perform(get("/api/counterparties/export").param("q", tag).param("sort", "NAME").param("desc", "true").cookie(cashier))
                .andExpect(status().isOk())
                .andReturn();
        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(all.getResponse().getContentAsByteArray()))) {
            Sheet sheet = wb.getSheetAt(0);
            assertThat(sheet.getRow(0).getCell(5).getStringCellValue()).isEqualTo("Litsenziya muddati");
            assertThat(sheet.getRow(1).getCell(1).getStringCellValue()).isEqualTo(names[2]);
            assertThat(sheet.getRow(4).getCell(1).getNumericCellValue()).isEqualTo(3.0);
        }
        // Haydovchida kontragent ko'rish ruxsati yo'q
        mvc.perform(get("/api/counterparties/export").cookie(loginAs("DRIVER", null))).andExpect(status().isForbidden());
    }
}
