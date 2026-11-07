package uz.medix.reporting.home;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

@RestController
@Tag(name = "home", description = "Bosh sahifalar")
class NavBadgesController {

    private final NavBadges badges;
    private final CurrentActor currentActor;

    NavBadgesController(NavBadges badges, CurrentActor currentActor) {
        this.badges = badges;
        this.currentActor = currentActor;
    }

    @GetMapping("/api/nav/badges")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Sidebar nishonlari", description = "Tasdiq kutayotgan buyurtmalar, jo'natishga tayyorlar, muddati 90 kun ichida tugaydigan partiyalar (o'tgan bo'lsa — danger). Ruxsat yo'q bo'lsa — null.")
    NavBadges.NavBadgesView get(@RequestParam(required = false) Long branchId, Authentication auth) {
        Set<String> authorities = auth.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.toSet());
        return badges.get(currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized")), authorities, branchId);
    }
}
