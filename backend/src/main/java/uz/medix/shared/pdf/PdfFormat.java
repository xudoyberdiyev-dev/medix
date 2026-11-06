package uz.medix.shared.pdf;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import uz.medix.shared.money.Money;

/** PDF shakllari uchun matn formatlari (frontend {@code lib/format.ts} bilan bir xil): sana 04.10.2026, miqdor 1.250, pul 1.250.000,00. */
public final class PdfFormat {

    public static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");
    public static final String DASH = "—";

    private PdfFormat() {}

    public static String date(LocalDate d) {
        return d == null ? DASH : d.format(DATE);
    }

    public static String dateTime(Instant t) {
        return t == null ? DASH : t.atZone(TASHKENT).format(DATE_TIME);
    }

    /** Butun son, minglar nuqta bilan: 1250 → «1.250». */
    public static String qty(long n) {
        String digits = Long.toString(Math.abs(n));
        StringBuilder sb = new StringBuilder();
        int lead = digits.length() % 3;
        for (int i = 0; i < digits.length(); i++) {
            if (i > 0 && (i - lead) % 3 == 0) {
                sb.append('.');
            }
            sb.append(digits.charAt(i));
        }
        return (n < 0 ? "-" : "") + sb;
    }

    /** Pul satri (API formatidagi «1250000.00») → «1.250.000,00»; null → «—». */
    public static String money(String amount) {
        return amount == null ? DASH : Money.of(amount).format();
    }

    public static String orDash(String s) {
        return s == null || s.isBlank() ? DASH : s;
    }
}
