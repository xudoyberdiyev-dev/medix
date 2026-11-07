package uz.medix.inventory.writeoff;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.inventory.writeoff.WriteOffModels.Reason;
import uz.medix.inventory.writeoff.WriteOffModels.ShortageKind;
import uz.medix.inventory.writeoff.WriteOffModels.Status;
import uz.medix.inventory.writeoff.WriteOffs.Approver;
import uz.medix.inventory.writeoff.WriteOffs.Created;
import uz.medix.inventory.writeoff.WriteOffs.LineQty;
import uz.medix.inventory.writeoff.WriteOffs.ZoneInfo;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * FS kamomadini hal qilish (transfer.resolve; dizayn: docs/notes/FS-dizayn.md 4-band). Kamomad — qabul qilingan FS da jo'natilgan −
 * kelgan; summa — qator tannarxi bo'yicha. Yo'llar:
 * <ul>
 *   <li>WRITE_OFF + BUYER — xaridor zimmasida: HC xaridor qabul zonasida (qoldiq harakatisiz), filiallararo qarz o'zgarmaydi;</li>
 *   <li>WRITE_OFF + SELLER — sotuvchi zimmasida: HC sotuvchi zonasida, xaridor qarzi kamomad summasiga kamayadi;</li>
 *   <li>RETURN — topildi (jo'natilmagan): sotuvchi zonaga kirim (jurnalda FS hujjati bilan), xaridor qarzi kamayadi.</li>
 * </ul>
 * Qarz tuzatish (branch_ledger, doc_type FSK) faqat qo'shiladi: kerakli tuzatish − shu FS bo'yicha avval yozilganlar. HC rad etilsa —
 * kamomad yana ochiq; qayta hal qilinganda qarz yangi qarorga moslanadi. FS satri FOR UPDATE — parallel ikki marta hal qilinmaydi.
 */
@Service
class BranchSaleShortages {

    static final String DEBT_DOC_TYPE = "FSK";

    enum Bearer { BUYER, SELLER }

    record FsShortageResolveRequest(@NotNull(message = "{validation.required}") ShortageKind kind,
            @Schema(nullable = true, description = "WRITE_OFF da majburiy; RETURN — doim SELLER") Bearer bearer,
            @Size(max = 500) String note) {}

    record FsShortageResolution(ShortageKind kind, Bearer bearer, int qty,
            @Schema(nullable = true, description = "Tannarxda; faqat special.cost") String amount,
            @Schema(nullable = true, description = "Xaridor qarzi o'zgarishi (− kamaydi); faqat special.cost") String debtChange,
            @Schema(nullable = true) Long writeOffId, @Schema(nullable = true) String writeOffNumber,
            @Schema(nullable = true) Status writeOffStatus, @Schema(nullable = true) String note, String resolvedBy, Instant resolvedAt) {}

    /** FS kamomadi: ochiqmi, summa (special.cost), hal qilish tarixi (eng yangisi birinchi). */
    record FsShortageInfo(long saleId, String number, int shortageQty, @Schema(nullable = true) String amount, boolean open,
            boolean canResolveAsBuyer, boolean canResolveAsSeller, List<FsShortageResolution> history) {}

    private record Sale(long id, String number, long sellerBranchId, String sellerName, long buyerBranchId, String buyerName,
            long fromZoneId, Long toZoneId, String status, int shortageQty) {}

    private record Missing(long batchId, int qty, BigDecimal unitCost) {}

    private final JdbcClient jdbc;
    private final WriteOffs writeOffs;
    private final StockLedger ledger;
    private final AuditLog audit;

    BranchSaleShortages(JdbcClient jdbc, WriteOffs writeOffs, StockLedger ledger, AuditLog audit) {
        this.jdbc = jdbc;
        this.writeOffs = writeOffs;
        this.ledger = ledger;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    Optional<FsShortageInfo> info(Actor actor, long saleId, boolean canSeeCost) {
        return sale(actor, saleId, false).map(s -> info(actor, s, canSeeCost));
    }

    @Transactional
    FsShortageInfo resolve(Actor actor, long saleId, FsShortageResolveRequest r, Approver approver, boolean canSeeCost) {
        Sale s = sale(actor, saleId, true).orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (!isOpen(s, history(s.id(), true))) {
            throw MedixException.conflict("transfer.shortage.notOpen");
        }
        Bearer bearer = r.kind() == ShortageKind.RETURN ? Bearer.SELLER : r.bearer();
        if (bearer == null) {
            throw MedixException.badRequest("transfer.fs.bearerRequired");
        }
        // Tovar harakati qaysi filial omborida bo'lsa — o'sha filial xodimi (yoki barcha filiallar) hal qiladi
        if (bearer == Bearer.SELLER && !actor.canAccessBranch(s.sellerBranchId())) {
            throw MedixException.forbidden("transfer.fs.sellerOnly", s.sellerName());
        }
        if (bearer == Bearer.BUYER && !actor.canAccessBranch(s.buyerBranchId())) {
            throw MedixException.forbidden("transfer.fs.buyerOnly", s.buyerName());
        }
        String note = r.note() == null || r.note().isBlank() ? null : r.note().strip();
        List<Missing> missing = missing(s.id());
        Money amount = Money.ZERO;
        List<LineQty> lines = new ArrayList<>();
        for (Missing m : missing) {
            amount = amount.plus(new Money(m.unitCost()).times(m.qty()));
            lines.add(new LineQty(m.batchId(), m.qty()));
        }
        Long writeOffId = null;
        if (r.kind() == ShortageKind.WRITE_OFF) {
            long zoneId = bearer == Bearer.BUYER ? s.toZoneId() : s.fromZoneId();
            ZoneInfo zone = writeOffs.zone(actor, zoneId);
            Created c = writeOffs.insert(actor, zone, Reason.SHORTAGE, null, null,
                    note == null ? "FS " + s.number() + " kamomadi" : "FS " + s.number() + ": " + note, lines, null, s.id());
            writeOffs.postOrNotify(actor, c, zone, approver);
            writeOffId = c.id();
        } else {
            List<Move> moves = new ArrayList<>();
            for (LineQty l : lines) {
                moves.add(Move.in(s.fromZoneId(), l.batchId(), l.qty()));
            }
            ledger.post(new DocRef("FS", s.id(), s.number()), moves);
        }
        // Qarz: sotuvchi zimmasida yoki qaytarilgan — xaridor kamomad summasini to'lamaydi
        Money target = bearer == Bearer.SELLER ? Money.ZERO.minus(amount) : Money.ZERO;
        BigDecimal applied = jdbc.sql("SELECT COALESCE(sum(amount), 0) FROM branch_ledger WHERE doc_type = :t AND doc_id = :id")
                .param("t", DEBT_DOC_TYPE)
                .param("id", s.id())
                .query(BigDecimal.class)
                .single();
        Money delta = target.minus(new Money(applied));
        if (!delta.isZero()) {
            jdbc.sql("""
                    INSERT INTO branch_ledger (debtor_branch_id, creditor_branch_id, amount, doc_type, doc_id, doc_number, created_by)
                    VALUES (:d, :c, :a, :t, :id, :n, :by)""")
                    .param("d", s.buyerBranchId())
                    .param("c", s.sellerBranchId())
                    .param("a", delta.amount())
                    .param("t", DEBT_DOC_TYPE)
                    .param("id", s.id())
                    .param("n", s.number())
                    .param("by", actor.employeeId())
                    .update();
        }
        jdbc.sql("""
                INSERT INTO branch_sale_resolution (sale_id, kind, bearer, write_off_id, qty, amount, debt_change, note, resolved_by)
                VALUES (:s, :k, :b, :w, :q, :a, :dc, :note, :by)""")
                .param("s", s.id())
                .param("k", r.kind().name())
                .param("b", bearer.name())
                .param("w", writeOffId)
                .param("q", s.shortageQty())
                .param("a", amount.amount())
                .param("dc", delta.amount())
                .param("note", note)
                .param("by", actor.employeeId())
                .update();
        audit.record(AuditEntry.of("transfer.fs.resolve", "branch_sale", s.id())
                .change(null, Map.of("number", s.number(), "kind", r.kind().name(), "bearer", bearer.name(), "qty", s.shortageQty(),
                        "amount", amount.toString(), "debtChange", delta.toString())), actor);
        return info(actor, s, canSeeCost);
    }

    private FsShortageInfo info(Actor actor, Sale s, boolean canSeeCost) {
        List<FsShortageResolution> history = history(s.id(), canSeeCost);
        String amount = null;
        if (canSeeCost && s.shortageQty() > 0) {
            Money total = Money.ZERO;
            for (Missing m : missing(s.id())) {
                total = total.plus(new Money(m.unitCost()).times(m.qty()));
            }
            amount = total.amount().toPlainString();
        }
        return new FsShortageInfo(s.id(), s.number(), s.shortageQty(), amount, isOpen(s, history),
                actor.canAccessBranch(s.buyerBranchId()), actor.canAccessBranch(s.sellerBranchId()), history);
    }

    private static boolean isOpen(Sale s, List<FsShortageResolution> history) {
        if (!"RECEIVED".equals(s.status()) || s.shortageQty() == 0) {
            return false;
        }
        if (history.isEmpty()) {
            return true;
        }
        FsShortageResolution last = history.getFirst();
        return last.kind() == ShortageKind.WRITE_OFF && last.writeOffStatus() == Status.REJECTED;
    }

    private List<Missing> missing(long saleId) {
        return jdbc.sql("""
                SELECT batch_id, qty - received_qty AS missing, unit_cost FROM branch_sale_line
                WHERE sale_id = :s AND received_qty IS NOT NULL AND received_qty < qty ORDER BY line_no""")
                .param("s", saleId)
                .query((rs, n) -> new Missing(rs.getLong("batch_id"), rs.getInt("missing"), rs.getBigDecimal("unit_cost")))
                .list();
    }

    private Optional<Sale> sale(Actor actor, long id, boolean lock) {
        return jdbc.sql("""
                SELECT t.id, t.number, t.seller_branch_id, sb.name AS seller_name, t.buyer_branch_id, bb.name AS buyer_name, t.from_zone_id,
                       t.to_zone_id, t.status, t.shortage_qty
                FROM branch_sale t JOIN branch sb ON sb.id = t.seller_branch_id JOIN branch bb ON bb.id = t.buyer_branch_id
                WHERE t.id = :id""" + (lock ? " FOR UPDATE OF t" : ""))
                .param("id", id)
                .query((rs, n) -> new Sale(rs.getLong("id"), rs.getString("number"), rs.getLong("seller_branch_id"), rs.getString("seller_name"),
                        rs.getLong("buyer_branch_id"), rs.getString("buyer_name"), rs.getLong("from_zone_id"),
                        rs.getObject("to_zone_id", Long.class), rs.getString("status"), rs.getInt("shortage_qty")))
                .optional()
                .filter(s -> actor.canAccessBranch(s.sellerBranchId()) || actor.canAccessBranch(s.buyerBranchId()));
    }

    private List<FsShortageResolution> history(long saleId, boolean canSeeCost) {
        return jdbc.sql("""
                SELECT r.kind, r.bearer, r.qty, r.amount, r.debt_change, r.write_off_id, w.number AS write_off_number,
                       w.status AS write_off_status, r.note, e.full_name AS resolved_by, r.resolved_at
                FROM branch_sale_resolution r
                JOIN employee e ON e.id = r.resolved_by
                LEFT JOIN write_off w ON w.id = r.write_off_id
                WHERE r.sale_id = :s ORDER BY r.resolved_at DESC, r.id DESC""")
                .param("s", saleId)
                .query((rs, n) -> new FsShortageResolution(ShortageKind.valueOf(rs.getString("kind")), Bearer.valueOf(rs.getString("bearer")),
                        rs.getInt("qty"), canSeeCost ? rs.getBigDecimal("amount").toPlainString() : null,
                        canSeeCost ? rs.getBigDecimal("debt_change").toPlainString() : null, rs.getObject("write_off_id", Long.class),
                        rs.getString("write_off_number"),
                        rs.getString("write_off_status") == null ? null : Status.valueOf(rs.getString("write_off_status")), rs.getString("note"),
                        rs.getString("resolved_by"), rs.getTimestamp("resolved_at").toInstant()))
                .list();
    }
}
