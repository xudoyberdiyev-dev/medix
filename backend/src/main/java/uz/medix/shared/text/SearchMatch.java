package uz.medix.shared.text;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Jadvallar standarti (SPEC 4): «topilgan joy qator ostida». Qidiruv so'zi jadvalda ko'rinmaydigan maydonda topilgan
 * bo'lsa (shtrix-kod, shartnoma nomi, STIR …) — qaysi maydon va uning qiymati.
 */
public record SearchMatch(
        @Schema(description = "Maydon kodi: BARCODE, CONTRACT_NAME, CLASSIFIER_NAME, TIN, PHONE, ADDRESS …") String field,
        String value) {

    /**
     * Ko'rinadigan maydonlarda topilmagan so'zlarni o'z ichiga olgan birinchi yashirin maydon. Hamma so'z ko'rinadigan
     * maydonlarda bo'lsa yoki hech bir yashirin maydon mos kelmasa — bo'sh.
     */
    public static Optional<SearchMatch> hidden(String query, List<String> visible, List<SearchMatch> candidates) {
        String q = SearchText.normalize(query);
        if (q.isEmpty()) {
            return Optional.empty();
        }
        String shown = SearchText.of(visible.toArray(String[]::new));
        List<String> missing = new ArrayList<>();
        for (String w : q.split(" ")) {
            if (!shown.contains(w)) {
                missing.add(w);
            }
        }
        if (missing.isEmpty()) {
            return Optional.empty();
        }
        for (SearchMatch c : candidates) {
            if (c.value() == null || c.value().isBlank()) {
                continue;
            }
            String text = SearchText.normalize(c.value());
            if (missing.stream().allMatch(text::contains)) {
                return Optional.of(c);
            }
        }
        return Optional.empty();
    }
}
