package uz.medix.finance;

import java.sql.Date;
import java.time.LocalDate;
import java.util.Objects;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.CurrentActor;

/**
 * Kontragentlar bilan hisob-kitob jurnali — finance modulining ochiq API'si (SPEC 6-10: qarz, avans faqat hujjatlardan).
 * Faqat qo'shiladi. Chaqiruvchi hujjat tranzaksiyasiga qo'shiladi (REQUIRED): hujjat qaytsa, yozuv ham qaytadi.
 */
@Service
public class PartyLedger {

    /** SUPPLIER — kompaniya YB ga qarzdor; CUSTOMER — mijoz kompaniyaga qarzdor. */
    public enum Side { SUPPLIER, CUSTOMER }

    /** Hujjat: turi (KR, YT, SV, MT, ...), id va raqami. */
    public record DocRef(String type, long id, String number) {
        public DocRef {
            Objects.requireNonNull(type);
            Objects.requireNonNull(number);
        }
    }

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;

    PartyLedger(JdbcClient jdbc, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
    }

    /** Yozuv: musbat — qarz oshdi, manfiy — kamaydi. Nol summa yozilmaydi. */
    @Transactional(propagation = Propagation.REQUIRED)
    public void record(DocRef doc, long branchId, long counterpartyId, Side side, Money amount, LocalDate dueDate, String note) {
        if (amount.isZero()) {
            return;
        }
        Long employee = currentActor.current().map(a -> a.employeeId()).orElse(null);
        jdbc.sql("""
                INSERT INTO party_ledger (branch_id, counterparty_id, side, amount, due_date, doc_type, doc_id, doc_number, employee_id, note)
                VALUES (:b, :c, :s, :a, :due, :dt, :di, :dn, :e, :note)""")
                .param("b", branchId)
                .param("c", counterpartyId)
                .param("s", side.name())
                .param("a", amount.amount())
                .param("due", dueDate == null ? null : Date.valueOf(dueDate))
                .param("dt", doc.type())
                .param("di", doc.id())
                .param("dn", doc.number())
                .param("e", employee)
                .param("note", note)
                .update();
    }

    /** Saldo (filial bo'yicha): musbat — qarz, manfiy — avans. */
    @Transactional(readOnly = true)
    public Money balance(long branchId, long counterpartyId, Side side) {
        return new Money(jdbc.sql("""
                SELECT coalesce(sum(amount), 0) FROM party_ledger WHERE branch_id = :b AND counterparty_id = :c AND side = :s""")
                .param("b", branchId)
                .param("c", counterpartyId)
                .param("s", side.name())
                .query(java.math.BigDecimal.class)
                .single());
    }

    /** Hujjat bo'yicha yozuvlar yig'indisi (bekor qilishda teskari yozuv uchun). */
    @Transactional(readOnly = true)
    public Money docTotal(String docType, long docId) {
        return new Money(jdbc.sql("SELECT coalesce(sum(amount), 0) FROM party_ledger WHERE doc_type = :t AND doc_id = :d")
                .param("t", docType)
                .param("d", docId)
                .query(java.math.BigDecimal.class)
                .single());
    }
}
