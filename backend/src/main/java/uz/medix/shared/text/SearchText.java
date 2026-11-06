package uz.medix.shared.text;

import java.util.Locale;
import java.util.Map;

/**
 * Qidiruv normalizatsiyasi (SPEC 2: qidiruv lotin va kirillda bir xil). Frontend'dagi {@code lib/search.ts} bilan bir xil
 * qoidalar: kirill → lotin, kichik harf, tutuq belgilari olib tashlanadi, «ts» → «c», «ks»/«kh» → «x».
 * Bazadagi {@code search_text} ustunlari va so'rov matni shu funksiyadan o'tadi.
 */
public final class SearchText {

    private static final Map<Character, String> CYR = Map.ofEntries(
            Map.entry('а', "a"), Map.entry('б', "b"), Map.entry('в', "v"), Map.entry('г', "g"), Map.entry('ғ', "g"),
            Map.entry('д', "d"), Map.entry('е', "e"), Map.entry('ё', "yo"), Map.entry('ж', "j"), Map.entry('з', "z"),
            Map.entry('и', "i"), Map.entry('й', "y"), Map.entry('к', "k"), Map.entry('қ', "q"), Map.entry('л', "l"),
            Map.entry('м', "m"), Map.entry('н', "n"), Map.entry('о', "o"), Map.entry('п', "p"), Map.entry('р', "r"),
            Map.entry('с', "s"), Map.entry('т', "t"), Map.entry('у', "u"), Map.entry('ў', "o"), Map.entry('ф', "f"),
            Map.entry('х', "x"), Map.entry('ҳ', "h"), Map.entry('ц', "ts"), Map.entry('ч', "ch"), Map.entry('ш', "sh"),
            Map.entry('щ', "sh"), Map.entry('ъ', ""), Map.entry('ы', "i"), Map.entry('ь', ""), Map.entry('э', "e"),
            Map.entry('ю', "yu"), Map.entry('я', "ya"));

    private SearchText() {}

    public static String normalize(String text) {
        if (text == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder(text.length());
        for (char c : text.toLowerCase(Locale.ROOT).toCharArray()) {
            String mapped = CYR.get(c);
            sb.append(mapped != null ? mapped : String.valueOf(c));
        }
        return sb.toString()
                .replaceAll("[ʻʼ'`‘’]", "")
                .replace("ts", "c")
                .replace("ks", "x")
                .replace("kh", "x")
                .replaceAll("\\s+", " ")
                .strip();
    }

    /** Bir nechta maydonni bitta qidiruv matniga birlashtiradi (bo'sh maydonlar tashlanadi). */
    public static String of(String... fields) {
        StringBuilder sb = new StringBuilder();
        for (String f : fields) {
            if (f != null && !f.isBlank()) {
                sb.append(' ').append(f);
            }
        }
        return normalize(sb.toString());
    }

    /** LIKE uchun xavfsiz: {@code % _ \} ekranlanadi. */
    public static String likeEscape(String normalized) {
        return normalized.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
