package uz.medix.identity.organization;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Kirish sahifasi uchun ommaviy maʼlumot (O20, kirishsiz): yordam telefoni va ish vaqti (Kompaniya sozlamalaridan) va faol rollar
 * soni («N rol uchun panel»). Maxfiy maʼlumot yuborilmaydi.
 */
@RestController
@Tag(name = "auth", description = "Tizimga kirish va sessiya")
class LoginInfoController {

    record LoginInfo(@Schema(nullable = true) String supportPhone, @Schema(nullable = true) String supportHours, int roles) {}

    private final Organization organization;
    private final JdbcClient jdbc;

    LoginInfoController(Organization organization, JdbcClient jdbc) {
        this.organization = organization;
        this.jdbc = jdbc;
    }

    @GetMapping("/api/auth/login-info")
    @Transactional(readOnly = true)
    @Operation(summary = "Kirish sahifasi maʼlumoti (ommaviy)", description = "Yordam telefoni, ish vaqti va faol rollar soni.")
    LoginInfo get() {
        Organization.SupportContact s = organization.supportContact();
        int roles = jdbc.sql("SELECT count(*) FROM role WHERE active").query(Integer.class).single();
        return new LoginInfo(s.phone(), s.hours(), roles);
    }
}
