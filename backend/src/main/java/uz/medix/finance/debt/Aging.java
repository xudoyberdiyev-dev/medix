package uz.medix.finance.debt;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import uz.medix.shared.money.Money;

/**
 * Qarz muddati guruhlari (SPEC 5.5): muddati kelmagan / 1–30 / 31–60 / 61–90 / 90+ kun. Muddati o'tgan qarz to'lov kunidan
 * sanaladi. Taqsimlanmagan to'lov (avans, open &lt; 0) avval eng eski qarzlardan ayriladi (FIFO) — kredit holati bilan bir xil qoida.
 * Sof funksiya: Spring'siz, float'siz.
 */
final class Aging {

    private Aging() {}

    /** Ochiq hujjat: open &gt; 0 — qarz, open &lt; 0 — avans; due = null — muddatsiz (muddati kelmagan hisoblanadi). */
    record Doc(LocalDate due, Money open) {}

    record Result(Money debt, Money advance, Money notDue, Money d1to30, Money d31to60, Money d61to90, Money d90plus, int maxOverdueDays) {

        Money overdue() {
            return d1to30.plus(d31to60).plus(d61to90).plus(d90plus);
        }

        Result plus(Result o) {
            return new Result(debt.plus(o.debt), advance.plus(o.advance), notDue.plus(o.notDue), d1to30.plus(o.d1to30), d31to60.plus(o.d31to60),
                    d61to90.plus(o.d61to90), d90plus.plus(o.d90plus), Math.max(maxOverdueDays, o.maxOverdueDays));
        }

        static final Result EMPTY = new Result(Money.ZERO, Money.ZERO, Money.ZERO, Money.ZERO, Money.ZERO, Money.ZERO, Money.ZERO, 0);
    }

    /** docs — eng eskisi birinchi (PartyLedger.openDocs tartibi). */
    static Result of(List<Doc> docs, LocalDate today) {
        Money net = Money.ZERO;
        Money left = Money.ZERO;
        for (Doc d : docs) {
            net = net.plus(d.open());
            if (d.open().isNegative()) {
                left = left.minus(d.open());
            }
        }
        Money[] b = {Money.ZERO, Money.ZERO, Money.ZERO, Money.ZERO, Money.ZERO};
        int max = 0;
        for (Doc d : docs) {
            if (!d.open().isPositive()) {
                continue;
            }
            Money open = d.open();
            if (left.isPositive()) {
                Money used = left.compareTo(open) >= 0 ? open : left;
                open = open.minus(used);
                left = left.minus(used);
            }
            if (open.isZero()) {
                continue;
            }
            long days = d.due() == null ? 0 : ChronoUnit.DAYS.between(d.due(), today);
            int i = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
            b[i] = b[i].plus(open);
            if (days > 0) {
                max = (int) Math.max(max, days);
            }
        }
        Money debt = net.isPositive() ? net : Money.ZERO;
        return new Result(debt, left, b[0], b[1], b[2], b[3], b[4], max);
    }
}
