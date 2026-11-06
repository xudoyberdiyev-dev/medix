package uz.medix.shared.money;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/**
 * So'mdagi pul miqdori, doim 2 kasr xona (tiyin) bilan, yaxlitlash HALF_UP.
 * float/double hech qachon ishlatilmaydi (SPEC 11-bo'lim, 2-qoida).
 */
public record Money(BigDecimal amount) implements Comparable<Money> {

    public static final int SCALE = 2;
    public static final RoundingMode ROUNDING = RoundingMode.HALF_UP;
    public static final Money ZERO = new Money(BigDecimal.ZERO);

    public Money {
        Objects.requireNonNull(amount, "amount");
        amount = amount.setScale(SCALE, ROUNDING);
    }

    public static Money of(String amount) {
        return new Money(new BigDecimal(amount));
    }

    public static Money of(long soum) {
        return new Money(BigDecimal.valueOf(soum));
    }

    public Money plus(Money other) {
        return new Money(amount.add(other.amount));
    }

    public Money minus(Money other) {
        return new Money(amount.subtract(other.amount));
    }

    /** Miqdorga ko'paytirish (miqdor butun son). */
    public Money times(long quantity) {
        return new Money(amount.multiply(BigDecimal.valueOf(quantity)));
    }

    public boolean isNegative() {
        return amount.signum() < 0;
    }

    public boolean isPositive() {
        return amount.signum() > 0;
    }

    public boolean isZero() {
        return amount.signum() == 0;
    }

    @Override
    public int compareTo(Money other) {
        return amount.compareTo(other.amount);
    }

    /** Ko'rinish formati: {@code 1.250.000,00} — minglar nuqta, tiyin vergul. */
    public String format() {
        return MoneyFormat.format(this);
    }

    @Override
    public String toString() {
        return amount.toPlainString();
    }
}
