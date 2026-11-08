package uz.medix.reporting.home;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/** Filial rahbari bosh sahifasi (prototip): reports.view yoki reports.all; branchId bo'lmasa — xodimning o'z filiali. */
@RestController
@Tag(name = "home", description = "Bosh sahifalar")
class BranchHomeController {

    private final BranchHome home;
    private final CurrentActor currentActor;

    BranchHomeController(BranchHome home, CurrentActor currentActor) {
        this.home = home;
        this.currentActor = currentActor;
    }

    @GetMapping("/api/home/branch")
    @PreAuthorize("hasAnyAuthority('reports.all', 'reports.view')")
    @Operation(summary = "Filial rahbari bosh sahifasi: tasdiqlarim, ko'rsatkichlar, bugungi reyslar, pul hisoblari")
    BranchHome.BranchHomeView get(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to, Authentication auth) {
        Set<String> perms = auth.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.toSet());
        return home.home(currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized")), perms, branchId, from, to);
    }
}
