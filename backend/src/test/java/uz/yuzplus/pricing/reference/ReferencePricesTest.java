package uz.yuzplus.pricing.reference;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import uz.yuzplus.pricing.reference.ReferenceModels.LineStatus;

/** O14: narxni o'qish, nom o'xshashligi va ruxsat etilgan farq. */
class ReferencePricesTest {

    private static String parse(String s) {
        return ReferencePrices.parsePrice(s).map(BigDecimal::toPlainString).orElse(null);
    }

    @Test
    void parsesPrices() {
        assertThat(parse("1 250 000,50")).isEqualTo("1250000.50");
        assertThat(parse("12,500.5")).isEqualTo("12500.50");
        assertThat(parse("1.250.000")).isEqualTo("1250000.00");
        assertThat(parse("12.5")).isEqualTo("12.50");
        assertThat(parse("12 500 soʻm".replace("ʻ", "'"))).isEqualTo("12500.00");
        assertThat(parse("0")).isNull();
        assertThat(parse("abc")).isNull();
        assertThat(parse(null)).isNull();
    }

    @Test
    void normalizesCyrillicAndComparesNames() {
        assertThat(ReferencePrices.norm("Парацетамол 500 мг")).isEqualTo("paracetamol 500 mg");
        assertThat(ReferencePrices.similarity("Analgin 500 mg N10", "analgin 500mg n10")).isLessThan(1.0);
        assertThat(ReferencePrices.similarity("Analgin 500 mg", "ANALGIN 500 MG")).isEqualTo(1.0);
        assertThat(ReferencePrices.matchKey("Analgin  500", null)).isEqualTo("analgin 500|");
    }

    @Test
    void toleranceBand() {
        BigDecimal ref = new BigDecimal("10000.00");
        assertThat(ReferencePrices.status(new BigDecimal("10100.00"), ref, BigDecimal.ONE)).isEqualTo(LineStatus.MATCH);
        assertThat(ReferencePrices.status(new BigDecimal("10100.01"), ref, BigDecimal.ONE)).isEqualTo(LineStatus.DEARER);
        assertThat(ReferencePrices.status(new BigDecimal("9899.99"), ref, BigDecimal.ONE)).isEqualTo(LineStatus.CHEAPER);
        assertThat(ReferencePrices.status(new BigDecimal("10000.01"), ref, BigDecimal.ZERO)).isEqualTo(LineStatus.DEARER);
        assertThat(ReferencePrices.diffPct(new BigDecimal("12000"), ref)).isEqualByComparingTo("20.00");
    }
}
