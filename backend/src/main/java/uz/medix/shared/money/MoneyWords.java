package uz.medix.shared.money;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Pul summasi so'z bilan (kassa orderi, ishonchnoma): 1250000.50 → «bir million ikki yuz ellik ming soʻm 50 tiyin».
 * Frontend {@code lib/words.ts} bilan bir xil.
 */
public final class MoneyWords {

    private static final String[] ONES = {"", "bir", "ikki", "uch", "toʻrt", "besh", "olti", "yetti", "sakkiz", "toʻqqiz"};
    private static final String[] TENS = {"", "oʻn", "yigirma", "oʻttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "toʻqson"};
    private static final String[] SCALES = {"", "ming", "million", "milliard", "trillion"};
    private static final BigInteger THOUSAND = BigInteger.valueOf(1000);

    private MoneyWords() {}

    public static String of(Money money) {
        BigDecimal a = money.amount().setScale(2, RoundingMode.HALF_UP);
        boolean negative = a.signum() < 0;
        a = a.abs();
        BigInteger integer = a.toBigInteger();
        int tiyin = a.subtract(new BigDecimal(integer)).movePointRight(2).intValueExact();
        List<String> words = new ArrayList<>();
        for (int i = 0; integer.signum() > 0; i++) {
            BigInteger[] qr = integer.divideAndRemainder(THOUSAND);
            int g = qr[1].intValue();
            integer = qr[0];
            if (g == 0) {
                continue;
            }
            if (i >= SCALES.length) {
                throw new IllegalArgumentException("Summa juda katta: " + money.amount());
            }
            List<String> part = triple(g);
            if (!SCALES[i].isEmpty()) {
                part.add(SCALES[i]);
            }
            words.addAll(0, part);
        }
        String body = words.isEmpty() ? "nol" : String.join(" ", words);
        return (negative ? "minus " : "") + body + " soʻm " + String.format(java.util.Locale.ROOT, "%02d", tiyin) + " tiyin";
    }

    private static List<String> triple(int n) {
        List<String> out = new ArrayList<>();
        int h = n / 100;
        int t = n % 100 / 10;
        int o = n % 10;
        if (h > 0) {
            out.add(ONES[h]);
            out.add("yuz");
        }
        if (t > 0) {
            out.add(TENS[t]);
        }
        if (o > 0) {
            out.add(ONES[o]);
        }
        return out;
    }
}
