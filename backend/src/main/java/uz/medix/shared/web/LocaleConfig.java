package uz.medix.shared.web;

import java.util.Locale;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.i18n.CookieLocaleResolver;

/**
 * Foydalanuvchi tili (SPEC 10: uz-Latn, uz-Cyrl, ru). Frontend tanlangan tilni {@code MEDIX_LOCALE} cookie'siga yozadi;
 * sahifa va API bir domenda, shuning uchun cookie har API so'rovi (PDF, .xlsx yuklash ham) bilan keladi.
 * Cookie yo'q yoki noto'g'ri — o'zbek (lotin); brauzerning Accept-Language sarlavhasi hisobga olinmaydi.
 * Matnlar: {@code messages.properties} (uz-Latn), {@code messages_uz_Cyrl.properties} (avtomatik), {@code messages_ru.properties}.
 */
@Configuration(proxyBeanMethods = false)
class LocaleConfig {

    static final String COOKIE = "MEDIX_LOCALE";
    static final Locale DEFAULT = Locale.forLanguageTag("uz-Latn");

    /** Nomi aynan «localeResolver» — DispatcherServlet shu bean'ni oladi (Boot standart bean'i o'rniga). */
    @Bean
    LocaleResolver localeResolver() {
        CookieLocaleResolver resolver = new CookieLocaleResolver(COOKIE);
        resolver.setDefaultLocale(DEFAULT);
        resolver.setRejectInvalidCookies(false); // buzilgan cookie — xato emas, asosiy til
        return resolver;
    }
}
