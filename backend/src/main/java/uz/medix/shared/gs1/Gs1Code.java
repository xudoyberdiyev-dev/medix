package uz.medix.shared.gs1;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Markirovka kodi (GS1 DataMatrix). Egasi 17.11 (O16) — O'zbekiston dori markirovkasining haqiqiy formati:
 *
 * <ul>
 *   <li><b>Dona kodi</b>: (01) GTIN-14 · (21) seriya (odatda 13 belgi) [+ (91)/(92)/(93) kripto-dum]; (10) partiya va (17)
 *       yaroqlilik ko'pincha YO'Q — bo'lsa o'qiladi. Masalan {@code 0104780011675089217HTFlJLN7jbo3}.</li>
 *   <li><b>Agregatsiya (quti) kodi</b>: (00) SSCC — 18 raqam (nazorat raqami bilan), masalan {@code 00047800116744728760}.
 *       Excel oldingi nollarni yo'qotgan bo'lsa ({@code 47800116744728760}) — 20 raqamgacha tiklanadi.</li>
 * </ul>
 *
 * <p>Skaner kodni FNC1 ajratgichi (GS, {@code \u001D}) bilan, ajratgichsiz yoki qavsli ko'rinishda beradi; boshidagi
 * simvologiya belgisi «]d2», «]C1», «]Q3» tashlanadi. Ajratgichsiz kodda (21) 13 belgi deb olinadi, qolgani kripto-dum.
 */
public record Gs1Code(String gtin, String serial, String batch, LocalDate expiry, Kind kind) {

    /** UNIT — dona kodi (01+21), AGGREGATE — quti (SSCC, AI 00): gtin null, serial = 18 raqamli SSCC. */
    public enum Kind { UNIT, AGGREGATE }

    /** O'zbekiston dori markirovkasida seriya uzunligi (ajratgichsiz kodni bo'lish uchun). */
    static final int UZ_SERIAL = 13;

    private static final char GS = '\u001D';

    /** Belgilangan uzunlikdagi AI'lar (GS1 General Specifications, 2-raqamli asosiylar). */
    private static final Map<String, Integer> FIXED = Map.ofEntries(
            Map.entry("00", 18), Map.entry("01", 14), Map.entry("02", 14), Map.entry("11", 6), Map.entry("12", 6),
            Map.entry("13", 6), Map.entry("15", 6), Map.entry("16", 6), Map.entry("17", 6), Map.entry("20", 2));

    /** Natija: kod yoki xato kaliti (i18n). */
    public sealed interface Parsed permits Ok, Error {}

    public record Ok(Gs1Code code) implements Parsed {}

    public record Error(String key) implements Parsed {}

    /** Kodni ajratib, tekshiradi. Xato kalitlari: marking.format, marking.gtinInvalid, marking.ssccInvalid, marking.expiryInvalid. */
    public static Parsed parse(String raw) {
        if (raw == null) {
            return new Error("marking.format");
        }
        String s = stripSymbology(raw.strip());
        if (s.isEmpty() || s.length() > 300) {
            return new Error("marking.format");
        }
        // Excel raqam qilib buzgan SSCC: oldingi nollar yo'qolgan (15–20 raqam) → 20 ga to'ldiriladi
        if (s.matches("\\d{15,20}") && !s.startsWith("01")) {
            s = "0".repeat(20 - s.length()) + s;
        }
        Optional<Map<String, String>> fields = s.charAt(0) == '(' ? bracketed(s) : separated(s);
        if (fields.isEmpty()) {
            return new Error("marking.format");
        }
        Map<String, String> f = fields.get();
        String sscc = f.get("00");
        if (sscc != null) {
            if (f.containsKey("01") || f.containsKey("21")) {
                return new Error("marking.format");
            }
            if (!sscc.matches("\\d{18}") || !checkDigitOk(sscc)) {
                return new Error("marking.ssccInvalid");
            }
            return new Ok(new Gs1Code(null, sscc, null, null, Kind.AGGREGATE));
        }
        String gtin = f.get("01");
        String serial = f.get("21");
        String batch = f.get("10");
        if (gtin == null || serial == null || serial.isEmpty() || (batch != null && batch.isEmpty())) {
            return new Error("marking.format");
        }
        if (!gtin.matches("\\d{14}") || !checkDigitOk(gtin)) {
            return new Error("marking.gtinInvalid");
        }
        LocalDate expiry = null;
        String e = f.get("17");
        if (e != null) {
            expiry = yymmdd(e);
            if (expiry == null) {
                return new Error("marking.expiryInvalid");
            }
        }
        if (!serial.matches("[\\x21-\\x7E]{1,20}") || (batch != null && !batch.matches("[\\x21-\\x7E]{1,20}"))) {
            return new Error("marking.format");
        }
        return new Ok(new Gs1Code(gtin, serial, batch, expiry, Kind.UNIT));
    }

    private static String stripSymbology(String s) {
        return s.startsWith("]d2") || s.startsWith("]C1") || s.startsWith("]Q3") ? s.substring(3) : s;
    }

    /**
     * Skanerdan kelgan to'liq kod (kripto-qismi va GS ajratgichi bilan) — simvologiya belgisisiz, ko'pi bilan 300 belgi
     * (O10a: Saplayn tekshiruvi uchun eksport).
     */
    public static String scanned(String raw) {
        String s = stripSymbology(raw.strip());
        if (s.matches("\\d{15,19}") && !s.startsWith("01")) {
            s = "0".repeat(20 - s.length()) + s;
        }
        return s.length() > 300 ? s.substring(0, 300) : s;
    }

    /** GS ajratgichini (U+001D) ko'rinadigan «<GS>» qilib ko'rsatish (Excel katagida boshqaruv belgisi yo'qolmasin). */
    public static String visibleGs(String s) {
        return s == null ? null : s.replace(String.valueOf(GS), "<GS>");
    }

    /** Odam o'qiydigan ko'rinish (kodlar jurnali uchun). */
    public String humanReadable() {
        if (kind == Kind.AGGREGATE) {
            return "(00)" + serial;
        }
        return "(01)" + gtin + "(21)" + serial + (expiry == null ? "" : "(17)" + String.format("%02d%02d%02d", expiry.getYear() % 100,
                expiry.getMonthValue(), expiry.getDayOfMonth())) + (batch == null ? "" : "(10)" + batch);
    }

    /** Kod ko'rinishidagi qisqa matn (Excel «Markirovka kodi» ustuni uchun): SSCC — «00…», dona — «01…21…». */
    public String plain() {
        return kind == Kind.AGGREGATE ? "00" + serial : "01" + gtin + "21" + serial;
    }

    /** GTIN-14 bo'yicha shtrix-kod mosligi: EAN-8/UPC-A/EAN-13 chapdan nollar bilan 14 ga to'ldiriladi. */
    public static Optional<String> gtin14(String barcode) {
        if (barcode == null || !barcode.matches("\\d{8}|\\d{12,14}")) {
            return Optional.empty();
        }
        return Optional.of("0".repeat(14 - barcode.length()) + barcode);
    }

    private static boolean cryptoTail(String rest) {
        return rest.length() >= 3 && (rest.startsWith("91") || rest.startsWith("92") || rest.startsWith("93"));
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
                // Ajratgichsiz dona kodi: seriya 13 belgi, keyin kripto-dum (91/92/93) — O16
                if ("21".equals(ai) && end - i > UZ_SERIAL && cryptoTail(s.substring(i + UZ_SERIAL, end))) {
                    end = i + UZ_SERIAL;
                }
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
