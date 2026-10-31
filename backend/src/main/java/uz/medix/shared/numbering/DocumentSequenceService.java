package uz.medix.shared.numbering;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Hujjat raqamini beradi. Raqam bir marta beriladi va qayta ishlatilmaydi:
 * hisoblagich alohida tranzaksiyada oshiriladi, shuning uchun asosiy tranzaksiya
 * orqaga qaytsa ham raqam takrorlanmaydi (bo'shliq bo'lishi mumkin — bu ruxsat etilgan).
 */
@Service
public class DocumentSequenceService {

    private final JdbcClient jdbc;

    public DocumentSequenceService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public DocumentNumber next(DocumentPrefix prefix, String branchCode) {
        long value = jdbc.sql("""
                INSERT INTO document_sequence (prefix, branch_code, last_value)
                VALUES (:prefix, :branch, 1)
                ON CONFLICT (prefix, branch_code)
                DO UPDATE SET last_value = document_sequence.last_value + 1, updated_at = now()
                RETURNING last_value
                """)
                .param("prefix", prefix.name())
                .param("branch", branchCode)
                .query(Long.class)
                .single();
        return new DocumentNumber(prefix, branchCode, value);
    }
}
