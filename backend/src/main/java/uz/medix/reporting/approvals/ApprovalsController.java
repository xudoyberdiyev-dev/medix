package uz.medix.reporting.approvals;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** «Tasdiqlash» sahifasi: ko'rish — approvals.view / approvals.branch / approvals.director; filial doirasi serverda. */
@RestController
@Tag(name = "approvals", description = "Tasdiqlash navbati")
class ApprovalsController {

    private final ApprovalsQueue queue;
    private final CurrentActor currentActor;

    ApprovalsController(ApprovalsQueue queue, CurrentActor currentActor) {
        this.queue = queue;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping("/api/approvals")
    @PreAuthorize("hasAnyAuthority('approvals.view', 'approvals.branch', 'approvals.director')")
    @Operation(summary = "Tasdiq navbati: buyurtmalar (Tasdiqlashda), narx tasdiqlari, bugun hal qilinganlar",
            description = "branchId bo'lmasa — barcha filiallarni ko'radiganlarga hammasi, qolganlarga o'z filiali.")
    ApprovalsQueue.ApprovalsView view(@RequestParam(required = false) Long branchId, Authentication auth) {
        Set<String> perms = auth.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.toSet());
        return queue.view(actor(), perms, branchId);
    }

    @GetMapping("/api/approvals/orders/{id}/credit")
    @PreAuthorize("hasAnyAuthority('approvals.view', 'approvals.branch', 'approvals.director')")
    @Operation(summary = "Buyurtma mijozining kredit tafsiloti: qarz yoshi, oxirgi to'lovlar, to'lov intizomi (so'nggi 6 oy)")
    ApprovalsQueue.CreditDetail credit(@PathVariable long id) {
        return queue.credit(actor(), id);
    }
}
