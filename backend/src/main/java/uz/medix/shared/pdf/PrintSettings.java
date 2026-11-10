package uz.medix.shared.pdf;

import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Chop etish sozlamalari (Sozlamalar → Chop etish, V72): imzo qo'yuvchilar filial bo'yicha, takroriy nusxa belgisi, yuk
 * xati standart varianti. Barcha PDF shakllari shu yerdan o'qiydi.
 */
@Service
public class PrintSettings {

    /** Imzo qo'yuvchilar (F.I.Sh.); tanlanmagan bo'lsa — rol bo'yicha avtomatik, topilmasa {@code null}. */
    public record Signers(String head, String accountant) {}

    private final JdbcClient jdbc;

    public PrintSettings(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Filial rahbari va bosh hisobchisi: qo'lda tanlangan → filial rahbari / buxgalter roli (filialniki yoki umumiy). */
    @Transactional(readOnly = true)
    public Signers signers(long branchId) {
        String head = manual(branchId, "head_id").or(() -> auto(branchId, "BRANCH_MANAGER", false)).orElse(null);
        String acc = manual(branchId, "accountant_id").or(() -> auto(branchId, "ACCOUNTANT", true)).orElse(null);
        return new Signers(head, acc);
    }

    /** Yuk xati (nakladnoy) standart varianti — narxlar bilanmi. */
    @Transactional(readOnly = true)
    public boolean waybillWithPrice() {
        return "PRICE".equals(jdbc.sql("SELECT invoice_variant FROM print_setting WHERE id = 1").query(String.class).optional().orElse("PRICE"));
    }

    /**
     * Chop etishni qayd qiladi va belgini qaytaradi: ikkinchi va keyingi chop etishda (sozlama yoqilgan bo'lsa) —
     * «Takroriy nusxa · N», aks holda {@code null}. Alohida tranzaksiyada (PDF o'qish tranzaksiyasi faqat o'qish uchun).
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String registerPrint(String docType, String docNumber, Long employeeId) {
        int copies = jdbc.sql("""
                INSERT INTO print_log (doc_type, doc_number, last_by) VALUES (:t, :n, :e)
                ON CONFLICT (doc_type, doc_number) DO UPDATE SET copies = print_log.copies + 1, last_at = now(), last_by = :e
                RETURNING copies""")
                .param("t", docType).param("n", docNumber).param("e", employeeId)
                .query(Integer.class).single();
        boolean mark = jdbc.sql("SELECT reprint_mark FROM print_setting WHERE id = 1").query(Boolean.class).optional().orElse(true);
        return mark && copies > 1 ? reprintLabel(copies) : null;
    }

    static String reprintLabel(int copies) {
        return "Takroriy nusxa · " + copies;
    }

    private Optional<String> manual(long branchId, String column) {
        return jdbc.sql("SELECT e.full_name FROM print_signer s JOIN employee e ON e.id = s." + column + " WHERE s.branch_id = :b")
                .param("b", branchId).query(String.class).optional();
    }

    private Optional<String> auto(long branchId, String role, boolean global) {
        return jdbc.sql("""
                SELECT e.full_name FROM employee e JOIN role r ON r.id = e.role_id
                WHERE e.status = 'ACTIVE' AND r.code = :role AND (e.branch_id = :b%s)
                ORDER BY e.full_name LIMIT 1""".formatted(global ? " OR e.branch_id IS NULL" : ""))
                .param("role", role).param("b", branchId).query(String.class).optional();
    }
}
