package uz.yuzplus.finance.opening;

import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.yuzplus.finance.opening.OpeningFinanceModels.Kind;
import uz.yuzplus.finance.opening.OpeningFinanceModels.OpeningFinanceLineRequest;
import uz.yuzplus.finance.opening.OpeningFinanceModels.OpeningFinanceRequest;
import uz.yuzplus.shared.security.Actor;

/**
 * BQ (qarzlar, kassa va bank) — bir fayldan ko'chirish uchun ochiq API (integration moduli, BQ1). Tekshiruv, qoralama va o'tkazish —
 * {@link OpeningFinances} orqali (yangi biznes qoidasi yo'q). Har (filial, tur) uchun bitta qoralama: mavjud bo'lsa — almashtiriladi.
 */
@Service
public class OpeningFinanceImport {

    public enum Section { CUSTOMER_DEBT, SUPPLIER_DEBT, MONEY }

    public enum Existing { NONE, DRAFT, POSTED }

    /** Qarz — {@code counterpartyId}, pul — {@code accountId}; summa satr ({@code -1500.00} — avans). */
    public record Line(Long counterpartyId, Long accountId, String amount, LocalDate dueDate, String docRef) {}

    private final OpeningFinances openings;
    private final JdbcClient jdbc;

    OpeningFinanceImport(OpeningFinances openings, JdbcClient jdbc) {
        this.openings = openings;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public Existing existing(long branchId, Section section) {
        String s = jdbc.sql("""
                SELECT CASE WHEN bool_or(status = 'POSTED') THEN 'POSTED' WHEN bool_or(status = 'DRAFT') THEN 'DRAFT' ELSE 'NONE' END
                FROM opening_finance WHERE branch_id = :b AND kind = :k""")
                .param("b", branchId)
                .param("k", section.name())
                .query(String.class)
                .single();
        return Existing.valueOf(s);
    }

    /** Qoralama yaratadi yoki (filial, tur) ning mavjud qoralamasini almashtiradi. Qaytaradi: hujjat id. */
    @Transactional
    public long replaceDraft(Actor actor, Section section, long branchId, LocalDate cutoff, List<Line> lines, String note) {
        Kind kind = Kind.valueOf(section.name());
        OpeningFinanceRequest r = new OpeningFinanceRequest(kind, branchId, cutoff, note,
                lines.stream().map(l -> new OpeningFinanceLineRequest(l.counterpartyId(), l.accountId(), l.amount(), l.dueDate(), l.docRef())).toList());
        Long draft = jdbc.sql("SELECT id FROM opening_finance WHERE branch_id = :b AND kind = :k AND status = 'DRAFT' ORDER BY id DESC LIMIT 1")
                .param("b", branchId)
                .param("k", kind.name())
                .query(Long.class)
                .optional()
                .orElse(null);
        if (draft == null) {
            return openings.create(r, actor);
        }
        openings.update(draft, r, actor);
        return draft;
    }

    @Transactional
    public void post(Actor actor, long id) {
        openings.post(id, actor);
    }

    @Transactional(readOnly = true)
    public String number(long id) {
        return jdbc.sql("SELECT number FROM opening_finance WHERE id = :id").param("id", id).query(String.class).single();
    }
}
