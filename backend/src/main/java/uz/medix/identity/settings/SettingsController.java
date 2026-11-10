package uz.medix.identity.settings;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Tizim sozlamalari (prototip «Sozlamalar»). Ko'rish — {@code settings.view}; o'zgartirish — kalit doirasiga qarab Direktor / Bosh administrator. */
@RestController
@RequestMapping("/api/settings")
@Tag(name = "settings", description = "Tizim sozlamalari")
class SettingsController {

    private final Settings settings;

    SettingsController(Settings settings) {
        this.settings = settings;
    }

    private static boolean has(Authentication auth, String role) {
        return auth.getAuthorities().stream().anyMatch(g -> role.equals(g.getAuthority()));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('settings.view')")
    @Operation(summary = "Sozlamalar", description = "Qiymatlar (bo'lim, tur, oraliq, oxirgi o'zgarish), QQS tarixi, chop etish, hujjat prefikslari, BQ sanasi.")
    Settings.View view(Authentication auth) {
        return settings.view(has(auth, "ROLE_DIRECTOR"), has(auth, "ROLE_ADMIN"));
    }

    record SaveRequest(@NotNull(message = "{validation.required}") @Schema(description = "kalit → yangi qiymat") Map<String, String> changes) {}

    @PutMapping
    @PreAuthorize("hasAuthority('settings.view')")
    @Operation(summary = "Sozlamalarni saqlash", description = "Bitta tranzaksiya; har o'zgarish auditga. Biznes chegaralari — faqat Direktor, xavfsizlik — Direktor va Bosh administrator.")
    Settings.View save(@Valid @RequestBody SaveRequest r, Authentication auth) {
        return settings.save(r.changes(), has(auth, "ROLE_DIRECTOR"), has(auth, "ROLE_ADMIN"));
    }

    record VatRequest(@NotNull(message = "{validation.required}") BigDecimal rate, @NotNull(message = "{validation.required}") LocalDate validFrom) {}

    @PostMapping("/vat")
    @PreAuthorize("hasAuthority('settings.view')")
    @Operation(summary = "Yangi QQS stavkasi", description = "Faqat Direktor; faqat kelajak sanadan; bir sanaga bitta stavka.")
    Settings.View addVat(@Valid @RequestBody VatRequest r, Authentication auth) {
        return settings.addVat(r.rate(), r.validFrom(), has(auth, "ROLE_DIRECTOR"), has(auth, "ROLE_ADMIN"));
    }

    record PrintRequest(
            @Schema(nullable = true) Boolean reprint,
            @Schema(nullable = true, description = "price | noprice") String nakVariant,
            @Schema(nullable = true) List<Settings.SignerDraft> signers) {}

    @PutMapping("/print")
    @PreAuthorize("hasAuthority('settings.view')")
    @Operation(summary = "Chop etish sozlamalari", description = "Faqat Direktor: qayta chop etish, nakladnoy standart varianti, filial imzochilari.")
    Settings.View savePrint(@RequestBody PrintRequest r, Authentication auth) {
        return settings.savePrint(r.reprint(), r.nakVariant(), r.signers(), has(auth, "ROLE_DIRECTOR"), has(auth, "ROLE_ADMIN"));
    }
}
