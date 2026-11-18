package uz.yuzplus.purchasing.receipt;

import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import uz.yuzplus.finance.PartyLedger;
import uz.yuzplus.finance.PartyLedger.Side;
import uz.yuzplus.purchasing.receipt.ExpectedReceiptModels.PaymentKind;
import uz.yuzplus.shared.audit.AuditEntry;
import uz.yuzplus.shared.audit.AuditLog;
import uz.yuzplus.shared.money.Money;

/**
 * Kirim (KR) ↔ KK bog'lanishi (O15): kirim o'tkazilganda chaqiriladi (Receipts.post tranzaksiyasi ichida). «Qarzga» KK da qarz KK
 * tasdig'ida yozilgan — kirim qarzni qayta yozmaydi, faqat farqni (haqiqiy − hujjatdagi soni) × narx KK ga qo'llanadigan tuzatish
 * sifatida yozadi: kam — qarz kamayadi, ortiqcha — ko'payadi. KK qatorlarida qabul qilingan (kelgan) soni oshadi; «Haqiqiy soni» qarori
 * bilan kelmagan qism hisobdan chiqariladi (qarz kamaygan), «Hujjat bo'yicha» bilan — hali kutilmoqda. Holat Qisman / Qabul qilindi.
 */
@Component
class ExpectedReceiptLinks {

    record Link(long id, String number, PaymentKind paymentKind) {
        boolean credit() {
            return paymentKind == PaymentKind.CREDIT;
        }
    }

    private final JdbcClient jdbc;
    private final PartyLedger parties;
    private final AuditLog audit;

    ExpectedReceiptLinks(JdbcClient jdbc, PartyLedger parties, AuditLog audit) {
        this.jdbc = jdbc;
        this.parties = parties;
        this.audit = audit;
    }

    /** Kirim KK dan tuzilgan bo'lsa — KK qulflanadi (parallel kirimlar ketma-ket). */
    Optional<Link> lockForReceipt(long receiptId) {
        return jdbc.sql("""
                SELECT k.id, k.number, k.payment_kind FROM expected_receipt k
                WHERE k.id = (SELECT expected_receipt_id FROM receipt WHERE id = :r) FOR UPDATE""")
                .param("r", receiptId)
                .query((rs, n) -> new Link(rs.getLong("id"), rs.getString("number"), PaymentKind.valueOf(rs.getString("payment_kind"))))
                .optional();
    }

    boolean linked(long receiptId) {
        return jdbc.sql("SELECT expected_receipt_id IS NOT NULL FROM receipt WHERE id = :r").param("r", receiptId).query(Boolean.class).single();
    }

    /** «Qarzga» KK: kirim farqi KK qarziga tuzatish (manfiy — kam, musbat — ortiqcha). */
    void adjustDebt(Link k, String receiptType, long receiptId, String receiptNumber, long branchId, long supplierId, Money delta) {
        if (delta.isZero()) {
            return;
        }
        parties.record(new PartyLedger.DocRef(receiptType, receiptId, receiptNumber), branchId, supplierId, Side.SUPPLIER, delta, null,
                "Farq: " + k.number(), new PartyLedger.DocRef(ExpectedReceipts.DOC_TYPE, k.id(), k.number()));
    }

    /** KK qatorlari va holati kirim natijasi bo'yicha. */
    void applyReceived(Link k, long receiptId, boolean writeOffShort) {
        jdbc.sql("""
                UPDATE expected_receipt_line el
                SET received_qty = el.received_qty + x.arrived,
                    written_off_qty = el.written_off_qty + CASE WHEN :wo THEN greatest(0, x.qty - x.arrived) ELSE 0 END
                FROM (SELECT expected_line_id, sum(qty) AS qty, sum(coalesce(received_qty, 0) + coalesce(damaged_qty, 0)) AS arrived
                      FROM receipt_line WHERE receipt_id = :r AND expected_line_id IS NOT NULL GROUP BY expected_line_id) x
                WHERE el.id = x.expected_line_id""")
                .param("wo", writeOffShort)
                .param("r", receiptId)
                .update();
        boolean done = !jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM expected_receipt_line WHERE expected_receipt_id = :k AND qty - received_qty - written_off_qty > 0)""")
                .param("k", k.id()).query(Boolean.class).single();
        jdbc.sql("""
                UPDATE expected_receipt SET status = :st, closed_at = CASE WHEN :done THEN now() END, updated_at = now(), version = version + 1
                WHERE id = :k""")
                .param("st", done ? "RECEIVED" : "PARTIAL")
                .param("done", done)
                .param("k", k.id())
                .update();
        audit.record(AuditEntry.of("kk.received", "expected_receipt", k.id())
                .change(null, Map.of("receipt", receiptId, "status", done ? "RECEIVED" : "PARTIAL")));
    }
}
