package uz.medix.finance.payment;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.sql.Date;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.PartyLedger;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * Avansni hisobga olish — AH (SPEC 7): kontragentning taqsimlanmagan to'lovi (avans) eng eski qarzlariga yopiladi. Bitta
 * tranzaksiyada: har qator uchun qarz jurnaliga ikki yozuv (avans hujjatiga +x, qarz hujjatiga −x), qatorlar, audit. Saldo
 * o'zgarmaydi, faqat qaysi hujjat ochiqligi o'zgaradi. Kontragent bo'yicha advisory lock (MT/YT bilan bir xil kalit).
 */
@Service
class AdvanceOffsets {

    static final String DOC_TYPE = "AH";
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    record OffsetRequest(@NotNull(message = "{validation.required}") Long branchId,
            @NotNull(message = "{validation.required}") Long counterpartyId,
            @Schema(nullable = true, description = "Eng ko'pi bilan shu summa; bo'sh — butun avans") @Size(max = 24) String amount,
            @Schema(nullable = true) @Size(max = 500) String note) {}

    record OffsetLine(String advanceDocNumber, String debtDocType, long debtDocId, String debtDocNumber, String amount) {}

    record OffsetPreview(String advance, String debt, String available, List<OffsetLine> lines) {}

    record Offset(long id, String number, long branchId, long counterpartyId, String counterparty, Side side, LocalDate offsetDate, String amount,
            @Schema(nullable = true) String note, String status, String createdBy, Instant createdAt, @Schema(nullable = true) String cancelReason,
            List<OffsetLine> lines) {}

    private final JdbcClient jdbc;
    private final PartyLedger parties;
    private final DocumentSequenceService numbers;
    private final AuditLog audit;
    private final Clock clock;

    AdvanceOffsets(JdbcClient jdbc, PartyLedger parties, DocumentSequenceService numbers, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.parties = parties;
        this.numbers = numbers;
        this.audit = audit;
        this.clock = clock;
    }

    private void lockParty(Side side, long branchId, long counterpartyId) {
        jdbc.sql("SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended('party:' || :s || ':' || :b || ':' || :c, 0))) x")
                .param("s", side.name())
                .param("b", branchId)
                .param("c", counterpartyId)
                .query(Integer.class)
                .single();
    }

    private List<Offsetter.Line> plan(Side side, long branchId, long counterpartyId, Money cap) {
        List<Allocator.Doc> docs = parties.openDocs(branchId, counterpartyId, side).stream()
                .map(d -> new Allocator.Doc(d.type(), d.id(), d.number(), d.open()))
                .toList();
        return Offsetter.plan(docs, cap);
    }

    private static OffsetLine view(Offsetter.Line l) {
        return new OffsetLine(l.advance().number(), l.debt().type(), l.debt().id(), l.debt().number(), l.amount().toString());
    }

    private void checkBranch(Actor actor, long branchId) {
        if (!actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
    }

    @Transactional(readOnly = true)
    OffsetPreview preview(Actor actor, Side side, long branchId, long counterpartyId) {
        checkBranch(actor, branchId);
        Money advance = Money.ZERO;
        Money debt = Money.ZERO;
        for (PartyLedger.OpenDoc d : parties.openDocs(branchId, counterpartyId, side)) {
            if (d.open().isNegative()) {
                advance = advance.minus(d.open());
            } else {
                debt = debt.plus(d.open());
            }
        }
        List<Offsetter.Line> lines = plan(side, branchId, counterpartyId, null);
        return new OffsetPreview(advance.toString(), debt.toString(), Offsetter.total(lines).toString(), lines.stream().map(AdvanceOffsets::view).toList());
    }

    @Transactional
    long create(Actor actor, Side side, OffsetRequest r) {
        checkBranch(actor, r.branchId());
        Money cap = null;
        if (r.amount() != null && !r.amount().isBlank()) {
            try {
                cap = Money.of(r.amount().strip());
            } catch (RuntimeException e) {
                throw MedixException.badRequest("payment.amountInvalid");
            }
            if (!cap.isPositive()) {
                throw MedixException.badRequest("payment.amountInvalid");
            }
        }
        lockParty(side, r.branchId(), r.counterpartyId());
        List<Offsetter.Line> lines = plan(side, r.branchId(), r.counterpartyId(), cap);
        if (lines.isEmpty()) {
            throw MedixException.conflict("advance.nothing");
        }
        Money total = Offsetter.total(lines);
        String branchCode = jdbc.sql("SELECT code FROM branch WHERE id = :b").param("b", r.branchId()).query(String.class).single();
        String number = numbers.next(DocumentPrefix.AH, branchCode).toString();
        long id = jdbc.sql("""
                INSERT INTO advance_offset (number, branch_id, counterparty_id, side, offset_date, amount, note, created_by)
                VALUES (:n, :b, :c, :s, :d, :a, :note, :by) RETURNING id""")
                .param("n", number)
                .param("b", r.branchId())
                .param("c", r.counterpartyId())
                .param("s", side.name())
                .param("d", Date.valueOf(LocalDate.now(clock.withZone(TASHKENT))))
                .param("a", total.amount())
                .param("note", r.note() == null || r.note().isBlank() ? null : r.note().strip())
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        PartyLedger.DocRef self = new PartyLedger.DocRef(DOC_TYPE, id, number);
        for (Offsetter.Line l : lines) {
            Allocator.Doc a = l.advance();
            Allocator.Doc d = l.debt();
            parties.record(self, r.branchId(), r.counterpartyId(), side, l.amount(), null, "Avans " + a.number() + " → " + d.number(),
                    new PartyLedger.DocRef(a.type(), a.id(), a.number()));
            parties.record(self, r.branchId(), r.counterpartyId(), side, Money.ZERO.minus(l.amount()), null, "Avansdan: " + a.number(),
                    new PartyLedger.DocRef(d.type(), d.id(), d.number()));
            jdbc.sql("""
                    INSERT INTO advance_offset_line (offset_id, advance_doc_type, advance_doc_id, advance_doc_number, debt_doc_type, debt_doc_id,
                                                     debt_doc_number, amount)
                    VALUES (:o, :at, :ai, :an, :dt, :di, :dn, :a)""")
                    .param("o", id)
                    .param("at", a.type())
                    .param("ai", a.id())
                    .param("an", a.number())
                    .param("dt", d.type())
                    .param("di", d.id())
                    .param("dn", d.number())
                    .param("a", l.amount().amount())
                    .update();
        }
        audit.record(AuditEntry.of("advance.offset.create", "advance_offset", id)
                .change(null, Map.of("number", number, "amount", total.toString(), "lines", lines.size())));
        return id;
    }

    @Transactional
    void cancel(Actor actor, long id, String reason) {
        record H(String number, long branchId, long counterpartyId, Side side, String status) {}
        H h = jdbc.sql("SELECT number, branch_id, counterparty_id, side, status FROM advance_offset WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new H(rs.getString("number"), rs.getLong("branch_id"), rs.getLong("counterparty_id"), Side.valueOf(rs.getString("side")),
                        rs.getString("status")))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if ("CANCELLED".equals(h.status())) {
            throw MedixException.conflict("payment.alreadyCancelled");
        }
        String why = reason.strip();
        lockParty(h.side(), h.branchId(), h.counterpartyId());
        PartyLedger.DocRef self = new PartyLedger.DocRef(DOC_TYPE, id, h.number());
        record Back(String type, long docId, String number, Money amount) {}
        jdbc.sql("""
                SELECT applies_doc_type, applies_doc_id, min(doc_number) AS n, sum(amount) AS amt FROM party_ledger
                WHERE doc_type = :t AND doc_id = :i GROUP BY applies_doc_type, applies_doc_id HAVING sum(amount) <> 0""")
                .param("t", DOC_TYPE)
                .param("i", id)
                .query((rs, n) -> new Back(rs.getString("applies_doc_type"), rs.getLong("applies_doc_id"), rs.getString("n"),
                        new Money(rs.getBigDecimal("amt"))))
                .list()
                .forEach(b -> parties.record(self, h.branchId(), h.counterpartyId(), h.side(), Money.ZERO.minus(b.amount()), null, "Bekor: " + why,
                        new PartyLedger.DocRef(b.type(), b.docId(), appliedNumber(id, b.type(), b.docId()))));
        jdbc.sql("""
                UPDATE advance_offset SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r, version = version + 1
                WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", why)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("advance.offset.cancel", "advance_offset", id).change(Map.of("status", "POSTED"), Map.of("status", "CANCELLED"))
                .withReason(why));
    }

    private String appliedNumber(long offsetId, String type, long docId) {
        return jdbc.sql("""
                SELECT min(n) FROM (
                  SELECT advance_doc_number AS n FROM advance_offset_line WHERE offset_id = :o AND advance_doc_type = :t AND advance_doc_id = :d
                  UNION ALL
                  SELECT debt_doc_number FROM advance_offset_line WHERE offset_id = :o AND debt_doc_type = :t AND debt_doc_id = :d) x""")
                .param("o", offsetId)
                .param("t", type)
                .param("d", docId)
                .query(String.class)
                .single();
    }

    // ===== O'qish =====

    private List<OffsetLine> lines(long id) {
        return jdbc.sql("""
                SELECT advance_doc_number, debt_doc_type, debt_doc_id, debt_doc_number, amount FROM advance_offset_line WHERE offset_id = :o ORDER BY id""")
                .param("o", id)
                .query((rs, n) -> new OffsetLine(rs.getString("advance_doc_number"), rs.getString("debt_doc_type"), rs.getLong("debt_doc_id"),
                        rs.getString("debt_doc_number"), new Money(rs.getBigDecimal("amount")).toString()))
                .list();
    }

    private static final String SELECT = """
            SELECT o.id, o.number, o.branch_id, o.counterparty_id, c.name AS counterparty, o.side, o.offset_date, o.amount, o.note, o.status,
                   e.full_name AS created_by, o.created_at, o.cancel_reason
            FROM advance_offset o JOIN counterparty c ON c.id = o.counterparty_id JOIN employee e ON e.id = o.created_by""";

    private record Row(long id, String number, long branchId, long counterpartyId, String counterparty, Side side, LocalDate date, String amount,
            String note, String status, String createdBy, Instant createdAt, String cancelReason) {

        Offset with(List<OffsetLine> lines) {
            return new Offset(id, number, branchId, counterpartyId, counterparty, side, date, amount, note, status, createdBy, createdAt, cancelReason, lines);
        }
    }

    private static Row row(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Row(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("counterparty_id"), rs.getString("counterparty"),
                Side.valueOf(rs.getString("side")), rs.getDate("offset_date").toLocalDate(), new Money(rs.getBigDecimal("amount")).toString(),
                rs.getString("note"), rs.getString("status"), rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(),
                rs.getString("cancel_reason"));
    }

    @Transactional(readOnly = true)
    List<Offset> list(Actor actor, Side side, Long branchId) {
        return jdbc.sql(SELECT + " WHERE o.side = :s AND (CAST(:b AS BIGINT) IS NULL OR o.branch_id = :b) ORDER BY o.offset_date DESC, o.id DESC LIMIT 300")
                .param("s", side.name())
                .param("b", branchId)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id")) ? row(rs) : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .map(r -> r.with(lines(r.id())))
                .toList();
    }

    @Transactional(readOnly = true)
    Offset find(Actor actor, long id) {
        return jdbc.sql(SELECT + " WHERE o.id = :id")
                .param("id", id)
                .query((rs, n) -> row(rs))
                .optional()
                .filter(r -> actor.canAccessBranch(r.branchId()))
                .map(r -> r.with(lines(r.id())))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }
}
