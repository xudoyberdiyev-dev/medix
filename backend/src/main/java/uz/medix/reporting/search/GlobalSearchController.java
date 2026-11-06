package uz.medix.reporting.search;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/** Ctrl+K universal qidiruv: har kim — o'z ruxsatlari va filial doirasida (guruhlar ruxsat bo'yicha). */
@RestController
@Tag(name = "search", description = "Universal qidiruv (Ctrl+K)")
class GlobalSearchController {

    private final GlobalSearch search;
    private final CurrentActor currentActor;

    GlobalSearchController(GlobalSearch search, CurrentActor currentActor) {
        this.search = search;
        this.currentActor = currentActor;
    }

    @GetMapping("/api/search")
    @Operation(summary = "Hujjat (raqam), mahsulot, kontragent, xodim qidiruvi — har guruhdan 5 tagacha; 2 belgidan qisqa so'rov — bo'sh")
    GlobalSearch.Result search(@RequestParam(defaultValue = "") String q, Authentication auth) {
        Set<String> permissions = auth.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.toSet());
        return search.search(currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized")), permissions,
                q.length() > 100 ? q.substring(0, 100) : q);
    }
}
