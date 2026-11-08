package uz.medix.shared.web;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import uz.medix.TestcontainersConfig;

/** Xato matni foydalanuvchi tanlagan tilda (MEDIX_LOCALE cookie); cookie yo'q yoki noto'g'ri — o'zbek (lotin). */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class LocaleIT {

    @Autowired
    MockMvc mvc;

    /** Har chaqiruvda boshqa login — urinishlar hisoblagichi (login_throttle) matnga ta'sir qilmasin. */
    private static MockHttpServletRequestBuilder badLogin(String login) {
        return post("/api/auth/login")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"login\":\"" + login + "\",\"password\":\"Notogri-parol-1\"}");
    }

    @Test
    void errorFollowsLocaleCookie() throws Exception {
        mvc.perform(badLogin("til-sinovi-1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("auth.badCredentialsLeft"))
                .andExpect(jsonPath("$.detail").value("Login yoki parol notoʻgʻri. Qolgan urinishlar: 4."));
        mvc.perform(badLogin("til-sinovi-2").cookie(new Cookie("MEDIX_LOCALE", "uz-Cyrl")))
                .andExpect(jsonPath("$.detail").value("Логин ёки парол нотўғри. Қолган уринишлар: 4."));
        mvc.perform(badLogin("til-sinovi-3").cookie(new Cookie("MEDIX_LOCALE", "ru")))
                .andExpect(jsonPath("$.detail").value("Неверный логин или пароль. Осталось попыток: 4."));
        // Brauzer tili hisobga olinmaydi, qo'llanmaydigan til — asosiy til.
        mvc.perform(badLogin("til-sinovi-4").header("Accept-Language", "ru").cookie(new Cookie("MEDIX_LOCALE", "de")))
                .andExpect(jsonPath("$.detail").value("Login yoki parol notoʻgʻri. Qolgan urinishlar: 4."));
    }

    @Test
    void validationMessagesFollowLocaleCookie() throws Exception {
        mvc.perform(post("/api/auth/login")
                        .with(csrf())
                        .cookie(new Cookie("MEDIX_LOCALE", "ru"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"login\":\"\",\"password\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("В данных есть ошибки. Исправьте отмеченные поля."));
    }
}
