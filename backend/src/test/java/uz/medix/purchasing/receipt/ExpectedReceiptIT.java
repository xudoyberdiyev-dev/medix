package uz.medix.purchasing.receipt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
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
import uz.medix.inventory.Warehouses;
import uz.medix.inventory.ZoneType;
import uz.medix.shared.security.Actor;

/** KK (O15): qarz tasdiqda darhol va bir marta, bekor qilishda teskari, narx ruxsati, oldindan to'langan, filial, tekshiruvlar, parallel. */
@SpringBootTest(properties = "medix.test.isolation=branch-admin")
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ExpectedReceiptIT {

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

    @Autowired
    ExpectedReceipts kk;

    private record Place(long branchId, long warehouseId, long receiving, long main, long quarantine, long safe) {}

    private Place place() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Medix Group' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        Long branch = jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'KK sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(400_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElse(null);
        if (branch == null) {
            return place();
        }
        long b = branch;
        Warehouses.Warehouse w = tx.execute(s -> warehouses.create(b, "KK ombor " + code, null, Set.of(ZoneType.SAFE)));
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
        String login = "kk" + UUID.randomUUID().toString().substring(0, 8);
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

    private static LocalDate today() {
        return LocalDate.now(ZoneId.of("Asia/Tashkent"));
    }

    private BigDecimal debt(long branch, long supplier) {
        return jdbc.sql("SELECT coalesce(sum(amount), 0) FROM party_ledger WHERE branch_id = :b AND counterparty_id = :c AND side = 'SUPPLIER'")
                .param("b", branch).param("c", supplier).query(BigDecimal.class).single();
    }


    private static String doc(Place p, long sup, String payment, LocalDate invoiceDate, String lines) {
        return "{\"warehouseId\":" + p.warehouseId() + ",\"supplierId\":" + sup + ",\"waybillNumber\":\"TTN-77\",\"waybillDate\":\""
                + today().minusDays(3) + "\",\"invoiceNumber\":\"HF-77\",\"invoiceDate\":" + (invoiceDate == null ? "null" : "\"" + invoiceDate + "\"")
                + ",\"contract\":\"Sh-1\",\"paymentKind\":\"" + payment + "\",\"expectedDate\":\"" + today().plusDays(4) + "\",\"lines\":[" + lines + "]}";
    }

    private static String ln(long product, int qty, String price) {
        return "{\"productId\":" + product + ",\"qty\":" + qty + ",\"price\":" + (price == null ? "null" : "\"" + price + "\"") + ",\"vatRate\":12}";
    }

    private int ledgerRows(long kkId) {
        return jdbc.sql("SELECT count(*) FROM party_ledger WHERE doc_type = 'KK' AND doc_id = :id").param("id", kkId).query(Integer.class).single();
    }

    @Test
    void creditApproveWritesDebtImmediatelyOnceAndCancelReverses() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), 10);
        long prod = product("KK Paratsetamol", false);
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        BigDecimal before = debt(p.branchId(), sup);

        MvcResult created = send(post("/api/expected-receipts"), manager, doc(p, sup, "CREDIT", today().minusDays(2), ln(prod, 500, "1200.50")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.number").value(org.hamcrest.Matchers.matchesPattern("^KK-[A-Z]{3}-\\d{6}$")))
                .andExpect(jsonPath("$.totalAmount").value("600250.00"))
                .andExpect(jsonPath("$.dueDate").value(today().plusDays(8).toString()))
                .andReturn();
        long id = id(created);
        // Qoralamada qarz yo'q
        assertThat(ledgerRows(id)).isZero();

        send(post("/api/expected-receipts/" + id + "/approve"), manager, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_TRANSIT"))
                .andExpect(jsonPath("$.debtAmount").value("600250.00"))
                .andExpect(jsonPath("$.debtOpen").value("600250.00"))
                .andExpect(jsonPath("$.lines[0].remainingQty").value(500));
        assertThat(debt(p.branchId(), sup)).isEqualByComparingTo(before.add(new BigDecimal("600250.00")));
        assertThat(jdbc.sql("SELECT due_date FROM party_ledger WHERE doc_type = 'KK' AND doc_id = :id").param("id", id)
                .query(LocalDate.class).single()).isEqualTo(today().plusDays(8));
        // Qoldiq o'zgarmaydi — tovar yo'lda
        assertThat(jdbc.sql("SELECT count(*) FROM stock_balance WHERE product_id = :p").param("p", prod).query(Integer.class).single()).isZero();
        // Qayta tasdiqlash — 409, qarz bir marta
        send(post("/api/expected-receipts/" + id + "/approve"), manager, "{}").andExpect(status().isConflict());
        assertThat(ledgerRows(id)).isEqualTo(1);
        // Ro'yxat: ochiq (Yo'lda)
        mvc.perform(get("/api/expected-receipts").param("open", "true").param("supplierId", String.valueOf(sup)).cookie(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].waybillNumber").value("TTN-77"))
                .andExpect(jsonPath("$.items[0].late").value(false));
        // Tasdiqlangan qatorlar tahrirlanmaydi (baza himoyasi)
        assertThatThrownBy(() -> jdbc.sql("UPDATE expected_receipt_line SET qty = 1 WHERE expected_receipt_id = :id").param("id", id).update())
                .hasMessageContaining("faqat qoralamada");
        assertThatThrownBy(() -> jdbc.sql("UPDATE expected_receipt SET debt_amount = 1 WHERE id = :id").param("id", id).update())
                .hasMessageContaining("tasdiqlangan");

        // Bekor qilish — qarz teskari yoziladi
        send(post("/api/expected-receipts/" + id + "/cancel"), manager, "{\"reason\":\"YB yukni qaytarib oldi\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(debt(p.branchId(), sup)).isEqualByComparingTo(before);
        assertThat(ledgerRows(id)).isEqualTo(2);
        send(post("/api/expected-receipts/" + id + "/cancel"), manager, "{\"reason\":\"yana\"}").andExpect(status().isConflict());
    }

    @Test
    void keeperWithoutPricesNeedsPricesForCreditAndKeepsThem() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), null);
        long prod = product("KK Analgin", false);
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        // Ombor mudiri narx ko'rmaydi — yuborgan narxi e'tiborsiz
        long id = id(send(post("/api/expected-receipts"), keeper, doc(p, sup, "CREDIT", null, ln(prod, 10, "999.00")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.lines[0].price").doesNotExist())
                .andExpect(jsonPath("$.totalAmount").doesNotExist())
                .andReturn());
        send(post("/api/expected-receipts/" + id + "/approve"), keeper, "{}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("kk.pricesMissing"));
        // Filial rahbari narx kiritadi, Ombor mudiri sonini o'zgartiradi — narx saqlanadi
        send(put("/api/expected-receipts/" + id), manager, doc(p, sup, "CREDIT", null, ln(prod, 10, "250.00"))).andExpect(status().isOk());
        send(put("/api/expected-receipts/" + id), keeper, doc(p, sup, "CREDIT", null, ln(prod, 12, null))).andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT price FROM expected_receipt_line WHERE expected_receipt_id = :id").param("id", id)
                .query(BigDecimal.class).single()).isEqualByComparingTo("250.00");
        // To'lov kuni: hisob-faktura yo'q — yuk xati sanasi + 0 kun
        send(post("/api/expected-receipts/" + id + "/approve"), keeper, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.debtAmount").doesNotExist())
                .andExpect(jsonPath("$.dueDate").value(today().minusDays(3).toString()));
        assertThat(debt(p.branchId(), sup)).isEqualByComparingTo("3000.00");
    }

    @Test
    void prepaidHasNoDebtAndAccessIsChecked() throws Exception {
        Place p = place();
        Place other = place();
        long sup = supplier(p.branchId(), 5);
        long prod = product("KK Ibuprofen", false);
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        Cookie operator = loginAs("OPERATOR", p.branchId());
        Cookie stranger = loginAs("BRANCH_MANAGER", other.branchId());
        // Kutilgan sana kiritilmagan (ixtiyoriy) — kartochka ochilishi kerak
        long id = id(send(post("/api/expected-receipts"), manager,
                doc(p, sup, "PREPAID", null, ln(prod, 5, "100.00")).replaceAll("\"expectedDate\":\"[^\"]+\"", "\"expectedDate\":null"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.dueDate").doesNotExist())
                .andReturn());
        send(post("/api/expected-receipts/" + id + "/approve"), manager, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.debtAmount").value("0.00"));
        assertThat(ledgerRows(id)).isZero();
        // Operator — ko'radi, yaratolmaydi; boshqa filial — topilmaydi
        mvc.perform(get("/api/expected-receipts/" + id).cookie(operator)).andExpect(status().isOk());
        send(post("/api/expected-receipts"), operator, doc(p, sup, "CASH", null, ln(prod, 1, null))).andExpect(status().isForbidden());
        mvc.perform(get("/api/expected-receipts/" + id).cookie(stranger)).andExpect(status().isNotFound());
        // Tekshiruvlar: kelajakdagi sana, takror qator
        String future = doc(p, sup, "CREDIT", today().plusDays(1), ln(prod, 1, "1.00"));
        send(post("/api/expected-receipts"), manager, future).andExpect(status().isBadRequest());
        send(post("/api/expected-receipts"), manager, doc(p, sup, "CREDIT", null, ln(prod, 1, "1.00") + "," + ln(prod, 2, "1.00")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("kk.duplicateLine"));
    }

    @Test
    void receivePartlyShortReducesDebtThenCloseWritesOffRest() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), 7);
        long prod = product("KK Sitramon", false);
        Cookie keeper = loginAs("WAREHOUSE_MANAGER", p.branchId());
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        long kkId = id(send(post("/api/expected-receipts"), manager, doc(p, sup, "CREDIT", null, ln(prod, 100, "50.00")))
                .andExpect(status().isCreated()).andReturn());
        send(post("/api/expected-receipts/" + kkId + "/approve"), manager, "{}").andExpect(status().isOk());
        assertThat(debt(p.branchId(), sup)).isEqualByComparingTo("5000.00");
        long kkLine = jdbc.sql("SELECT id FROM expected_receipt_line WHERE expected_receipt_id = :k").param("k", kkId).query(Long.class).single();
        // Yo'ldagi tovar ko'rinadi, qoldiqqa kirmaydi
        mvc.perform(get("/api/expected-receipts/in-transit").param("productId", String.valueOf(prod)).cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].qty").value(100))
                .andExpect(jsonPath("$[0].docs[0].id").value(kkId));

        // Qabul qilish: 60 dona kutiladi — kirim qoralamasi (narx KK dan)
        String recv = "{\"lines\":[{\"expectedLineId\":" + kkLine + ",\"qty\":60,\"batchNumber\":\"S-1\",\"expiryDate\":\"2028-01-31\",\"zoneId\":"
                + p.main() + "}]}";
        long receipt = ((Number) JsonPath.read(send(post("/api/expected-receipts/" + kkId + "/receive"), keeper, recv)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.receiptId")).longValue();
        assertThat(jdbc.sql("SELECT price FROM receipt_line WHERE receipt_id = :r").param("r", receipt).query(BigDecimal.class).single())
                .isEqualByComparingTo("50.00");
        // Ochiq kirimdagi 60 hisobga olinadi: yana 41 — ko'p
        send(post("/api/expected-receipts/" + kkId + "/receive"), keeper, recv.replace("\"qty\":60", "\"qty\":41"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("kk.receiveTooMuch"));
        // Ombor sanaydi: 55 keldi (5 kam) → «Haqiqiy soni» bilan o'tkaziladi
        long rLine = jdbc.sql("SELECT id FROM receipt_line WHERE receipt_id = :r").param("r", receipt).query(Long.class).single();
        send(post("/api/receipts/" + receipt + "/accept"), keeper,
                "{\"lines\":[{\"lineId\":" + rLine + ",\"receivedQty\":55,\"damagedQty\":0,\"diffReason\":\"SHORT\"}]}").andExpect(status().isOk());
        send(post("/api/receipts/" + receipt + "/post"), manager, "{\"resolution\":\"ACTUAL\"}").andExpect(status().isOk());
        // Qarz qayta yozilmadi — faqat kam 5 × 50 kamaydi
        assertThat(debt(p.branchId(), sup)).isEqualByComparingTo("4750.00");
        assertThat(jdbc.sql("SELECT sum(qty) FROM stock_balance WHERE product_id = :p").param("p", prod).query(Integer.class).single()).isEqualTo(55);
        mvc.perform(get("/api/expected-receipts/" + kkId).cookie(manager))
                .andExpect(jsonPath("$.status").value("PARTIAL"))
                .andExpect(jsonPath("$.debtOpen").value("4750.00"))
                .andExpect(jsonPath("$.lines[0].receivedQty").value(55))
                .andExpect(jsonPath("$.lines[0].writtenOffQty").value(5))
                .andExpect(jsonPath("$.lines[0].remainingQty").value(40))
                .andExpect(jsonPath("$.receipts[0].status").value("POSTED"));
        // Farq dalolatnomasi (PDF)
        mvc.perform(get("/api/expected-receipts/" + kkId + "/act/pdf").cookie(keeper))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().contentType("application/pdf"));
        // Bog'langan o'tkazilgan kirim bekor qilinmaydi; qisman KK bekor qilinmaydi
        send(post("/api/receipts/" + receipt + "/cancel"), manager, "{\"reason\":\"xato\"}").andExpect(status().is4xxClientError());
        send(post("/api/expected-receipts/" + kkId + "/cancel"), manager, "{\"reason\":\"x\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("kk.cancelReceived"));
        // Yakuniy qabul: qolgan 40 kelmaydi — qarzdan chiqariladi
        send(post("/api/expected-receipts/" + kkId + "/close"), manager, "{\"reason\":\"YB qolganini yubormaydi\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RECEIVED"))
                .andExpect(jsonPath("$.lines[0].remainingQty").value(0));
        assertThat(debt(p.branchId(), sup)).isEqualByComparingTo("2750.00");
        mvc.perform(get("/api/expected-receipts/in-transit").param("productId", String.valueOf(prod)).cookie(keeper))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void parallelApproveWritesDebtOnce() throws Exception {
        Place p = place();
        long sup = supplier(p.branchId(), 0);
        long prod = product("KK parallel", false);
        Cookie manager = loginAs("BRANCH_MANAGER", p.branchId());
        long id = id(send(post("/api/expected-receipts"), manager, doc(p, sup, "CREDIT", null, ln(prod, 3, "10.00")))
                .andExpect(status().isCreated()).andReturn());
        long approver = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, branch_id, password_hash, must_change_password)
                SELECT :l, 'Parallel', id, :b, 'x', false FROM role WHERE code = 'BRANCH_MANAGER' RETURNING id""")
                .param("l", "kkp" + UUID.randomUUID().toString().substring(0, 8))
                .param("b", p.branchId())
                .query(Long.class)
                .single();
        Actor a = new Actor(approver, p.branchId(), false);
        ExecutorService pool = Executors.newFixedThreadPool(5);
        List<Future<Boolean>> results = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            Callable<Boolean> job = () -> {
                try {
                    kk.approve(a, id);
                    return true;
                } catch (RuntimeException e) {
                    return false;
                }
            };
            results.add(pool.submit(job));
        }
        int ok = 0;
        for (Future<Boolean> f : results) {
            if (f.get()) {
                ok++;
            }
        }
        pool.shutdown();
        assertThat(ok).isEqualTo(1);
        assertThat(ledgerRows(id)).isEqualTo(1);
        assertThat(debt(p.branchId(), sup)).isEqualByComparingTo("30.00");
    }
}
