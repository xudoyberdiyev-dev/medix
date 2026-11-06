package uz.medix.shared.money;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MoneyWordsTest {

    @Test
    void groupsZerosAndTiyin() {
        assertThat(MoneyWords.of(Money.of("1250000.50"))).isEqualTo("bir million ikki yuz ellik ming soʻm 50 tiyin");
        assertThat(MoneyWords.of(Money.of("0.00"))).isEqualTo("nol soʻm 00 tiyin");
        assertThat(MoneyWords.of(Money.of("1001"))).isEqualTo("bir ming bir soʻm 00 tiyin");
        assertThat(MoneyWords.of(Money.of("2000000000.05"))).isEqualTo("ikki milliard soʻm 05 tiyin");
        assertThat(MoneyWords.of(Money.of("94017.9"))).isEqualTo("toʻqson toʻrt ming oʻn yetti soʻm 90 tiyin");
        assertThat(MoneyWords.of(Money.of("-310"))).isEqualTo("minus uch yuz oʻn soʻm 00 tiyin");
    }
}
