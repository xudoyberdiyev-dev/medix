package uz.medix.purchasing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;
import uz.medix.TestcontainersConfig;
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.inventory.Warehouses;
import uz.medix.inventory.ZoneType;

/** KR: qoralama → qabul (farq sababi, Qabul zonasi) → o'tkazish (zonalar, Karantin, qarz, to'lov kuni) → bekor qilish qoidalari. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ReceiptIT {

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
    @Autowired
    uz.medix.finance.PartyLedger parties;

    @Autowired
    uz.medix.purchasing.receipt.ReceiptReminders reminders;

    private record Place(long branchId, long warehouseId, long receiving, long main, long quarantine, long safe) {}

    private Place place() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        Long branch = jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'KR sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(400_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElse(null);
        if (branch == null) {
            return place();
        }
        long b = branch;
        Warehouses.Warehouse w = tx.execute(s -> warehouses.create(b, "KR ombor " + code, null, Set.of(ZoneType.SAFE)));
        return new Place(b, w.id(), zone(w, ZoneType.RECEIVING), zone(w, ZoneType.MAIN), zone(w, ZoneType.QUARANTINE), zone(w, ZoneType.SAFE));
    }

    private static long zone(Warehouses.Warehouse w, ZoneType t) {
        return w.zones().stream().filter(z -> z.type() == t).findFirst().orElseThrow().id();
    }

    private long supplier(long branchId, Integer days) {
        long id = jdbc.sql("INSERT INTO counterparty (tin, name, is_supplier) VALUES (:t, :n, true) RETURNING id")
                .param("t", String.valueOf(200_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .param("n", "YB " + UUID.randomUUID().toString().substring(0, 6))
                .query(Long.class)
                .single();
        if (days != null) {
            jdbc.sql("INSERT INTO counterparty_branch_terms (counterparty_id, branch_id, supplier_payment_days) VALUES (:c, :b, :d)")
                    .param("c", id)
                    .param("b", branchId)
                    .param("d", days)
                    .update();
        }
        return id;
    }

    private long product(String name, boolean controlled) {
        return jdbc.sql("""
                INSERT INTO product (code, name, unit_id, search_text, controlled)
                SELECT :c, :n, id, lower(:n), :ctl FROM unit WHERE short_name = 'dona' RETURNING id""")
                .param("c", String.valueOf(10_000_000 + ThreadLocalRandom.current().nextInt(89_999_999)))
                .param("n", name)
                .param("ctl", controlled)
                .query(Long.class)
                .single();
    }

    private Cookie loginAs(String role, Long branchId) throws Exception {
        String login = "kr" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :login, 'Sinov ' || :role, id, :b, :hash, false FROM role WHERE code = :role""")
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
        return ((Number) JsonPath.read(r.getResponse().getContentAsString(), "$.id")).longValue();
    }

    private static List<Integer> lineIds(MvcResult r) throws Exception {
        return JsonPath.read(r.getResponse().getContentAsString(), "$.lines[*].id");
    }

    private static LocalDate today() {
        return LocalDate.now(ZoneId.of("Asia/Tashkent"));
    }

    private static String line(long product, String batch, long zone, int qty, int bonus, String price) {
        return "{\"productId\":" + product + ",\"batchNumber\":\"" + batch + "\",\"expiryDate\":\"2028-06-30\",\"zoneId\":" + zone
                + ",\"qty\":" + qty + ",\"bonusQty\":" + bonus + ",\"price\":" + (price == null ? "null" : "\"" + price + "\"") + "}";
    }

    private static String doc(Place p, long supplier, boolean prepaid, String... lines) {
        return "{\"warehouseId\":" + p.warehouseId() + ",\"supplierId\":" + supplier + ",\"receiptDate\":\"" + today()
                + "\",\"invoiceNumber\":\"F-77\",\"paymentType\":\"TRANSFER\",\"prepaid\":" + prepaid
                + ",\"discountKind\":\"PERCENT\",\"discountValue\":\"3\",\"lines\":[" + String.join(",", lines) + "]}";
    }

    private long stock(long zone, long product) {
        return jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_balance WHERE zone_id = :z AND product_id = :p")
                .param("z", zone).param("p", product).query(Long.class).single();
    }

    private String debt(long branch, long supplier) {
        return jdbc.sql("SELECT coalesce(sum(amount), 0)::text FROM party_ledger WHERE branch_id = :b AND counterparty_id = :c AND side = 'SUPPLIER'")
                .param("b", branch).param("c", supplier).query(String.class).single();
    }

    @Test
    void draftAcceptPostWithDiffAndDebt() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), 30);
        long a = product("KR Ibuprofen", false);
        long c = product("KR Morfin", true);
        Cookie purchaser = loginAs("PURCHASER", p.branchId());
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());

        // Nazoratdagi mahsulot Asosiy zonaga — yo'q
        send(post("/api/receipts"), purchaser, doc(p, sup, false, line(c, "M-1", p.main(), 1, 0, "100")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("receipt.controlledZone"));

        MvcResult created = send(post("/api/receipts"), purchaser, doc(p, sup, false,
                        line(a, "IB-1", p.main(), 10, 1, "15000.50"), line(c, "M-1", p.safe(), 4, 0, "200000")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(matchesPattern("^KR-[A-Z]{3}-\\d{6}$")))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.dueDate").value(today().plusDays(30).toString()))
                .andExpect(jsonPath("$.dueManual").value(false))
                .andExpect(jsonPath("$.amount").value("950005.00"))
                .andExpect(jsonPath("$.totalBonusQty").value(1))
                .andReturn();
        long doc = id(created);
        List<Integer> lines = lineIds(created);
        assertThat(stock(p.receiving(), a)).isZero();

        // Ombor mudiri narxni ko'rmaydi va narxli qoralamani tahrirlamaydi
        mvc.perform(get("/api/receipts/" + doc).cookie(keeper))
                .andExpect(jsonPath("$.pricesVisible").value(false))
                .andExpect(jsonPath("$.hasPrices").value(true))
                .andExpect(jsonPath("$.lines[0].price").doesNotExist())
                .andExpect(jsonPath("$.amount").doesNotExist())
                .andExpect(jsonPath("$.supplierBalance").doesNotExist());
        send(put("/api/receipts/" + doc), keeper, doc(p, sup, false, line(a, "IB-1", p.main(), 10, 1, null)))
                .andExpect(status().isForbidden());

        // Farq bor — sabab majburiy va soniga mos
        String noReason = "{\"lines\":[{\"lineId\":" + lines.get(0) + ",\"receivedQty\":8,\"damagedQty\":0},{\"lineId\":" + lines.get(1)
                + ",\"receivedQty\":4,\"damagedQty\":0}]}";
        send(post("/api/receipts/" + doc + "/accept"), keeper, noReason)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("receipt.diffReasonRequired"));
        send(post("/api/receipts/" + doc + "/accept"), keeper, noReason.replace("\"damagedQty\":0}", "\"damagedQty\":0,\"diffReason\":\"EXCESS\"}"))
                .andExpect(status().isBadRequest());
        // 9 yaroqli + 1 shikastlangan; ikkinchi qator to'liq
        String ok = "{\"lines\":[{\"lineId\":" + lines.get(0) + ",\"receivedQty\":9,\"damagedQty\":1,\"diffReason\":\"DAMAGED\"},{\"lineId\":"
                + lines.get(1) + ",\"receivedQty\":4,\"damagedQty\":0}]}";
        send(post("/api/receipts/" + doc + "/accept"), keeper, ok)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.hasDiff").value(true))
                .andExpect(jsonPath("$.lines[0].bonusBatch").value("IB-1-B"))
                // Prototip `DocumentLinesGrid`: mahsulot belgilari va QQS stavkasi qatorda
                .andExpect(jsonPath("$.lines[0].controlled").isBoolean())
                .andExpect(jsonPath("$.lines[0].marked").isBoolean())
                .andExpect(jsonPath("$.lines[0].vatRate").isString());
        // Bildirishnoma: o'tkazish kutmoqda — kirim muallifiga (Xarid)
        assertThat(jdbc.sql("""
                SELECT count(*) FROM notification n JOIN receipt r ON r.created_by = n.employee_id
                WHERE n.dedup_key = :d AND r.id = :id""").param("d", "receipt.accepted:" + doc).param("id", doc).query(Integer.class).single())
                .isEqualTo(1);
        // Qabul zonasida, sotuvga yopiq; qarz yo'q
        assertThat(stock(p.receiving(), a)).isEqualTo(11);
        assertThat(stock(p.main(), a)).isZero();
        assertThat(debt(p.branchId(), sup)).isEqualTo("0");
        assertThatThrownBy(() -> jdbc.sql("UPDATE receipt_line SET qty = 1 WHERE receipt_id = :d").param("d", doc).update())
                .hasMessageContaining("faqat qoralamada");

        // O'tkazish: qaror majburiy; keyin zonalar va qarz
        send(post("/api/receipts/" + doc + "/post"), manager, "{}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("receipt.resolutionRequired"));
        send(post("/api/receipts/" + doc + "/post"), keeper, "{\"resolution\":\"ACTUAL\"}").andExpect(status().isForbidden());
        send(post("/api/receipts/" + doc + "/post"), manager, "{\"resolution\":\"DOCUMENT\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.resolution").value("DOCUMENT"))
                .andExpect(jsonPath("$.debtAmount").value("950005.00"))
                .andExpect(jsonPath("$.supplierBalance").value("950005.00"));
        assertThat(stock(p.receiving(), a)).isZero();
        assertThat(stock(p.main(), a)).isEqualTo(10); // 9 + 1 bonus
        assertThat(stock(p.quarantine(), a)).isEqualTo(1);
        assertThat(stock(p.safe(), c)).isEqualTo(4);
        assertThat(debt(p.branchId(), sup)).isEqualTo("950005.00");

        // Kirim sahifasi: hujjat bo'yicha ochiq qoldiq, «To'langan» belgisi va tarix (audit)
        mvc.perform(get("/api/receipts/" + doc).cookie(manager)).andExpect(jsonPath("$.openAmount").value("950005.00"));
        mvc.perform(get("/api/receipts/" + doc).cookie(keeper)).andExpect(jsonPath("$.openAmount").value(org.hamcrest.Matchers.nullValue()));
        String krNo = jdbc.sql("SELECT number FROM receipt WHERE id = :d").param("d", doc).query(String.class).single();
        mvc.perform(get("/api/receipts").param("q", krNo).cookie(manager))
                .andExpect(jsonPath("$.items[?(@.id == " + doc + ")].paid").value(org.hamcrest.Matchers.contains(false)));
        tx.executeWithoutResult(st -> parties.record(new uz.medix.finance.PartyLedger.DocRef("TY", 1, "TY-TST-000001"), p.branchId(), sup,
                uz.medix.finance.PartyLedger.Side.SUPPLIER, new uz.medix.shared.money.Money(new java.math.BigDecimal("-950005.00")), null, null,
                new uz.medix.finance.PartyLedger.DocRef("KR", doc, "KR")));
        mvc.perform(get("/api/receipts/" + doc).cookie(manager)).andExpect(jsonPath("$.openAmount").value("0.00"));
        mvc.perform(get("/api/receipts").param("q", krNo).cookie(manager))
                .andExpect(jsonPath("$.items[?(@.id == " + doc + ")].paid").value(org.hamcrest.Matchers.contains(true)));
        mvc.perform(get("/api/receipts/" + doc + "/history").cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].action").value("receipt.create"))
                .andExpect(jsonPath("$[-1].action").value("receipt.post"))
                .andExpect(jsonPath("$[?(@.action == 'receipt.accept')]", hasSize(1)));
        mvc.perform(get("/api/receipts/" + doc + "/history").cookie(loginAs("PICKER", p.branchId()))).andExpect(status().isForbidden());

        // «Mahsulot qo'shish» katalogi: shu YB mahsulotlari, ombordagi qoldiq, oxirgi narx (Ombor mudiriga narxsiz)
        mvc.perform(get("/api/receipts/catalog").param("warehouseId", "" + p.warehouseId()).param("supplierId", "" + sup)
                        .param("supplierOnly", "true").cookie(purchaser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2));
        mvc.perform(get("/api/receipts/catalog").param("warehouseId", "" + p.warehouseId()).param("supplierId", "" + sup)
                        .param("supplierOnly", "true").param("q", "ibuprofen").cookie(purchaser))
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].productId").value((int) a))
                .andExpect(jsonPath("$.items[0].stock").value(11))
                .andExpect(jsonPath("$.items[0].lastPrice").value("15000.50"))
                .andExpect(jsonPath("$.items[0].lastDate").value(today().toString()));
        mvc.perform(get("/api/receipts/catalog").param("warehouseId", "" + p.warehouseId()).param("supplierId", "" + sup)
                        .param("supplierOnly", "true").param("q", "ibuprofen").cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].stock").value(11))
                .andExpect(jsonPath("$.items[0].lastPrice").value(org.hamcrest.Matchers.nullValue()));
        mvc.perform(get("/api/receipts/catalog").param("warehouseId", "" + p.warehouseId()).cookie(loginAs("PICKER", p.branchId())))
                .andExpect(status().isForbidden());
        assertThat(jdbc.sql("SELECT due_date FROM party_ledger WHERE doc_type = 'KR' AND doc_id = :d").param("d", doc).query(LocalDate.class).single())
                .isEqualTo(today().plusDays(30));
        // Partiya tannarxi — faktura narxi; bonus — 0
        assertThat(jdbc.sql("SELECT string_agg(number || ':' || cost, ',' ORDER BY id) FROM batch WHERE product_id = :p").param("p", a)
                        .query(String.class).single())
                .isEqualTo("IB-1:15000.50,IB-1-B:0.00");
        assertThatThrownBy(() -> jdbc.sql("UPDATE receipt SET debt_amount = 1 WHERE id = :d").param("d", doc).update())
                .hasMessageContaining("faqat bekor qilish");

        // Filial rahbari o'tkazilganni bekor qila olmaydi; partiyadan sotilgan bo'lsa Admin ham
        send(post("/api/receipts/" + doc + "/cancel"), manager, "{\"reason\":\"xato\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("receipt.cancelPostedForbidden"));
        long batch = jdbc.sql("SELECT batch_id FROM receipt_line WHERE id = :l").param("l", lines.get(0).longValue()).query(Long.class).single();
        tx.executeWithoutResult(s -> ledger.post(new DocRef("SV", 9, "SV-TST-000009"), List.of(Move.out(p.main(), batch, 1))));
        Cookie admin = loginAs("ADMIN", null);
        send(post("/api/receipts/" + doc + "/cancel"), admin, "{\"reason\":\"xato\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("receipt.batchUsed"));
    }

    @Test
    void cancelPostedReversesStockAndDebt() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), null);
        long a = product("KR bekor", false);
        Cookie admin = loginAs("ADMIN", null);
        MvcResult created = send(post("/api/receipts"), admin, doc(p, sup, false, line(a, "B-1", p.main(), 5, 2, "1000"))).andReturn();
        long doc = id(created);
        // YB sharti yo'q — to'lov kuni = kirim sanasi
        assertThat(jdbc.sql("SELECT due_date FROM receipt WHERE id = :d").param("d", doc).query(LocalDate.class).single()).isEqualTo(today());
        send(post("/api/receipts/" + doc + "/accept"), admin,
                "{\"lines\":[{\"lineId\":" + lineIds(created).getFirst() + ",\"receivedQty\":5,\"damagedQty\":0}]}")
                .andExpect(status().isOk());
        send(post("/api/receipts/" + doc + "/post"), admin, "{}").andExpect(status().isOk()).andExpect(jsonPath("$.debtAmount").value("5000.00"));
        assertThat(stock(p.main(), a)).isEqualTo(7);

        send(post("/api/receipts/" + doc + "/cancel"), admin, "{\"reason\":\"Ikki marta kiritilgan\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(stock(p.main(), a)).isZero();
        assertThat(debt(p.branchId(), sup)).isEqualTo("0.00");
        assertThat(jdbc.sql("SELECT count(*) FROM party_ledger WHERE doc_type = 'KR' AND doc_id = :d").param("d", doc).query(Long.class).single())
                .isEqualTo(2);
    }

    @Test
    void acceptedCanBeCancelledAndPrepaidHasNoDue() throws Exception {
        Place p = place();
        Place other = place();
        long sup = supplier(p.branchId(), 10);
        long a = product("KR oldindan", false);
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        MvcResult created = send(post("/api/receipts"), manager, doc(p, sup, true, line(a, "P-1", p.main(), 3, 0, "500")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.dueDate").doesNotExist())
                .andExpect(jsonPath("$.prepaid").value(true))
                .andReturn();
        long doc = id(created);
        send(post("/api/receipts/" + doc + "/accept"), manager,
                "{\"lines\":[{\"lineId\":" + lineIds(created).getFirst() + ",\"receivedQty\":3,\"damagedQty\":0}]}")
                .andExpect(status().isOk());
        assertThat(stock(p.receiving(), a)).isEqualTo(3);
        send(post("/api/receipts/" + doc + "/cancel"), manager, "{\"reason\":\"YB qaytarib oldi\"}").andExpect(status().isOk());
        assertThat(stock(p.receiving(), a)).isZero();

        // Boshqa filial xodimi ko'rmaydi; Buxgalter yarata olmaydi
        Cookie otherKeeper = loginAs("WAREHOUSE_MANAGER", other.branchId());
        mvc.perform(get("/api/receipts/" + doc).cookie(otherKeeper)).andExpect(status().isNotFound());
        Cookie accountant = loginAs("ACCOUNTANT", p.branchId()); // E3: Buxgalter — o'z filiali
        send(post("/api/receipts"), accountant, doc(p, sup, false, line(a, "P-2", p.main(), 1, 0, "1"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/receipts").param("branchId", String.valueOf(p.branchId())).cookie(accountant))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].status").value("CANCELLED"));
        // .xlsx eksport (T12-audit №4): ro'yxat filtrlari bilan; boshqa filial xodimi — faqat o'z filiali (bo'sh fayl)
        byte[] xlsx = mvc.perform(get("/api/receipts/export").param("branchId", String.valueOf(p.branchId())).cookie(accountant))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .andReturn().getResponse().getContentAsByteArray();
        try (var wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook(new java.io.ByteArrayInputStream(xlsx))) {
            var sheet = wb.getSheetAt(0);
            assertThat(sheet.getRow(2).getCell(0).getStringCellValue()).isEqualTo("Raqam");
            assertThat(sheet.getRow(3).getCell(5).getStringCellValue()).isEqualTo("Bekor qilingan");
        }
        mvc.perform(get("/api/receipts/export").cookie(otherKeeper)).andExpect(status().isOk());
    }

    private String postedReceipt(Cookie who, String body) throws Exception {
        MvcResult created = send(post("/api/receipts"), who, body).andExpect(status().isCreated()).andReturn();
        long doc = id(created);
        StringBuilder accept = new StringBuilder("{\"lines\":[");
        List<Integer> ids = lineIds(created);
        List<Integer> qtys = JsonPath.read(created.getResponse().getContentAsString(), "$.lines[*].qty");
        for (int i = 0; i < ids.size(); i++) {
            accept.append(i == 0 ? "" : ",").append("{\"lineId\":").append(ids.get(i)).append(",\"receivedQty\":").append(qtys.get(i))
                    .append(",\"damagedQty\":0}");
        }
        send(post("/api/receipts/" + doc + "/accept"), who, accept.append("]}").toString()).andExpect(status().isOk());
        return String.valueOf(doc);
    }

    /** Bonus balans yorligʻi (prototip Payables): kirimlar holati, «Bonus berilmadi» — sabab bilan, bir marta, balansga taʼsir yoʻq. */
    @Test
    void bonusReceiptsListAndDecline() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), 15);
        long a = product("KR bonus rad", false);
        Cookie admin = loginAs("ADMIN", null);
        String kr1 = postedReceipt(admin, doc(p, sup, false, line(a, "D1", p.main(), 10, 0, "1000")));
        send(post("/api/receipts/" + kr1 + "/post"), admin, "{}").andExpect(status().isOk());
        String kr2 = postedReceipt(admin, doc(p, sup, false, line(a, "D2", p.main(), 5, 0, "1000")));
        send(post("/api/receipts/" + kr2 + "/post"), admin, "{}").andExpect(status().isOk());

        String r1 = "$.rows[?(@.receiptId == " + kr1 + ")]";
        String r2 = "$.rows[?(@.receiptId == " + kr2 + ")]";
        String bal = "$.balances[?(@.supplierId == " + sup + ")]";
        mvc.perform(get("/api/supplier-bonuses/receipts").param("branchId", "" + p.branchId()).cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.today").exists())
                .andExpect(jsonPath(r1 + ".state").value(contains("PENDING")))
                .andExpect(jsonPath(r1 + ".receiptSum").value(contains("10000.00")))
                .andExpect(jsonPath(r1 + ".amount").value(contains("300.00")))
                .andExpect(jsonPath(r1 + ".percent").value(contains("3")))
                .andExpect(jsonPath(bal + ".pending").value(contains("450.00")))
                .andExpect(jsonPath(bal + ".pendingCount").value(contains(2)));
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        mvc.perform(get("/api/supplier-bonuses/receipts").cookie(keeper)).andExpect(status().isForbidden());
        send(post("/api/receipts/" + kr1 + "/bonus/decline"), keeper, "{\"reason\":\"YB rad etdi\"}").andExpect(status().isForbidden());
        send(post("/api/receipts/" + kr1 + "/bonus/decline"), admin, "{\"reason\":\"  \"}").andExpect(status().isBadRequest());

        send(post("/api/receipts/" + kr1 + "/bonus/decline"), admin, "{\"reason\":\"YB rad etdi\"}").andExpect(status().isOk());
        send(post("/api/receipts/" + kr1 + "/bonus/decline"), admin, "{\"reason\":\"yana\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("receipt.bonusDeclined"));
        send(post("/api/receipts/" + kr1 + "/bonus"), admin, "")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("receipt.bonusDeclined"));
        send(post("/api/receipts/" + kr2 + "/bonus"), admin, "").andExpect(status().isOk());
        send(post("/api/receipts/" + kr2 + "/bonus/decline"), admin, "{\"reason\":\"kech\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("receipt.bonusConfirmed"));

        mvc.perform(get("/api/supplier-bonuses/receipts").cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath(r1 + ".state").value(contains("DECLINED")))
                .andExpect(jsonPath(r1 + ".declineReason").value(contains("YB rad etdi")))
                .andExpect(jsonPath(r2 + ".state").value(contains("CONFIRMED")))
                .andExpect(jsonPath(r2 + ".bnsNumber").value(contains(matchesPattern("^BNS-[A-Z]{2,4}-\\d{6}$"))))
                .andExpect(jsonPath(r2 + ".amount").value(contains("150.00")))
                .andExpect(jsonPath(bal + ".balance").value(contains("150.00")))
                .andExpect(jsonPath(bal + ".pending").value(contains("0.00")))
                .andExpect(jsonPath(bal + ".pendingCount").value(contains(0)));
        // Rad etilgan bonus kutilayotganlarga kirmaydi; balans jurnaliga yozuv yoʻq
        mvc.perform(get("/api/supplier-bonuses/" + sup).param("branchId", "" + p.branchId()).cookie(admin))
                .andExpect(jsonPath("$.pending", hasSize(0)))
                .andExpect(jsonPath("$.moves", hasSize(1)));
        assertThat(jdbc.sql("SELECT count(*) FROM audit_log WHERE action = 'receipt.bonusDecline' AND entity_id = :id").param("id", Long.parseLong(kr1))
                        .query(Long.class).single())
                .isEqualTo(1L);
    }

    /** Ro'yxat (prototip `Receipts`): yorliqlar soni, YB/ombor/sana/qidiruv filtrlari, bonus ustunlari, kartalar, narx yashirinligi. */
    @Test
    void listHasTabsFiltersBonusColumnsAndCards() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), 10);
        long a = product("KR royxat", false);
        Cookie admin = loginAs("ADMIN", null);
        String kr1 = postedReceipt(admin, doc(p, sup, false, line(a, "L1", p.main(), 10, 2, "1000")));
        send(post("/api/receipts/" + kr1 + "/post"), admin, "{}").andExpect(status().isOk());
        String draft = doc(p, sup, false, line(a, "L2", p.main(), 1, 0, "500")).replace("F-77", "YX-ROYXAT-" + sup);
        long kr2 = id(send(post("/api/receipts"), admin, draft).andExpect(status().isCreated()).andReturn());
        String b = "" + p.branchId(), s = "" + sup;

        String one = "$.items[?(@.id == " + kr1 + ")]";
        mvc.perform(get("/api/receipts").param("branchId", b).param("supplierId", s).cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.statuses[0].count").value(2))
                .andExpect(jsonPath("$.statuses[?(@.status == 'POSTED')].count").value(org.hamcrest.Matchers.contains(1)))
                .andExpect(jsonPath("$.statuses[?(@.status == 'DRAFT')].count").value(org.hamcrest.Matchers.contains(1)))
                .andExpect(jsonPath(one + ".bonusAmount").value(org.hamcrest.Matchers.contains("300.00")))
                .andExpect(jsonPath(one + ".bonusQty").value(org.hamcrest.Matchers.contains(2)))
                .andExpect(jsonPath(one + ".bonusConfirmed").value(org.hamcrest.Matchers.contains(false)))
                .andExpect(jsonPath(one + ".paymentType").value(org.hamcrest.Matchers.contains("TRANSFER")))
                .andExpect(jsonPath("$.suppliers[?(@.id == " + sup + ")].count").value(org.hamcrest.Matchers.contains(2)))
                .andExpect(jsonPath("$.kpi.drafts").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.kpi.expectedBonusDocs").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.kpi.bonusGoodsMonth").value(org.hamcrest.Matchers.greaterThanOrEqualTo(2)));
        // Yorliq: faqat qoralamalar; sonlar holat filtrisiz qoladi
        mvc.perform(get("/api/receipts").param("branchId", b).param("supplierId", s).param("status", "DRAFT").cookie(admin))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(kr2))
                .andExpect(jsonPath("$.statuses[0].count").value(2));
        // Qidiruv — yuk xati raqami; ombor va sana filtri; saralash summa bo'yicha
        mvc.perform(get("/api/receipts").param("branchId", b).param("q", "yx-royxat-" + sup).cookie(admin))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(kr2));
        mvc.perform(get("/api/receipts").param("branchId", b).param("supplierId", s).param("warehouseId", "" + p.warehouseId())
                        .param("from", today().toString()).param("to", today().toString()).param("sort", "AMOUNT").param("desc", "true").cookie(admin))
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[0].id").value(Long.parseLong(kr1)));
        mvc.perform(get("/api/receipts").param("branchId", b).param("supplierId", s).param("from", today().plusDays(1).toString()).cookie(admin))
                .andExpect(jsonPath("$.total").value(0));
        // Ombor mudiri narxni ko'rmaydi — bonus summasi va kutilayotgan bonus ham yashirin
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        mvc.perform(get("/api/receipts").param("supplierId", s).cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath(one + ".bonusAmount").value(org.hamcrest.Matchers.contains((Object) null)))
                .andExpect(jsonPath("$.kpi.expectedBonus").doesNotExist());
        // Tasdiqlangan bonus — kutilayotganlardan chiqadi
        send(post("/api/receipts/" + kr1 + "/bonus"), admin, "").andExpect(status().isOk());
        mvc.perform(get("/api/receipts").param("branchId", b).param("supplierId", s).cookie(admin))
                .andExpect(jsonPath(one + ".bonusConfirmed").value(org.hamcrest.Matchers.contains(true)));
    }

    @Test
    void discountBecomesBonusBalanceAndBonusReceiptHasNoDebt() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), 15);
        long a = product("KR bonus", false);
        Cookie admin = loginAs("ADMIN", null);

        // 1) Oddiy kirim, chegirma 3% — qarz kamaymaydi
        String kr1 = postedReceipt(admin, doc(p, sup, false, line(a, "B1", p.main(), 10, 0, "1000")));
        send(post("/api/receipts/" + kr1 + "/post"), admin, "{}").andExpect(jsonPath("$.debtAmount").value("10000.00"));
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        send(post("/api/receipts/" + kr1 + "/bonus"), keeper, "").andExpect(status().isForbidden());
        // Bonus balans sahifasi: tasdiqlanmagan chegirma — «kutilayotgan»
        String row = "$.rows[?(@.supplierId == " + sup + ")]";
        mvc.perform(get("/api/supplier-bonuses").param("branchId", "" + p.branchId()).cookie(keeper)).andExpect(status().isForbidden());
        mvc.perform(get("/api/supplier-bonuses").param("branchId", "" + p.branchId()).cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath(row + ".balance").value(org.hamcrest.Matchers.contains("0.00")))
                .andExpect(jsonPath(row + ".pending").value(org.hamcrest.Matchers.contains("300.00")))
                .andExpect(jsonPath(row + ".pendingCount").value(org.hamcrest.Matchers.contains(1)));
        send(post("/api/receipts/" + kr1 + "/bonus"), admin, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bonusNumber").value(matchesPattern("^BNS-[A-Z]{3}-\\d{6}$")))
                .andExpect(jsonPath("$.bonusAmount").value("300.00"))
                .andExpect(jsonPath("$.bonusBalance").value("300.00"))
                .andExpect(jsonPath("$.supplierBalance").value("10000.00"));
        send(post("/api/receipts/" + kr1 + "/bonus"), admin, "").andExpect(status().isConflict());

        // 2) Bonus balans hisobidan kirim: qarz yo'q, tannarx 0, «-B»
        String bonusDoc = doc(p, sup, false, line(a, "B2", p.main(), 1, 1, "250"))
                .replace("\"discountKind\":\"PERCENT\",\"discountValue\":\"3\",", "\"fromBonus\":true,");
        send(post("/api/receipts"), admin, bonusDoc.replace("\"fromBonus\":true", "\"fromBonus\":true,\"prepaid\":true").replace("\"prepaid\":false,", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("receipt.bonusConflict"));
        String kr2 = postedReceipt(admin, bonusDoc);
        mvc.perform(get("/api/receipts/" + kr2).cookie(admin)).andExpect(jsonPath("$.dueDate").doesNotExist()).andExpect(jsonPath("$.fromBonus").value(true));
        send(post("/api/receipts/" + kr2 + "/post"), admin, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.debtAmount").value("0.00"))
                .andExpect(jsonPath("$.bonusBalance").value("50.00"))
                .andExpect(jsonPath("$.supplierBalance").value("10000.00"));
        assertThat(jdbc.sql("SELECT number || ':' || cost || ':' || bonus FROM batch WHERE product_id = :p AND number LIKE 'B2%'").param("p", a)
                        .query(String.class).list())
                .containsExactly("B2-B:0.00:true");
        assertThat(stock(p.main(), a)).isEqualTo(12);
        mvc.perform(get("/api/supplier-bonuses/" + sup).param("branchId", "" + p.branchId()).cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.balance").value("50.00"))
                .andExpect(jsonPath("$.moves", hasSize(2)))
                .andExpect(jsonPath("$.moves[0].docType").value("BNS"))
                .andExpect(jsonPath("$.moves[0].amount").value("300.00"))
                .andExpect(jsonPath("$.moves[1].amount").value("-250.00"))
                .andExpect(jsonPath("$.moves[1].balance").value("50.00"))
                .andExpect(jsonPath("$.pending", hasSize(0)));
        mvc.perform(get("/api/supplier-bonuses").param("branchId", "" + p.branchId()).param("q", "").cookie(admin))
                .andExpect(jsonPath(row + ".balance").value(org.hamcrest.Matchers.contains("50.00")))
                .andExpect(jsonPath(row + ".pending").value(org.hamcrest.Matchers.contains("0.00")))
                .andExpect(jsonPath(row + ".idleDays").value(org.hamcrest.Matchers.contains(0)));

        // 3) Balans yetmaydi — o'tkazilmaydi
        String kr3 = postedReceipt(admin, bonusDoc.replace("\"B2\"", "\"B3\"").replace("\"250\"", "\"100\""));
        send(post("/api/receipts/" + kr3 + "/post"), admin, "{}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("receipt.bonusInsufficient"));

        // 4) Bonusi ishlatilgan kirimni bekor qilib bo'lmaydi; bonus kirimini bekor qilsa — balans qaytadi
        send(post("/api/receipts/" + kr1 + "/cancel"), admin, "{\"reason\":\"xato\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("receipt.bonusUsed"));
        send(post("/api/receipts/" + kr2 + "/cancel"), admin, "{\"reason\":\"xato\"}").andExpect(status().isOk());
        send(post("/api/receipts/" + kr1 + "/cancel"), admin, "{\"reason\":\"xato\"}").andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT coalesce(sum(amount), 0)::text FROM supplier_bonus_ledger WHERE supplier_id = :s").param("s", sup)
                        .query(String.class).single())
                .isEqualTo("0.00");
        assertThat(debt(p.branchId(), sup)).isEqualTo("0.00");
    }

    @Test
    void dueAndBonusRemindersReachOwnerOnce() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), 3);
        long a = product("KR eslatma", false);
        Cookie admin = loginAs("ADMIN", null);
        Cookie owner = loginAs("PURCHASER", p.branchId());
        long ownerId = jdbc.sql("SELECT max(id) FROM employee WHERE role_id = (SELECT id FROM role WHERE code = 'PURCHASER')").query(Long.class).single();
        String body = doc(p, sup, false, line(a, "E-1", p.main(), 2, 0, "5000"))
                .replace("\"prepaid\":false", "\"prepaid\":false,\"ownerId\":" + ownerId + ",\"discountDate\":\"" + today() + "\"");
        String kr = postedReceipt(admin, body);
        send(post("/api/receipts/" + kr + "/post"), admin, "{}").andExpect(status().isOk());

        // To'lov kuni = bugun + 3 → «3 kundan keyin»; bonus vaqti keldi
        int first = reminders.run(today());
        assertThat(first).isGreaterThanOrEqualTo(2);
        assertThat(reminders.run(today())).isZero();
        MvcResult list = mvc.perform(get("/api/notifications").cookie(owner)).andExpect(status().isOk()).andReturn();
        String json = list.getResponse().getContentAsString();
        assertThat((Integer) JsonPath.read(json, "$.unread")).isEqualTo(2);
        List<String> titles = JsonPath.read(json, "$.items[*].title");
        assertThat(titles).anySatisfy(t -> assertThat(t).startsWith("Toʻlov kuni 3 kundan keyin: KR-"));
        assertThat(titles).anySatisfy(t -> assertThat(t).startsWith("Bonusni tasdiqlash vaqti keldi: KR-"));
        // 1–2 kun qolganda — jim; to'lov kuni — yana
        assertThat(reminders.run(today().plusDays(1))).isZero();
        assertThat(reminders.run(today().plusDays(3))).isGreaterThanOrEqualTo(1);
        send(post("/api/notifications/read-all"), owner, "").andExpect(status().isOk());
        mvc.perform(get("/api/notifications").cookie(owner)).andExpect(jsonPath("$.unread").value(0));
        // Boshqa xodim birovning bildirishnomasini o'qiy olmaydi
        long notif = ((Number) JsonPath.read(json, "$.items[0].id")).longValue();
        send(post("/api/notifications/" + notif + "/read"), admin, "").andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT employee_id FROM notification WHERE id = :id").param("id", notif).query(Long.class).single()).isEqualTo(ownerId);
    }

    @Test
    void idleBonusBalanceRemindsEveryThirtyDays() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), 15);
        long a = product("KR bonus eslatma", false);
        Cookie admin = loginAs("ADMIN", null);
        loginAs("PURCHASER", p.branchId());
        long ownerId = jdbc.sql("SELECT max(id) FROM employee WHERE role_id = (SELECT id FROM role WHERE code = 'PURCHASER')").query(Long.class).single();
        String body = doc(p, sup, false, line(a, "BI-1", p.main(), 10, 0, "1000"))
                .replace("\"prepaid\":false", "\"prepaid\":false,\"ownerId\":" + ownerId);
        String kr = postedReceipt(admin, body);
        send(post("/api/receipts/" + kr + "/post"), admin, "{}").andExpect(status().isOk());
        send(post("/api/receipts/" + kr + "/bonus"), admin, "").andExpect(status().isOk());

        String like = "bonus.idle:" + p.branchId() + ":" + sup + ":%";
        java.util.function.Supplier<Integer> count = () -> jdbc.sql("SELECT count(*)::int FROM notification WHERE dedup_key LIKE :k")
                .param("k", like).query(Integer.class).single();
        java.util.function.Supplier<Integer> ownerCount = () -> jdbc.sql(
                "SELECT count(*)::int FROM notification WHERE dedup_key LIKE :k AND employee_id = :e")
                .param("k", like).param("e", ownerId).query(Integer.class).single();
        reminders.run(today().plusDays(29));
        assertThat(count.get()).isZero();
        reminders.run(today().plusDays(30));
        assertThat(ownerCount.get()).isEqualTo(1);
        int afterFirst = count.get();
        assertThat(afterFirst).isGreaterThanOrEqualTo(2); // Kim nomiga + Direktor/Admin
        String title = jdbc.sql("SELECT title FROM notification WHERE dedup_key LIKE :k AND employee_id = :e")
                .param("k", like).param("e", ownerId).query(String.class).single();
        assertThat(title).startsWith("Bonus balansi 30 kundan beri ishlatilmagan:");
        // Shu davrda qayta yozilmaydi; keyingi 30 kunda — yana
        reminders.run(today().plusDays(31));
        reminders.run(today().plusDays(45));
        assertThat(count.get()).isEqualTo(afterFirst);
        reminders.run(today().plusDays(60));
        assertThat(ownerCount.get()).isEqualTo(2);
    }
}
