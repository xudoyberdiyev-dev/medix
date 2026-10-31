package uz.medix.shared.money;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class MoneyTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "0         | 0,00",
        "5         | 5,00",
        "999.5     | 999,50",
        "1000      | 1.000,00",
        "1250000   | 1.250.000,00",
        "1250000.5 | 1.250.000,50",
        "48250000  | 48.250.000,00",
        "-4200000  | -4.200.000,00",
        "123456789012.34 | 123.456.789.012,34"
    })
    void formatsLikeDesignSystem(String amount, String expected) {
        assertThat(Money.of(amount).format()).isEqualTo(expected);
    }

    @Test
    void roundsHalfUpToTiyin() {
        assertThat(Money.of("10.005").amount()).isEqualByComparingTo("10.01");
        assertThat(Money.of("10.004").amount()).isEqualByComparingTo("10.00");
        assertThat(Money.of("-10.005").amount()).isEqualByComparingTo("-10.01");
    }

    @Test
    void arithmeticKeepsScale() {
        Money price = Money.of("12500.50");
        assertThat(price.times(3)).isEqualTo(Money.of("37501.50"));
        assertThat(price.plus(Money.of(1)).minus(Money.of("0.50"))).isEqualTo(Money.of("12501.00"));
        assertThat(Money.ZERO.minus(price).isNegative()).isTrue();
        assertThat(new Money(new BigDecimal("7")).amount().scale()).isEqualTo(2);
    }
}
