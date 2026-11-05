package uz.medix.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Optional;
import uz.medix.shared.money.Money;

/** Narx hisob-kitoblari (SPEC 6): ustama, yaxlitlash, o'zgarish foizi, narx tanlash tartibi. Sof funksiyalar. */
public final class PriceMath {

    /** «20% dan ko'p o'zgarish — ogohlantirish». */
    public static final BigDecimal WARN_CHANGE_PERCENT = BigDecimal.valueOf(20);

    private PriceMath() {}

    /** Yaxlitlash qadami: 0 (yo'q), 100, 500, 1000 so'm. Eng yaqin karraliga (HALF_UP). */
    public static Money round(Money price, int step) {
        if (step <= 0) {
            return price;
        }
        BigDecimal s = BigDecimal.valueOf(step);
        BigDecimal rounded = price.amount().divide(s, 0, RoundingMode.HALF_UP).multiply(s);
        return new Money(rounded.signum() == 0 ? s : rounded);
    }

    /** Asos narxga foiz ustama: {@code base × (1 + percent/100)}, keyin yaxlitlash. Foiz manfiy bo'lishi mumkin (chegirma). */
    public static Money markup(Money base, BigDecimal percent, int roundingStep) {
        BigDecimal factor = BigDecimal.ONE.add(percent.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        return round(new Money(base.amount().multiply(factor)), roundingStep);
    }

    /** O'zgarish foizi (eski → yangi), 2 xona. Eski narx yo'q yoki 0 bo'lsa — bo'sh. */
    public static Optional<BigDecimal> changePercent(Money oldPrice, Money newPrice) {
        if (oldPrice == null || oldPrice.isZero()) {
            return Optional.empty();
        }
        return Optional.of(newPrice.amount().subtract(oldPrice.amount()).multiply(BigDecimal.valueOf(100))
                .divide(oldPrice.amount(), 2, RoundingMode.HALF_UP));
    }

    public static boolean bigChange(Money oldPrice, Money newPrice) {
        return changePercent(oldPrice, newPrice).map(p -> p.abs().compareTo(WARN_CHANGE_PERCENT) > 0).orElse(false);
    }

    /**
     * Narx tanlash tartibi (SPEC 6): 1) partiya narxi — mijoz turida, bo'lmasa bazaviy turda; 2) mijoz narx turining narxi;
     * 3) bazaviy narx. Partiya narxi ustun turadi.
     */
    public static Optional<Money> select(Optional<Money> batchCustomerType, Optional<Money> batchBase, Optional<Money> customerType,
            Optional<Money> base) {
        return batchCustomerType.or(() -> batchBase).or(() -> customerType).or(() -> base);
    }

    /** Partiya ulushi: narx va miqdor. */
    public record Part(Money price, int qty) {}

    /**
     * Bir qator bir necha partiyaga tushsa (SPEC 6): qator narxi — o'rtacha tortilgan narx {@code Σ(narx × miqdor) / Σ miqdor},
     * 2 xona, HALF_UP. Bo'sh yoki jami miqdor 0 bo'lsa — bo'sh.
     */
    public static Optional<Money> weightedAverage(java.util.List<Part> parts) {
        long qty = 0;
        BigDecimal sum = BigDecimal.ZERO;
        for (Part p : parts) {
            if (p.qty() <= 0) {
                continue;
            }
            qty += p.qty();
            sum = sum.add(p.price().amount().multiply(BigDecimal.valueOf(p.qty())));
        }
        if (qty == 0) {
            return Optional.empty();
        }
        return Optional.of(new Money(sum.divide(BigDecimal.valueOf(qty), Money.SCALE, Money.ROUNDING)));
    }
}
