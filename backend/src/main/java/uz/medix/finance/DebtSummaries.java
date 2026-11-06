package uz.medix.finance;

import java.time.LocalDate;
import java.util.List;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.shared.security.Actor;

/**
 * Qarzlar xulosasi — finance modulining ochiq API'si (bosh sahifalar uchun). Hisob «Mijozlar qarzi» / «YB qarzi» sahifalari bilan bir
 * manbadan (SPEC 8, bitta manba qoidasi): avans eng eski qarzdan ayriladi, filiallar alohida hisoblanadi. Pul — satr («1250000.00»).
 */
public interface DebtSummaries {

    /** Eng katta qarzdor / kreditor. */
    record Top(long counterpartyId, String name, String debt, String overdue, int maxOverdueDays) {}

    /** Jami qarz, avans va muddati o'tgan qarz guruhlari (1–30 / 31–60 / 61–90 / 90+ kun). */
    record Summary(String debt, String advance, String overdue, String d1to30, String d31to60, String d61to90, String d90plus, List<Top> top) {}

    /** To'lov kuni bo'yicha ochiq qarz (YB): kechikkan / bugun / keyingi 3 kun ichida. */
    record DueSoon(String overdue, String today, String next3Days) {}

    /** branchId = null — barcha filiallar (faqat barcha filiallarni ko'radiganlarga). top — nechta eng katta qarzdor qaytarilsin. */
    Summary summary(Actor actor, Side side, Long branchId, int top);

    /** Kompaniyaning YB oldidagi ochiq qarzi to'lov kuni bo'yicha. */
    default DueSoon supplierDue(Actor actor, Long branchId, LocalDate today) {
        return due(actor, Side.SUPPLIER, branchId, today);
    }

    /** Ochiq qarz (mijozlar yoki YB) hujjatdagi to'lov kuni bo'yicha: kechikkan / bugun / 3 kun ichida. */
    DueSoon due(Actor actor, Side side, Long branchId, LocalDate today);
}
