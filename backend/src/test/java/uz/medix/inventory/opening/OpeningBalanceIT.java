package uz.medix.inventory.opening;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.io.ByteArrayOutputStream;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;
import uz.medix.TestcontainersConfig;
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.inventory.Warehouses;
import uz.medix.inventory.ZoneType;
import uz.medix.shared.error.MedixException;

/** BQ: qoralama qoldiqqa ta'sir qilmaydi → o'tkazish (partiya + jurnal + qoldiq) → o'zgarmaydi → bekor qilish qoidalari; import. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class OpeningBalanceIT {

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
    StockLedger ledger;

    @Autowired
    TransactionTemplate tx;

    private record Place(long branchId, long warehouseId, long main, long quarantine, long safe) {}

    private Place place() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        Long branch = jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'BQ sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(500_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElse(null);
        if (branch == null) {
            return place();
        }
        long b = branch;
        Warehouses.Warehouse w = tx.execute(s -> warehouses.create(b, "BQ ombor " + code, null, Set.of(ZoneType.SAFE)));
        return new Place(b, w.id(), zone(w, ZoneType.MAIN), zone(w, ZoneType.QUARANTINE), zone(w, ZoneType.SAFE));
    }

    private static long zone(Warehouses.Warehouse w, ZoneType t) {
        return w.zones().stream().filter(z -> z.type() == t).findFirst().orElseThrow().id();
    }

    private record Product(long id, String code) {}

    private Product product(String name, boolean controlled) {
        String code = String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999));
        long id = jdbc.sql("""
                INSERT INTO product (code, name, unit_id, search_text, controlled)
                SELECT :c, :n, id, lower(:n), :ctl FROM unit WHERE short_name = 'dona' RETURNING id""")
                .param("c", code)
                .param("n", name)
                .param("ctl", controlled)
                .query(Long.class)
                .single();
        return new Product(id, code);
    }

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "bq" + UUID.randomUUID().toString().substring(0, 8);
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
            if (h.startsWith("MEDIX_SESSION=")) {
                return new Cookie("MEDIX_SESSION", h.substring("MEDIX_SESSION=".length(), h.indexOf(';')));
            }
        }
        throw new AssertionError("sessiya yo'q");
    }

    private ResultActions send(MockHttpServletRequestBuilder b, Cookie session, String body) throws Exception {
        return mvc.perform(b.with(csrf()).cookie(session).contentType(MediaType.APPLICATION_JSON).content(body))
                .andDo(r -> {
                    if (r.getResponse().getStatus() >= 500) {
                        throw new AssertionError("500: " + r.getResolvedException(), r.getResolvedException());
                    }
                });
    }

    private static long id(MvcResult r) throws Exception {
        return Long.parseLong(r.getResponse().getContentAsString().replaceAll("^\\{\"id\":(\\d+).*", "$1"));
    }

    private static String today() {
        return LocalDate.now(ZoneId.of("Asia/Tashkent")).toString();
    }

    private static String line(long product, long zone, String batch, String expiry, String cost, boolean bonus, int qty) {
        return "{\"productId\":" + product + ",\"zoneId\":" + zone + ",\"batchNumber\":\"" + batch + "\",\"producedOn\":null,\"expiryDate\":\""
                + expiry + "\",\"cost\":\"" + cost + "\",\"bonus\":" + bonus + ",\"qty\":" + qty + "}";
    }

    private static String doc(Place p, String... lines) {
        return "{\"branchId\":" + p.branchId() + ",\"warehouseId\":" + p.warehouseId() + ",\"cutoffDate\":\"" + today()
                + "\",\"note\":\"SmartUp dan\",\"lines\":[" + String.join(",", lines) + "]}";
    }

    private long stock(long zone, long product) {
        return jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_balance WHERE zone_id = :z AND product_id = :p")
                .param("z", zone)
                .param("p", product)
                .query(Long.class)
                .single();
    }

    @Test
    void draftThenPostCreatesBatchesAndStock() throws Exception {
        Place p = place();
        Product a = product("BQ Paracetamol", false);
        Product c = product("BQ Tramadol", true);
        Cookie admin = loginAs("ADMIN", null);

        MvcResult created = send(post("/api/opening-balances"), admin, doc(p,
                        line(a.id(), p.main(), "PR-1", "2028-05-31", "12500.50", false, 100),
                        line(a.id(), p.quarantine(), "pr-1", "2028-05-31", "12500.50", false, 5),
                        line(a.id(), p.main(), "PR-1", "2028-05-31", "999", true, 10),
                        line(c.id(), p.safe(), "TR-9", "2020-01-31", "40000", false, 3)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(matchesPattern("^BQ-[A-Z]{3}-\\d{6}$")))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.lines", hasSize(4)))
                .andExpect(jsonPath("$.lines[2].cost").value("0.00"))
                .andExpect(jsonPath("$.totalQty").value(118))
                .andExpect(jsonPath("$.totalCost").value("1432552.50"))
                .andExpect(jsonPath("$.expiredLines").value(1))
                .andReturn();
        long doc = id(created);
        // Qoralama qoldiqqa ta'sir qilmaydi (SPEC 6-2)
        assertThat(stock(p.main(), a.id())).isZero();

        send(post("/api/opening-balances/" + doc + "/post"), admin, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.postedBy").value("Sinov"))
                .andExpect(jsonPath("$.lines[0].batchId").isNumber());
        assertThat(stock(p.main(), a.id())).isEqualTo(110);
        assertThat(stock(p.quarantine(), a.id())).isEqualTo(5);
        assertThat(stock(p.safe(), c.id())).isEqualTo(3);
        // Bir partiya ikki zonada — bitta partiya yozuvi; bonus — alohida «-B», tannarx 0
        List<String> batches = jdbc.sql("SELECT number || '|' || cost || '|' || source_type FROM batch WHERE product_id = :p ORDER BY id")
                .param("p", a.id())
                .query(String.class)
                .list();
        assertThat(batches).containsExactly("PR-1|12500.50|BQ", "PR-1-B|0.00|BQ");
        long journal = jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_move WHERE doc_type = 'BQ' AND doc_id = :d AND batch_id IN (SELECT batch_id FROM opening_balance_line WHERE opening_id = :d)").param("d", doc).query(Long.class).single();
        assertThat(journal).isEqualTo(118);

        // O'tkazilgan hujjat o'zgarmaydi — API va baza darajasida
        send(put("/api/opening-balances/" + doc), admin, doc(p, line(a.id(), p.main(), "PR-1", "2028-05-31", "1", false, 1)))
                .andExpect(status().isConflict());
        send(post("/api/opening-balances/" + doc + "/post"), admin, "").andExpect(status().isConflict());
        assertThatThrownBy(() -> jdbc.sql("UPDATE opening_balance_line SET qty = 1 WHERE opening_id = :d").param("d", doc).update())
                .hasMessageContaining("faqat qoralamada");
        assertThatThrownBy(() -> jdbc.sql("UPDATE opening_balance SET cutoff_date = cutoff_date - 1 WHERE id = :d").param("d", doc).update())
                .hasMessageContaining("faqat bekor qilish");
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM opening_balance WHERE id = :d").param("d", doc).update())
                .hasMessageContaining("o'chirilmaydi");

        // Qoldig'i bor omborni nofaol qilib bo'lmaydi
        assertThatThrownBy(() -> tx.execute(s -> warehouses.setActive(p.warehouseId(), false, "sinov")))
                .isInstanceOf(MedixException.class)
                .hasFieldOrPropertyWithValue("code", "warehouse.hasStock");

        mvc.perform(get("/api/opening-balances").param("branchId", String.valueOf(p.branchId())).cookie(admin))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].lines").value(4))
                .andExpect(jsonPath("$.items[0].totalQty").value(118));
    }

    @Test
    void rulesAreCheckedPerLine() throws Exception {
        Place p = place();
        Place other = place();
        Product a = product("BQ qoida", false);
        Product c = product("BQ nazorat", true);
        Cookie admin = loginAs("ADMIN", null);

        // Nazoratdagi mahsulot Asosiy zonaga — yo'q (faqat Seyf)
        send(post("/api/opening-balances"), admin, doc(p, line(c.id(), p.main(), "N-1", "2028-01-31", "100", false, 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("opening.lineInvalid"));
        // Bir partiya — har xil yaroqlilik
        send(post("/api/opening-balances"), admin, doc(p,
                        line(a.id(), p.main(), "X-1", "2028-01-31", "100", false, 1),
                        line(a.id(), p.quarantine(), "X-1", "2029-01-31", "100", false, 1)))
                .andExpect(status().isBadRequest());
        // Takror qator
        send(post("/api/opening-balances"), admin, doc(p,
                        line(a.id(), p.main(), "X-1", "2028-01-31", "100", false, 1),
                        line(a.id(), p.main(), "x-1", "2028-01-31", "100", false, 2)))
                .andExpect(status().isBadRequest());
        // Boshqa ombor zonasi
        send(post("/api/opening-balances"), admin, doc(p, line(a.id(), other.main(), "X-1", "2028-01-31", "100", false, 1)))
                .andExpect(status().isBadRequest());
        // Kelajak sana
        send(post("/api/opening-balances"), admin, doc(p, line(a.id(), p.main(), "X-1", "2028-01-31", "100", false, 1))
                        .replace(today(), LocalDate.parse(today()).plusDays(1).toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("opening.futureDate"));
        // Bo'sh qoralama saqlanadi, lekin o'tkazilmaydi
        long empty = id(send(post("/api/opening-balances"), admin, doc(p)).andExpect(status().isCreated()).andReturn());
        send(post("/api/opening-balances/" + empty + "/post"), admin, "")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("opening.noLines"));
        // O'tkazilmagan qoralama bor omborni nofaol qilib bo'lmaydi
        assertThatThrownBy(() -> tx.execute(s -> warehouses.setActive(p.warehouseId(), false, "sinov")))
                .hasFieldOrPropertyWithValue("code", "warehouse.hasDrafts");
        send(post("/api/opening-balances/" + empty + "/cancel"), admin, "{\"reason\":\"xato\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        tx.execute(s -> warehouses.setActive(p.warehouseId(), false, "sinov"));
    }

    @Test
    void permissionsAndBranchScope() throws Exception {
        Place p = place();
        Place other = place();
        Product a = product("BQ ruxsat", false);
        Cookie admin = loginAs("ADMIN", null);
        long doc = id(send(post("/api/opening-balances"), admin, doc(p, line(a.id(), p.main(), "R-1", "2028-01-31", "100", false, 1)))
                .andExpect(status().isCreated())
                .andReturn());

        // Buxgalter: yaratish bor, lekin tovar qoldig'i (opening.goods) yo'q
        Cookie accountant = loginAs("ACCOUNTANT", p.branchId()); // E3: Buxgalter — o'z filiali
        send(post("/api/opening-balances"), accountant, doc(p)).andExpect(status().isForbidden());
        mvc.perform(get("/api/opening-balances/" + doc).cookie(accountant)).andExpect(status().isOk());
        // Ombor mudiri — BQ ko'rmaydi
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        mvc.perform(get("/api/opening-balances").cookie(keeper)).andExpect(status().isForbidden());
        // Boshqa filial rahbari — hujjat «yo'q»
        Cookie otherManager = loginAs("BRANCH_MANAGER", other.branchId());
        mvc.perform(get("/api/opening-balances/" + doc).cookie(otherManager)).andExpect(status().isNotFound());
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        mvc.perform(get("/api/opening-balances/" + doc).cookie(manager)).andExpect(status().isOk());
        send(post("/api/opening-balances/" + doc + "/post"), manager, "").andExpect(status().isForbidden());
    }

    @Test
    void cancelPostedOnlyByDirectorAndOnlyIfUnused() throws Exception {
        Place p = place();
        Product a = product("BQ bekor", false);
        Cookie admin = loginAs("ADMIN", null);
        Cookie director = loginAs("DIRECTOR", null);
        long doc = id(send(post("/api/opening-balances"), admin, doc(p, line(a.id(), p.main(), "C-1", "2028-01-31", "100", false, 7)))
                .andReturn());
        send(post("/api/opening-balances/" + doc + "/post"), admin, "").andExpect(status().isOk());

        send(post("/api/opening-balances/" + doc + "/cancel"), admin, "{\"reason\":\"xato\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("opening.cancelPostedForbidden"));
        send(post("/api/opening-balances/" + doc + "/cancel"), director, "{\"reason\":\"  \"}").andExpect(status().isBadRequest());

        // Partiyadan sotilgan bo'lsa — bekor qilinmaydi
        long batch = jdbc.sql("SELECT batch_id FROM opening_balance_line WHERE opening_id = :d").param("d", doc).query(Long.class).single();
        tx.executeWithoutResult(s -> ledger.post(new DocRef("SV", 1, "SV-TST-000001"), List.of(Move.out(p.main(), batch, 1))));
        send(post("/api/opening-balances/" + doc + "/cancel"), director, "{\"reason\":\"xato\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("opening.batchUsed"));

        long doc2 = id(send(post("/api/opening-balances"), admin, doc(p, line(a.id(), p.main(), "C-2", "2028-01-31", "100", false, 4)))
                .andReturn());
        send(post("/api/opening-balances/" + doc2 + "/post"), admin, "").andExpect(status().isOk());
        assertThat(stock(p.main(), a.id())).isEqualTo(10);
        send(post("/api/opening-balances/" + doc2 + "/cancel"), director, "{\"reason\":\"Ikki marta kiritilgan\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.cancelReason").value("Ikki marta kiritilgan"));
        assertThat(stock(p.main(), a.id())).isEqualTo(6);
        // Tarix (prototip OpeningDoc «Tarix»): yaratildi → tasdiqlandi → bekor qilindi (sabab bilan)
        mvc.perform(get("/api/opening-balances/" + doc2 + "/history").cookie(director))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[0].action").value("opening.create"))
                .andExpect(jsonPath("$[1].action").value("opening.post"))
                .andExpect(jsonPath("$[2].action").value("opening.cancel"))
                .andExpect(jsonPath("$[2].reason").value("Ikki marta kiritilgan"));
        // Jurnal: kirim va bekor qilish chiqimi saqlanadi (faqat qo'shiladi)
        assertThat(jdbc.sql("SELECT string_agg(qty::text, ',' ORDER BY id) FROM stock_move WHERE doc_type = 'BQ' AND doc_id = :d AND batch_id IN (SELECT batch_id FROM opening_balance_line WHERE opening_id = :d)")
                        .param("d", doc2).query(String.class).single())
                .isEqualTo("4,-4");
        assertThatThrownBy(() -> jdbc.sql("UPDATE opening_balance SET note = 'x' WHERE id = :d").param("d", doc2).update())
                .hasMessageContaining("bekor qilingan");
    }

    private static byte[] xlsx(String[]... rows) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet s = wb.createSheet();
            for (int i = 0; i < rows.length; i++) {
                Row r = s.createRow(i);
                for (int j = 0; j < rows[i].length; j++) {
                    r.createCell(j).setCellValue(rows[i][j]);
                }
            }
            wb.write(out);
            return out.toByteArray();
        }
    }

    @Test
    void importReplacesDraftLinesAllOrNothing() throws Exception {
        Place p = place();
        Product a = product("BQ import A", false);
        Product b = product("BQ import B", false);
        Cookie admin = loginAs("ADMIN", null);
        long doc = id(send(post("/api/opening-balances"), admin, doc(p, line(a.id(), p.main(), "OLD", "2028-01-31", "1", false, 1)))
                .andReturn());
        String[] header = {"Mahsulot kodi", "Zona", "Partiya", "Yaroqlilik", "Tannarx", "Soni", "Bonus"};

        byte[] bad = xlsx(header,
                new String[] {a.code(), "", "I-1", "31.05.2028", "12 500,50", "10", ""},
                new String[] {"99999999", "", "I-2", "05.2028", "100", "1", ""},
                new String[] {b.code(), "Karantin", "I-3", "2028-13-01", "100", "1", ""});
        mvc.perform(multipart("/api/opening-balances/" + doc + "/import").file(new MockMultipartFile("file", "bq.xlsx", null, bad))
                        .param("apply", "true").with(csrf()).cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(false))
                .andExpect(jsonPath("$.errors", hasSize(2)))
                .andExpect(jsonPath("$.errors[0].row").value(3))
                .andExpect(jsonPath("$.errors[1].row").value(4));
        mvc.perform(get("/api/opening-balances/" + doc).cookie(admin)).andExpect(jsonPath("$.lines[0].batchNumber").value("OLD"));

        byte[] good = xlsx(header,
                new String[] {a.code(), "", "I-1", "31.05.2028", "12.500,50", "10", ""},
                new String[] {b.code(), "karantin", "I-3", "05.2028", "", "2", "ha"});
        mvc.perform(multipart("/api/opening-balances/" + doc + "/import").file(new MockMultipartFile("file", "bq.xlsx", null, good))
                        .param("apply", "true").with(csrf()).cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(true))
                .andExpect(jsonPath("$.errors", hasSize(0)));
        mvc.perform(get("/api/opening-balances/" + doc).cookie(admin))
                .andExpect(jsonPath("$.source").value("IMPORT"))
                .andExpect(jsonPath("$.fileName").value("bq.xlsx"))
                .andExpect(jsonPath("$.lines", hasSize(2)))
                .andExpect(jsonPath("$.lines[0].cost").value("12500.50"))
                .andExpect(jsonPath("$.lines[0].zoneType").value("MAIN"))
                .andExpect(jsonPath("$.lines[1].zoneType").value("QUARANTINE"))
                .andExpect(jsonPath("$.lines[1].expiryDate").value("2028-05-31"))
                .andExpect(jsonPath("$.lines[1].bonus").value(true));
    }
}
