package uz.medix.identity.organization;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Kompaniya logotipi — sidebar va sozlash ustasi uchun (har bir kirgan xodim). SVG skriptsiz va sandbox bilan beriladi. */
@RestController
@RequestMapping("/api/company/logo")
@Tag(name = "company", description = "Kompaniya")
class CompanyLogoController {

    private final Organization organization;

    CompanyLogoController(Organization organization) {
        this.organization = organization;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Kompaniya logotipi (PNG yoki SVG); yo'q bo'lsa — 404")
    ResponseEntity<byte[]> logo() {
        return organization.logo()
                .map(l -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(l.contentType()))
                        .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePrivate())
                        .header("X-Content-Type-Options", "nosniff")
                        .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
                        .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"logo\"")
                        .body(l.content()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
