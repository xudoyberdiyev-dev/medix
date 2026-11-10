package uz.medix.identity.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import uz.medix.TestcontainersConfig;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.PinVerifier;

/** Profil: ko'rish, telefon, PIN o'rnatish; PIN tekshiruvi va 5 xatodan keyin qulflash. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ProfilePinIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    PinVerifier pins;

    private record Session(long id, Cookie cookie) {}

    private Session loginAs(String role) throws Exception {
        String login = "prof" + UUID.randomUUID().toString().substring(0, 6);
        long id = jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, must_change_password)
                SELECT :login, 'Profil Sinov', id, :hash, false FROM role WHERE code = :role RETURNING id""")
                .param("login", login)
                .param("hash", encoder.encode(PASSWORD))
                .param("role", role)
                .query(Long.class)
                .single();
        MvcResult r = mvc.perform(post("/api/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"login\":\"" + login + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        for (String h : r.getResponse().getHeaders("Set-Cookie")) {
            if (h.startsWith("MEDIX_SESSION=")) {
                return new Session(id, new Cookie("MEDIX_SESSION", h.substring("MEDIX_SESSION=".length(), h.indexOf(';'))));
            }
        }
        throw new AssertionError("sessiya yo'q");
    }

    @Test
    void profileAndPhone() throws Exception {
        Session s = loginAs("OPERATOR");
        mvc.perform(get("/api/profile").cookie(s.cookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Profil Sinov"))
                .andExpect(jsonPath("$.roleName").value("Operator"))
                .andExpect(jsonPath("$.pinSet").value(false))
                .andExpect(jsonPath("$.lastLoginAt").isNotEmpty());
        mvc.perform(put("/api/profile").with(csrf()).cookie(s.cookie())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\" +998 90 123 45 67 \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").value("+998 90 123 45 67"));
    }

    @Test
    void setPinRequiresPasswordAndRejectsWeak() throws Exception {
        Session s = loginAs("BRANCH_MANAGER");
        mvc.perform(put("/api/profile/pin").with(csrf()).cookie(s.cookie())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"notogri-parol\",\"pin\":\"4826\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("auth.currentPasswordWrong"));
        mvc.perform(put("/api/profile/pin").with(csrf()).cookie(s.cookie())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + PASSWORD + "\",\"pin\":\"1234\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("pin.weak"));
        mvc.perform(put("/api/profile/pin").with(csrf()).cookie(s.cookie())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + PASSWORD + "\",\"pin\":\"4826\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/profile").cookie(s.cookie()))
                .andExpect(jsonPath("$.pinSet").value(true))
                .andExpect(jsonPath("$.pinSetAt").isNotEmpty());
        long hashed = jdbc.sql("SELECT count(*) FROM employee WHERE id = :id AND pin_hash LIKE '{bcrypt}%'")
                .param("id", s.id()).query(Long.class).single();
        assertThat(hashed).isEqualTo(1);
    }

    @Test
    void verifyCountsFailuresAndLocks() throws Exception {
        Session s = loginAs("BRANCH_MANAGER");
        assertThatThrownBy(() -> pins.verify(s.id(), "4826"))
                .isInstanceOf(MedixException.class).hasFieldOrPropertyWithValue("code", "pin.notSet");
        jdbc.sql("UPDATE employee SET pin_hash = :h WHERE id = :id").param("h", encoder.encode("4826")).param("id", s.id()).update();

        pins.verify(s.id(), "4826");
        // standart pinTries = 5 (Sozlamalar)
        for (int i = 1; i < 5; i++) {
            assertThatThrownBy(() -> pins.verify(s.id(), "0000"))
                    .isInstanceOf(MedixException.class).hasFieldOrPropertyWithValue("code", "pin.wrong");
        }
        assertThatThrownBy(() -> pins.verify(s.id(), "0000"))
                .isInstanceOf(MedixException.class).hasFieldOrPropertyWithValue("code", "pin.locked");
        // Qulflangan: to'g'ri PIN ham qabul qilinmaydi
        assertThatThrownBy(() -> pins.verify(s.id(), "4826"))
                .isInstanceOf(MedixException.class).hasFieldOrPropertyWithValue("code", "pin.locked");

        // Qulf muddati o'tgach — yana ishlaydi, hisob nolga qaytadi
        jdbc.sql("UPDATE employee SET pin_locked_until = now() - interval '1 minute' WHERE id = :id").param("id", s.id()).update();
        pins.verify(s.id(), "4826");
        int failed = jdbc.sql("SELECT pin_failed_count FROM employee WHERE id = :id").param("id", s.id()).query(Integer.class).single();
        assertThat(failed).isZero();
    }

    @Test
    void trivialPins() {
        assertThat(PinService.isTrivial("1111")).isTrue();
        assertThat(PinService.isTrivial("123456")).isTrue();
        assertThat(PinService.isTrivial("9876")).isTrue();
        assertThat(PinService.isTrivial("4826")).isFalse();
    }
}
