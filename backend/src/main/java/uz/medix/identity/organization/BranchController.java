package uz.medix.identity.organization;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/** Filiallar ro'yxati — har bir kirgan xodim uchun, filial doirasi bilan (filial tanlagich, formalar). */
@RestController
@RequestMapping("/api/branches")
@Tag(name = "branches", description = "Filiallar")
class BranchController {

    private final Organization organization;
    private final CurrentActor currentActor;

    BranchController(Organization organization, CurrentActor currentActor) {
        this.organization = organization;
        this.currentActor = currentActor;
    }

    @GetMapping
    @Operation(summary = "Ko'rish mumkin bo'lgan filiallar")
    List<Organization.Branch> list() {
        var actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        return organization.branches().stream().filter(b -> actor.canAccessBranch(b.id())).toList();
    }
}
