package uz.yuzplus.purchasing.receipt;

import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.yuzplus.notification.Notifications;

/**
 * O15: kutilayotgan kirim (KK) eslatmalari — «Yo'lda» / «Qisman qabul qilindi» KK ning kutilgan kelish sanasi kelganda (bugun) va
 * kechiksa har kuni: {@code kk.approve} egalari (Direktor, Admin, Filial rahbari, Ombor mudiri) va KK ni yaratgan xodimga.
 * Kutilgan sanasiz KK — eslatmasiz. Har kuni 08:05 (Toshkent).
 */
@Service
public class ExpectedReceiptReminders {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private final JdbcClient jdbc;
    private final Notifications notifications;
    private final Clock clock;

    ExpectedReceiptReminders(JdbcClient jdbc, Notifications notifications, Clock clock) {
        this.jdbc = jdbc;
        this.notifications = notifications;
        this.clock = clock;
    }

    @Scheduled(cron = "0 5 8 * * *", zone = "Asia/Tashkent")
    void daily() {
        run(LocalDate.now(clock.withZone(TASHKENT)));
    }

    private record Open(long id, String number, long branchId, String supplier, String waybillNumber, Date expectedDate, long createdBy) {}

    /** Bir kunlik eslatmalar; qaytaradi — yozilgan bildirishnomalar soni (bir KK ga bir kunda bir marta). */
    @Transactional
    public int run(LocalDate today) {
        List<Open> open = jdbc.sql("""
                SELECT k.id, k.number, k.branch_id, c.name AS supplier, k.waybill_number, k.expected_date, k.created_by
                FROM expected_receipt k JOIN counterparty c ON c.id = k.supplier_id
                WHERE k.status IN ('IN_TRANSIT', 'PARTIAL') AND k.expected_date IS NOT NULL AND k.expected_date <= :today
                ORDER BY k.expected_date, k.id""")
                .param("today", Date.valueOf(today))
                .query(Open.class)
                .list();
        int created = 0;
        for (Open k : open) {
            LocalDate expected = k.expectedDate().toLocalDate();
            long late = ChronoUnit.DAYS.between(expected, today);
            String text = late == 0 ? "kk.today" : "kk.late";
            created += notifications.notify("kk.approve", k.branchId(), List.of(k.createdBy()),
                    notifications.message(text, text, "/expected-receipts/" + k.id(), text + ":" + k.id() + ":" + today, k.number(),
                            k.supplier(), k.waybillNumber(), expected.format(DAY), late));
        }
        return created;
    }
}
