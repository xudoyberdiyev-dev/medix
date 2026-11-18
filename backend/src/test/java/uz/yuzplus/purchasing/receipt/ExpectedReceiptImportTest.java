package uz.yuzplus.purchasing.receipt;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/** O15: YB fayli katakchalarini o'qish (soni, QQS, yaroqlilik). */
class ExpectedReceiptImportTest {

    @Test
    void quantities() {
        assertThat(ExpectedReceiptImport.qty("500")).contains(500);
        assertThat(ExpectedReceiptImport.qty("500,00")).contains(500);
        assertThat(ExpectedReceiptImport.qty("1 000")).contains(1000);
        assertThat(ExpectedReceiptImport.qty("1.000")).contains(1000);
        assertThat(ExpectedReceiptImport.qty("12 500 dona")).contains(12500);
        assertThat(ExpectedReceiptImport.qty("2,5")).isEmpty();
        assertThat(ExpectedReceiptImport.qty("0")).isEmpty();
        assertThat(ExpectedReceiptImport.qty("")).isEmpty();
        assertThat(ExpectedReceiptImport.qty(null)).isEmpty();
        assertThat(ExpectedReceiptImport.qty("abc")).isEmpty();
    }

    @Test
    void vatRates() {
        assertThat(ExpectedReceiptImport.vat("12")).contains(12);
        assertThat(ExpectedReceiptImport.vat("12%")).contains(12);
        assertThat(ExpectedReceiptImport.vat("12.0")).contains(12);
        assertThat(ExpectedReceiptImport.vat("Без НДС")).contains(0);
        assertThat(ExpectedReceiptImport.vat("QQSsiz")).contains(0);
        assertThat(ExpectedReceiptImport.vat("150")).isEmpty();
        assertThat(ExpectedReceiptImport.vat("")).isEmpty();
    }

    @Test
    void dates() {
        assertThat(ExpectedReceiptImport.date("31.12.2027")).contains(LocalDate.of(2027, 12, 31));
        assertThat(ExpectedReceiptImport.date("2027-12-31")).contains(LocalDate.of(2027, 12, 31));
        assertThat(ExpectedReceiptImport.date("1/6/2028")).contains(LocalDate.of(2028, 6, 1));
        assertThat(ExpectedReceiptImport.date("02.2028")).contains(LocalDate.of(2028, 2, 29));
        // Excel sana raqami: 46387 = 31.12.2026
        assertThat(ExpectedReceiptImport.date("46387")).contains(LocalDate.of(2026, 12, 31));
        assertThat(ExpectedReceiptImport.date("31.02.2027")).isEmpty();
        assertThat(ExpectedReceiptImport.date("ertaga")).isEmpty();
    }
}
