package uz.medix.pricing.change;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class PriceExcelTest {

    private static void amount(String raw, String expected) {
        BigDecimal v = PriceExcel.parseAmount(raw);
        if (expected == null) {
            assertThat(v).as(raw).isNull();
        } else {
            assertThat(v).as(raw).isEqualByComparingTo(expected);
        }
    }

    @Test
    void parsesUzbekAndForeignNumberFormats() {
        amount("1.250.000,00", "1250000");
        amount("1 250 000.5", "1250000.5");
        amount("1,250,000.00", "1250000");
        amount("1250000", "1250000");
        amount("1.250", "1250");
        amount("12.5", "12.5");
        amount("1,5", "1.5");
        amount("10 000 soʻm", "10000");
        amount("9 990 сум", "9990");
        amount("abc", null);
        amount("-5", null);
    }

    @Test
    void findsCodeAndNewPriceColumns() {
        assertThat(PriceExcel.columns(new String[] {"Kod", "Mahsulot", "Joriy narx (QQS bilan)", "Yangi narx (QQS bilan)"})).containsExactly(0, 3);
        assertThat(PriceExcel.columns(new String[] {"Наименование", "Код", "Цена"})).containsExactly(1, 2);
        assertThat(PriceExcel.columns(new String[] {"Mahsulot", "Narx"})).containsExactly(-1, 1);
    }
}
