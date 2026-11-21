package uz.yuzplus.integration.opening;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionTemplate;
import uz.yuzplus.TestcontainersConfig;
import uz.yuzplus.inventory.Warehouses;
import uz.yuzplus.inventory.ZoneType;

/** BQ1: bitta fayl → tekshirish → qoralamalar → (qayta yuklash — almashtiriladi) → o'tkazish → takror — xato; ruxsatlar. */
@SpringBootTest(properties = "yuzplus.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class OpeningImportIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    Warehouses warehouses;

    @Autowired
    TransactionTemplate tx;

    private record Place(long branchId, String code, long warehouseId, String warehouse, long main) {}

    private Place place() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Shifo Dori' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        Long branch = jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'BQ1 sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(600_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElse(null);
        if (branch == null) {
            return place();
        }
        long b = branch;
        String name = "BQ1 ombor " + code;
        Warehouses.Warehouse w = tx.execute(s -> warehouses.create(b, name, null, Set.of()));
        long main = w.zones().stream().filter(z -> z.type() == ZoneType.MAIN).findFirst().orElseThrow().id();
        return new Place(b, code, w.id(), name, main);
    }

    private record Product(long id, String code, String name) {}

    private Product product() {
        String code = String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999));
        String name = "BQ1 dori " + UUID.randomUUID().toString().substring(0, 8);
        long id = jdbc.sql("""
                INSERT INTO product (code, name, unit_id, search_text)
                SELECT :c, :n, id, lower(:n) FROM unit WHERE short_name = 'dona' RETURNING id""")
                .param("c", code)
                .param("n", name)
                .query(Long.class)
                .single();
        return new Product(id, code, name);
    }

    private record Party(long id, String tin) {}

    private Party party(boolean supplier) {
        String tin = String.valueOf(700_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L));
        long id = jdbc.sql("INSERT INTO counterparty (tin, name, is_customer, is_supplier) VALUES (:t, :n, :c, :s) RETURNING id")
                .param("t", tin)
                .param("n", "BQ1 kontragent " + UUID.randomUUID().toString().substring(0, 6))
                .param("c", !supplier)
                .param("s", supplier)
                .query(Long.class)
                .single();
        return new Party(id, tin);
    }

    private record Account(long id, String name) {}

    private Account cash(long branch) {
        String code = "Q1" + UUID.randomUUID().toString().substring(0, 8);
        String name = "Kassa " + code;
        long id = jdbc.sql("INSERT INTO money_account (branch_id, kind, code, name) VALUES (:b, 'CASH', :c, :n) RETURNING id")
                .param("b", branch)
                .param("c", code)
                .param("n", name)
                .query(Long.class)
                .single();
        return new Account(id, name);
    }

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "bqi" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :login, 'Sinov', id, :b, :hash, false FROM role WHERE code = :role""")
                .param("login", login)
                .param("b", branchId)
                .param("hash", encoder.encode(PASSWORD))
                .param("role", role)
                .update();
        MvcResult r = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
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

    private static String today() {
        return LocalDate.now(ZoneId.of("Asia/Tashkent")).toString();
    }

    private static byte[] workbook(List<List<String>> goods, List<List<String>> customers, List<List<String>> suppliers, List<List<String>> money)
            throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            sheet(wb, "Tovar", List.of("Филиал", "Склад", "Код", "Наименование", "Серия", "Срок годности", "Себестоимость", "Количество"), goods);
            sheet(wb, "Mijozlar qarzi", List.of("Filial", "STIR", "Mijoz", "Summa", "Toʻlov muddati", "Asos №"), customers);
            sheet(wb, "YB qarzi", List.of("Filial", "STIR", "Yetkazib beruvchi", "Summa"), suppliers);
            sheet(wb, "Kassa va bank", List.of("Filial", "Hisob", "Summa"), money);
            wb.write(out);
            return out.toByteArray();
        }
    }

    private static void sheet(XSSFWorkbook wb, String name, List<String> header, List<List<String>> rows) {
        if (rows.isEmpty()) {
            return;
        }
        Sheet s = wb.createSheet(name);
        List<List<String>> all = new java.util.ArrayList<>();
        all.add(header);
        all.addAll(rows);
        for (int i = 0; i < all.size(); i++) {
            Row r = s.createRow(i);
            for (int c = 0; c < all.get(i).size(); c++) {
                r.createCell(c).setCellValue(all.get(i).get(c));
            }
        }
    }

    private ResultActions upload(String path, Cookie session, byte[] file, boolean post) throws Exception {
        MockMultipartFile f = new MockMultipartFile("file", "smartup.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file);
        return mvc.perform(multipart("/api/opening-import/" + path).file(f).param("cutoffDate", today()).param("post", String.valueOf(post))
                        .with(csrf()).cookie(session))
                .andDo(r -> {
                    if (r.getResponse().getStatus() >= 500) {
                        throw new AssertionError("500: " + r.getResolvedException(), r.getResolvedException());
                    }
                });
    }

    private long stock(long zone, long product) {
        return jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_balance WHERE zone_id = :z AND product_id = :p")
                .param("z", zone)
                .param("p", product)
                .query(Long.class)
                .single();
    }

    @Test
    void oneFileCreatesDraftsReplacesThemAndPostsEverything() throws Exception {
        Place p = place();
        Product a = product();
        Product b = product();
        Party customer = party(false);
        Party supplier = party(true);
        Account cash = cash(p.branchId());
        Cookie admin = loginAs("ADMIN", null);

        byte[] first = workbook(
                List.of(List.of(p.code(), p.warehouse(), a.code(), "", "PR-1", "30.09.2028", "12 500,00", "100"),
                        List.of(p.code(), p.warehouse(), "", b.name(), "IB-7", "09.2020", "8000", "5")),
                List.of(List.of(p.code(), customer.tin(), "", "15 000 000,00", "15.12.2026", "SU-1")),
                List.of(List.of(p.code(), supplier.tin(), "", "-500000")),
                List.of(List.of(p.code(), cash.name(), "3500000")));

        upload("preview", admin, first, false)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canApply").value(true))
                .andExpect(jsonPath("$.errors", hasSize(0)))
                .andExpect(jsonPath("$.warnings[0].sheet").value("Tovar"))
                .andExpect(jsonPath("$.warnings[0].row").value(3))
                .andExpect(jsonPath("$.groups", hasSize(4)))
                .andExpect(jsonPath("$.sections[0].section").value("GOODS"))
                .andExpect(jsonPath("$.sections[0].rows").value(2))
                .andExpect(jsonPath("$.sections[0].qty").value(105))
                .andExpect(jsonPath("$.sections[0].amount").value("1290000.00"))
                .andExpect(jsonPath("$.sections[1].amount").value("15000000.00"))
                .andExpect(jsonPath("$.groups[0].existing").value("NONE"));
        // Ko'rib chiqish hech narsa yozmaydi
        assertThat(jdbc.sql("SELECT count(*) FROM opening_balance WHERE warehouse_id = :w").param("w", p.warehouseId()).query(Long.class).single())
                .isZero();

        MvcResult drafts = upload("apply", admin, first, false)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.posted").value(false))
                .andExpect(jsonPath("$.documents", hasSize(4)))
                .andReturn();
        int goodsDoc = JsonPath.read(drafts.getResponse().getContentAsString(), "$.documents[0].id");
        assertThat(stock(p.main(), a.id())).isZero();
        assertThat(jdbc.sql("SELECT source FROM opening_balance WHERE id = :id").param("id", goodsDoc).query(String.class).single()).isEqualTo("IMPORT");

        // Qayta yuklash: qoralamalar almashtiriladi (yangi hujjat yaratilmaydi) va hammasi o'tkaziladi
        byte[] second = workbook(
                List.of(List.of(p.code(), p.warehouse(), a.code(), "", "PR-1", "30.09.2028", "12500", "110")),
                List.of(List.of(p.code(), customer.tin(), "", "15000000", "", "")),
                List.of(List.of(p.code(), supplier.tin(), "", "-500000")),
                List.of(List.of(p.code(), cash.name(), "3500000")));
        upload("preview", admin, second, false).andExpect(jsonPath("$.groups[0].existing").value("DRAFT"));
        upload("apply", admin, second, true)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.posted").value(true))
                .andExpect(jsonPath("$.documents[0].id").value(goodsDoc));
        assertThat(jdbc.sql("SELECT count(*) FROM opening_balance WHERE warehouse_id = :w").param("w", p.warehouseId()).query(Long.class).single())
                .isEqualTo(1);
        assertThat(stock(p.main(), a.id())).isEqualTo(110);
        assertThat(stock(p.main(), b.id())).isZero();
        assertThat(jdbc.sql("SELECT coalesce(sum(amount), 0) FROM party_ledger WHERE counterparty_id = :c AND doc_type = 'BQ'")
                .param("c", customer.id()).query(BigDecimal.class).single()).isEqualByComparingTo("15000000");
        assertThat(jdbc.sql("SELECT coalesce(sum(amount), 0) FROM party_ledger WHERE counterparty_id = :c AND doc_type = 'BQ'")
                .param("c", supplier.id()).query(BigDecimal.class).single()).isEqualByComparingTo("-500000");
        assertThat(jdbc.sql("SELECT balance FROM money_account WHERE id = :a").param("a", cash.id()).query(BigDecimal.class).single())
                .isEqualByComparingTo("3500000");

        // Takror: o'tkazilgan — xato, hech narsa o'zgarmaydi
        upload("preview", admin, second, false)
                .andExpect(jsonPath("$.canApply").value(false))
                .andExpect(jsonPath("$.errors[*].sheet", hasItem("Tovar")))
                .andExpect(jsonPath("$.errors[*].sheet", hasItem("Kassa va bank")));
        upload("apply", admin, second, true).andExpect(status().isBadRequest());
        assertThat(stock(p.main(), a.id())).isEqualTo(110);
    }

    @Test
    void rowErrorsPointToSheetAndRowAndNothingIsWritten() throws Exception {
        Place p = place();
        Product a = product();
        Party supplier = party(true);
        Cookie admin = loginAs("ADMIN", null);

        byte[] file = workbook(
                List.of(List.of(p.code(), p.warehouse(), "99999999", "", "X-1", "30.09.2028", "100", "1"),
                        List.of(p.code(), p.warehouse(), a.code(), "", "X-2", "ertaga", "100", "1"),
                        List.of(p.code(), "Yoʻq ombor", a.code(), "", "X-3", "30.09.2028", "100", "1"),
                        List.of(p.code(), p.warehouse(), a.code(), "", "X-4", "30.09.2028", "100", "1,5")),
                List.of(List.of(p.code(), supplier.tin(), "", "1000", "", ""), List.of("Yoʻq filial", "", "Nomaʼlum", "1000", "", "")),
                List.of(),
                List.of());
        upload("preview", admin, file, false)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canApply").value(false))
                .andExpect(jsonPath("$.errors", hasSize(6)))
                .andExpect(jsonPath("$.errors[0].row").value(2))
                .andExpect(jsonPath("$.errors[0].message", containsString("99999999")))
                .andExpect(jsonPath("$.errors[1].message", containsString("ertaga")))
                .andExpect(jsonPath("$.errors[2].message", containsString("Yoʻq ombor")))
                .andExpect(jsonPath("$.errors[3].row").value(5))
                // YB mijoz varag'ida — tur mos emas
                .andExpect(jsonPath("$.errors[4].sheet").value("Mijozlar qarzi"))
                .andExpect(jsonPath("$.errors[5].message", containsString("Yoʻq filial")));
        upload("apply", admin, file, false).andExpect(status().isBadRequest());
        assertThat(jdbc.sql("SELECT count(*) FROM opening_balance WHERE warehouse_id = :w").param("w", p.warehouseId()).query(Long.class).single())
                .isZero();
    }

    @Test
    void permissionsAndBranchScope() throws Exception {
        Place p = place();
        Place other = place();
        Product a = product();
        byte[] file = workbook(List.of(List.of(p.code(), p.warehouse(), a.code(), "", "P-1", "30.09.2028", "100", "1")), List.of(), List.of(),
                List.of());

        // Buxgalter: BQ yaratadi, lekin tovar qoldig'i (opening.goods) yo'q — tovar varag'i xato
        Cookie accountant = loginAs("ACCOUNTANT", p.branchId());
        upload("preview", accountant, file, false)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canApply").value(false))
                .andExpect(jsonPath("$.errors[0].sheet").value("Tovar"));
        // Boshqa filial buxgalteri — filial «topilmadi»; o'z filialida qoralama yaratadi, lekin o'tkaza olmaydi (opening.approve yo'q)
        Party customer = party(false);
        Cookie stranger = loginAs("ACCOUNTANT", other.branchId());
        byte[] debt = workbook(List.of(), List.of(List.of(p.code(), customer.tin(), "", "1000", "", "")), List.of(), List.of());
        upload("preview", stranger, debt, false)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors[0].message", containsString(p.code())));
        upload("preview", accountant, debt, false).andExpect(jsonPath("$.canApply").value(true));
        upload("apply", accountant, debt, true).andExpect(status().isForbidden());
        upload("apply", accountant, debt, false).andExpect(status().isOk()).andExpect(jsonPath("$.documents[0].section").value("CUSTOMER_DEBT"));
        // Ombor mudiri — ruxsat yo'q
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        upload("preview", keeper, file, false).andExpect(status().isForbidden());
        mvc.perform(get("/api/opening-import/template").cookie(keeper)).andExpect(status().isForbidden());
        Cookie admin = loginAs("ADMIN", null);
        mvc.perform(get("/api/opening-import/template").cookie(admin)).andExpect(status().isOk());
    }
}
