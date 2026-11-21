package uz.yuzplus.finance;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import uz.yuzplus.TestcontainersConfig;
import uz.yuzplus.finance.PartyLedger.DocRef;
import uz.yuzplus.finance.PartyLedger.Side;
import uz.yuzplus.shared.money.Money;

/**
 * S1 (V107): hujjat boʻyicha ochiq qarz (party_doc_balance) jurnal bilan bitta tranzaksiyada yangilanadi va har doim jurnalni
 * guruhlash natijasiga (avvalgi own/app soʻrovi) teng — ketma-ket va parallel yozuvlarda.
 */
@SpringBootTest
@Import(TestcontainersConfig.class)
class PartyDocBalanceIT {

    /** Avvalgi hisob (jurnalni guruhlash) — hosila jadval bilan solishtirish uchun. */
    private static final String RAW = """
            WITH own AS (SELECT side, branch_id, counterparty_id, doc_type, doc_id, min(due_date) AS due, min(occurred_at) AS at,
                                min(doc_number) AS num, sum(amount) AS amt
                         FROM party_ledger WHERE applies_doc_type IS NULL AND branch_id = :b GROUP BY 1, 2, 3, 4, 5),
                 app AS (SELECT side, branch_id, counterparty_id, applies_doc_type AS t, applies_doc_id AS i, sum(amount) AS amt
                         FROM party_ledger WHERE applies_doc_type IS NOT NULL AND branch_id = :b GROUP BY 1, 2, 3, 4, 5)
            SELECT own.side || '|' || own.counterparty_id || '|' || own.doc_type || '|' || own.doc_id || '|' || coalesce(own.due::text, '-')
                   || '|' || own.num || '|' || (own.amt + coalesce(app.amt, 0))::text AS k
            FROM own LEFT JOIN app ON app.side = own.side AND app.branch_id = own.branch_id AND app.counterparty_id = own.counterparty_id
                                  AND app.t = own.doc_type AND app.i = own.doc_id
            WHERE own.amt + coalesce(app.amt, 0) <> 0 ORDER BY 1""";

    private static final String DERIVED = """
            SELECT side || '|' || counterparty_id || '|' || doc_type || '|' || doc_id || '|' || coalesce(due_date::text, '-')
                   || '|' || doc_number || '|' || open_amount::text AS k
            FROM party_doc_balance WHERE branch_id = :b AND own_rows > 0 AND open_amount <> 0 ORDER BY 1""";

    @Autowired
    PartyLedger ledger;

    @Autowired
    JdbcClient jdbc;

    @Test
    void derivedBalanceMatchesLedgerForPaymentsReturnsAndAdvances() {
        long b = branch();
        long c = counterparty();
        long other = counterparty();
        LocalDate today = LocalDate.now();
        DocRef sv1 = new DocRef("SV", 9_100_001L, "SV-T-1");
        DocRef sv2 = new DocRef("SV", 9_100_002L, "SV-T-2");
        DocRef kr = new DocRef("KR", 9_100_003L, "KR-T-3");
        ledger.record(sv1, b, c, Side.CUSTOMER, money("500.00"), today.plusDays(5), null);
        ledger.record(sv2, b, c, Side.CUSTOMER, money("300.00"), today.plusDays(2), null);
        ledger.record(kr, b, other, Side.SUPPLIER, money("1000.00"), today.minusDays(3), null);
        // Taqsimlanmagan toʻlov — avans (oʻz hujjati, manfiy)
        ledger.record(new DocRef("MT", 9_100_004L, "MT-T-4"), b, c, Side.CUSTOMER, money("-100.00"), null, null);
        // Qisman toʻlov, qaytarish (ortiqcha — hujjat manfiyga oʻtadi), toʻliq yopilgan YB qarzi
        ledger.record(new DocRef("MT", 9_100_005L, "MT-T-5"), b, c, Side.CUSTOMER, money("-200.00"), null, null, sv1);
        ledger.record(new DocRef("QM", 9_100_006L, "QM-T-6"), b, c, Side.CUSTOMER, money("-350.00"), null, null, sv1);
        ledger.record(new DocRef("YT", 9_100_007L, "YT-T-7"), b, other, Side.SUPPLIER, money("-1000.00"), null, null, kr);
        // Bekor qilish: hujjatning oʻz teskari yozuvi (muddatsiz)
        ledger.record(sv2, b, c, Side.CUSTOMER, money("-300.00"), null, null);

        assertThat(derived(b)).isEqualTo(raw(b));
        Map<String, Object> row = jdbc.sql("""
                SELECT own_rows, own_amount::text AS own, applied_amount::text AS app, open_amount::text AS open, due_date
                FROM party_doc_balance WHERE side = 'CUSTOMER' AND branch_id = :b AND doc_type = 'SV' AND doc_id = :d""")
                .param("b", b).param("d", sv1.id()).query().singleRow();
        assertThat(row.get("own_rows")).isEqualTo(1);
        assertThat(row.get("own")).isEqualTo("500.00");
        assertThat(row.get("app")).isEqualTo("-550.00");
        assertThat(row.get("open")).isEqualTo("-50.00");
        assertThat(jdbc.sql("SELECT open_amount::text FROM party_doc_balance WHERE doc_type = 'KR' AND doc_id = :d").param("d", kr.id())
                .query(String.class).single()).isEqualTo("0.00");
        assertThat(jdbc.sql("SELECT count(*) FROM party_doc_balance WHERE doc_type = 'SV' AND doc_id = :d AND open_amount <> 0")
                .param("d", sv2.id()).query(Long.class).single()).isZero();
    }

    @Test
    void parallelPaymentsOnSameDocumentKeepBalanceConsistent() throws Exception {
        long b = branch();
        long c = counterparty();
        DocRef sale = new DocRef("SV", 9_200_001L, "SV-P-1");
        ledger.record(sale, b, c, Side.CUSTOMER, money("10000.00"), LocalDate.now().plusDays(10), null);
        int n = 40;
        List<Callable<Void>> tasks = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            long id = 9_200_100L + i;
            tasks.add(() -> {
                ledger.record(new DocRef("MT", id, "MT-P-" + id), b, c, Side.CUSTOMER, money("-125.50"), null, null, sale);
                return null;
            });
        }
        try (ExecutorService pool = Executors.newFixedThreadPool(8)) {
            for (Future<Void> f : pool.invokeAll(tasks)) {
                f.get();
            }
        }
        // 10 000,00 − 40 × 125,50 = 4 980,00
        assertThat(jdbc.sql("SELECT open_amount::text FROM party_doc_balance WHERE branch_id = :b AND doc_id = :d")
                .param("b", b).param("d", sale.id()).query(String.class).single()).isEqualTo("4980.00");
        assertThat(derived(b)).isEqualTo(raw(b));
    }

    private List<String> raw(long b) {
        return jdbc.sql(RAW).param("b", b).query(String.class).list();
    }

    private List<String> derived(long b) {
        return jdbc.sql(DERIVED).param("b", b).query(String.class).list();
    }

    private static Money money(String v) {
        return new Money(new java.math.BigDecimal(v));
    }

    private long branch() {
        jdbc.sql("INSERT INTO company (name) SELECT 'Shifo Dori' WHERE NOT EXISTS (SELECT 1 FROM company)").update();
        var rnd = ThreadLocalRandom.current();
        String code = "" + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26)) + (char) ('A' + rnd.nextInt(26));
        return jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                SELECT id, :c, 'Hosila sinov ' || :c, 'MChJ', :t FROM company ON CONFLICT DO NOTHING RETURNING id""")
                .param("c", code)
                .param("t", String.valueOf(300_000_000L + rnd.nextLong(99_999_999L)))
                .query(Long.class)
                .optional()
                .orElseGet(this::branch);
    }

    private long counterparty() {
        return jdbc.sql("INSERT INTO counterparty (tin, name, is_customer, is_supplier) VALUES (:t, :n, true, true) RETURNING id")
                .param("t", String.valueOf(500_000_000L + ThreadLocalRandom.current().nextLong(99_999_999L)))
                .param("n", "Hosila " + UUID.randomUUID().toString().substring(0, 6))
                .query(Long.class)
                .single();
    }
}
