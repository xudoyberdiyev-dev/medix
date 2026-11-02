package uz.medix.finance.payment;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import uz.medix.shared.money.Money;

/**
 * To'lov taqsimoti (SPEC 5.5): avtomatik — eng eski qarzdan boshlab (ro'yxat tartibi); qo'lda — har hujjatga ochiq qoldiqdan
 * oshmasin, jami to'lovdan oshmasin. Ortig'i — avans. Sof funksiya (Spring'siz).
 */
final class Allocator {

    private Allocator() {}

    record Doc(String type, long id, String number, Money open) {}

    record Part(Doc doc, Money amount) {}

    record Result(List<Part> parts, Money advance) {}

    static final class Invalid extends RuntimeException {
        private static final long serialVersionUID = 1L;
        final String code;

        Invalid(String code) {
            super(code);
            this.code = code;
        }
    }

    /** docs — faqat qarzlar (open > 0), eng eskisi birinchi. */
    static Result auto(List<Doc> docs, Money amount) {
        if (!amount.isPositive()) {
            throw new Invalid("payment.amountInvalid");
        }
        List<Part> parts = new ArrayList<>();
        Money left = amount;
        for (Doc d : docs) {
            if (left.isZero()) {
                break;
            }
            if (!d.open().isPositive()) {
                continue;
            }
            Money use = left.compareTo(d.open()) >= 0 ? d.open() : left;
            parts.add(new Part(d, use));
            left = left.minus(use);
        }
        return new Result(parts, left);
    }

    record Manual(String type, long id, Money amount) {}

    static Result manual(List<Doc> docs, Money amount, List<Manual> wanted) {
        if (!amount.isPositive()) {
            throw new Invalid("payment.amountInvalid");
        }
        Map<String, Doc> byKey = new HashMap<>();
        docs.forEach(d -> byKey.put(d.type() + ":" + d.id(), d));
        Map<String, Money> sum = new java.util.LinkedHashMap<>();
        for (Manual m : wanted) {
            if (m.amount().isNegative()) {
                throw new Invalid("payment.allocInvalid");
            }
            if (m.amount().isZero()) {
                continue;
            }
            String k = m.type() + ":" + m.id();
            if (!byKey.containsKey(k)) {
                throw new Invalid("payment.allocUnknown");
            }
            sum.merge(k, m.amount(), Money::plus);
        }
        List<Part> parts = new ArrayList<>();
        Money total = Money.ZERO;
        for (Map.Entry<String, Money> e : sum.entrySet()) {
            Doc d = byKey.get(e.getKey());
            if (e.getValue().compareTo(d.open()) > 0) {
                throw new Invalid("payment.allocOverOpen");
            }
            parts.add(new Part(d, e.getValue()));
            total = total.plus(e.getValue());
        }
        if (total.compareTo(amount) > 0) {
            throw new Invalid("payment.allocOverAmount");
        }
        return new Result(parts, amount.minus(total));
    }
}
