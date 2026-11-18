package uz.yuzplus.identity.settings;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.yuzplus.shared.error.SystemErrors;

/** P4: «Tizim holati» (Sozlamalar → Xavfsizlik) — ushlanmagan server xatolari soni va oxirgilari. */
@RestController
@RequestMapping("/api/settings/system-status")
@Tag(name = "settings", description = "Sozlamalar")
class SystemStatusController {

    private final SystemErrors errors;

    SystemStatusController(SystemErrors errors) {
        this.errors = errors;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('settings.security')")
    @Operation(summary = "Tizim holati: server xatolari (24 soat, 7 kun), eng koʻp uchraganlari va oxirgi 20 tasi")
    SystemErrors.Status status() {
        return errors.status();
    }
}
