package uz.yuzplus.shared.text;

/**
 * O'zbek lotin → kirill (server hujjatlari uchun: akt sverka, summa so'z bilan). Frontend {@code scripts/i18n-cyrl.ts} qoidalariga
 * yaqin: sh → ш, ch → ч, oʻ → ў, gʻ → ғ, yo/yu/ya/ye → ё/ю/я/е, so'z boshidagi e → э, ʼ → ъ. Raqam va boshqa belgilar o'zgarmaydi.
 */
public final class UzTranslit {

    private UzTranslit() {}

    public static String toCyrl(String s) {
        if (s == null) {
            return null;
        }
        StringBuilder out = new StringBuilder(s.length());
        int n = s.length();
        for (int i = 0; i < n; i++) {
            char c = s.charAt(i);
            char next = i + 1 < n ? s.charAt(i + 1) : 0;
            boolean upper = Character.isUpperCase(c);
            char lc = Character.toLowerCase(c);
            boolean wordStart = i == 0 || !Character.isLetter(s.charAt(i - 1)) && !isApostrophe(s.charAt(i - 1));
            String r = null;
            int skip = 0;
            if ((lc == 'o' || lc == 'g') && isApostrophe(next)) {
                r = lc == 'o' ? "ў" : "ғ";
                skip = 1;
            } else if (lc == 's' && Character.toLowerCase(next) == 'h') {
                r = "ш";
                skip = 1;
            } else if (lc == 'c' && Character.toLowerCase(next) == 'h') {
                r = "ч";
                skip = 1;
            } else if (lc == 'y' && "oaue".indexOf(Character.toLowerCase(next)) >= 0 && next != 0) {
                r = switch (Character.toLowerCase(next)) {
                    case 'o' -> "ё";
                    case 'u' -> "ю";
                    case 'a' -> "я";
                    default -> "е";
                };
                skip = 1;
            } else if (lc == 'e') {
                r = wordStart ? "э" : "е";
            } else if (isApostrophe(c)) {
                r = "ъ";
            } else {
                int k = "abdfghijklmnopqrstuvxyz".indexOf(lc);
                if (k >= 0) {
                    r = String.valueOf("абдфгҳижклмнопқрстувхйз".charAt(k));
                }
            }
            if (r == null) {
                out.append(c);
                continue;
            }
            out.append(upper ? r.toUpperCase(java.util.Locale.ROOT) : r);
            i += skip;
        }
        return out.toString();
    }

    private static boolean isApostrophe(char c) {
        return c == 'ʻ' || c == 'ʼ' || c == '\'' || c == '‘' || c == '’' || c == '`';
    }
}
