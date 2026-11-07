package uz.medix.shared.text;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.PropertyResourceBundle;
import java.util.ResourceBundle;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/** Server matnlari uch tilda (SPEC 10): kalitlar va o'rinbosarlar bir xil, til to'g'ri faylga tushadi. */
class MessagesBundleTest {

    private static final Pattern ARG = Pattern.compile("\\{\\d+}");
    private static final ResourceBundle.Control NO_FALLBACK = ResourceBundle.Control.getNoFallbackControl(
            ResourceBundle.Control.FORMAT_PROPERTIES);

    private static ResourceBundle bundle(String tag) {
        return ResourceBundle.getBundle("messages", Locale.forLanguageTag(tag), NO_FALLBACK);
    }

    private static Set<String> args(String value) {
        Set<String> out = new TreeSet<>();
        Matcher m = ARG.matcher(value);
        while (m.find()) {
            out.add(m.group());
        }
        return out;
    }

    @Test
    void localeTagsResolveToTheirFiles() {
        assertThat(bundle("uz-Latn").getString("auth.badCredentials")).startsWith("Login yoki parol");
        assertThat(bundle("uz-Cyrl").getString("auth.badCredentials")).startsWith("Логин ёки парол");
        assertThat(bundle("ru").getString("auth.badCredentials")).startsWith("Неверный логин");
    }

    /** Faqat shu faylning o'zi (ota-fayl kalitlarisiz) — yetishmagan kalit ko'rinsin. */
    private static ResourceBundle file(String name) throws IOException {
        try (InputStream in = MessagesBundleTest.class.getResourceAsStream("/" + name)) {
            assertThat(in).as(name).isNotNull();
            return new PropertyResourceBundle(in);
        }
    }

    @Test
    void everyLanguageHasEveryKeyWithSameArguments() throws IOException {
        ResourceBundle base = file("messages.properties");
        for (String name : new String[] {"messages_uz_Cyrl.properties", "messages_ru.properties"}) {
            ResourceBundle other = file(name);
            assertThat(other.keySet()).as(name).isEqualTo(base.keySet());
            for (String key : base.keySet()) {
                assertThat(args(other.getString(key))).as("%s: %s", name, key).isEqualTo(args(base.getString(key)));
            }
        }
    }

    @Test
    void russianHasNoApostrophes() throws IOException {
        // MessageFormat'da ' — ekranlash belgisi: matnda bo'lsa o'rinbosar yo'qoladi.
        ResourceBundle ru = file("messages_ru.properties");
        for (String key : ru.keySet()) {
            assertThat(ru.getString(key)).as(key).doesNotContain("'");
        }
    }
}
