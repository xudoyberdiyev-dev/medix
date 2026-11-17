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

    // ===== Rus tilida (akt sverka, O17): «Пятьдесят один миллион двести шестнадцать тысяч триста семьдесят один сум 45 тийин» =====

    private static final String[] RU_ONES = {"", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"};
    private static final String[] RU_ONES_F = {"", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"};
    private static final String[] RU_TEENS = {"десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать",
            "семнадцать", "восемнадцать", "девятнадцать"};
    private static final String[] RU_TENS = {"", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят",
            "девяносто"};
    private static final String[] RU_HUNDREDS = {"", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот",
            "девятьсот"};
    private static final String[][] RU_SCALES = {{"", "", ""}, {"тысяча", "тысячи", "тысяч"}, {"миллион", "миллиона", "миллионов"},
            {"миллиард", "миллиарда", "миллиардов"}, {"триллион", "триллиона", "триллионов"}};

    /** Rus tilida, bosh harf bilan. */
    public static String ru(Money money) {
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
            if (i >= RU_SCALES.length) {
                throw new IllegalArgumentException("Summa juda katta: " + money.amount());
            }
            List<String> part = new ArrayList<>();
            int h = g / 100;
            int t = g % 100 / 10;
            int o = g % 10;
            if (h > 0) {
                part.add(RU_HUNDREDS[h]);
            }
            if (t == 1) {
                part.add(RU_TEENS[o]);
            } else {
                if (t > 1) {
                    part.add(RU_TENS[t]);
                }
                if (o > 0) {
                    part.add(i == 1 ? RU_ONES_F[o] : RU_ONES[o]);
                }
            }
            if (i > 0) {
                part.add(RU_SCALES[i][ruForm(g)]);
            }
            words.addAll(0, part);
        }
        String body = words.isEmpty() ? "ноль" : String.join(" ", words);
        String text = (negative ? "минус " : "") + body + " сум " + String.format(java.util.Locale.ROOT, "%02d", tiyin) + " тийин";
        return Character.toUpperCase(text.charAt(0)) + text.substring(1);
    }

    /** Hujjat tilida: ru, uz-Cyrl (lotin matn transliteratsiyasi), qolgani — uz-Latn; bosh harf bilan. */
    public static String inLang(Money money, String lang) {
        if ("ru".equals(lang)) {
            return ru(money);
        }
        String latn = of(money);
        latn = Character.toUpperCase(latn.charAt(0)) + latn.substring(1);
        return "uz-Cyrl".equals(lang) ? uz.medix.shared.text.UzTranslit.toCyrl(latn) : latn;
    }

    private static int ruForm(int n) {
        int t = n % 100;
        int o = n % 10;
        if (t >= 11 && t <= 14) {
            return 2;
        }
        if (o == 1) {
            return 0;
        }
        return o >= 2 && o <= 4 ? 1 : 2;
    }
}
