package uz.medix.inventory.writeoff;

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
import uz.medix.inventory.writeoff.WriteOffModels.ShortageInfo;
import uz.medix.inventory.writeoff.WriteOffModels.ShortageKind;
import uz.medix.inventory.writeoff.WriteOffModels.ShortageResolution;
import uz.medix.inventory.writeoff.WriteOffModels.Status;
import uz.medix.inventory.writeoff.WriteOffs.Approver;
import uz.medix.inventory.writeoff.WriteOffs.Created;
import uz.medix.inventory.writeoff.WriteOffs.LineQty;
import uz.medix.inventory.writeoff.WriteOffs.ZoneInfo;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/**
 * OK kamomadini hal qilish (T12: resolveHc / resolveBack, transfer.resolve). Kamomad — qabul qilingan OK da jo'natilgan − kelgan.
 * «Hisobdan chiqarish» — HC (sabab «Kamomad», manba zona, qoldiq harakatisiz; HC tasdiq qoidalari). «Topildi — qaytarish» — manba
 * zonaga kirim (jurnalda OK hujjati bilan). Ochiq kamomad: hal qilinmagan yoki oxirgi HC rad etilgan. OK satri FOR UPDATE —
 * parallel ikki marta hal qilinmaydi.
 */
@Service
class TransferShortages {

    private final JdbcClient jdbc;
    private final WriteOffs writeOffs;
    private final StockLedger ledger;
    private final AuditLog audit;

    TransferShortages(JdbcClient jdbc, WriteOffs writeOffs, StockLedger ledger, AuditLog audit) {
        this.jdbc = jdbc;
        this.writeOffs = writeOffs;
        this.ledger = ledger;
        this.audit = audit;
    }

    private record Transfer(long id, String number, long branchId, long fromZoneId, String status, int shortageQty) {}

    @Transactional(readOnly = true)
    Optional<ShortageInfo> info(Actor actor, long transferId) {
        return transfer(actor, transferId, false).map(t -> {
            List<ShortageResolution> history = history(t.id());
            return new ShortageInfo(t.id(), t.number(), t.shortageQty(), isOpen(t, history), history);
        });
    }

    @Transactional
    ShortageInfo resolve(Actor actor, long transferId, ShortageKind kind, String rawNote, Approver approver) {
        Transfer t = transfer(actor, transferId, true).orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (!isOpen(t, history(t.id()))) {
            throw MedixException.conflict("transfer.shortage.notOpen");
        }
        String note = rawNote == null || rawNote.isBlank() ? null : rawNote.strip();
        List<LineQty> lines = jdbc.sql("""
                SELECT batch_id, qty - received_qty AS missing FROM warehouse_transfer_line
                WHERE transfer_id = :t AND received_qty IS NOT NULL AND received_qty < qty ORDER BY line_no""")
                .param("t", t.id())
                .query((rs, n) -> new LineQty(rs.getLong("batch_id"), rs.getInt("missing")))
                .list();
        Long writeOffId = null;
        if (kind == ShortageKind.WRITE_OFF) {
            ZoneInfo zone = writeOffs.zone(actor, t.fromZoneId());
            Created c = writeOffs.insert(actor, zone, Reason.SHORTAGE, null, null,
                    note == null ? "OK " + t.number() + " kamomadi" : "OK " + t.number() + ": " + note, lines, t.id());
            writeOffs.postOrNotify(actor, c, zone, approver);
            writeOffId = c.id();
        } else {
            List<Move> moves = new ArrayList<>();
            for (LineQty l : lines) {
                moves.add(Move.in(t.fromZoneId(), l.batchId(), l.qty()));
            }
            ledger.post(new DocRef("OK", t.id(), t.number()), moves);
        }
        jdbc.sql("""
                INSERT INTO warehouse_transfer_resolution (transfer_id, kind, write_off_id, qty, note, resolved_by)
                VALUES (:t, :k, :w, :q, :note, :by)""")
                .param("t", t.id())
                .param("k", kind.name())
                .param("w", writeOffId)
                .param("q", t.shortageQty())
                .param("note", note)
                .param("by", actor.employeeId())
                .update();
        audit.record(AuditEntry.of("transfer.ok.resolve", "warehouse_transfer", t.id())
                .change(null, Map.of("number", t.number(), "kind", kind.name(), "qty", t.shortageQty())), actor);
        List<ShortageResolution> history = history(t.id());
        return new ShortageInfo(t.id(), t.number(), t.shortageQty(), isOpen(t, history), history);
    }

    private static boolean isOpen(Transfer t, List<ShortageResolution> history) {
        if (!"RECEIVED".equals(t.status()) || t.shortageQty() == 0) {
            return false;
        }
        if (history.isEmpty()) {
            return true;
        }
        ShortageResolution last = history.getFirst();
        return last.kind() == ShortageKind.WRITE_OFF && last.writeOffStatus() == Status.REJECTED;
    }

    private Optional<Transfer> transfer(Actor actor, long id, boolean lock) {
        return jdbc.sql("SELECT id, number, branch_id, from_zone_id, status, shortage_qty FROM warehouse_transfer WHERE id = :id"
                        + (lock ? " FOR UPDATE" : ""))
                .param("id", id)
                .query((rs, n) -> new Transfer(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("from_zone_id"),
                        rs.getString("status"), rs.getInt("shortage_qty")))
                .optional()
                .filter(t -> actor.canAccessBranch(t.branchId()));
    }

    private List<ShortageResolution> history(long transferId) {
        return jdbc.sql("""
                SELECT r.kind, r.qty, r.write_off_id, w.number AS write_off_number, w.status AS write_off_status, r.note,
                       e.full_name AS resolved_by, r.resolved_at
                FROM warehouse_transfer_resolution r
                JOIN employee e ON e.id = r.resolved_by
                LEFT JOIN write_off w ON w.id = r.write_off_id
                WHERE r.transfer_id = :t ORDER BY r.resolved_at DESC, r.id DESC""")
                .param("t", transferId)
                .query((rs, n) -> new ShortageResolution(ShortageKind.valueOf(rs.getString("kind")), rs.getInt("qty"),
                        rs.getObject("write_off_id", Long.class), rs.getString("write_off_number"),
                        rs.getString("write_off_status") == null ? null : Status.valueOf(rs.getString("write_off_status")), rs.getString("note"),
                        rs.getString("resolved_by"), rs.getTimestamp("resolved_at").toInstant()))
                .list();
    }
}
