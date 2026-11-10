package uz.medix.finance.debt;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.PartyLedger;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * Mijozlar qarzi va yetkazib beruvchilar qarzi (SPEC 5.5): faqat qarz jurnalidan, muddat guruhlari bilan. Filial tanlanmasa —
 * barcha filiallar (faqat barcha filiallarni ko'radigan xodim uchun), har filial alohida hisoblanib qo'shiladi.
 */
@Service
class Debts {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    record Buckets(String debt, String advance, String notDue, String d1to30, String d31to60, String d61to90, String d90plus, String overdue) {

        static Buckets of(Aging.Result r) {
            return new Buckets(r.debt().toString(), r.advance().toString(), r.notDue().toString(), r.d1to30().toString(), r.d31to60().toString(),
                    r.d61to90().toString(), r.d90plus().toString(), r.overdue().toString());
        }
    }

    record DebtRow(long counterpartyId, String name, String tin, @Schema(nullable = true) String phone, Buckets buckets, int maxOverdueDays,
            @Schema(nullable = true, description = "Kredit limiti (faqat bitta filial tanlanganda; mijoz)") String creditLimit,
            @Schema(nullable = true) LocalDate lastPayment, @Schema(nullable = true, description = "Hudud (mijoz kartochkasidan)") String region,
            @Schema(nullable = true, description = "Masʼul operator (filial shartidan; filial tanlanmasa — barcha filiallardagilar)")
            String operator,
            @Schema(nullable = true, description = "To'lov sharti, kun (faqat bitta filial tanlanganda)") Integer paymentDays) {}

    record DebtReport(@Schema(nullable = true) Long branchId, LocalDate today, Buckets totals, List<DebtRow> rows) {}

    record DebtDoc(long branchId, String branch, String docType, long docId, String docNumber, LocalDate date, @Schema(nullable = true) LocalDate dueDate,
            String open, int overdueDays, @Schema(description = "Hujjat summasi") String total,
            @Schema(description = "Qaytarishlar") String returned, @Schema(description = "To'langan (avans hisobga olinishi bilan)") String paid) {}

    record ActLine(java.time.Instant occurredAt, LocalDate date, String docType, long docId, String docNumber, @Schema(nullable = true) String note,
            @Schema(description = "Qarz oshdi") String debit, @Schema(description = "Qarz kamaydi") String credit, String balance) {}

    record Act(long counterpartyId, String name, String tin, long branchId, String branch, LocalDate from, LocalDate to, String opening,
            String debitTotal, String creditTotal, String closing, List<ActLine> lines) {}

    record SupplierInvoice(long receiptId, String number, long branchId, String branch, long supplierId, String supplier, LocalDate date,
            String paymentType, @Schema(nullable = true) String owner, @Schema(nullable = true) LocalDate dueDate, boolean prepaid,
            String sum, String paid, String left, @Schema(nullable = true, description = "Toʻlov kunigacha qolgan kun (manfiy — kechikkan)") Integer days) {}

    record SupplierInvoices(LocalDate today, List<SupplierInvoice> rows) {}

    private final JdbcClient jdbc;
    private final PartyLedger parties;
    private final Clock clock;

    Debts(JdbcClient jdbc, PartyLedger parties, Clock clock) {
        this.jdbc = jdbc;
        this.parties = parties;
        this.clock = clock;
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(TASHKENT));
    }

    private record Open(long branchId, long counterpartyId, LocalDate due, Money open) {}

    @Transactional(readOnly = true)
    DebtReport report(Actor actor, Side side, Long branchId) {
        if (branchId == null ? !actor.allBranches() : !actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        LocalDate today = today();
        // PartyLedger.openDocs bilan bir xil qoida, lekin filialdagi barcha kontragentlar uchun bitta so'rovda
        List<Open> open = jdbc.sql("""
                WITH own AS (SELECT branch_id, counterparty_id, doc_type, doc_id, min(due_date) AS due, min(occurred_at) AS at, sum(amount) AS amt
                             FROM party_ledger WHERE side = :s AND applies_doc_type IS NULL AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)
                             GROUP BY branch_id, counterparty_id, doc_type, doc_id),
                     app AS (SELECT branch_id, counterparty_id, applies_doc_type AS t, applies_doc_id AS i, sum(amount) AS amt
                             FROM party_ledger WHERE side = :s AND applies_doc_type IS NOT NULL AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)
                             GROUP BY branch_id, counterparty_id, applies_doc_type, applies_doc_id)
                SELECT own.branch_id, own.counterparty_id, own.due, own.amt + coalesce(app.amt, 0) AS open
                FROM own LEFT JOIN app ON app.branch_id = own.branch_id AND app.counterparty_id = own.counterparty_id AND app.t = own.doc_type
                                      AND app.i = own.doc_id
                WHERE own.amt + coalesce(app.amt, 0) <> 0
                ORDER BY own.branch_id, own.counterparty_id, coalesce(own.due, (own.at AT TIME ZONE 'Asia/Tashkent')::date), own.at, own.doc_id""")
                .param("s", side.name())
                .param("b", branchId)
                .query((rs, n) -> new Open(rs.getLong("branch_id"), rs.getLong("counterparty_id"),
                        rs.getDate("due") == null ? null : rs.getDate("due").toLocalDate(), new Money(rs.getBigDecimal("open"))))
                .list();
        // (filial, kontragent) bo'yicha guruh — hisob har filialda alohida, keyin kontragent bo'yicha qo'shiladi
        Map<Long, Aging.Result> byParty = new LinkedHashMap<>();
        int i = 0;
        while (i < open.size()) {
            Open first = open.get(i);
            List<Aging.Doc> docs = new ArrayList<>();
            while (i < open.size() && open.get(i).branchId() == first.branchId() && open.get(i).counterpartyId() == first.counterpartyId()) {
                docs.add(new Aging.Doc(open.get(i).due(), open.get(i).open()));
                i++;
            }
            byParty.merge(first.counterpartyId(), Aging.of(docs, today), Aging.Result::plus);
        }
        if (byParty.isEmpty()) {
            return new DebtReport(branchId, today, Buckets.of(Aging.Result.EMPTY), List.of());
        }
        record Info(String name, String tin, String phone, BigDecimal limit, LocalDate lastPayment, String region, String operator, Integer days) {}
        String payDoc = side == Side.CUSTOMER ? "MT" : "YT";
        Map<Long, Info> info = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT c.id, c.name, c.tin, c.phone, t.credit_limit, t.%s AS pay_days,
                       (SELECT max((p.occurred_at AT TIME ZONE 'Asia/Tashkent')::date) FROM party_ledger p
                        WHERE p.counterparty_id = c.id AND p.side = :s AND p.doc_type = :pd AND (CAST(:b AS BIGINT) IS NULL OR p.branch_id = :b)) AS last_pay,
                       rg.name AS region,
                       (SELECT string_agg(DISTINCT e.full_name, ', ') FROM counterparty_branch_terms ot JOIN employee e ON e.id = ot.operator_employee_id
                        WHERE ot.counterparty_id = c.id AND (CAST(:b AS BIGINT) IS NULL OR ot.branch_id = :b)) AS operator
                FROM counterparty c LEFT JOIN counterparty_branch_terms t ON t.counterparty_id = c.id AND t.branch_id = :b
                LEFT JOIN region rg ON rg.id = c.region_id
                WHERE c.id IN (:ids)""".formatted(side == Side.CUSTOMER ? "payment_days" : "supplier_payment_days"))
                .param("s", side.name())
                .param("pd", payDoc)
                .param("b", branchId)
                .param("ids", byParty.keySet())
                .query((rs, n) -> {
                    info.put(rs.getLong("id"), new Info(rs.getString("name"), rs.getString("tin"), rs.getString("phone"),
                            side == Side.CUSTOMER ? rs.getBigDecimal("credit_limit") : null,
                            rs.getDate("last_pay") == null ? null : rs.getDate("last_pay").toLocalDate(), rs.getString("region"),
                            side == Side.CUSTOMER ? rs.getString("operator") : null, rs.getObject("pay_days", Integer.class)));
                    return 0;
                })
                .list();
        Aging.Result total = Aging.Result.EMPTY;
        List<DebtRow> rows = new ArrayList<>();
        for (Map.Entry<Long, Aging.Result> e : byParty.entrySet()) {
            Aging.Result r = e.getValue();
            total = total.plus(r);
            Info c = info.get(e.getKey());
            rows.add(new DebtRow(e.getKey(), c.name(), c.tin(), c.phone(), Buckets.of(r), r.maxOverdueDays(),
                    c.limit() == null ? null : new Money(c.limit()).toString(), c.lastPayment(), c.region(), c.operator(), c.days()));
        }
        // Eng ko'p muddati o'tgan qarz birinchi, keyin umumiy qarz
        rows.sort(Comparator.comparing((DebtRow r) -> Money.of(r.buckets().overdue())).reversed()
                .thenComparing((DebtRow r) -> Money.of(r.buckets().debt()), Comparator.reverseOrder()));
        return new DebtReport(branchId, today, Buckets.of(total), rows);
    }

    /**
     * YB qarzi — kirim (KR) boʻyicha (prototip Payables): summa, toʻlangan, qoldiq, toʻlov kuni, toʻlov turi, kim nomiga. Ochiq kirimlar va
     * oxirgi 30 kundagi oldindan toʻlangan kirimlar.
     */
    @Transactional(readOnly = true)
    SupplierInvoices supplierInvoices(Actor actor, Long branchId) {
        if (branchId == null ? !actor.allBranches() : !actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        LocalDate today = today();
        List<SupplierInvoice> rows = jdbc.sql("""
                WITH own AS (SELECT doc_id, sum(amount) AS amt FROM party_ledger
                             WHERE side = 'SUPPLIER' AND doc_type = 'KR' AND applies_doc_type IS NULL AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)
                             GROUP BY doc_id),
                     app AS (SELECT applies_doc_id AS i, sum(amount) AS amt FROM party_ledger
                             WHERE side = 'SUPPLIER' AND applies_doc_type = 'KR' AND (CAST(:b AS BIGINT) IS NULL OR branch_id = :b)
                             GROUP BY applies_doc_id)
                SELECT r.id, r.number, r.branch_id, b.name AS bname, c.id AS cid, c.name AS cname, r.receipt_date, r.payment_type, e.full_name,
                       r.due_date, r.prepaid, own.amt AS total, -coalesce(app.amt, 0) AS paid, own.amt + coalesce(app.amt, 0) AS left_amt
                FROM own JOIN receipt r ON r.id = own.doc_id JOIN branch b ON b.id = r.branch_id JOIN counterparty c ON c.id = r.supplier_id
                     LEFT JOIN employee e ON e.id = r.owner_id LEFT JOIN app ON app.i = own.doc_id
                WHERE own.amt + coalesce(app.amt, 0) > 0 OR (r.prepaid AND r.receipt_date >= :since)
                ORDER BY r.due_date NULLS LAST, r.receipt_date, r.id
                LIMIT 2000""")
                .param("b", branchId)
                .param("since", java.sql.Date.valueOf(today.minusDays(30)))
                .query((rs, n) -> {
                    Money left = new Money(rs.getBigDecimal("left_amt"));
                    LocalDate due = rs.getDate("due_date") == null ? null : rs.getDate("due_date").toLocalDate();
                    Integer days = due == null || !left.isPositive() ? null : (int) java.time.temporal.ChronoUnit.DAYS.between(today, due);
                    return new SupplierInvoice(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getString("bname"),
                            rs.getLong("cid"), rs.getString("cname"), rs.getDate("receipt_date").toLocalDate(), rs.getString("payment_type"),
                            rs.getString("full_name"), due, rs.getBoolean("prepaid"), new Money(rs.getBigDecimal("total")).toString(),
                            new Money(rs.getBigDecimal("paid")).toString(), left.isPositive() ? left.toString() : "0.00", days);
                })
                .list();
        return new SupplierInvoices(today, rows);
    }

    @Transactional(readOnly = true)
    List<DebtDoc> docs(Actor actor, Side side, Long branchId, long counterpartyId) {
        if (branchId == null ? !actor.allBranches() : !actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        LocalDate today = today();
        List<Long> branches = branchId != null ? List.of(branchId)
                : jdbc.sql("SELECT DISTINCT branch_id FROM party_ledger WHERE counterparty_id = :c AND side = :s ORDER BY 1")
                        .param("c", counterpartyId).param("s", side.name()).query(Long.class).list();
        List<DebtDoc> out = new ArrayList<>();
        for (long b : branches) {
            String name = jdbc.sql("SELECT name FROM branch WHERE id = :b").param("b", b).query(String.class).single();
            for (PartyLedger.OpenDoc d : parties.openDocs(b, counterpartyId, side)) {
                int overdue = d.dueDate() != null && d.dueDate().isBefore(today) && d.open().isPositive()
                        ? (int) java.time.temporal.ChronoUnit.DAYS.between(d.dueDate(), today) : 0;
                out.add(new DebtDoc(b, name, d.type(), d.id(), d.number(), d.date(), d.dueDate(), d.open().toString(), overdue,
                        d.total().toString(), d.returned().toString(), d.paid().toString()));
            }
        }
        return out;
    }

    /**
     * Akt sverka (prototip holatida, SPEC 5.5): davr boshi qoldig'i, har hujjat (qarz oshdi / kamaydi) va davr oxiri. Musbat qoldiq —
     * mijoz (yoki kompaniya YB ga) qarzdor, manfiy — avans.
     */
    @Transactional(readOnly = true)
    Act act(Actor actor, Side side, long branchId, long counterpartyId, LocalDate from, LocalDate to) {
        if (!actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        LocalDate t = to == null ? today() : to;
        LocalDate f = from == null ? t.withDayOfMonth(1) : from;
        if (f.isAfter(t)) {
            throw MedixException.badRequest("cash.periodInvalid");
        }
        record Party(String name, String tin) {}
        Party p = jdbc.sql("SELECT name, tin FROM counterparty WHERE id = :c")
                .param("c", counterpartyId)
                .query((rs, n) -> new Party(rs.getString("name"), rs.getString("tin")))
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        String branch = jdbc.sql("SELECT name FROM branch WHERE id = :b").param("b", branchId).query(String.class).single();
        Money opening = new Money(jdbc.sql("""
                SELECT coalesce(sum(amount), 0) FROM party_ledger WHERE branch_id = :b AND counterparty_id = :c AND side = :s
                  AND (occurred_at AT TIME ZONE 'Asia/Tashkent')::date < :f""")
                .param("b", branchId)
                .param("c", counterpartyId)
                .param("s", side.name())
                .param("f", java.sql.Date.valueOf(f))
                .query(BigDecimal.class)
                .single());
        record Raw(java.time.Instant at, LocalDate date, String type, long id, String number, String note, Money amount) {}
        List<Raw> raw = jdbc.sql("""
                SELECT occurred_at, (occurred_at AT TIME ZONE 'Asia/Tashkent')::date AS d, doc_type, doc_id, doc_number, note, amount
                FROM party_ledger WHERE branch_id = :b AND counterparty_id = :c AND side = :s
                  AND (occurred_at AT TIME ZONE 'Asia/Tashkent')::date BETWEEN :f AND :t
                ORDER BY occurred_at, id LIMIT 5000""")
                .param("b", branchId)
                .param("c", counterpartyId)
                .param("s", side.name())
                .param("f", java.sql.Date.valueOf(f))
                .param("t", java.sql.Date.valueOf(t))
                .query((rs, n) -> new Raw(rs.getTimestamp("occurred_at").toInstant(), rs.getDate("d").toLocalDate(), rs.getString("doc_type"),
                        rs.getLong("doc_id"), rs.getString("doc_number"), rs.getString("note"), new Money(rs.getBigDecimal("amount"))))
                .list();
        Money balance = opening;
        Money debit = Money.ZERO;
        Money credit = Money.ZERO;
        List<ActLine> lines = new ArrayList<>();
        for (Raw r : raw) {
            balance = balance.plus(r.amount());
            Money abs = r.amount().isNegative() ? Money.ZERO.minus(r.amount()) : r.amount();
            if (r.amount().isNegative()) {
                credit = credit.plus(abs);
            } else {
                debit = debit.plus(abs);
            }
            lines.add(new ActLine(r.at(), r.date(), r.type(), r.id(), r.number(), r.note(), r.amount().isNegative() ? "0.00" : abs.toString(),
                    r.amount().isNegative() ? abs.toString() : "0.00", balance.toString()));
        }
        return new Act(counterpartyId, p.name(), p.tin(), branchId, branch, f, t, opening.toString(), debit.toString(), credit.toString(),
                balance.toString(), lines);
    }
}
