package uz.medix.shared.text;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;

/**
 * Foydalanuvchiga ko'rinadigan server matnlari (bildirishnomalar, buyurtma muammolari, tasdiq sabablari) — kalit +
 * o'rinbosar ({@code messages.properties}), kodda qattiq matn yo'q (T12-audit №20). Hozircha bitta til — o'zbek (lotin).
 *
 * <p>O'rinbosarlar doim satrga aylantiriladi: {@code MessageFormat} sonlarni lokal bo'yicha guruhlamasin (1500 → «1 500»);
 * pul esa chaqiruvchida {@code Money.format()} bilan beriladi.
 */
@Component
public class Texts {

    public static final Locale UZ = Locale.forLanguageTag("uz-Latn");

    private final MessageSource messages;

    public Texts(MessageSource messages) {
        this.messages = messages;
    }

    /** Kalit topilmasa — kalitning o'zi (xato yashirinmasin, testda ko'rinsin). */
    public String get(String key, Object... args) {
        return messages.getMessage(key, strings(args), key, UZ);
    }

    /** Ixtiyoriy matn (masalan, bildirishnoma tanasi): kalit yo'q bo'lsa — bo'sh. */
    public Optional<String> find(String key, Object... args) {
        return Optional.ofNullable(messages.getMessage(key, strings(args), null, UZ));
    }

    static Object[] strings(Object... args) {
        return Arrays.stream(args).map(a -> a == null ? "" : a.toString()).toArray();
    }
}
