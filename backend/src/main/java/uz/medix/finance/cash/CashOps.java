package uz.medix.finance.cash;

import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.CashierGuard;
import uz.medix.finance.MoneyLedger;
import uz.medix.finance.account.Accounts;
import uz.medix.finance.cash.CashModels.CashOp;
import uz.medix.finance.cash.CashModels.CashOpRequest;
import uz.medix.finance.cash.CashModels.Direction;
import uz.medix.finance.cash.CashModels.OpSource;
import uz.medix.finance.cash.CashModels.OpStatus;
import uz.medix.notification.Notifications;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;
import uz.medix.shared.settings.SettingKey;
import uz.medix.shared.settings.SystemSettings;

/**
 * Kassa (KO) va bank / Terminal (BO) operatsiyalari (SPEC 5.5): kirim yoki chiqim, modda bilan. Kassadan 2 000 000 so'mdan katta
 * chiqim «Tasdiqlashda» turadi (cash.approve), qolganlari darhol o'tkaziladi. O'tkazish = bitta tranzaksiya (pul jurnali + hisob
 * qoldig'i + audit). O'tkazilgan operatsiya faqat sababi bilan bekor qilinadi — bugungi sana bilan teskari yozuv.
 */
@Service
class CashOps {

    /** Shu summadan katta kassa chiqimi tasdiq talab qiladi (SPEC 5.5). */

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final MoneyLedger money;
    private final Accounts accounts;
    private final CashierGuard cashiers;
    private final DocumentSequenceService numbers;
    private final AuditLog audit;
    private final Clock clock;
    private final Notifications notifications;
    private final SystemSettings settings;

    CashOps(JdbcClient jdbc, MoneyLedger money, Accounts accounts, CashierGuard cashiers, DocumentSequenceService numbers, AuditLog audit, Clock clock,
            Notifications notifications, SystemSettings settings) {
        this.notifications = notifications;
        this.settings = settings;
        this.jdbc = jdbc;
        this.money = money;
        this.accounts = accounts;
        this.cashiers = cashiers;
        this.numbers = numbers;
        this.audit = audit;
        this.clock = clock;
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(TASHKENT));
    }

    static Money parseAmount(String raw, String code) {
        Money m;
        try {
            m = Money.of(raw.strip());
        } catch (RuntimeException e) {
            throw MedixException.badRequest(code);
        }
        if (!m.isPositive()) {
            throw MedixException.badRequest(code);
        }
        return m;
    }

    static String blank(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    // ===== Yaratish =====

    @Transactional
    long create(Actor actor, CashOpRequest r) {
        if (!actor.canAccessBranch(r.branchId())) {
            throw MedixException.notFound("error.notFound");
        }
        Accounts.Account acc = accounts.find(r.accountId())
                .filter(a -> a.branchId() == r.branchId() && a.active())
                .orElseThrow(() -> MedixException.badRequest("payment.accountUnknown"));
        cashiers.check(acc.id());
        Boolean itemOk = jdbc.sql("SELECT active AND direction = :d FROM expense_item WHERE id = :i")
                .param("d", r.direction() == Direction.OUT ? "EXPENSE" : "INCOME")
                .param("i", r.itemId())
                .query(Boolean.class)
                .optional()
                .orElse(false);
        if (!itemOk) {
            throw MedixException.badRequest("cash.itemUnknown");
        }
        Money amount = parseAmount(r.amount(), "payment.amountInvalid");
        LocalDate date = r.opDate() == null ? today() : r.opDate();
        if (date.isAfter(today())) {
            throw MedixException.badRequest("payment.dateFuture");
        }
        boolean needsApproval = acc.kind() == Accounts.Kind.CASH && r.direction() == Direction.OUT && amount.compareTo(settings.money(SettingKey.cashBranchApprove)) > 0;
        long id = insert(actor, acc, r.direction(), r.itemId(), amount, date, blank(r.party()), blank(r.note()), blank(r.baseNo()), OpSource.MANUAL,
                needsApproval ? OpStatus.PENDING : OpStatus.POSTED);
        if (!needsApproval) {
            post(id);
        } else {
            String number = jdbc.sql("SELECT number FROM cash_op WHERE id = :id").param("id", id).query(String.class).single();
            notifications.notify("cash.approve", r.branchId(), List.of(), notifications.message("cash.approval", "cash.approval", "/cash",
                    "cash.approval:" + id, number, amount.format(), acc.name()));
        }
        return id;
    }

    /** Kunni yopishdagi tuzatuvchi KO: tasdiqsiz, darhol o'tkaziladi. Chaqiruvchi tranzaksiyasida. */
    @Transactional(propagation = Propagation.MANDATORY)
    long correction(Actor actor, Accounts.Account acc, Money diff, LocalDate date, String note) {
        Direction dir = diff.isNegative() ? Direction.OUT : Direction.IN;
        long item = jdbc.sql("SELECT id FROM expense_item WHERE system AND name = :n AND direction = :d")
                .param("n", dir == Direction.OUT ? "Boshqa" : "Boshqa kirim")
                .param("d", dir == Direction.OUT ? "EXPENSE" : "INCOME")
                .query(Long.class)
                .single();
        Money amount = diff.isNegative() ? Money.ZERO.minus(diff) : diff;
        long id = insert(actor, acc, dir, item, amount, date, null, note, null, OpSource.CLOSE, OpStatus.POSTED);
        post(id);
        return id;
    }

    private long insert(Actor actor, Accounts.Account acc, Direction dir, long itemId, Money amount, LocalDate date, String party, String note,
            String baseNo, OpSource source, OpStatus status) {
        DocumentPrefix prefix = acc.kind() == Accounts.Kind.CASH ? DocumentPrefix.KO : DocumentPrefix.BO;
        String branchCode = jdbc.sql("SELECT code FROM branch WHERE id = :b").param("b", acc.branchId()).query(String.class).single();
        String number = numbers.next(prefix, branchCode).toString();
        long id = jdbc.sql("""
                INSERT INTO cash_op (number, doc_type, branch_id, account_id, op_date, direction, expense_item_id, amount, party, note, base_no,
                                     source, status, created_by, posted_at)
                VALUES (:n, :t, :b, :a, :d, :dir, :i, :amt, :p, :note, :base, :src, :s, :by, CASE WHEN :s = 'POSTED' THEN now() END) RETURNING id""")
                .param("n", number)
                .param("t", prefix.name())
                .param("b", acc.branchId())
                .param("a", acc.id())
                .param("d", Date.valueOf(date))
                .param("dir", dir.name())
                .param("i", itemId)
                .param("amt", amount.amount())
                .param("p", party)
                .param("note", note)
                .param("base", baseNo)
                .param("src", source.name())
                .param("s", status.name())
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        audit.record(AuditEntry.of("cash.op.create", "cash_op", id)
                .change(null, Map.of("number", number, "direction", dir.name(), "amount", amount.toString(), "status", status.name())));
        return id;
    }

    private record Head(long id, String number, String docType, long branchId, long accountId, LocalDate date, Direction direction, Money amount,
            OpStatus status) {}

    private Head lock(Actor actor, long id) {
        return jdbc.sql("SELECT id, number, doc_type, branch_id, account_id, op_date, direction, amount, status FROM cash_op WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getString("doc_type"), rs.getLong("branch_id"),
                        rs.getLong("account_id"), rs.getDate("op_date").toLocalDate(), Direction.valueOf(rs.getString("direction")),
                        new Money(rs.getBigDecimal("amount")), OpStatus.valueOf(rs.getString("status"))))
                .optional()
                .filter(h -> actor == null || actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private void post(long id) {
        Head h = lock(null, id);
        Money signed = h.direction() == Direction.OUT ? Money.ZERO.minus(h.amount()) : h.amount();
        money.post(h.accountId(), h.date(), signed, new MoneyLedger.DocRef(h.docType(), h.id(), h.number()), h.docType());
    }

    // ===== Tasdiqlash =====

    @Transactional
    void approve(Actor actor, long id) {
        Head h = lock(actor, id);
        if (h.status() != OpStatus.PENDING) {
            throw MedixException.conflict("cash.notPending");
        }
        post(id);
        jdbc.sql("""
                UPDATE cash_op SET status = 'POSTED', approved_by = :by, approved_at = now(), posted_at = now(), updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("cash.op.approve", "cash_op", id).change(Map.of("status", "PENDING"), Map.of("status", "POSTED")));
        notifyAuthor(h, actor, notifications.message("cash.approved", "cash.approved", "/cash", "cash.approved:" + id,
                h.number(), h.amount().format()));
    }

    @Transactional
    void reject(Actor actor, long id, String reason) {
        Head h = lock(actor, id);
        if (h.status() != OpStatus.PENDING) {
            throw MedixException.conflict("cash.notPending");
        }
        String why = reason.strip();
        jdbc.sql("""
                UPDATE cash_op SET status = 'REJECTED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r, updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", why)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("cash.op.reject", "cash_op", id).change(Map.of("status", "PENDING"), Map.of("status", "REJECTED")).withReason(why));
        notifyAuthor(h, actor, notifications.message("cash.rejected", "cash.rejected", "/cash", "cash.rejected:" + id, h.number(), why));
    }

    /** Chiqim muallifiga (o'zi qaror qilmagan bo'lsa). */
    private void notifyAuthor(Head h, Actor actor, Notifications.Message m) {
        long author = jdbc.sql("SELECT created_by FROM cash_op WHERE id = :id").param("id", h.id()).query(Long.class).single();
        if (author != actor.employeeId()) {
            notifications.notify("-", h.branchId(), List.of(author), m);
        }
    }

    // ===== Bekor qilish =====

    @Transactional
    void cancel(Actor actor, long id, String reason) {
        Head h = lock(actor, id);
        if (h.status() != OpStatus.POSTED) {
            throw MedixException.conflict(h.status() == OpStatus.PENDING ? "cash.pendingUseReject" : "cash.alreadyCancelled");
        }
        String source = jdbc.sql("SELECT source FROM cash_op WHERE id = :id").param("id", id).query(String.class).single();
        if (OpSource.CLOSE.name().equals(source)) {
            throw MedixException.conflict("cash.closeCorrection");
        }
        String why = reason.strip();
        Money back = h.direction() == Direction.OUT ? h.amount() : Money.ZERO.minus(h.amount());
        money.post(h.accountId(), today(), back, new MoneyLedger.DocRef(h.docType(), h.id(), h.number()), "Bekor: " + why);
        jdbc.sql("""
                UPDATE cash_op SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r, updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", why)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("cash.op.cancel", "cash_op", id).change(Map.of("status", "POSTED"), Map.of("status", "CANCELLED")).withReason(why));
    }

    // ===== O'qish =====

    private static final String SELECT = """
            SELECT o.id, o.number, o.doc_type, o.branch_id, o.account_id, a.name AS account, a.kind AS account_kind, o.op_date, o.direction,
                   o.expense_item_id, i.name AS item, o.amount, o.party, o.note, o.base_no, o.source, o.status, cb.full_name AS created_by, o.created_at,
                   ab.full_name AS approved_by, o.approved_at, xb.full_name AS cancelled_by, o.cancelled_at, o.cancel_reason, o.version
            FROM cash_op o JOIN money_account a ON a.id = o.account_id JOIN expense_item i ON i.id = o.expense_item_id
            JOIN employee cb ON cb.id = o.created_by LEFT JOIN employee ab ON ab.id = o.approved_by LEFT JOIN employee xb ON xb.id = o.cancelled_by""";

    private static CashOp map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new CashOp(rs.getLong("id"), rs.getString("number"), rs.getString("doc_type"), rs.getLong("branch_id"), rs.getLong("account_id"),
                rs.getString("account"), rs.getString("account_kind"), rs.getDate("op_date").toLocalDate(), Direction.valueOf(rs.getString("direction")),
                rs.getLong("expense_item_id"), rs.getString("item"), new Money(rs.getBigDecimal("amount")).toString(), rs.getString("party"),
                rs.getString("note"), rs.getString("base_no"), OpSource.valueOf(rs.getString("source")), OpStatus.valueOf(rs.getString("status")), rs.getString("created_by"),
                rs.getTimestamp("created_at").toInstant(), rs.getString("approved_by"),
                rs.getTimestamp("approved_at") == null ? null : rs.getTimestamp("approved_at").toInstant(), rs.getString("cancelled_by"),
                rs.getTimestamp("cancelled_at") == null ? null : rs.getTimestamp("cancelled_at").toInstant(), rs.getString("cancel_reason"),
                rs.getLong("version"));
    }

    @Transactional(readOnly = true)
    // expenseItemId — modda (Xarajatlar hisoboti qatoridan oʻtish, SPEC 8), ixtiyoriy
    List<CashOp> list(Actor actor, Long branchId, Long accountId, OpStatus status, LocalDate from, LocalDate to, Long expenseItemId) {
        return jdbc.sql(SELECT + """
                 WHERE (CAST(:b AS BIGINT) IS NULL OR o.branch_id = :b) AND (CAST(:a AS BIGINT) IS NULL OR o.account_id = :a)
                   AND (CAST(:s AS VARCHAR) IS NULL OR o.status = :s)
                   AND (CAST(:f AS DATE) IS NULL OR o.op_date >= :f) AND (CAST(:t AS DATE) IS NULL OR o.op_date <= :t)
                   AND (CAST(:i AS BIGINT) IS NULL OR o.expense_item_id = :i)
                ORDER BY o.op_date DESC, o.id DESC LIMIT 500""")
                .param("i", expenseItemId)
                .param("b", branchId)
                .param("a", accountId)
                .param("s", status == null ? null : status.name())
                .param("f", from == null ? null : Date.valueOf(from))
                .param("t", to == null ? null : Date.valueOf(to))
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id")) ? map(rs) : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .toList();
    }

    @Transactional(readOnly = true)
    CashOp find(Actor actor, long id) {
        return jdbc.sql(SELECT + " WHERE o.id = :id")
                .param("id", id)
                .query((rs, n) -> map(rs))
                .optional()
                .filter(o -> actor.canAccessBranch(o.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    /** KO/BO tarixi — audit jurnalidan (eng eskisi birinchi). Kirish huquqi — {@link #find} bilan tekshiriladi. */
    @Transactional(readOnly = true)
    List<CashModels.CashOpHistoryEvent> history(Actor actor, long id) {
        find(actor, id);
        return jdbc.sql("""
                SELECT a.occurred_at, e.full_name AS employee, a.action, a.reason
                FROM audit_log a LEFT JOIN employee e ON e.id = a.employee_id
                WHERE a.entity_type = 'cash_op' AND a.entity_id = :id
                ORDER BY a.occurred_at, a.id""")
                .param("id", String.valueOf(id))
                .query((rs, n) -> new CashModels.CashOpHistoryEvent(rs.getTimestamp("occurred_at").toInstant(), rs.getString("employee"),
                        rs.getString("action"), rs.getString("reason")))
                .list();
    }
}
