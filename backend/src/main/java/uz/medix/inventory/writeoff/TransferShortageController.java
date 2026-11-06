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
import uz.medix.inventory.writeoff.WriteOffModels.ShortageInfo;
import uz.medix.inventory.writeoff.WriteOffModels.ShortageResolveRequest;
import uz.medix.inventory.writeoff.WriteOffs.Approver;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** OK kamomadini hal qilish: ko'rish — OK ko'ra oladiganlar, hal qilish — transfer.resolve. Filial doirasi serverda. */
@RestController
@RequestMapping("/api/warehouse-transfers/{id}/shortage")
@Tag(name = "warehouse-transfer", description = "Ombor ko'chirishi (OK)")
class TransferShortageController {

    private final TransferShortages shortages;
    private final CurrentActor currentActor;

    TransferShortageController(TransferShortages shortages, CurrentActor currentActor) {
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
    @PreAuthorize("hasAnyAuthority('transfer.view', 'transfer.ok', 'transfer.send', 'transfer.receive', 'transfer.resolve')")
    @Operation(summary = "OK kamomadi", description = "Ochiqmi va hal qilish tarixi.")
    ShortageInfo get(@PathVariable long id) {
        return shortages.info(actor(), id).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @PostMapping("/resolve")
    @PreAuthorize("hasAuthority('transfer.resolve')")
    @Operation(summary = "Kamomadni hal qilish",
            description = "WRITE_OFF — HC (sabab «Kamomad», qoldiq harakatisiz, HC tasdiq qoidalari); RETURN — topildi, manba zonaga qaytariladi.")
    ShortageInfo resolve(@PathVariable long id, @Valid @RequestBody ShortageResolveRequest r, Authentication auth) {
        return shortages.resolve(actor(), id, r.kind(), r.note(), new Approver(has(auth, "hc.approve"), has(auth, "hc.director")));
    }
}
