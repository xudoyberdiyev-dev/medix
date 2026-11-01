package uz.medix.shared.gs1;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Markirovka kodi (GS1 DataMatrix), SPEC 6: (01) GTIN · (21) seriya · (17) yaroqlilik · (10) partiya · (91) Q/D.
 *
 * <p>Skaner klaviatura rejimida kodni ikki ko'rinishda beradi: FNC1 ajratgichi (GS, {@code \u001D}) bilan yoki odam o'qiydigan
 * qavsli ko'rinishda — «(01)04601234567893(21)ABC…». Boshidagi simvologiya belgisi «]d2» va «]C1» tashlanadi. Ajratgichsiz
 * o'zgaruvchan uzunlikdagi maydonlarni ajratib bo'lmaydi — bunday kod format xatosi.
 *
 * <p>Majburiy: 01 (nazorat raqami to'g'ri), 21, 10, 91 (Q — quti, D — dona). 17 — ixtiyoriy, bo'lsa sana to'g'ri bo'lishi shart
 * (kun «00» — oyning oxirgi kuni). Boshqa AI'lar (masalan 92, 93 — kripto-dum) o'qiladi va e'tiborsiz qoldiriladi.
 */
public record Gs1Code(String gtin, String serial, String batch, LocalDate expiry, Kind kind) {

    /** Qadoq turi (AI 91). */
    public enum Kind { BOX, UNIT }

    private static final char GS = '\u001D';

    /** Belgilangan uzunlikdagi AI'lar (GS1 General Specifications, 2-raqamli asosiylar). */
    private static final Map<String, Integer> FIXED = Map.ofEntries(
            Map.entry("00", 18), Map.entry("01", 14), Map.entry("02", 14), Map.entry("11", 6), Map.entry("12", 6),
            Map.entry("13", 6), Map.entry("15", 6), Map.entry("16", 6), Map.entry("17", 6), Map.entry("20", 2));

    /** Natija: kod yoki xato kaliti (i18n). */
    public sealed interface Parsed permits Ok, Error {}

    public record Ok(Gs1Code code) implements Parsed {}

    public record Error(String key) implements Parsed {}

    /** Kodni ajratib, tekshiradi. Xato kalitlari: marking.format, marking.gtinInvalid, marking.kindInvalid, marking.expiryInvalid. */
    public static Parsed parse(String raw) {
        if (raw == null) {
            return new Error("marking.format");
        }
        String s = raw.strip();
        if (s.startsWith("]d2") || s.startsWith("]C1") || s.startsWith("]Q3")) {
            s = s.substring(3);
        }
        if (s.isEmpty() || s.length() > 300) {
            return new Error("marking.format");
        }
        Optional<Map<String, String>> fields = s.charAt(0) == '(' ? bracketed(s) : separated(s);
        if (fields.isEmpty()) {
            return new Error("marking.format");
        }
        Map<String, String> f = fields.get();
        String gtin = f.get("01");
        String serial = f.get("21");
        String batch = f.get("10");
        String kind = f.get("91");
        if (gtin == null || serial == null || batch == null || kind == null || serial.isEmpty() || batch.isEmpty()) {
            return new Error("marking.format");
        }
        if (!gtin.matches("\\d{14}") || !checkDigitOk(gtin)) {
            return new Error("marking.gtinInvalid");
        }
        Kind k = switch (kind.toUpperCase()) {
            case "Q" -> Kind.BOX;
            case "D" -> Kind.UNIT;
            default -> null;
        };
        if (k == null) {
            return new Error("marking.kindInvalid");
        }
        LocalDate expiry = null;
        String e = f.get("17");
        if (e != null) {
            expiry = yymmdd(e);
            if (expiry == null) {
                return new Error("marking.expiryInvalid");
            }
        }
        if (!serial.matches("[\\x21-\\x7E]{1,20}") || !batch.matches("[\\x21-\\x7E]{1,20}")) {
            return new Error("marking.format");
        }
        return new Ok(new Gs1Code(gtin, serial, batch, expiry, k));
    }

    /** Odam o'qiydigan ko'rinish (kodlar jurnali uchun). */
    public String humanReadable() {
        return "(01)" + gtin + "(21)" + serial + (expiry == null ? "" : "(17)" + String.format("%02d%02d%02d", expiry.getYear() % 100,
                expiry.getMonthValue(), expiry.getDayOfMonth())) + "(10)" + batch + "(91)" + (kind == Kind.BOX ? "Q" : "D");
    }

    /** GTIN-14 bo'yicha shtrix-kod mosligi: EAN-8/UPC-A/EAN-13 chapdan nollar bilan 14 ga to'ldiriladi. */
    public static Optional<String> gtin14(String barcode) {
        if (barcode == null || !barcode.matches("\\d{8}|\\d{12,14}")) {
            return Optional.empty();
        }
        return Optional.of("0".repeat(14 - barcode.length()) + barcode);
    }

    static boolean checkDigitOk(String digits) {
        int sum = 0;
        int n = digits.length();
        for (int i = 0; i < n - 1; i++) {
            int d = digits.charAt(i) - '0';
            // O'ngdan hisoblaganda nazorat raqamidan oldingisi ×3, keyingisi ×1 …
            sum += ((n - 1 - i) % 2 == 1) ? d * 3 : d;
        }
        int check = (10 - sum % 10) % 10;
        return check == digits.charAt(n - 1) - '0';
    }

    private static LocalDate yymmdd(String v) {
        if (!v.matches("\\d{6}")) {
            return null;
        }
        int yy = Integer.parseInt(v.substring(0, 2));
        int mm = Integer.parseInt(v.substring(2, 4));
        int dd = Integer.parseInt(v.substring(4, 6));
        if (mm < 1 || mm > 12) {
            return null;
        }
        YearMonth ym = YearMonth.of(2000 + yy, mm);
        if (dd == 0) {
            return ym.atEndOfMonth();
        }
        return dd <= ym.lengthOfMonth() ? ym.atDay(dd) : null;
    }

    private static Optional<Map<String, String>> bracketed(String s) {
        Map<String, String> out = new LinkedHashMap<>();
        int i = 0;
        while (i < s.length()) {
            if (s.charAt(i) != '(') {
                return Optional.empty();
            }
            int close = s.indexOf(')', i);
            if (close < 0) {
                return Optional.empty();
            }
            String ai = s.substring(i + 1, close);
            if (!ai.matches("\\d{2,4}")) {
                return Optional.empty();
            }
            int next = s.indexOf('(', close + 1);
            int end = next < 0 ? s.length() : next;
            String value = s.substring(close + 1, end);
            if (out.putIfAbsent(ai, value) != null) {
                return Optional.empty();
            }
            i = end;
        }
        return Optional.of(out);
    }

    private static Optional<Map<String, String>> separated(String s) {
        Map<String, String> out = new LinkedHashMap<>();
        int i = 0;
        while (i < s.length()) {
            if (s.charAt(i) == GS) {
                i++;
                continue;
            }
            if (i + 2 > s.length()) {
                return Optional.empty();
            }
            String ai = s.substring(i, i + 2);
            if (!ai.matches("\\d{2}")) {
                return Optional.empty();
            }
            i += 2;
            Integer len = FIXED.get(ai);
            String value;
            if (len != null) {
                if (i + len > s.length()) {
                    return Optional.empty();
                }
                value = s.substring(i, i + len);
                i += len;
            } else {
                int gs = s.indexOf(GS, i);
                int end = gs < 0 ? s.length() : gs;
                value = s.substring(i, end);
                i = end;
            }
            if (out.putIfAbsent(ai, value) != null) {
                return Optional.empty();
            }
        }
        return Optional.of(out);
    }
}
