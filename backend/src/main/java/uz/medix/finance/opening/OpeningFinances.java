package uz.medix.finance.opening;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.MoneyLedger;
import uz.medix.finance.PartyLedger;
import uz.medix.finance.opening.OpeningFinanceModels.Kind;
import uz.medix.finance.opening.OpeningFinanceModels.Line;
import uz.medix.finance.opening.OpeningFinanceModels.LineRequest;
import uz.medix.finance.opening.OpeningFinanceModels.OpeningFinanceDetail;
import uz.medix.finance.opening.OpeningFinanceModels.OpeningFinanceRequest;
import uz.medix.finance.opening.OpeningFinanceModels.OpeningFinanceSummary;
import uz.medix.finance.opening.OpeningFinanceModels.Status;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * BQ — pul turlari. Qoralama hech narsaga ta'sir qilmaydi; o'tkazish bitta tranzaksiyada: qarz — {@link PartyLedger} (doc_type BQ,
 * muddat bilan; musbat — qarz, manfiy — avans), pul — {@link MoneyLedger} (kesish sanasi bilan). Har (filial, tur) uchun bitta
 * o'tkazilgan BQ (bazada UNIQUE). O'tkazilgan hujjat o'zgarmaydi; qoralamani bekor qilish mumkin.
 */
@Service
class OpeningFinances {

    static final String DOC_TYPE = "BQ";
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    private static final int LIST_LIMIT = 500;

    private final JdbcClient jdbc;
    private final PartyLedger parties;
    private final MoneyLedger money;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final Clock clock;

    OpeningFinances(JdbcClient jdbc, PartyLedger parties, MoneyLedger money, AuditLog audit, DocumentSequenceService numbers, Clock clock) {
        this.jdbc = jdbc;
        this.parties = parties;
        this.money = money;
        this.audit = audit;
        this.numbers = numbers;
        this.clock = clock;
    }

    // ===== O'qish =====

    @Transactional(readOnly = true)
    List<OpeningFinanceSummary> list(Actor actor, Long branchId) {
        return jdbc.sql("""
                SELECT o.id, o.number, o.kind, o.branch_id, b.name AS branch, o.cutoff_date, o.status, coalesce(t.lines, 0) AS lines,
                       coalesce(t.total, 0) AS total, e.full_name AS created_by, o.created_at, o.posted_at
                FROM opening_finance o
                JOIN branch b ON b.id = o.branch_id
                JOIN employee e ON e.id = o.created_by
                LEFT JOIN (SELECT opening_id, count(*) AS lines, sum(amount) AS total FROM opening_finance_line GROUP BY opening_id) t
                       ON t.opening_id = o.id
                WHERE (:all OR o.branch_id = :own) AND (CAST(:b AS BIGINT) IS NULL OR o.branch_id = :b)
                ORDER BY o.created_at DESC, o.id DESC LIMIT :l""")
                .param("all", actor.allBranches())
                .param("own", actor.branchId() == null ? -1L : actor.branchId())
                .param("b", branchId)
                .param("l", LIST_LIMIT)
                .query((rs, n) -> new OpeningFinanceSummary(rs.getLong("id"), rs.getString("number"), Kind.valueOf(rs.getString("kind")),
                        rs.getLong("branch_id"), rs.getString("branch"), rs.getDate("cutoff_date").toLocalDate(),
                        Status.valueOf(rs.getString("status")), rs.getInt("lines"), new Money(rs.getBigDecimal("total")).toString(),
                        rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(), instant(rs.getTimestamp("posted_at"))))
                .list();
    }

    @Transactional(readOnly = true)
    Optional<OpeningFinanceDetail> find(long id, Actor actor) {
        List<Line> lines = jdbc.sql("""
                SELECT l.id, l.line_no, l.counterparty_id, l.account_id, coalesce(c.name, a.name) AS name, c.tin, l.amount, l.due_date, l.doc_ref
                FROM opening_finance_line l
                LEFT JOIN counterparty c ON c.id = l.counterparty_id
                LEFT JOIN money_account a ON a.id = l.account_id
                WHERE l.opening_id = :id ORDER BY l.line_no""")
                .param("id", id)
                .query((rs, n) -> new Line(rs.getLong("id"), rs.getInt("line_no"), (Long) rs.getObject("counterparty_id"),
                        (Long) rs.getObject("account_id"), rs.getString("name"), rs.getString("tin"),
                        new Money(rs.getBigDecimal("amount")).toString(), date(rs.getDate("due_date")), rs.getString("doc_ref")))
                .list();
        Money total = lines.stream().map(l -> Money.of(l.amount())).reduce(Money.ZERO, Money::plus);
        return jdbc.sql("""
                SELECT o.*, b.name AS branch, ec.full_name AS created_name, ep.full_name AS posted_name, ex.full_name AS cancelled_name
                FROM opening_finance o
                JOIN branch b ON b.id = o.branch_id
                JOIN employee ec ON ec.id = o.created_by
                LEFT JOIN employee ep ON ep.id = o.posted_by
                LEFT JOIN employee ex ON ex.id = o.cancelled_by
                WHERE o.id = :id""")
                .param("id", id)
                .query((rs, n) -> new OpeningFinanceDetail(rs.getLong("id"), rs.getString("number"), Kind.valueOf(rs.getString("kind")),
                        rs.getLong("branch_id"), rs.getString("branch"), rs.getDate("cutoff_date").toLocalDate(), rs.getString("note"),
                        Status.valueOf(rs.getString("status")), total.toString(), rs.getString("created_name"),
                        rs.getTimestamp("created_at").toInstant(), rs.getString("posted_name"), instant(rs.getTimestamp("posted_at")),
                        rs.getString("cancelled_name"), instant(rs.getTimestamp("cancelled_at")), rs.getString("cancel_reason"),
                        rs.getLong("version"), lines))
                .optional()
                .filter(d -> actor.canAccessBranch(d.branchId()));
    }

    // ===== Yozish =====

    @Transactional
    long create(OpeningFinanceRequest r, Actor actor) {
        String code = branchCode(actor, r.branchId());
        checkCutoff(r.cutoffDate());
        validate(r.kind(), r.branchId(), r.lines());
        String number = numbers.next(DocumentPrefix.BQ, code).toString();
        long id = jdbc.sql("""
                INSERT INTO opening_finance (number, kind, branch_id, cutoff_date, note, created_by)
                VALUES (:n, :k, :b, :d, :note, :e) RETURNING id""")
                .param("n", number)
                .param("k", r.kind().name())
                .param("b", r.branchId())
                .param("d", Date.valueOf(r.cutoffDate()))
                .param("note", blankToNull(r.note()))
                .param("e", actor.employeeId())
                .query(Long.class)
                .single();
        insertLines(id, r.lines());
        audit.record(AuditEntry.of("opening.create", "opening_finance", id).change(null, Map.of("number", number, "kind", r.kind().name(),
                "lines", r.lines().size())));
        return id;
    }

    @Transactional
    void update(long id, OpeningFinanceRequest r, Actor actor) {
        Head h = lock(id, actor);
        requireDraft(h);
        if (r.kind() != h.kind() || r.branchId() != h.branchId()) {
            throw MedixException.badRequest("opening.fin.kindFixed");
        }
        checkCutoff(r.cutoffDate());
        validate(h.kind(), h.branchId(), r.lines());
        jdbc.sql("DELETE FROM opening_finance_line WHERE opening_id = :id").param("id", id).update();
        jdbc.sql("UPDATE opening_finance SET cutoff_date = :d, note = :note, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("d", Date.valueOf(r.cutoffDate()))
                .param("note", blankToNull(r.note()))
                .param("id", id)
                .update();
        insertLines(id, r.lines());
        audit.record(AuditEntry.of("opening.update", "opening_finance", id).change(null, Map.of("lines", r.lines().size())));
    }

    @Transactional
    void post(long id, Actor actor) {
        Head h = lock(id, actor);
        requireDraft(h);
        // Bir filial va tur uchun parallel o'tkazishlar navbatga turadi — ikkinchisi birinchisining natijasini ko'radi
        jdbc.sql("SELECT pg_advisory_xact_lock(:k, CAST(:b AS INTEGER))")
                .param("k", ("opening_finance:" + h.kind().name()).hashCode())
                .param("b", h.branchId())
                .query(Object.class)
                .single();
        boolean posted = jdbc.sql("SELECT EXISTS (SELECT 1 FROM opening_finance WHERE branch_id = :b AND kind = :k AND status = 'POSTED')")
                .param("b", h.branchId())
                .param("k", h.kind().name())
                .query(Boolean.class)
                .single();
        if (posted) {
            throw MedixException.conflict("opening.fin.alreadyPosted");
        }
        record L(Long counterpartyId, Long accountId, Money amount, LocalDate due, String docRef) {}
        List<L> lines = jdbc.sql("SELECT counterparty_id, account_id, amount, due_date, doc_ref FROM opening_finance_line WHERE opening_id = :id ORDER BY line_no")
                .param("id", id)
                .query((rs, n) -> new L((Long) rs.getObject("counterparty_id"), (Long) rs.getObject("account_id"),
                        new Money(rs.getBigDecimal("amount")), date(rs.getDate("due_date")), rs.getString("doc_ref")))
                .list();
        if (lines.isEmpty()) {
            throw MedixException.badRequest("opening.fin.noLines");
        }
        String note = "Boshlang'ich qoldiq " + h.number();
        for (L l : lines) {
            if (h.kind() == Kind.MONEY) {
                money.post(l.accountId(), h.cutoffDate(), l.amount(), new MoneyLedger.DocRef(DOC_TYPE, id, h.number()), note);
            } else {
                PartyLedger.Side side = h.kind() == Kind.CUSTOMER_DEBT ? PartyLedger.Side.CUSTOMER : PartyLedger.Side.SUPPLIER;
                parties.record(new PartyLedger.DocRef(DOC_TYPE, id, h.number()), h.branchId(), l.counterpartyId(), side, l.amount(),
                        l.amount().isPositive() ? l.due() : null, l.docRef() == null ? note : note + " · " + l.docRef());
            }
        }
        jdbc.sql("UPDATE opening_finance SET status = 'POSTED', posted_by = :e, posted_at = now(), updated_at = now(), version = version + 1 WHERE id = :id")
                .param("e", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("opening.post", "opening_finance", id).change(Map.of("status", "DRAFT"), Map.of("status", "POSTED")));
    }

    @Transactional
    void cancel(long id, String reason, Actor actor) {
        Head h = lock(id, actor);
        requireDraft(h);
        jdbc.sql("""
                UPDATE opening_finance SET status = 'CANCELLED', cancelled_by = :e, cancelled_at = now(), cancel_reason = :r,
                                           updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("e", actor.employeeId())
                .param("r", reason.strip())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("opening.cancel", "opening_finance", id).withReason(reason.strip()));
    }

    // ===== Ichki =====

    record Head(long id, String number, Kind kind, long branchId, Status status, LocalDate cutoffDate) {}

    private Head lock(long id, Actor actor) {
        return jdbc.sql("SELECT id, number, kind, branch_id, status, cutoff_date FROM opening_finance WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), Kind.valueOf(rs.getString("kind")), rs.getLong("branch_id"),
                        Status.valueOf(rs.getString("status")), rs.getDate("cutoff_date").toLocalDate()))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static void requireDraft(Head h) {
        if (h.status() != Status.DRAFT) {
            throw MedixException.conflict("opening.notDraft");
        }
    }

    private void checkCutoff(LocalDate cutoff) {
        if (cutoff.isAfter(LocalDate.now(clock.withZone(TASHKENT)))) {
            throw MedixException.badRequest("opening.futureDate");
        }
    }

    /** Qator tekshiruvi: qarz — mijoz/YB belgisi bor kontragent; pul — shu filialning faol hisobi, musbat, takrorlanmaydi. */
    private void validate(Kind kind, long branchId, List<LineRequest> lines) {
        Set<Long> accounts = new HashSet<>();
        int no = 0;
        for (LineRequest l : lines) {
            no++;
            Money amount = Money.of(l.amount());
            if (amount.isZero()) {
                throw MedixException.badRequest("opening.fin.zero", no);
            }
            if (kind == Kind.MONEY) {
                if (l.accountId() == null || l.counterpartyId() != null || l.dueDate() != null) {
                    throw MedixException.badRequest("opening.fin.accountRequired", no);
                }
                if (amount.isNegative()) {
                    throw MedixException.badRequest("opening.fin.moneyNegative", no);
                }
                if (!accounts.add(l.accountId())) {
                    throw MedixException.badRequest("opening.fin.accountDuplicate", no);
                }
                boolean ok = jdbc.sql("SELECT EXISTS (SELECT 1 FROM money_account WHERE id = :a AND branch_id = :b AND active)")
                        .param("a", l.accountId())
                        .param("b", branchId)
                        .query(Boolean.class)
                        .single();
                if (!ok) {
                    throw MedixException.badRequest("opening.fin.accountUnknown", no);
                }
            } else {
                if (l.counterpartyId() == null || l.accountId() != null) {
                    throw MedixException.badRequest("opening.fin.partyRequired", no);
                }
                String flag = kind == Kind.CUSTOMER_DEBT ? "is_customer" : "is_supplier";
                boolean ok = jdbc.sql("SELECT EXISTS (SELECT 1 FROM counterparty WHERE id = :c AND " + flag + ")")
                        .param("c", l.counterpartyId())
                        .query(Boolean.class)
                        .single();
                if (!ok) {
                    throw MedixException.badRequest("opening.fin.partyUnknown", no);
                }
            }
        }
    }

    private void insertLines(long id, List<LineRequest> lines) {
        int no = 0;
        for (LineRequest l : lines) {
            no++;
            jdbc.sql("""
                    INSERT INTO opening_finance_line (opening_id, line_no, counterparty_id, account_id, amount, due_date, doc_ref)
                    VALUES (:id, :no, :c, :a, :amt, :due, :ref)""")
                    .param("id", id)
                    .param("no", no)
                    .param("c", l.counterpartyId())
                    .param("a", l.accountId())
                    .param("amt", Money.of(l.amount()).amount())
                    .param("due", l.dueDate() == null ? null : Date.valueOf(l.dueDate()))
                    .param("ref", blankToNull(l.docRef()))
                    .update();
        }
    }

    private String branchCode(Actor actor, long branchId) {
        return jdbc.sql("SELECT code FROM branch WHERE id = :b AND active")
                .param("b", branchId)
                .query(String.class)
                .optional()
                .filter(c -> actor.canAccessBranch(branchId))
                .orElseThrow(() -> MedixException.badRequest("employee.branchUnknown"));
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }

    private static LocalDate date(Date d) {
        return d == null ? null : d.toLocalDate();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
