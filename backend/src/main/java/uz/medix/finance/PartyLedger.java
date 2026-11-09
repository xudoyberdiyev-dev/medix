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
        record(doc, branchId, counterpartyId, side, amount, dueDate, note, null);
    }

    /**
     * Yozuv boshqa hujjatni yopadi (appliesTo): MT taqsimoti — sotuvni, QM — o'z sotuvini. appliesTo = null — hujjatning o'z qarzi
     * yoki (manfiy bo'lsa) avans.
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public void record(DocRef doc, long branchId, long counterpartyId, Side side, Money amount, LocalDate dueDate, String note, DocRef appliesTo) {
        if (amount.isZero()) {
            return;
        }
        Long employee = currentActor.current().map(a -> a.employeeId()).orElse(null);
        jdbc.sql("""
                INSERT INTO party_ledger (branch_id, counterparty_id, side, amount, due_date, doc_type, doc_id, doc_number, employee_id, note,
                                          applies_doc_type, applies_doc_id)
                VALUES (:b, :c, :s, :a, :due, :dt, :di, :dn, :e, :note, :at, :ai)""")
                .param("at", appliesTo == null ? null : appliesTo.type())
                .param("ai", appliesTo == null ? null : appliesTo.id())
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

    /** Hujjat bo'yicha ochiq qoldiq: o'z yozuvlari + unga qo'llangan to'lovlar (musbat — hali to'lanmagan qism). */
    @Transactional(readOnly = true)
    public Money docOpen(String docType, long docId) {
        return new Money(jdbc.sql("""
                SELECT coalesce(sum(amount), 0) FROM party_ledger
                WHERE (doc_type = :t AND doc_id = :d AND applies_doc_type IS NULL) OR (applies_doc_type = :t AND applies_doc_id = :d)""")
                .param("t", docType)
                .param("d", docId)
                .query(java.math.BigDecimal.class)
                .single());
    }

    /** Kredit holati: qarz, muddati o'tgan qismi va eng eski muddati o'tgan qarz kunlari. */
    public record CreditState(Money debt, Money overdue, int overdueDays) {}

    /** Ochiq hujjat: o'z yozuvlari + uni yopgan yozuvlar. open > 0 — qarz, open < 0 — avans (taqsimlanmagan to'lov). */
    public record OpenDoc(String type, long id, String number, LocalDate dueDate, LocalDate date, Money open, Money total, Money returned, Money paid) {
        public DocRef ref() {
            return new DocRef(type, id, number);
        }
    }

    /** Hujjatlar bo'yicha ochiq qoldiq, eng eskisi birinchi (muddati, bo'lmasa yozilgan sanasi bo'yicha). */
    @Transactional(readOnly = true)
    public java.util.List<OpenDoc> openDocs(long branchId, long counterpartyId, Side side) {
        return jdbc.sql("""
                WITH own AS (SELECT doc_type, doc_id, min(doc_number) AS doc_number, min(due_date) AS due, min(occurred_at) AS at, sum(amount) AS amt
                             FROM party_ledger WHERE branch_id = :b AND counterparty_id = :c AND side = :s AND applies_doc_type IS NULL
                             GROUP BY doc_type, doc_id),
                     app AS (SELECT applies_doc_type AS t, applies_doc_id AS i, sum(amount) AS amt,
                                    sum(amount) FILTER (WHERE doc_type IN ('MT', 'YT', 'AH')) AS pay
                             FROM party_ledger WHERE branch_id = :b AND counterparty_id = :c AND side = :s AND applies_doc_type IS NOT NULL
                             GROUP BY applies_doc_type, applies_doc_id)
                SELECT own.doc_type, own.doc_id, own.doc_number, own.due, (own.at AT TIME ZONE 'Asia/Tashkent')::date AS d,
                       own.amt + coalesce(app.amt, 0) AS open, own.amt AS total,
                       coalesce(app.pay, 0) AS pay, coalesce(app.amt, 0) - coalesce(app.pay, 0) AS ret
                FROM own LEFT JOIN app ON app.t = own.doc_type AND app.i = own.doc_id
                WHERE own.amt + coalesce(app.amt, 0) <> 0
                ORDER BY coalesce(own.due, (own.at AT TIME ZONE 'Asia/Tashkent')::date), own.at, own.doc_id""")
                .param("b", branchId)
                .param("c", counterpartyId)
                .param("s", side.name())
                .query((rs, n) -> new OpenDoc(rs.getString("doc_type"), rs.getLong("doc_id"), rs.getString("doc_number"),
                        rs.getDate("due") == null ? null : rs.getDate("due").toLocalDate(), rs.getDate("d").toLocalDate(),
                        new Money(rs.getBigDecimal("open")), new Money(rs.getBigDecimal("total")),
                        Money.ZERO.minus(new Money(rs.getBigDecimal("ret"))), Money.ZERO.minus(new Money(rs.getBigDecimal("pay")))))
                .list();
    }

    @Transactional(readOnly = true)
    public CreditState creditState(long branchId, long counterpartyId, Side side, LocalDate today) {
        java.util.List<OpenDoc> docs = openDocs(branchId, counterpartyId, side);
        Money debt = Money.ZERO;
        Money advance = Money.ZERO;
        for (OpenDoc d : docs) {
            debt = debt.plus(d.open());
            if (d.open().isNegative()) {
                advance = advance.minus(d.open());
            }
        }
        // Taqsimlanmagan to'lov (avans) eng eski qarzlardan ayriladi (FIFO)
        Money overdue = Money.ZERO;
        int days = 0;
        Money left = advance;
        for (OpenDoc d : docs) {
            if (d.open().isNegative()) {
                continue;
            }
            Money open = d.open();
            if (!left.isZero()) {
                Money used = left.compareTo(open) >= 0 ? open : left;
                open = open.minus(used);
                left = left.minus(used);
            }
            if (!open.isZero() && d.dueDate() != null && d.dueDate().isBefore(today)) {
                overdue = overdue.plus(open);
                days = Math.max(days, (int) java.time.temporal.ChronoUnit.DAYS.between(d.dueDate(), today));
            }
        }
        return new CreditState(debt, overdue, days);
    }
}
