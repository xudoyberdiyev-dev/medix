package uz.medix.purchasing.receipt;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** YB bonus balansi (Pul → YB qarzi va bonus balans): ko'rish — YB qarzi yoki bonus tasdig'i ruxsati. */
@RestController
@RequestMapping("/api/supplier-bonuses")
@Tag(name = "supplier-bonuses", description = "Yetkazib beruvchi bonus balansi")
class BonusController {

    private static final String VIEW = "hasAnyAuthority('sdebt.view', 'supplierBonus.confirm')";

    private final BonusBalances bonuses;
    private final CurrentActor currentActor;

    BonusController(BonusBalances bonuses, CurrentActor currentActor) {
        this.bonuses = bonuses;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @PreAuthorize(VIEW)
    @Operation(summary = "Filialdagi YB bonus balanslari va kutilayotgan bonuslar")
    BonusBalances.BonusSummary list(@RequestParam long branchId, @RequestParam(required = false) String q) {
        return bonuses.list(actor(), branchId, q);
    }

    @GetMapping("/receipts")
    @PreAuthorize(VIEW)
    @Operation(summary = "Chegirmali kirimlar holati (kutilmoqda / tasdiqlandi / berilmadi) va YB × filial balanslari")
    BonusBalances.BonusReceipts receipts(@RequestParam(required = false) Long branchId) {
        return bonuses.receipts(actor(), branchId);
    }

    @GetMapping("/{supplierId}")
    @PreAuthorize(VIEW)
    @Operation(summary = "Bitta YB: bonus harakatlari (BNS, bonus hisobidan kirim) va kutilayotgan bonuslar")
    BonusBalances.BonusDetail detail(@PathVariable long supplierId, @RequestParam long branchId) {
        return bonuses.detail(actor(), branchId, supplierId);
    }
}
