package uz.medix.finance.payment;

import java.util.ArrayList;
import java.util.List;
import uz.medix.shared.money.Money;

/**
 * Avansni hisobga olish — AH (SPEC 7): taqsimlanmagan to'lovlar (avans, open &lt; 0) eng eski avansdan boshlab eng eski qarzlarga
 * (open &gt; 0) yopiladi. cap — eng ko'pi bilan shu summa (null — hammasi). Sof funksiya (Spring'siz, float'siz).
 */
final class Offsetter {

    private Offsetter() {}

    record Line(Allocator.Doc advance, Allocator.Doc debt, Money amount) {}

    /** docs — eng eskisi birinchi (PartyLedger.openDocs tartibi). */
    static List<Line> plan(List<Allocator.Doc> docs, Money cap) {
        List<Allocator.Doc> advances = docs.stream().filter(d -> d.open().isNegative()).toList();
        List<Allocator.Doc> debts = docs.stream().filter(d -> d.open().isPositive()).toList();
        List<Line> lines = new ArrayList<>();
        Money limit = cap;
        int a = 0;
        int b = 0;
        Money advLeft = advances.isEmpty() ? Money.ZERO : Money.ZERO.minus(advances.get(0).open());
        Money debtLeft = debts.isEmpty() ? Money.ZERO : debts.get(0).open();
        while (a < advances.size() && b < debts.size() && (limit == null || limit.isPositive())) {
            Money x = advLeft.compareTo(debtLeft) <= 0 ? advLeft : debtLeft;
            if (limit != null && limit.compareTo(x) < 0) {
                x = limit;
            }
            lines.add(new Line(advances.get(a), debts.get(b), x));
            if (limit != null) {
                limit = limit.minus(x);
            }
            advLeft = advLeft.minus(x);
            debtLeft = debtLeft.minus(x);
            if (advLeft.isZero() && ++a < advances.size()) {
                advLeft = Money.ZERO.minus(advances.get(a).open());
            }
            if (debtLeft.isZero() && ++b < debts.size()) {
                debtLeft = debts.get(b).open();
            }
        }
        return lines;
    }

    static Money total(List<Line> lines) {
        Money t = Money.ZERO;
        for (Line l : lines) {
            t = t.plus(l.amount());
        }
        return t;
    }
}
