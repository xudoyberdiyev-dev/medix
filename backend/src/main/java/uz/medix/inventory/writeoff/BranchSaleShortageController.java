package uz.medix.inventory.writeoff;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.inventory.writeoff.BranchSaleShortages.FsShortageInfo;
import uz.medix.inventory.writeoff.BranchSaleShortages.FsShortageResolveRequest;
import uz.medix.inventory.writeoff.WriteOffs.Approver;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** FS kamomadini hal qilish: ko'rish — FS ko'ra oladiganlar, hal qilish — transfer.resolve. Summalar — special.cost. */
@RestController
@RequestMapping("/api/branch-sales/{id}/shortage")
@Tag(name = "branch-sale", description = "Filiallararo savdo (FS)")
class BranchSaleShortageController {

    private final BranchSaleShortages shortages;
    private final CurrentActor currentActor;

    BranchSaleShortageController(BranchSaleShortages shortages, CurrentActor currentActor) {
        this.shortages = shortages;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private static boolean has(Authentication auth, String permission) {
        return auth.getAuthorities().stream().anyMatch(a -> permission.equals(a.getAuthority()));
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('transfer.view', 'transfer.fs', 'transfer.send', 'transfer.receive', 'transfer.resolve')")
    @Operation(summary = "FS kamomadi", description = "Ochiqmi, summa (special.cost) va hal qilish tarixi.")
    FsShortageInfo get(@PathVariable long id, Authentication auth) {
        return shortages.info(actor(), id, has(auth, "special.cost")).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @PostMapping("/resolve")
    @PreAuthorize("hasAuthority('transfer.resolve')")
    @Operation(summary = "FS kamomadini hal qilish",
            description = "WRITE_OFF + BUYER — HC xaridor zonasida, qarz o'zgarmaydi; WRITE_OFF + SELLER — HC sotuvchi zonasida, xaridor qarzi "
                    + "kamayadi; RETURN — topildi, sotuvchi zonaga qaytariladi, xaridor qarzi kamayadi. HC tasdiq qoidalari amal qiladi.")
    FsShortageInfo resolve(@PathVariable long id, @Valid @RequestBody FsShortageResolveRequest r, Authentication auth) {
        return shortages.resolve(actor(), id, r, new Approver(has(auth, "hc.approve"), has(auth, "hc.director")), has(auth, "special.cost"));
    }
}
