package uz.yuzplus.identity.auth;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.yuzplus.identity.role.Roles;
import uz.yuzplus.identity.security.MobileTokens;
import uz.yuzplus.identity.security.YuzplusPrincipal;

/**
 * Haydovchi mobil ilovasi kirishi (M2): login + parol bir marta → qurilma tokeni (keyin ilovada PIN).
 * Keyingi soʻrovlar {@code Authorization: Bearer <token>} bilan; sessiya va CSRF ishlatilmaydi.
 */
@RestController
@RequestMapping("/api/mobile/auth")
@Tag(name = "mobile-auth", description = "Haydovchi mobil ilovasi kirishi")
class MobileAuthController {

    record MobileLoginRequest(
            @NotBlank(message = "{validation.required}") @Size(max = 64) String login,
            @NotBlank(message = "{validation.required}") @Size(max = 128) String password,
            @Schema(nullable = true, description = "Qurilma nomi (masalan, «Samsung A54 · Android 15»)") @Size(max = 160) String device) {}

    record MobileLoginResponse(@Schema(description = "Qurilma tokeni — faqat bir marta qaytariladi") String token, MeResponse me) {}

    private final MobileTokens tokens;
    private final Roles roles;

    MobileAuthController(MobileTokens tokens, Roles roles) {
        this.tokens = tokens;
        this.roles = roles;
    }

    @PostMapping("/login")
    @Operation(summary = "Mobil ilovaga kirish (faqat haydovchi)")
    MobileLoginResponse login(@Valid @RequestBody MobileLoginRequest body) {
        var issued = tokens.login(body.login(), body.password(), body.device());
        var p = (YuzplusPrincipal) issued.authentication().getPrincipal();
        return new MobileLoginResponse(issued.token(), MeResponse.of(p, roles.home(p.roleCode())));
    }

    @PostMapping("/logout")
    @PreAuthorize("hasRole('DRIVER')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Mobil ilovadan chiqish — shu qurilma tokeni bekor qilinadi")
    void logout(
            @Parameter(hidden = true) @AuthenticationPrincipal YuzplusPrincipal principal,
            @Parameter(hidden = true) @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        tokens.logout(authorization.substring(7).strip(), principal);
    }
}
