package uz.medix.catalog.counterparty;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.catalog.counterparty.CounterpartyModels.Kind;
import uz.medix.catalog.counterparty.CounterpartyModels.PaymentType;
import uz.medix.finance.DebtSummaries;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * «Mijozlar» / «Yetkazib beruvchilar» ro'yxati (prototip Counterparties): kartadagi asosiy ma'lumot + filial shartlari, litsenziya,
 * qarz (finance — «Mijozlar qarzi» bilan bir manba), oxirgi sotuv/kirim. Ro'yxat to'liq qaytariladi — ko'rinishlar, filtrlar, sanoqlar va
 * saralash prototipdagidek brauzerda (kontragentlar soni minglab, sahifa 25–100 qator).
 */
@Service
class CounterpartyOverview {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    enum CounterpartyState { ACTIVE, BLOCKED, INACTIVE }

    record OverviewBranch(String code, String name) {}

    record OverviewRow(
            long id,
            String tin,
            String name,
            @Schema(nullable = true) String legalName,
            boolean customer,
            boolean supplier,
            @Schema(nullable = true) Kind kind,
            @Schema(nullable = true) String region,
            @Schema(nullable = true, description = "Faqat clients.contact / suppliers.contact bilan") String phone,
            @Schema(nullable = true) String contactPerson,
            @Schema(description = "Sharti bor filiallar kodlari") List<String> branches,
            @Schema(description = "Tanlangan (yoki xodimning) filialida sharti bor; filial tanlanmagan — true") boolean inScope,
            @Schema(nullable = true, description = "Eng uzoq amal qiladigan litsenziya muddati") LocalDate licenseValidUntil,
            @Schema(description = "Nazoratdagi mahsulotlarga amaldagi ruxsat") boolean controlledAllowed,
            CounterpartyState status,
            @Schema(description = "Qarz (mijoz — bizga, YB — bizning qarzimiz), so'm") String debt,
            String overdue,
            int maxOverdueDays,
            @Schema(description = "Muddati o'tgan qarz guruhlari: 1-30, 31-60, 61-90, 90plus") List<String> agingBuckets,
            @Schema(nullable = true, description = "Kredit limiti (filial tanlanmagan — filiallar yig'indisi)") String creditLimit,
            @Schema(description = "Narx turlari (NULL shart — bazaviy)") List<String> priceTypes,
            List<String> operators,
            @Schema(nullable = true) LocalDate lastSaleDate,
            @Schema(nullable = true) String lastSaleNumber,
            @Schema(nullable = true, description = "Oxirgi sotuv buyurtmasi (karta havolasi)") Long lastSaleOrderId,
            @Schema(description = "YB: to'lov muddati (kun), filiallar bo'yicha") List<Integer> paymentDays,
            @Schema(description = "YB: ta'minotchilar") List<String> buyers,
            @Schema(nullable = true) PaymentType mainPayment,
            @Schema(nullable = true) LocalDate lastReceiptDate,
            @Schema(nullable = true) String lastReceiptNumber,
            @Schema(nullable = true) Long lastReceiptId,
            @Schema(nullable = true) LocalDate lastPaymentDate,
            LocalDate createdOn) {}

    record CounterpartyOverviewPage(List<OverviewRow> items, List<OverviewBranch> branches, LocalDate today) {}

    record LastDoc(LocalDate date, String amount, String number, @Schema(nullable = true) Long id) {}

    record BranchSummary(
            long branchId,
            String code,
            String name,
            boolean hasTerms,
            @Schema(description = "Qarz (mijoz — bizga, YB — bizning qarzimiz)") String debt,
            String advance,
            String overdue,
            int maxOverdueDays,
            @Schema(nullable = true) String creditLimit,
            @Schema(nullable = true, description = "Qolgan limit = limit − qarz (manfiy bo'lmaydi)") String limitLeft,
            @Schema(nullable = true, description = "NULL shart — bazaviy narx turi nomi") String priceType,
            @Schema(nullable = true) String operator,
            @Schema(nullable = true) Integer paymentDays,
            @Schema(nullable = true, description = "Mijoz — oxirgi sotuv (id — buyurtma), YB — oxirgi kirim (id — kirim)") LastDoc lastDoc,
            @Schema(nullable = true) LastDoc lastPayment) {}

    record CounterpartySummary(List<BranchSummary> branches) {}

    private final JdbcClient jdbc;
    private final DebtSummaries debts;
    private final Clock clock;

    CounterpartyOverview(JdbcClient jdbc, DebtSummaries debts, Clock clock) {
        this.jdbc = jdbc;
        this.debts = debts;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    CounterpartyOverviewPage overview(Actor actor, boolean customers, Long branchId, boolean contacts) {
        Long scope = actor.allBranches() ? branchId : actor.branchId();
        if (scope != null && !actor.canAccessBranch(scope)) {
            throw MedixException.notFound("error.notFound");
        }
        LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
        Side side = customers ? Side.CUSTOMER : Side.SUPPLIER;
        Map<Long, DebtSummaries.PartyDebt> debt = debts.byParty(actor, side, scope);
        String terms = "FROM counterparty_branch_terms t WHERE t.counterparty_id = c.id AND (CAST(:b AS BIGINT) IS NULL OR t.branch_id = :b)";
        List<OverviewRow> rows = jdbc.sql("""
                SELECT c.id, c.tin, c.name, c.legal_name, c.is_customer, c.is_supplier, c.kind, r.name AS region, c.phone, c.contact_person,
                       c.blocked, c.active, (c.created_at AT TIME ZONE 'Asia/Tashkent')::date AS created_on,
                       (SELECT max(l.valid_until) FROM counterparty_license l WHERE l.counterparty_id = c.id) AS lic,
                       EXISTS (SELECT 1 FROM counterparty_license l WHERE l.counterparty_id = c.id AND l.controlled_allowed
                                 AND (l.valid_until IS NULL OR l.valid_until >= :today)) AS ctrl,
                       (SELECT string_agg(b.code, ',' ORDER BY b.code) FROM counterparty_branch_terms t JOIN branch b ON b.id = t.branch_id
                        WHERE t.counterparty_id = c.id) AS branches,
                       (CAST(:b AS BIGINT) IS NULL OR EXISTS (SELECT 1 FROM counterparty_branch_terms t WHERE t.counterparty_id = c.id
                                                                AND t.branch_id = :b)) AS in_scope,
                       (SELECT sum(t.credit_limit) %1$s) AS credit_limit,
                       (SELECT string_agg(DISTINCT coalesce(pt.name, (SELECT name FROM price_type WHERE base)), '|')
                        FROM counterparty_branch_terms t LEFT JOIN price_type pt ON pt.id = t.price_type_id
                        WHERE t.counterparty_id = c.id AND (CAST(:b AS BIGINT) IS NULL OR t.branch_id = :b)) AS price_types,
                       (SELECT string_agg(DISTINCT e.full_name, '|') FROM counterparty_branch_terms t JOIN employee e ON e.id = t.operator_employee_id
                        WHERE t.counterparty_id = c.id AND (CAST(:b AS BIGINT) IS NULL OR t.branch_id = :b)) AS operators,
                       (SELECT string_agg(DISTINCT e.full_name, '|') FROM counterparty_branch_terms t JOIN employee e ON e.id = t.supply_employee_id
                        WHERE t.counterparty_id = c.id AND (CAST(:b AS BIGINT) IS NULL OR t.branch_id = :b)) AS buyers,
                       (SELECT string_agg(DISTINCT t.supplier_payment_days::text, '|') %1$s AND t.supplier_payment_days IS NOT NULL) AS pay_days,
                       (SELECT t.default_payment_type %1$s AND t.default_payment_type IS NOT NULL ORDER BY t.branch_id LIMIT 1) AS main_pay,
                       ls.order_id AS sale_order_id, ls.number AS sale_no, ls.sale_date,
                       lr.id AS receipt_id, lr.number AS receipt_no, lr.receipt_date,
                       (SELECT max((p.occurred_at AT TIME ZONE 'Asia/Tashkent')::date) FROM party_ledger p
                        WHERE p.counterparty_id = c.id AND p.side = :side AND p.doc_type = :pd
                          AND (CAST(:b AS BIGINT) IS NULL OR p.branch_id = :b)) AS last_pay
                FROM counterparty c
                LEFT JOIN region r ON r.id = c.region_id
                LEFT JOIN LATERAL (SELECT s.order_id, s.number, s.sale_date FROM sale s
                                   WHERE :customers AND s.customer_id = c.id AND s.status = 'POSTED'
                                     AND (CAST(:b AS BIGINT) IS NULL OR s.branch_id = :b)
                                   ORDER BY s.sale_date DESC, s.id DESC LIMIT 1) ls ON true
                LEFT JOIN LATERAL (SELECT x.id, x.number, x.receipt_date FROM receipt x
                                   WHERE NOT :customers AND x.supplier_id = c.id AND x.status = 'POSTED'
                                     AND (CAST(:b AS BIGINT) IS NULL OR x.branch_id = :b)
                                   ORDER BY x.receipt_date DESC, x.id DESC LIMIT 1) lr ON true
                WHERE CASE WHEN :customers THEN c.is_customer ELSE c.is_supplier END
                ORDER BY c.name, c.id""".formatted(terms))
                .param("b", scope)
                .param("today", Date.valueOf(today))
                .param("customers", customers)
                .param("side", side.name())
                .param("pd", customers ? "MT" : "YT")
                .query((rs, n) -> row(rs, debt.get(rs.getLong("id")), contacts))
                .list();
        List<OverviewBranch> branches = jdbc.sql("SELECT code, name FROM branch WHERE active ORDER BY code")
                .query(OverviewBranch.class)
                .list();
        return new CounterpartyOverviewPage(rows, branches, today);
    }

    /** Kartochka o'ng paneli (prototip CounterpartyCard «Umumiy»): har filial bo'yicha qarz, limit, oxirgi sotuv/kirim va to'lov. */
    @Transactional(readOnly = true)
    CounterpartySummary summary(Actor actor, long id, boolean customers) {
        Side side = customers ? Side.CUSTOMER : Side.SUPPLIER;
        record Br(long id, String code, String name, boolean hasTerms, BigDecimal creditLimit, String priceType, String operator,
                Integer paymentDays) {}
        List<Br> brs = jdbc.sql("""
                SELECT b.id, b.code, b.name, t.counterparty_id IS NOT NULL AS has_terms, t.credit_limit,
                       CASE WHEN t.counterparty_id IS NULL THEN NULL ELSE coalesce(pt.name, (SELECT name FROM price_type WHERE base)) END
                           AS price_type,
                       op.full_name AS operator,
                       CASE WHEN :customers THEN t.payment_days ELSE t.supplier_payment_days END AS payment_days
                FROM branch b
                LEFT JOIN counterparty_branch_terms t ON t.branch_id = b.id AND t.counterparty_id = :c
                LEFT JOIN price_type pt ON pt.id = t.price_type_id
                LEFT JOIN employee op ON op.id = CASE WHEN :customers THEN t.operator_employee_id ELSE t.supply_employee_id END
                WHERE t.counterparty_id IS NOT NULL
                   OR EXISTS (SELECT 1 FROM party_ledger p WHERE p.branch_id = b.id AND p.counterparty_id = :c AND p.side = :side)
                ORDER BY b.code""")
                .param("c", id)
                .param("customers", customers)
                .param("side", side.name())
                .query((rs, n) -> new Br(rs.getLong("id"), rs.getString("code"), rs.getString("name"), rs.getBoolean("has_terms"),
                        rs.getBigDecimal("credit_limit"), rs.getString("price_type"), rs.getString("operator"),
                        rs.getObject("payment_days", Integer.class)))
                .list()
                .stream()
                .filter(b -> actor.canAccessBranch(b.id()))
                .toList();
        List<BranchSummary> out = new java.util.ArrayList<>();
        for (Br b : brs) {
            DebtSummaries.PartyDebt d = debts.byParty(actor, side, b.id()).get(id);
            Money debt = d == null ? Money.ZERO : Money.of(d.debt());
            Money left = null;
            if (b.creditLimit() != null) {
                Money l = new Money(b.creditLimit()).minus(debt);
                left = l.isNegative() ? Money.ZERO : l;
            }
            LastDoc lastDoc = customers
                    ? jdbc.sql("""
                            SELECT sale_date AS date, total AS amount, number, order_id AS id FROM sale
                            WHERE customer_id = :c AND branch_id = :b AND status = 'POSTED' ORDER BY sale_date DESC, id DESC LIMIT 1""")
                            .param("c", id).param("b", b.id()).query((rs, n) -> lastDoc(rs)).optional().orElse(null)
                    : jdbc.sql("""
                            SELECT x.receipt_date AS date, coalesce((SELECT abs(sum(p.amount)) FROM party_ledger p WHERE p.side = 'SUPPLIER'
                                     AND p.doc_type = 'KR' AND p.doc_id = x.id AND p.applies_doc_type IS NULL), 0) AS amount,
                                   x.number, x.id FROM receipt x
                            WHERE x.supplier_id = :c AND x.branch_id = :b AND x.status = 'POSTED' ORDER BY x.receipt_date DESC, x.id DESC LIMIT 1""")
                            .param("c", id).param("b", b.id()).query((rs, n) -> lastDoc(rs)).optional().orElse(null);
            LastDoc lastPay = jdbc.sql("""
                    SELECT (max(occurred_at) AT TIME ZONE 'Asia/Tashkent')::date AS date, abs(sum(amount)) AS amount, min(doc_number) AS number,
                           NULL::bigint AS id
                    FROM party_ledger WHERE branch_id = :b AND counterparty_id = :c AND side = :side AND doc_type = :pd
                    GROUP BY doc_id ORDER BY max(occurred_at) DESC LIMIT 1""")
                    .param("b", b.id()).param("c", id).param("side", side.name()).param("pd", customers ? "MT" : "YT")
                    .query((rs, n) -> lastDoc(rs)).optional().orElse(null);
            out.add(new BranchSummary(b.id(), b.code(), b.name(), b.hasTerms(), debt.toString(),
                    d == null ? Money.ZERO.toString() : d.advance(), d == null ? Money.ZERO.toString() : d.overdue(),
                    d == null ? 0 : d.maxOverdueDays(), b.creditLimit() == null ? null : new Money(b.creditLimit()).toString(),
                    left == null ? null : left.toString(), b.priceType(), b.operator(), b.paymentDays(), lastDoc, lastPay));
        }
        return new CounterpartySummary(out);
    }

    private static LastDoc lastDoc(ResultSet rs) throws SQLException {
        BigDecimal a = rs.getBigDecimal("amount");
        return new LastDoc(rs.getDate("date").toLocalDate(), new Money(a == null ? BigDecimal.ZERO : a).toString(), rs.getString("number"),
                rs.getObject("id", Long.class));
    }

    private static OverviewRow row(ResultSet rs, DebtSummaries.PartyDebt d, boolean contacts) throws SQLException {
        CounterpartyState status = rs.getBoolean("blocked") ? CounterpartyState.BLOCKED : rs.getBoolean("active") ? CounterpartyState.ACTIVE : CounterpartyState.INACTIVE;
        String kind = rs.getString("kind");
        String pay = rs.getString("main_pay");
        BigDecimal limit = rs.getBigDecimal("credit_limit");
        List<String> aging = d == null ? List.of() : buckets(d);
        return new OverviewRow(rs.getLong("id"), rs.getString("tin"), rs.getString("name"), rs.getString("legal_name"), rs.getBoolean("is_customer"),
                rs.getBoolean("is_supplier"), kind == null ? null : Kind.valueOf(kind), rs.getString("region"), contacts ? rs.getString("phone") : null,
                contacts ? rs.getString("contact_person") : null, split(rs.getString("branches"), ","), rs.getBoolean("in_scope"), date(rs, "lic"),
                rs.getBoolean("ctrl"), status, d == null ? Money.ZERO.toString() : d.debt(), d == null ? Money.ZERO.toString() : d.overdue(),
                d == null ? 0 : d.maxOverdueDays(), aging, limit == null ? null : new Money(limit).toString(),
                split(rs.getString("price_types"), "\\|"), split(rs.getString("operators"), "\\|"), date(rs, "sale_date"),
                rs.getString("sale_no"), rs.getObject("sale_order_id", Long.class),
                split(rs.getString("pay_days"), "\\|").stream().map(Integer::valueOf).sorted().toList(), split(rs.getString("buyers"), "\\|"),
                pay == null ? null : PaymentType.valueOf(pay), date(rs, "receipt_date"), rs.getString("receipt_no"),
                rs.getObject("receipt_id", Long.class), date(rs, "last_pay"), date(rs, "created_on"));
    }

    private static List<String> buckets(DebtSummaries.PartyDebt d) {
        String[][] b = {{"1-30", d.d1to30()}, {"31-60", d.d31to60()}, {"61-90", d.d61to90()}, {"90plus", d.d90plus()}};
        return Arrays.stream(b).filter(x -> Money.of(x[1]).isPositive()).map(x -> x[0]).toList();
    }

    private static List<String> split(String s, String sep) {
        return s == null || s.isEmpty() ? List.of() : List.of(s.split(sep));
    }

    private static LocalDate date(ResultSet rs, String col) throws SQLException {
        Date d = rs.getDate(col);
        return d == null ? null : d.toLocalDate();
    }
}
