package uz.medix.finance.payment;

import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.CashierGuard;
import uz.medix.finance.CustomerPayments;
import uz.medix.finance.MoneyLedger;
import uz.medix.finance.PartyLedger;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.finance.account.Accounts;
import uz.medix.finance.payment.PaymentModels.PaymentAllocation;
import uz.medix.finance.payment.PaymentModels.PaymentAllocationRequest;
import uz.medix.finance.payment.PaymentModels.OpenDocView;
import uz.medix.finance.payment.PaymentModels.DocPayment;
import uz.medix.finance.payment.PaymentModels.DocPaymentLine;
import uz.medix.finance.payment.PaymentModels.OpenDocs;
import uz.medix.finance.payment.PaymentModels.PaymentDetail;
import uz.medix.finance.payment.PaymentModels.PaymentRequest;
import uz.medix.finance.payment.PaymentModels.PaymentSource;
import uz.medix.finance.payment.PaymentModels.PaymentStatus;
import uz.medix.finance.payment.PaymentModels.PaymentSummary;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * Mijozdan to'lov — MT (SPEC 5.5): Qoralama → O'tkazilgan → Bekor qilingan. O'tkazish bitta tranzaksiyada: taqsimot (eng eski
 * qarzdan yoki qo'lda), qarz jurnali (har taqsimot — o'z hujjatiga, ortig'i — avans), pul jurnali (hisob qoldig'i), audit.
 * Bir mijozning to'lovlari parallel o'tkazilmaydi (advisory lock) — bitta qarz ikki marta yopilmaydi.
 */
@Service
class Payments implements CustomerPayments {

    static final String DOC_TYPE = "MT";
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final PartyLedger parties;
    private final MoneyLedger money;
    private final Accounts accounts;
    private final CashierGuard cashiers;
    private final DocumentSequenceService numbers;
    private final AuditLog audit;
    private final Clock clock;

    Payments(JdbcClient jdbc, PartyLedger parties, MoneyLedger money, Accounts accounts, CashierGuard cashiers, DocumentSequenceService numbers, AuditLog audit,
            Clock clock) {
        this.jdbc = jdbc;
        this.parties = parties;
        this.money = money;
        this.accounts = accounts;
        this.cashiers = cashiers;
        this.numbers = numbers;
        this.audit = audit;
        this.clock = clock;
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(TASHKENT));
    }

    // ===== Ochiq qarzlar =====

    @Transactional(readOnly = true)
    /** Mijoz hujjati (masalan, SV) bo'yicha to'lov holati: summa, yopilgan, ochiq qism, muddat va taqsimlangan MT lar. */
    @Transactional(readOnly = true)
    DocPayment docPayment(Actor actor, String docType, long docId) {
        record Own(long branchId, java.math.BigDecimal total, LocalDate due) {}
        Own own = jdbc.sql("""
                SELECT min(branch_id) AS branch_id, coalesce(sum(amount), 0) AS total, min(due_date) AS due FROM party_ledger
                WHERE doc_type = :t AND doc_id = :d AND applies_doc_type IS NULL AND side = 'CUSTOMER'""")
                .param("t", docType)
                .param("d", docId)
                .query((rs, n) -> new Own(rs.getLong("branch_id"), rs.getBigDecimal("total"),
                        rs.getDate("due") == null ? null : rs.getDate("due").toLocalDate()))
                .single();
        if (own.branchId() == 0 || !actor.canAccessBranch(own.branchId())) {
            throw MedixException.notFound("error.notFound");
        }
        Money total = new Money(own.total());
        Money open = parties.docOpen(docType, docId);
        LocalDate today = today();
        int overdue = open.isPositive() && own.due() != null && own.due().isBefore(today)
                ? (int) java.time.temporal.ChronoUnit.DAYS.between(own.due(), today) : 0;
        List<DocPaymentLine> lines = jdbc.sql("""
                SELECT p.id, p.number, p.payment_date, a.name AS account, sum(al.amount) AS amount
                FROM customer_payment_alloc al JOIN customer_payment p ON p.id = al.payment_id JOIN money_account a ON a.id = p.account_id
                WHERE al.doc_type = :t AND al.doc_id = :d AND p.status = 'POSTED'
                GROUP BY p.id, p.number, p.payment_date, a.name ORDER BY p.payment_date, p.id""")
                .param("t", docType)
                .param("d", docId)
                .query((rs, n) -> new DocPaymentLine(rs.getLong("id"), rs.getString("number"), rs.getDate("payment_date").toLocalDate(),
                        rs.getString("account"), new Money(rs.getBigDecimal("amount")).toString()))
                .list();
        return new DocPayment(total.toString(), total.minus(open).toString(), open.toString(), own.due(), overdue, lines);
    }

    OpenDocs openDocs(Actor actor, long branchId, long customerId) {
        if (!actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        LocalDate today = today();
        Money debt = Money.ZERO;
        Money advance = Money.ZERO;
        List<OpenDocView> docs = new ArrayList<>();
        for (PartyLedger.OpenDoc d : parties.openDocs(branchId, customerId, Side.CUSTOMER)) {
            debt = debt.plus(d.open());
            if (d.open().isNegative()) {
                advance = advance.minus(d.open());
                continue;
            }
            int overdue = d.dueDate() != null && d.dueDate().isBefore(today)
                    ? (int) java.time.temporal.ChronoUnit.DAYS.between(d.dueDate(), today) : 0;
            docs.add(new OpenDocView(d.type(), d.id(), d.number(), d.date(), d.dueDate(), d.open().toString(), overdue));
        }
        return new OpenDocs(debt.toString(), advance.toString(), docs);
    }

    // ===== Qoralama =====

    private record Checked(long branchId, long customerId, long accountId, LocalDate date, Money amount, String note) {}

    private Checked check(Actor actor, PaymentRequest r) {
        if (!actor.canAccessBranch(r.branchId())) {
            throw MedixException.notFound("error.notFound");
        }
        boolean customer = jdbc.sql("SELECT EXISTS (SELECT 1 FROM counterparty WHERE id = :c AND is_customer)")
                .param("c", r.customerId()).query(Boolean.class).single();
        if (!customer) {
            throw MedixException.badRequest("payment.customerUnknown");
        }
        Accounts.Account acc = accounts.find(r.accountId())
                .filter(a -> a.branchId() == r.branchId() && a.active())
                .orElseThrow(() -> MedixException.badRequest("payment.accountUnknown"));
        cashiers.check(acc.id());
        Money amount;
        try {
            amount = Money.of(r.amount().strip());
        } catch (RuntimeException e) {
            throw MedixException.badRequest("payment.amountInvalid");
        }
        if (!amount.isPositive()) {
            throw MedixException.badRequest("payment.amountInvalid");
        }
        LocalDate date = r.paymentDate() == null ? today() : r.paymentDate();
        if (date.isAfter(today())) {
            throw MedixException.badRequest("payment.dateFuture");
        }
        String note = r.note() == null || r.note().isBlank() ? null : r.note().strip();
        return new Checked(r.branchId(), r.customerId(), acc.id(), date, amount, note);
    }

    @Transactional
    long create(Actor actor, PaymentRequest r) {
        return insert(actor, check(actor, r), PaymentSource.MANUAL, null);
    }

    private long insert(Actor actor, Checked c, PaymentSource source, String sourceRef) {
        String branchCode = jdbc.sql("SELECT code FROM branch WHERE id = :b").param("b", c.branchId()).query(String.class).single();
        String number = numbers.next(DocumentPrefix.MT, branchCode).toString();
        long id = jdbc.sql("""
                INSERT INTO customer_payment (number, branch_id, customer_id, account_id, payment_date, amount, source, source_ref, note, created_by)
                VALUES (:n, :b, :c, :a, :d, :amt, :src, :ref, :note, :by) RETURNING id""")
                .param("n", number)
                .param("b", c.branchId())
                .param("c", c.customerId())
                .param("a", c.accountId())
                .param("d", Date.valueOf(c.date()))
                .param("amt", c.amount().amount())
                .param("src", source.name())
                .param("ref", sourceRef)
                .param("note", c.note())
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        audit.record(AuditEntry.of("payment.create", "customer_payment", id).change(null, Map.of("number", number, "amount", c.amount().toString())));
        return id;
    }

    private record Head(long id, String number, long branchId, long customerId, long accountId, LocalDate date, Money amount, PaymentStatus status,
            long version) {}

    private Head lock(Actor actor, long id) {
        return jdbc.sql("""
                SELECT id, number, branch_id, customer_id, account_id, payment_date, amount, status, version FROM customer_payment
                WHERE id = :id FOR UPDATE""")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("customer_id"),
                        rs.getLong("account_id"), rs.getDate("payment_date").toLocalDate(), new Money(rs.getBigDecimal("amount")),
                        PaymentStatus.valueOf(rs.getString("status")), rs.getLong("version")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @Transactional
    void update(Actor actor, long id, PaymentRequest r) {
        Head h = lock(actor, id);
        if (h.status() != PaymentStatus.DRAFT) {
            throw MedixException.conflict("payment.notDraft");
        }
        Checked c = check(actor, r);
        if (c.branchId() != h.branchId()) {
            throw MedixException.badRequest("payment.branchChange");
        }
        jdbc.sql("""
                UPDATE customer_payment SET customer_id = :c, account_id = :a, payment_date = :d, amount = :amt, note = :note, updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("c", c.customerId())
                .param("a", c.accountId())
                .param("d", Date.valueOf(c.date()))
                .param("amt", c.amount().amount())
                .param("note", c.note())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("payment.update", "customer_payment", id).change(Map.of("amount", h.amount().toString()),
                Map.of("amount", c.amount().toString())));
    }

    // ===== O'tkazish =====

    @Transactional
    void post(Actor actor, long id, List<PaymentAllocationRequest> manual) {
        Head h = lock(actor, id);
        if (h.status() != PaymentStatus.DRAFT) {
            throw MedixException.conflict("payment.notDraft");
        }
        doPost(actor, h, manual);
    }

    private void doPost(Actor actor, Head h, List<PaymentAllocationRequest> manual) {
        // Bir mijozning (filialda) to'lovlari ketma-ket taqsimlanadi
        lockParty(h.branchId(), h.customerId());
        List<Allocator.Doc> docs = parties.openDocs(h.branchId(), h.customerId(), Side.CUSTOMER).stream()
                .filter(d -> d.open().isPositive())
                .map(d -> new Allocator.Doc(d.type(), d.id(), d.number(), d.open()))
                .toList();
        Allocator.Result res;
        try {
            if (manual == null) {
                res = Allocator.auto(docs, h.amount());
            } else {
                List<Allocator.Manual> wanted = new ArrayList<>();
                for (PaymentAllocationRequest a : manual) {
                    Money m;
                    try {
                        m = Money.of(a.amount().strip());
                    } catch (RuntimeException e) {
                        throw new Allocator.Invalid("payment.allocInvalid");
                    }
                    wanted.add(new Allocator.Manual(a.docType(), a.docId(), m));
                }
                res = Allocator.manual(docs, h.amount(), wanted);
            }
        } catch (Allocator.Invalid e) {
            throw MedixException.badRequest(e.code);
        }
        PartyLedger.DocRef self = new PartyLedger.DocRef(DOC_TYPE, h.id(), h.number());
        for (Allocator.Part p : res.parts()) {
            parties.record(self, h.branchId(), h.customerId(), Side.CUSTOMER, Money.ZERO.minus(p.amount()), null, "Toʻlov → " + p.doc().number(),
                    new PartyLedger.DocRef(p.doc().type(), p.doc().id(), p.doc().number()));
            jdbc.sql("INSERT INTO customer_payment_alloc (payment_id, doc_type, doc_id, doc_number, amount) VALUES (:p, :t, :i, :n, :a)")
                    .param("p", h.id())
                    .param("t", p.doc().type())
                    .param("i", p.doc().id())
                    .param("n", p.doc().number())
                    .param("a", p.amount().amount())
                    .update();
        }
        if (res.advance().isPositive()) {
            parties.record(self, h.branchId(), h.customerId(), Side.CUSTOMER, Money.ZERO.minus(res.advance()), null, "Avans");
        }
        money.post(h.accountId(), h.date(), h.amount(), new MoneyLedger.DocRef(DOC_TYPE, h.id(), h.number()), "MT");
        jdbc.sql("""
                UPDATE customer_payment SET status = 'POSTED', advance = :adv, posted_by = :by, posted_at = now(), updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("adv", res.advance().amount())
                .param("by", actor.employeeId())
                .param("id", h.id())
                .update();
        audit.record(AuditEntry.of("payment.post", "customer_payment", h.id()).change(Map.of("status", "DRAFT"),
                Map.of("status", "POSTED", "allocated", res.parts().size(), "advance", res.advance().toString())));
    }

    // ===== Bekor qilish =====

    @Transactional
    void cancel(Actor actor, long id, String reason) {
        Head h = lock(actor, id);
        String why = reason.strip();
        if (h.status() == PaymentStatus.CANCELLED) {
            throw MedixException.conflict("payment.alreadyCancelled");
        }
        if (h.status() == PaymentStatus.POSTED) {
            lockParty(h.branchId(), h.customerId());
            PartyLedger.DocRef self = new PartyLedger.DocRef(DOC_TYPE, h.id(), h.number());
            // Har yozuv teskarisi bilan: taqsimotlar o'z hujjatiga qaytadi, avans yopiladi
            jdbc.sql("""
                    SELECT applies_doc_type, applies_doc_id, sum(amount) AS amt FROM party_ledger
                    WHERE doc_type = :t AND doc_id = :i GROUP BY applies_doc_type, applies_doc_id HAVING sum(amount) <> 0""")
                    .param("t", DOC_TYPE)
                    .param("i", h.id())
                    .query((rs, n) -> new Object[] {rs.getString("applies_doc_type"), (Long) rs.getObject("applies_doc_id"), rs.getBigDecimal("amt")})
                    .list()
                    .forEach(row -> {
                        String at = (String) row[0];
                        Long ai = (Long) row[1];
                        Money back = Money.ZERO.minus(new Money((java.math.BigDecimal) row[2]));
                        parties.record(self, h.branchId(), h.customerId(), Side.CUSTOMER, back, null, "Bekor: " + why,
                                at == null ? null : new PartyLedger.DocRef(at, ai, docNumber(at, ai)));
                    });
            money.post(h.accountId(), today(), Money.ZERO.minus(h.amount()), new MoneyLedger.DocRef(DOC_TYPE, h.id(), h.number()), "Bekor: " + why);
        }
        jdbc.sql("""
                UPDATE customer_payment SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r, updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", why)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("payment.cancel", "customer_payment", id).change(Map.of("status", h.status().name()),
                Map.of("status", "CANCELLED")).withReason(why));
    }

    private void lockParty(long branchId, long customerId) {
        jdbc.sql("SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended('party:CUSTOMER:' || :b || ':' || :c, 0))) x")
                .param("b", branchId)
                .param("c", customerId)
                .query(Integer.class)
                .single();
    }

    private String docNumber(String type, long id) {
        return jdbc.sql("SELECT min(doc_number) FROM party_ledger WHERE doc_type = :t AND doc_id = :i")
                .param("t", type).param("i", id).query(String.class).single();
    }

    // ===== Haydovchidagi pul (ochiq API) =====

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Posted acceptDriverCash(Actor actor, long branchId, long customerId, long accountId, Money amount, String sourceRef, String note) {
        Accounts.Account acc = accounts.find(accountId)
                .filter(a -> a.branchId() == branchId && a.active() && a.kind() == Accounts.Kind.CASH)
                .orElseThrow(() -> MedixException.badRequest("payment.cashAccountRequired"));
        Checked c = new Checked(branchId, customerId, acc.id(), today(), amount, note);
        long id = insert(actor, c, PaymentSource.DRIVER, sourceRef);
        Head h = lock(actor, id);
        doPost(actor, h, null);
        return new Posted(id, h.number());
    }

    // ===== O'qish =====

    private static final String SUMMARY = """
            SELECT p.id, p.number, p.branch_id, p.customer_id, c.name AS customer, c.tin AS customer_tin, p.account_id, a.name AS account,
                   a.kind AS account_kind, p.payment_date, p.amount, p.advance, p.status, p.source, p.source_ref, p.note, cb.full_name AS created_by,
                   p.created_at, pb.full_name AS posted_by, p.posted_at, xb.full_name AS cancelled_by, p.cancelled_at, p.cancel_reason, p.version
            FROM customer_payment p JOIN counterparty c ON c.id = p.customer_id JOIN money_account a ON a.id = p.account_id
            JOIN employee cb ON cb.id = p.created_by LEFT JOIN employee pb ON pb.id = p.posted_by LEFT JOIN employee xb ON xb.id = p.cancelled_by""";

    @Transactional(readOnly = true)
    List<PaymentSummary> list(Actor actor, Long branchId, PaymentStatus status, Long customerId) {
        return jdbc.sql(SUMMARY + """
                 WHERE (CAST(:b AS BIGINT) IS NULL OR p.branch_id = :b) AND (CAST(:s AS VARCHAR) IS NULL OR p.status = :s)
                   AND (CAST(:c AS BIGINT) IS NULL OR p.customer_id = :c)
                ORDER BY p.payment_date DESC, p.id DESC LIMIT 300""")
                .param("b", branchId)
                .param("s", status == null ? null : status.name())
                .param("c", customerId)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id"))
                        ? new PaymentSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("customer_id"),
                                rs.getString("customer"), rs.getLong("account_id"), rs.getString("account"), rs.getString("account_kind"),
                                rs.getDate("payment_date").toLocalDate(), new Money(rs.getBigDecimal("amount")).toString(),
                                PaymentStatus.valueOf(rs.getString("status")), PaymentSource.valueOf(rs.getString("source")), rs.getString("created_by"),
                                rs.getTimestamp("created_at").toInstant())
                        : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .toList();
    }

    @Transactional(readOnly = true)
    PaymentDetail find(Actor actor, long id) {
        List<PaymentAllocation> allocs = jdbc.sql("SELECT doc_type, doc_id, doc_number, amount FROM customer_payment_alloc WHERE payment_id = :p ORDER BY id")
                .param("p", id)
                .query((rs, n) -> new PaymentAllocation(rs.getString("doc_type"), rs.getLong("doc_id"), rs.getString("doc_number"),
                        new Money(rs.getBigDecimal("amount")).toString()))
                .list();
        return jdbc.sql(SUMMARY + " WHERE p.id = :id")
                .param("id", id)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id"))
                        ? new PaymentDetail(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("customer_id"),
                                rs.getString("customer"), rs.getString("customer_tin"), rs.getLong("account_id"), rs.getString("account"),
                                rs.getString("account_kind"), rs.getDate("payment_date").toLocalDate(), new Money(rs.getBigDecimal("amount")).toString(),
                                rs.getBigDecimal("advance") == null ? null : new Money(rs.getBigDecimal("advance")).toString(),
                                PaymentStatus.valueOf(rs.getString("status")), PaymentSource.valueOf(rs.getString("source")), rs.getString("source_ref"),
                                rs.getString("note"), rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(), rs.getString("posted_by"),
                                rs.getTimestamp("posted_at") == null ? null : rs.getTimestamp("posted_at").toInstant(), rs.getString("cancelled_by"),
                                rs.getTimestamp("cancelled_at") == null ? null : rs.getTimestamp("cancelled_at").toInstant(),
                                rs.getString("cancel_reason"), rs.getLong("version"), allocs)
                        : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .findFirst()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }
}
