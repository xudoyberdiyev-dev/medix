package uz.medix.purchasing.receipt;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.PartyLedger;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.notification.Notifications;
import uz.medix.shared.money.Money;

/**
 * Kirim eslatmalari (SPEC 5.1): Direktor, Buxgalter (ruxsat kaliti bo'yicha) va «Kim nomiga» xodimiga —
 * to'lov kunidan 3 kun oldin, to'lov kuni va kechiksa har kuni (YB saldosi qarz bo'lsa); bonusni tasdiqlash vaqti kelganda.
 * 100% oldindan to'langan va bonus hisobidan kirimda eslatma yo'q. Har kuni 08:00 (Toshkent).
 */
@Service
public class ReceiptReminders {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private final JdbcClient jdbc;
    private final Notifications notifications;
    private final PartyLedger parties;
    private final Clock clock;

    ReceiptReminders(JdbcClient jdbc, Notifications notifications, PartyLedger parties, Clock clock) {
        this.jdbc = jdbc;
        this.notifications = notifications;
        this.parties = parties;
        this.clock = clock;
    }

    @Scheduled(cron = "0 0 8 * * *", zone = "Asia/Tashkent")
    void daily() {
        run(LocalDate.now(clock.withZone(TASHKENT)));
    }

    private static List<Long> owner(Long id) {
        List<Long> l = new ArrayList<>();
        if (id != null) {
            l.add(id);
        }
        return l;
    }

    private record Due(long id, String number, long branchId, long supplierId, String supplier, Date dueDate, Long ownerId,
            BigDecimal debtAmount) {}

    private record BonusDue(long id, String number, long branchId, String supplier, Long ownerId, Date discountDate) {}

    private record IdleBonus(long branchId, long supplierId, String supplier, BigDecimal balance, Date lastMove, Long ownerId) {}

    /** Bir kunlik eslatmalar; qaytaradi — yozilgan bildirishnomalar soni (takrorlar yozilmaydi). */
    @Transactional
    public int run(LocalDate today) {
        int created = 0;
        List<Due> dues = jdbc.sql("""
                SELECT r.id, r.number, r.branch_id, r.supplier_id, c.name AS supplier, r.due_date, r.owner_id, r.debt_amount
                FROM receipt r JOIN counterparty c ON c.id = r.supplier_id
                WHERE r.status = 'POSTED' AND NOT r.prepaid AND NOT r.from_bonus AND r.due_date <= :limit AND r.debt_amount > 0
                ORDER BY r.due_date, r.id""")
                .param("limit", Date.valueOf(today.plusDays(3)))
                .query(Due.class)
                .list();
        for (Due d : dues) {
            LocalDate due = d.dueDate().toLocalDate();
            long days = ChronoUnit.DAYS.between(today, due);
            if (days == 1 || days == 2) {
                continue;
            }
            // To'lovlar (YT) 9-bosqichda: hozircha YB saldosi qarz bo'lmasa (avans yoki to'langan) — eslatma yo'q.
            if (parties.balance(d.branchId(), d.supplierId(), Side.SUPPLIER).amount().signum() <= 0) {
                continue;
            }
            String text = days == 3 ? "receipt.dueSoon" : days == 0 ? "receipt.dueToday" : "receipt.dueLate";
            created += notifications.notify("supplierPay.notify", d.branchId(), owner(d.ownerId()),
                    notifications.message("receipt.due", text, "/receipts", "receipt.due:" + d.id() + ":" + today, d.number(), d.supplier(),
                            new Money(d.debtAmount()).format(), due.format(DAY), -days));
        }
        List<BonusDue> bonuses = jdbc.sql("""
                SELECT r.id, r.number, r.branch_id, c.name AS supplier, r.owner_id, r.discount_date
                FROM receipt r JOIN counterparty c ON c.id = r.supplier_id
                WHERE r.status = 'POSTED' AND r.discount_kind IS NOT NULL AND coalesce(r.discount_date, r.receipt_date) <= :today
                  AND NOT EXISTS (SELECT 1 FROM supplier_bonus b WHERE b.receipt_id = r.id)
                ORDER BY r.id""")
                .param("today", Date.valueOf(today))
                .query(BonusDue.class)
                .list();
        for (BonusDue b : bonuses) {
            // Bir marta: tasdiqlanmaguncha qayta yozilmaydi.
            created += notifications.notify("supplierBonus.notify", b.branchId(), owner(b.ownerId()),
                    notifications.message("receipt.bonus", b.discountDate() == null ? "receipt.bonusNoDate" : "receipt.bonus", "/receipts",
                            "receipt.bonus:" + b.id(), b.number(), b.supplier(),
                            b.discountDate() == null ? "" : b.discountDate().toLocalDate().format(DAY)));
        }
        created += idleBonuses(today);
        return created;
    }

    /**
     * SPEC 5.1: bonusning muddati yo'q, lekin balans 30 kun ishlatilmasa — eslatma (Direktor, Buxgalter va oxirgi BNS kirimining
     * «Kim nomiga» xodimi). Har 30 kunlik bo'shliq uchun bir marta; balans harakatlansa hisob qaytadan boshlanadi.
     */
    private int idleBonuses(LocalDate today) {
        List<IdleBonus> idle = jdbc.sql("""
                WITH led AS (SELECT branch_id, supplier_id, sum(amount) AS balance,
                                    (max(occurred_at) AT TIME ZONE 'Asia/Tashkent')::date AS last_move
                             FROM supplier_bonus_ledger GROUP BY branch_id, supplier_id)
                SELECT led.branch_id, led.supplier_id, c.name AS supplier, led.balance, led.last_move,
                       (SELECT r.owner_id FROM supplier_bonus s JOIN receipt r ON r.id = s.receipt_id
                        WHERE s.branch_id = led.branch_id AND s.supplier_id = led.supplier_id
                        ORDER BY s.id DESC LIMIT 1) AS owner_id
                FROM led JOIN counterparty c ON c.id = led.supplier_id
                WHERE led.balance > 0 AND led.last_move <= :limit
                ORDER BY led.branch_id, led.supplier_id""")
                .param("limit", Date.valueOf(today.minusDays(BonusBalances.IDLE_DAYS)))
                .query(IdleBonus.class)
                .list();
        int created = 0;
        for (IdleBonus b : idle) {
            LocalDate last = b.lastMove().toLocalDate();
            long days = ChronoUnit.DAYS.between(last, today);
            long period = days / BonusBalances.IDLE_DAYS;
            created += notifications.notify("supplierBonus.notify", b.branchId(), owner(b.ownerId()),
                    notifications.message("bonus.idle", "bonus.idle", "/bonuses",
                            "bonus.idle:" + b.branchId() + ":" + b.supplierId() + ":" + last + ":" + period, b.supplier(),
                            new Money(b.balance()).format(), days, last.format(DAY)));
        }
        return created;
    }
}
