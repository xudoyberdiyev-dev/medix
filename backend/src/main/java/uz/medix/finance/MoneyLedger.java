package uz.medix.finance;

import java.sql.Date;
import java.time.LocalDate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.CurrentActor;

/**
 * Pul jurnali (SPEC 5.5, 6-10): kassa, Terminal va bank qoldig'i faqat hujjatlardan. Har yozuv hisob qatorini qulflaydi
 * (FOR UPDATE) va qoldiqni jurnal bilan bitta tranzaksiyada yangilaydi; qoldiq manfiy bo'lmaydi.
 */
@Service
public class MoneyLedger {

    public record DocRef(String type, long id, String number) {}

    private static final java.time.format.DateTimeFormatter DAY = java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;
    private final CashierGuard cashiers;

    MoneyLedger(JdbcClient jdbc, CurrentActor currentActor, CashierGuard cashiers) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
        this.cashiers = cashiers;
    }

    /** Musbat — hisobga kirim, manfiy — chiqim. Chaqiruvchi tranzaksiyasida. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Money post(long accountId, LocalDate date, Money amount, DocRef doc, String note) {
        if (amount.isZero()) {
            throw new IllegalArgumentException("Nol summa");
        }
        cashiers.check(accountId);
        record A(java.math.BigDecimal balance, boolean active, String name) {}
        A a = jdbc.sql("SELECT balance, active, name FROM money_account WHERE id = :id FOR NO KEY UPDATE")
                .param("id", accountId)
                .query((rs, n) -> new A(rs.getBigDecimal("balance"), rs.getBoolean("active"), rs.getString("name")))
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        // Yopilgan kunga (va undan oldingi kunlarga) yangi harakat yozilmaydi (SPEC 5.5)
        jdbc.sql("SELECT close_date FROM cash_day_close WHERE account_id = :id ORDER BY close_date DESC LIMIT 1")
                .param("id", accountId)
                .query(Date.class)
                .optional()
                .map(Date::toLocalDate)
                .filter(closed -> !date.isAfter(closed))
                .ifPresent(closed -> {
                    throw MedixException.conflict("money.dayClosed", a.name(), closed.format(DAY));
                });
        Money next = new Money(a.balance()).plus(amount);
        if (next.isNegative()) {
            throw MedixException.conflict("money.insufficient", a.name(), new Money(a.balance()).format());
        }
        if (!a.active() && !amount.isNegative()) {
            throw MedixException.conflict("money.accountInactive", a.name());
        }
        jdbc.sql("""
                INSERT INTO money_move (account_id, move_date, amount, doc_type, doc_id, doc_number, employee_id, note)
                VALUES (:a, :d, :amt, :t, :i, :n, :e, :note)""")
                .param("a", accountId)
                .param("d", Date.valueOf(date))
                .param("amt", amount.amount())
                .param("t", doc.type())
                .param("i", doc.id())
                .param("n", doc.number())
                .param("e", currentActor.current().map(x -> x.employeeId()).orElse(null))
                .param("note", note)
                .update();
        jdbc.sql("UPDATE money_account SET balance = :b, version = version + 1 WHERE id = :id")
                .param("b", next.amount())
                .param("id", accountId)
                .update();
        return next;
    }
}
