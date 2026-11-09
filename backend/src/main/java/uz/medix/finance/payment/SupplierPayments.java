package uz.medix.finance.payment;

import java.math.BigDecimal;
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
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.CashierGuard;
import uz.medix.finance.MoneyLedger;
import uz.medix.finance.PartyLedger;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.finance.account.Accounts;
import uz.medix.finance.payment.PaymentModels.BankRefs;
import uz.medix.finance.payment.PaymentModels.OpenDocView;
import uz.medix.finance.payment.PaymentModels.OpenDocs;
import uz.medix.finance.payment.PaymentModels.PaymentAllocation;
import uz.medix.finance.payment.PaymentModels.PaymentAllocationRequest;
import uz.medix.finance.payment.PaymentModels.SupplierPaymentDetail;
import uz.medix.finance.payment.PaymentModels.SupplierPaymentRequest;
import uz.medix.finance.payment.PaymentModels.SupplierPaymentStatus;
import uz.medix.finance.payment.PaymentModels.SupplierPaymentSummary;
import uz.medix.notification.Notifications;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * Yetkazib beruvchiga to'lov — YT (SPEC 5.5): Qoralama → Tasdiqlashda → O'tkazilgan (tasdiq — payments.ytApprove; tasdiqsiz —
 * payments.ytDirect). O'tkazish bitta tranzaksiyada: taqsimot (eng eski kirim qarzidan yoki qo'lda; ortig'i — YB avansi), qarz
 * jurnali, pul jurnali (hisobdan chiqim — qoldiq yetmasa o'tkazilmaydi), audit. Bir YB ning to'lovlari ketma-ket (advisory lock).
 */
@Service
class SupplierPayments {

    static final String DOC_TYPE = "YT";
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final PartyLedger parties;
    private final MoneyLedger money;
    private final Accounts accounts;
    private final CashierGuard cashiers;
    private final DocumentSequenceService numbers;
    private final AuditLog audit;
    private final Clock clock;
    private final Notifications notifications;

    SupplierPayments(JdbcClient jdbc, PartyLedger parties, MoneyLedger money, Accounts accounts, CashierGuard cashiers, DocumentSequenceService numbers, AuditLog audit,
            Clock clock, Notifications notifications) {
        this.notifications = notifications;
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

    @Transactional(readOnly = true)
    OpenDocs openDocs(Actor actor, long branchId, long supplierId) {
        if (!actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        LocalDate today = today();
        Money debt = Money.ZERO;
        Money advance = Money.ZERO;
        List<OpenDocView> docs = new ArrayList<>();
        for (PartyLedger.OpenDoc d : parties.openDocs(branchId, supplierId, Side.SUPPLIER)) {
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

    private record Checked(long branchId, long supplierId, long accountId, LocalDate date, Money amount, String note, BankRefs refs) {}

    private Checked check(Actor actor, SupplierPaymentRequest r) {
        if (!actor.canAccessBranch(r.branchId())) {
            throw MedixException.notFound("error.notFound");
        }
        boolean supplier = jdbc.sql("SELECT EXISTS (SELECT 1 FROM counterparty WHERE id = :c AND is_supplier)")
                .param("c", r.supplierId()).query(Boolean.class).single();
        if (!supplier) {
            throw MedixException.badRequest("payment.supplierUnknown");
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
        return new Checked(r.branchId(), r.supplierId(), acc.id(), date, amount, r.note() == null || r.note().isBlank() ? null : r.note().strip(),
                BankRefs.of(r.payOrderNo(), r.bankDate(), r.checkNo()));
    }

    @Transactional
    long create(Actor actor, SupplierPaymentRequest r) {
        Checked c = check(actor, r);
        String branchCode = jdbc.sql("SELECT code FROM branch WHERE id = :b").param("b", c.branchId()).query(String.class).single();
        String number = numbers.next(DocumentPrefix.YT, branchCode).toString();
        long id = jdbc.sql("""
                INSERT INTO supplier_payment (number, branch_id, supplier_id, account_id, payment_date, amount, note, created_by,
                                              pay_order_no, bank_date, check_no)
                VALUES (:n, :b, :s, :a, :d, :amt, :note, :by, :pon, :bd, :chk) RETURNING id""")
                .param("pon", c.refs().payOrderNo())
                .param("bd", c.refs().bankDate() == null ? null : Date.valueOf(c.refs().bankDate()))
                .param("chk", c.refs().checkNo())
                .param("n", number)
                .param("b", c.branchId())
                .param("s", c.supplierId())
                .param("a", c.accountId())
                .param("d", Date.valueOf(c.date()))
                .param("amt", c.amount().amount())
                .param("note", c.note())
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        audit.record(AuditEntry.of("ytpayment.create", "supplier_payment", id).change(null, Map.of("number", number, "amount", c.amount().toString())));
        return id;
    }

    private record Head(long id, String number, long branchId, long supplierId, long accountId, LocalDate date, Money amount,
            SupplierPaymentStatus status) {}

    private Head lock(Actor actor, long id) {
        return jdbc.sql("""
                SELECT id, number, branch_id, supplier_id, account_id, payment_date, amount, status FROM supplier_payment WHERE id = :id FOR UPDATE""")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("supplier_id"),
                        rs.getLong("account_id"), rs.getDate("payment_date").toLocalDate(), new Money(rs.getBigDecimal("amount")),
                        SupplierPaymentStatus.valueOf(rs.getString("status"))))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @Transactional
    void update(Actor actor, long id, SupplierPaymentRequest r) {
        Head h = lock(actor, id);
        if (h.status() != SupplierPaymentStatus.DRAFT) {
            throw MedixException.conflict("payment.notDraft");
        }
        Checked c = check(actor, r);
        if (c.branchId() != h.branchId()) {
            throw MedixException.badRequest("payment.branchChange");
        }
        jdbc.sql("""
                UPDATE supplier_payment SET supplier_id = :s, account_id = :a, payment_date = :d, amount = :amt, note = :note, updated_at = now(),
                       pay_order_no = :pon, bank_date = :bd, check_no = :chk, version = version + 1 WHERE id = :id""")
                .param("pon", c.refs().payOrderNo())
                .param("bd", c.refs().bankDate() == null ? null : Date.valueOf(c.refs().bankDate()))
                .param("chk", c.refs().checkNo())
                .param("s", c.supplierId())
                .param("a", c.accountId())
                .param("d", Date.valueOf(c.date()))
                .param("amt", c.amount().amount())
                .param("note", c.note())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("ytpayment.update", "supplier_payment", id).change(Map.of("amount", h.amount().toString()),
                Map.of("amount", c.amount().toString())));
    }

    /** Qoralama → Tasdiqlashda. */
    @Transactional
    void send(Actor actor, long id) {
        Head h = lock(actor, id);
        if (h.status() != SupplierPaymentStatus.DRAFT) {
            throw MedixException.conflict("payment.notDraft");
        }
        jdbc.sql("""
                UPDATE supplier_payment SET status = 'PENDING', sent_by = :by, sent_at = now(), returned_reason = NULL, updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("ytpayment.send", "supplier_payment", id).change(Map.of("status", "DRAFT"), Map.of("status", "PENDING")));
        notifications.notify("payments.ytApprove", h.branchId(), List.of(), notifications.message("ytpayment.approval", "ytpayment.approval", "/payments?tab=yt",
                "ytpayment.approval:" + id + ":" + clock.millis(), h.number(), h.amount().format()));
    }

    /** Tasdiqlashda → Qoralama (sabab bilan). */
    @Transactional
    void returnToDraft(Actor actor, long id, String reason) {
        Head h = lock(actor, id);
        if (h.status() != SupplierPaymentStatus.PENDING) {
            throw MedixException.conflict("payment.notPending");
        }
        jdbc.sql("""
                UPDATE supplier_payment SET status = 'DRAFT', returned_reason = :r, updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("r", reason.strip())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("ytpayment.return", "supplier_payment", id).change(Map.of("status", "PENDING"), Map.of("status", "DRAFT"))
                .withReason(reason.strip()));
        long author = jdbc.sql("SELECT sent_by FROM supplier_payment WHERE id = :id").param("id", id).query(Long.class).single();
        if (author != actor.employeeId()) {
            String why = reason.strip();
            notifications.notify("-", h.branchId(), List.of(author), notifications.message("ytpayment.returned", "ytpayment.returned", "/payments?tab=yt",
                    "ytpayment.returned:" + id + ":" + clock.millis(), h.number(), why));
        }
    }

    /** Tasdiq (Tasdiqlashda → O'tkazilgan) yoki tasdiqsiz o'tkazish (Qoralama → O'tkazilgan). */
    @Transactional
    void post(Actor actor, long id, List<PaymentAllocationRequest> manual, SupplierPaymentStatus expected) {
        Head h = lock(actor, id);
        if (h.status() != expected) {
            throw MedixException.conflict(expected == SupplierPaymentStatus.PENDING ? "payment.notPending" : "payment.notDraft");
        }
        lockParty(h.branchId(), h.supplierId());
        List<Allocator.Doc> docs = parties.openDocs(h.branchId(), h.supplierId(), Side.SUPPLIER).stream()
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
            parties.record(self, h.branchId(), h.supplierId(), Side.SUPPLIER, Money.ZERO.minus(p.amount()), null, "Toʻlov → " + p.doc().number(),
                    new PartyLedger.DocRef(p.doc().type(), p.doc().id(), p.doc().number()));
            jdbc.sql("INSERT INTO supplier_payment_alloc (payment_id, doc_type, doc_id, doc_number, amount) VALUES (:p, :t, :i, :n, :a)")
                    .param("p", h.id())
                    .param("t", p.doc().type())
                    .param("i", p.doc().id())
                    .param("n", p.doc().number())
                    .param("a", p.amount().amount())
                    .update();
        }
        if (res.advance().isPositive()) {
            parties.record(self, h.branchId(), h.supplierId(), Side.SUPPLIER, Money.ZERO.minus(res.advance()), null, "Avans");
        }
        money.post(h.accountId(), h.date(), Money.ZERO.minus(h.amount()), new MoneyLedger.DocRef(DOC_TYPE, h.id(), h.number()), "YT");
        jdbc.sql("""
                UPDATE supplier_payment SET status = 'POSTED', advance = :adv, posted_by = :by, posted_at = now(), updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("adv", res.advance().amount())
                .param("by", actor.employeeId())
                .param("id", h.id())
                .update();
        audit.record(AuditEntry.of("ytpayment.post", "supplier_payment", h.id()).change(Map.of("status", expected.name()),
                Map.of("status", "POSTED", "allocated", res.parts().size(), "advance", res.advance().toString())));
    }

    @Transactional
    void cancel(Actor actor, long id, String reason) {
        Head h = lock(actor, id);
        String why = reason.strip();
        if (h.status() == SupplierPaymentStatus.CANCELLED) {
            throw MedixException.conflict("payment.alreadyCancelled");
        }
        if (h.status() == SupplierPaymentStatus.POSTED) {
            lockParty(h.branchId(), h.supplierId());
            PartyLedger.DocRef self = new PartyLedger.DocRef(DOC_TYPE, h.id(), h.number());
            record Row(String type, Long id, BigDecimal amount) {}
            List<Row> rows = jdbc.sql("""
                    SELECT applies_doc_type, applies_doc_id, sum(amount) AS amt FROM party_ledger
                    WHERE doc_type = :t AND doc_id = :i GROUP BY applies_doc_type, applies_doc_id HAVING sum(amount) <> 0""")
                    .param("t", DOC_TYPE)
                    .param("i", h.id())
                    .query((rs, n) -> new Row(rs.getString("applies_doc_type"), (Long) rs.getObject("applies_doc_id"), rs.getBigDecimal("amt")))
                    .list();
            for (Row r : rows) {
                parties.record(self, h.branchId(), h.supplierId(), Side.SUPPLIER, Money.ZERO.minus(new Money(r.amount())), null, "Bekor: " + why,
                        r.type() == null ? null : new PartyLedger.DocRef(r.type(), r.id(), docNumber(r.type(), r.id())));
            }
            money.post(h.accountId(), today(), h.amount(), new MoneyLedger.DocRef(DOC_TYPE, h.id(), h.number()), "Bekor: " + why);
        }
        jdbc.sql("""
                UPDATE supplier_payment SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r, updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", why)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("ytpayment.cancel", "supplier_payment", id).change(Map.of("status", h.status().name()),
                Map.of("status", "CANCELLED")).withReason(why));
    }

    private void lockParty(long branchId, long supplierId) {
        jdbc.sql("SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended('party:SUPPLIER:' || :b || ':' || :c, 0))) x")
                .param("b", branchId)
                .param("c", supplierId)
                .query(Integer.class)
                .single();
    }

    private String docNumber(String type, long id) {
        return jdbc.sql("SELECT min(doc_number) FROM party_ledger WHERE doc_type = :t AND doc_id = :i")
                .param("t", type).param("i", id).query(String.class).single();
    }

    private static final String SELECT = """
            SELECT p.id, p.number, p.branch_id, p.supplier_id, c.name AS supplier, c.tin AS supplier_tin, p.account_id, a.name AS account,
                   a.kind AS account_kind, a.balance AS account_balance, p.payment_date, p.amount, p.advance, p.status, p.note,
                   cb.full_name AS created_by, p.created_at, sb.full_name AS sent_by, p.sent_at, p.returned_reason, pb.full_name AS posted_by,
                   p.posted_at, xb.full_name AS cancelled_by, p.cancelled_at, p.cancel_reason, p.version, p.pay_order_no, p.bank_date, p.check_no
            FROM supplier_payment p JOIN counterparty c ON c.id = p.supplier_id JOIN money_account a ON a.id = p.account_id
            JOIN employee cb ON cb.id = p.created_by LEFT JOIN employee sb ON sb.id = p.sent_by LEFT JOIN employee pb ON pb.id = p.posted_by
            LEFT JOIN employee xb ON xb.id = p.cancelled_by""";

    @Transactional(readOnly = true)
    List<SupplierPaymentSummary> list(Actor actor, Long branchId, SupplierPaymentStatus status, Long supplierId) {
        return jdbc.sql(SELECT + """
                 WHERE (CAST(:b AS BIGINT) IS NULL OR p.branch_id = :b) AND (CAST(:s AS VARCHAR) IS NULL OR p.status = :s)
                   AND (CAST(:c AS BIGINT) IS NULL OR p.supplier_id = :c)
                ORDER BY p.payment_date DESC, p.id DESC LIMIT 300""")
                .param("b", branchId)
                .param("s", status == null ? null : status.name())
                .param("c", supplierId)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id"))
                        ? new SupplierPaymentSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("supplier_id"),
                                rs.getString("supplier"), rs.getLong("account_id"), rs.getString("account"), rs.getString("account_kind"),
                                rs.getDate("payment_date").toLocalDate(), new Money(rs.getBigDecimal("amount")).toString(),
                                SupplierPaymentStatus.valueOf(rs.getString("status")), rs.getString("created_by"), rs.getTimestamp("created_at").toInstant())
                        : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .toList();
    }

    @Transactional(readOnly = true)
    SupplierPaymentDetail find(Actor actor, long id) {
        List<PaymentAllocation> allocs = jdbc.sql("SELECT doc_type, doc_id, doc_number, amount FROM supplier_payment_alloc WHERE payment_id = :p ORDER BY id")
                .param("p", id)
                .query((rs, n) -> new PaymentAllocation(rs.getString("doc_type"), rs.getLong("doc_id"), rs.getString("doc_number"),
                        new Money(rs.getBigDecimal("amount")).toString()))
                .list();
        return jdbc.sql(SELECT + " WHERE p.id = :id")
                .param("id", id)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id"))
                        ? new SupplierPaymentDetail(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("supplier_id"),
                                rs.getString("supplier"), rs.getString("supplier_tin"), rs.getLong("account_id"), rs.getString("account"),
                                rs.getString("account_kind"), new Money(rs.getBigDecimal("account_balance")).toString(),
                                rs.getDate("payment_date").toLocalDate(), new Money(rs.getBigDecimal("amount")).toString(),
                                rs.getBigDecimal("advance") == null ? null : new Money(rs.getBigDecimal("advance")).toString(),
                                SupplierPaymentStatus.valueOf(rs.getString("status")), rs.getString("note"), rs.getString("created_by"),
                                rs.getTimestamp("created_at").toInstant(), rs.getString("sent_by"),
                                rs.getTimestamp("sent_at") == null ? null : rs.getTimestamp("sent_at").toInstant(), rs.getString("returned_reason"),
                                rs.getString("posted_by"), rs.getTimestamp("posted_at") == null ? null : rs.getTimestamp("posted_at").toInstant(),
                                rs.getString("cancelled_by"), rs.getTimestamp("cancelled_at") == null ? null : rs.getTimestamp("cancelled_at").toInstant(),
                                rs.getString("cancel_reason"), rs.getLong("version"), allocs, rs.getString("pay_order_no"),
                                rs.getDate("bank_date") == null ? null : rs.getDate("bank_date").toLocalDate(), rs.getString("check_no"))
                        : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .findFirst()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }
}
