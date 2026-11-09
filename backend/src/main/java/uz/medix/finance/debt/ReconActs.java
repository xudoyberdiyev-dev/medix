package uz.medix.finance.debt;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * Akt sverka hujjati (prototip Reconciliation): AS-… raqamli, holatlar Tuzildi → Yuborildi → Imzolandi yoki Farq bor (kontragent
 * hisobidagi qoldiq + izoh). Davr oxiridagi qoldiq tuzilganda saqlanadi; varaq qatorlari qarz jurnalidan ({@link Debts#act}).
 */
@Service
class ReconActs {

    enum Status { MADE, SENT, SIGNED, DIFF }

    record ReconRow(long id, String number, Side side, long counterpartyId, String counterparty, String tin, long branchId, String branch,
            LocalDate from, LocalDate to, String closing, Status status, @Schema(nullable = true) String theirBalance,
            @Schema(nullable = true) String diffNote, String createdBy, Instant createdAt) {}

    record ReconList(List<ReconRow> rows) {}

    record ReconDetail(ReconRow head, String ourName, String ourTin, Debts.Act act) {}

    record CreateRequest(@NotNull Side side, long counterpartyId, long branchId, @NotNull LocalDate from, @NotNull LocalDate to) {}

    record StatusRequest(@NotNull Status status, @Schema(nullable = true) String theirBalance,
            @Schema(nullable = true) @Size(max = 500) String note) {}

    private static final String SELECT = """
            SELECT a.id, a.number, a.side, a.counterparty_id, c.name AS cname, c.tin, a.branch_id, b.name AS bname, a.period_from,
                   a.period_to, a.closing, a.status, a.their_balance, a.diff_note, e.full_name, a.created_at
            FROM reconciliation_act a JOIN counterparty c ON c.id = a.counterparty_id JOIN branch b ON b.id = a.branch_id
                 JOIN employee e ON e.id = a.created_by
            """;

    private final JdbcClient jdbc;
    private final Debts debts;
    private final DocumentSequenceService numbers;
    private final AuditLog audit;

    ReconActs(JdbcClient jdbc, Debts debts, DocumentSequenceService numbers, AuditLog audit) {
        this.jdbc = jdbc;
        this.debts = debts;
        this.numbers = numbers;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    ReconList list(Actor actor, Long branchId) {
        if (branchId != null && !actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        Long scope = branchId != null ? branchId : actor.allBranches() ? null : actor.branchId();
        if (scope == null && !actor.allBranches()) {
            return new ReconList(List.of());
        }
        return new ReconList(jdbc.sql(SELECT + " WHERE (CAST(:b AS BIGINT) IS NULL OR a.branch_id = :b) ORDER BY a.created_at DESC, a.id DESC LIMIT 1000")
                .param("b", scope)
                .query((rs, n) -> row(rs))
                .list());
    }

    @Transactional(readOnly = true)
    ReconDetail get(Actor actor, long id) {
        ReconRow head = find(actor, id);
        record Our(String name, String tin) {}
        Our our = jdbc.sql("SELECT coalesce(nullif(legal_name, ''), name) AS n, coalesce(tin, '') AS t FROM branch WHERE id = :b")
                .param("b", head.branchId())
                .query((rs, n) -> new Our(rs.getString("n"), rs.getString("t")))
                .single();
        return new ReconDetail(head, our.name(), our.tin(), debts.act(actor, head.side(), head.branchId(), head.counterpartyId(), head.from(), head.to()));
    }

    @Transactional
    long create(Actor actor, CreateRequest r) {
        if (!actor.canAccessBranch(r.branchId())) {
            throw MedixException.notFound("error.notFound");
        }
        boolean partyOk = jdbc.sql("SELECT EXISTS (SELECT 1 FROM counterparty WHERE id = :c AND " + (r.side() == Side.CUSTOMER ? "is_customer" : "is_supplier") + ")")
                .param("c", r.counterpartyId())
                .query(Boolean.class)
                .single();
        if (!partyOk) {
            throw MedixException.badRequest("recon.partyRequired");
        }
        Debts.Act act = debts.act(actor, r.side(), r.branchId(), r.counterpartyId(), r.from(), r.to());
        String code = jdbc.sql("SELECT code FROM branch WHERE id = :b").param("b", r.branchId()).query(String.class).single();
        String number = numbers.next(DocumentPrefix.AS, code).toString();
        long id = jdbc.sql("""
                INSERT INTO reconciliation_act (number, side, counterparty_id, branch_id, period_from, period_to, closing, created_by)
                VALUES (:n, :s, :c, :b, :f, :t, :z, :by) RETURNING id""")
                .param("n", number)
                .param("s", r.side().name())
                .param("c", r.counterpartyId())
                .param("b", r.branchId())
                .param("f", Date.valueOf(r.from()))
                .param("t", Date.valueOf(r.to()))
                .param("z", new BigDecimal(act.closing()))
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        audit.record(AuditEntry.of("recon.create", "reconciliation_act", id)
                .change(null, Map.of("number", number, "side", r.side().name(), "counterparty", r.counterpartyId(), "from", r.from().toString(), "to",
                        r.to().toString(), "closing", act.closing())), actor);
        return id;
    }

    @Transactional
    void setStatus(Actor actor, long id, StatusRequest r) {
        ReconRow head = find(actor, id);
        jdbc.sql("SELECT id FROM reconciliation_act WHERE id = :i FOR UPDATE").param("i", id).query(Long.class).single();
        Status from = head.status();
        boolean allowed = switch (r.status()) {
            case SENT -> from == Status.MADE;
            case SIGNED, DIFF -> from == Status.SENT || from == Status.DIFF;
            case MADE -> false;
        };
        if (!allowed) {
            throw MedixException.badRequest("recon.statusInvalid");
        }
        Money theirs = null;
        String note = null;
        if (r.status() == Status.DIFF) {
            if (r.theirBalance() == null || r.theirBalance().isBlank()) {
                throw MedixException.badRequest("recon.theirRequired");
            }
            try {
                theirs = Money.of(r.theirBalance().trim());
            } catch (RuntimeException e) {
                throw MedixException.badRequest("recon.theirRequired");
            }
            note = r.note() == null ? "" : r.note().trim();
            if (note.isEmpty()) {
                throw MedixException.badRequest("recon.noteRequired");
            }
        }
        jdbc.sql("""
                UPDATE reconciliation_act SET status = :s, their_balance = CASE WHEN :s = 'DIFF' THEN CAST(:th AS NUMERIC) ELSE their_balance END,
                       diff_note = CASE WHEN :s = 'DIFF' THEN :note ELSE diff_note END, updated_by = :by, updated_at = now(), version = version + 1
                WHERE id = :i""")
                .param("s", r.status().name())
                .param("th", theirs == null ? null : theirs.amount())
                .param("note", note)
                .param("by", actor.employeeId())
                .param("i", id)
                .update();
        audit.record(AuditEntry.of("recon.status", "reconciliation_act", id)
                .change(Map.of("status", from.name()), theirs == null ? Map.of("status", r.status().name())
                        : Map.of("status", r.status().name(), "theirBalance", theirs.toString(), "note", note)), actor);
    }

    private ReconRow find(Actor actor, long id) {
        ReconRow head = jdbc.sql(SELECT + " WHERE a.id = :i").param("i", id).query((rs, n) -> row(rs)).optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (!actor.canAccessBranch(head.branchId())) {
            throw MedixException.notFound("error.notFound");
        }
        return head;
    }

    private static ReconRow row(java.sql.ResultSet rs) throws java.sql.SQLException {
        BigDecimal th = rs.getBigDecimal("their_balance");
        return new ReconRow(rs.getLong("id"), rs.getString("number"), Side.valueOf(rs.getString("side")), rs.getLong("counterparty_id"),
                rs.getString("cname"), rs.getString("tin"), rs.getLong("branch_id"), rs.getString("bname"), rs.getDate("period_from").toLocalDate(),
                rs.getDate("period_to").toLocalDate(), new Money(rs.getBigDecimal("closing")).toString(), Status.valueOf(rs.getString("status")),
                th == null ? null : new Money(th).toString(), rs.getString("diff_note"), rs.getString("full_name"),
                rs.getTimestamp("created_at").toInstant());
    }
}
