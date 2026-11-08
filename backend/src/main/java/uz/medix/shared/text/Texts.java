package uz.medix.shared.text;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContext;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.stereotype.Component;

/**
 * Foydalanuvchiga ko'rinadigan server matnlari (bildirishnomalar, buyurtma muammolari, tasdiq sabablari) — kalit +
 * o'rinbosar ({@code messages.properties}), kodda qattiq matn yo'q (T12-audit №20). Bazaga yoziladigan matnlar — o'zbek (lotin); so'rov tili — {@link #requestLocale()}.
 *
 * <p>O'rinbosarlar doim satrga aylantiriladi: {@code MessageFormat} sonlarni lokal bo'yicha guruhlamasin (1500 → «1 500»);
 * pul esa chaqiruvchida {@code Money.format()} bilan beriladi.
 */
@Component
public class Texts {

    public static final Locale UZ = Locale.forLanguageTag("uz-Latn");

    private final MessageSource messages;

    /**
     * Joriy so'rov tili ({@code MEDIX_LOCALE} cookie, {@code LocaleConfig}) — faqat so'rov yuborgan foydalanuvchiga
     * qaytadigan matnlar uchun (xatolar). Bazaga yoziladigan matnlar (bildirishnomalar) — {@link #UZ}.
     * So'rovdan tashqarida (hodisa, rejali ish) — o'zbek (lotin), tizim tili emas.
     */
    public static Locale requestLocale() {
        LocaleContext ctx = LocaleContextHolder.getLocaleContext();
        Locale locale = ctx == null ? null : ctx.getLocale();
        return locale == null ? UZ : locale;
    }

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

    /** Berilgan tilda (masalan, bildirishnoma o'qilganda — o'quvchi tili). */
    public String getIn(Locale locale, String key, Object... args) {
        return messages.getMessage(key, strings(args), key, locale);
    }

    public Optional<String> findIn(Locale locale, String key, Object... args) {
        return Optional.ofNullable(messages.getMessage(key, strings(args), null, locale));
    }

    public static Object[] strings(Object... args) {
        return Arrays.stream(args).map(a -> a == null ? "" : a.toString()).toArray();
    }
}
