package uz.medix.purchasing.receipt;

import java.math.BigDecimal;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.CurrentActor;

/** YB bonus balansi jurnali (faqat qo'shiladi). Balans — yozuvlar yig'indisi (SPEC 6-10: qo'lda kiritilmaydi). */
@Service
class SupplierBonuses {

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;

    SupplierBonuses(JdbcClient jdbc, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
    }

    /** Bir YB × filial balansini o'zgartiruvchi tranzaksiyalar ketma-ket bajariladi (ikki kirim bir balansni ikki marta ishlatmasin). */
    void lock(long branchId, long supplierId) {
        jdbc.sql("SELECT pg_advisory_xact_lock(:k)").param("k", (branchId << 32) ^ supplierId ^ 0x5B0_0000_0000_0000L).query((rs, n) -> 1).list();
    }

    Money balance(long branchId, long supplierId) {
        return new Money(jdbc.sql("SELECT coalesce(sum(amount), 0) FROM supplier_bonus_ledger WHERE branch_id = :b AND supplier_id = :s")
                .param("b", branchId)
                .param("s", supplierId)
                .query(BigDecimal.class)
                .single());
    }

    Money docTotal(String docType, long docId) {
        return new Money(jdbc.sql("SELECT coalesce(sum(amount), 0) FROM supplier_bonus_ledger WHERE doc_type = :t AND doc_id = :d")
                .param("t", docType)
                .param("d", docId)
                .query(BigDecimal.class)
                .single());
    }

    void record(long branchId, long supplierId, Money amount, String docType, long docId, String docNumber, String note) {
        if (amount.isZero()) {
            return;
        }
        jdbc.sql("""
                INSERT INTO supplier_bonus_ledger (branch_id, supplier_id, amount, doc_type, doc_id, doc_number, employee_id, note)
                VALUES (:b, :s, :a, :t, :d, :n, :e, :note)""")
                .param("b", branchId)
                .param("s", supplierId)
                .param("a", amount.amount())
                .param("t", docType)
                .param("d", docId)
                .param("n", docNumber)
                .param("e", currentActor.current().map(a -> a.employeeId()).orElse(null))
                .param("note", note)
                .update();
    }
}
