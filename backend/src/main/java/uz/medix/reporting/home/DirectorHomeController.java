package uz.medix.reporting.home;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/** Direktor / Admin bosh sahifasi (SPEC 8): reports.all. branchId bo'lmasa — barcha filiallar. */
@RestController
@Tag(name = "home", description = "Bosh sahifalar")
class DirectorHomeController {

    private final DirectorHome home;
    private final CurrentActor currentActor;

    DirectorHomeController(DirectorHome home, CurrentActor currentActor) {
        this.home = home;
        this.currentActor = currentActor;
    }

    @GetMapping("/api/home/director")
    @PreAuthorize("hasAuthority('reports.all')")
    @Operation(summary = "Direktor bosh sahifasi: 4 karta, filiallar kesimi, «Diqqat talab qiladi», eng katta qarzdorlar")
    DirectorHome.Home get(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return home.home(currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized")), branchId, from, to);
    }
}
