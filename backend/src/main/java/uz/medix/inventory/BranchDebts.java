package uz.medix.inventory;

import java.math.BigDecimal;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import uz.medix.shared.money.Money;

/**
 * Filiallararo qarz jurnali ({@code branch_ledger}, faqat qo'shiladi) — boshqa modullar uchun ochiq API (masalan, Pul moduli:
 * filiallar o'rtasida to'lov). Chaqiruvchi tranzaksiyasida ishlaydi; juftlik {@link #lockPair} bilan qulflanadi (parallel to'lovlar
 * qarzdan oshmaydi).
 */
@Service
public class BranchDebts {

    private final JdbcClient jdbc;

    BranchDebts(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Ikki filial satrini id tartibida qulflaydi (deadlock bo'lmaydi). */
    public void lockPair(long a, long b) {
        jdbc.sql("SELECT id FROM branch WHERE id IN (:a, :b) ORDER BY id FOR UPDATE")
                .param("a", a)
                .param("b", b)
                .query(Long.class)
                .list();
    }

    /** {@code debtor} filialning {@code creditor} oldidagi qarzi (shu yo'nalishdagi yozuvlar yig'indisi). */
    public Money balance(long debtor, long creditor) {
        BigDecimal v = jdbc.sql("SELECT coalesce(sum(amount), 0) FROM branch_ledger WHERE debtor_branch_id = :d AND creditor_branch_id = :c")
                .param("d", debtor)
                .param("c", creditor)
                .query(BigDecimal.class)
                .single();
        return new Money(v);
    }

    /** Yozuv: musbat — qarz oshdi, manfiy — kamaydi. */
    public void post(long debtor, long creditor, Money amount, String docType, long docId, String docNumber, long employeeId) {
        jdbc.sql("""
                INSERT INTO branch_ledger (debtor_branch_id, creditor_branch_id, amount, doc_type, doc_id, doc_number, created_by)
                VALUES (:d, :c, :a, :t, :id, :n, :by)""")
                .param("d", debtor)
                .param("c", creditor)
                .param("a", amount.amount())
                .param("t", docType)
                .param("id", docId)
                .param("n", docNumber)
                .param("by", employeeId)
                .update();
    }
}
