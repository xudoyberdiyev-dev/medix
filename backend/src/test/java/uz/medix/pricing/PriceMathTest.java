package uz.medix.pricing;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import uz.medix.shared.money.Money;

class PriceMathTest {

    @Test
    void roundsToNearestStep() {
        assertThat(PriceMath.round(Money.of("12340"), 100)).isEqualTo(Money.of("12300"));
        assertThat(PriceMath.round(Money.of("12350"), 100)).isEqualTo(Money.of("12400"));
        assertThat(PriceMath.round(Money.of("12749.99"), 500)).isEqualTo(Money.of("12500"));
        assertThat(PriceMath.round(Money.of("12750"), 500)).isEqualTo(Money.of("13000"));
        assertThat(PriceMath.round(Money.of("1499"), 1000)).isEqualTo(Money.of("1000"));
        assertThat(PriceMath.round(Money.of("40"), 100)).isEqualTo(Money.of("100"));
        assertThat(PriceMath.round(Money.of("1234.56"), 0)).isEqualTo(Money.of("1234.56"));
    }

    @Test
    void markupAndChange() {
        assertThat(PriceMath.markup(Money.of("10000"), BigDecimal.valueOf(15), 100)).isEqualTo(Money.of("11500"));
        assertThat(PriceMath.markup(Money.of("10000"), new BigDecimal("12.5"), 0)).isEqualTo(Money.of("11250"));
        assertThat(PriceMath.markup(Money.of("10000"), BigDecimal.valueOf(-10), 500)).isEqualTo(Money.of("9000"));
        assertThat(PriceMath.changePercent(Money.of("10000"), Money.of("12500"))).contains(new BigDecimal("25.00"));
        assertThat(PriceMath.changePercent(null, Money.of("1"))).isEmpty();
        assertThat(PriceMath.bigChange(Money.of("10000"), Money.of("12001"))).isTrue();
        assertThat(PriceMath.bigChange(Money.of("10000"), Money.of("12000"))).isFalse();
        assertThat(PriceMath.bigChange(Money.of("10000"), Money.of("7999"))).isTrue();
    }

    @Test
    void selectionOrder() {
        Optional<Money> none = Optional.empty();
        Optional<Money> a = Optional.of(Money.of("1"));
        Optional<Money> b = Optional.of(Money.of("2"));
        Optional<Money> c = Optional.of(Money.of("3"));
        Optional<Money> d = Optional.of(Money.of("4"));
        assertThat(PriceMath.select(a, b, c, d)).isEqualTo(a);
        assertThat(PriceMath.select(none, b, c, d)).isEqualTo(b);
        assertThat(PriceMath.select(none, none, c, d)).isEqualTo(c);
        assertThat(PriceMath.select(none, none, none, d)).isEqualTo(d);
        assertThat(PriceMath.select(none, none, none, none)).isEmpty();
    }

    @Test
    void weightedAverageOverBatches() {
        // 3 × 1000 + 7 × 1100 = 10700 / 10 = 1070
        assertThat(PriceMath.weightedAverage(java.util.List.of(new PriceMath.Part(Money.of("1000"), 3), new PriceMath.Part(Money.of("1100"), 7))))
                .contains(Money.of("1070"));
        // 1 × 100 + 2 × 100.01 = 300.02 / 3 = 100.0066… → 100.01 (HALF_UP)
        assertThat(PriceMath.weightedAverage(java.util.List.of(new PriceMath.Part(Money.of("100"), 1), new PriceMath.Part(Money.of("100.01"), 2))))
                .contains(Money.of("100.01"));
        assertThat(PriceMath.weightedAverage(java.util.List.of(new PriceMath.Part(Money.of("5"), 0)))).isEmpty();
        assertThat(PriceMath.weightedAverage(java.util.List.of())).isEmpty();
    }
}
