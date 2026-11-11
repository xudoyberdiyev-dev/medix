package uz.medix.inventory.transfer;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.inventory.transfer.ZoneTransferModels.Status;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneStockRow;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneTransferDetail;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneTransferPage;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneTransferRejectRequest;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneTransferRequest;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * ZK — zona ko'chirishi. Ruxsatlar (T12): ko'rish — transfer.view yoki transfer.zk, yaratish — transfer.zk, karantindan sotuvga
 * ochiq zonaga ko'chirishni tasdiqlash / rad etish — transfer.quar. Filial doirasi serverda.
 */
@RestController
@RequestMapping("/api/zone-transfers")
@Tag(name = "zone-transfer", description = "Zona ko'chirishi (ZK)")
class ZoneTransferController {

    private static final String VIEW = "hasAnyAuthority('transfer.view', 'transfer.zk', 'transfer.quar')";

    private final ZoneTransfers transfers;
    private final CurrentActor currentActor;

    ZoneTransferController(ZoneTransfers transfers, CurrentActor currentActor) {
        this.transfers = transfers;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private ZoneTransferDetail detail(long id) {
        return transfers.find(id, actor()).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @GetMapping
    @PreAuthorize(VIEW)
    @Operation(summary = "ZK hujjatlari")
    ZoneTransferPage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) Status status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return transfers.list(actor(), branchId, warehouseId, status, Math.max(page, 0), Math.clamp(size, 1, 200));
    }

    @GetMapping("/{id}")
    @PreAuthorize(VIEW)
    @Operation(summary = "ZK hujjati")
    ZoneTransferDetail get(@PathVariable long id) {
        return detail(id);
    }

    @GetMapping("/zone-stock")
    @PreAuthorize("hasAuthority('transfer.zk')")
    @Operation(summary = "Zonadagi partiyalar", description = "Ko'chirish uchun: qoldiq, faol zahira va bo'sh miqdor (tannarxsiz).")
    List<ZoneStockRow> zoneStock(@RequestParam long zoneId) {
        return transfers.zoneStock(actor(), zoneId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('transfer.zk')")
    @Operation(summary = "Zona ko'chirishi",
            description = "Darhol o'tkaziladi. Karantindan sotuvga ochiq zonaga — transfer.quar ruxsati bo'lmasa «Tasdiqda» holatida qoladi.")
    ZoneTransferDetail create(@Valid @RequestBody ZoneTransferRequest r, Authentication auth) {
        return detail(transfers.create(actor(), r, canApprove(auth)));
    }

    @PostMapping("/drafts")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('transfer.zk')")
    @Operation(summary = "Zona ko'chirishi (qoralama)", description = "Tovar o'tkazilguncha joyida qoladi.")
    ZoneTransferDetail createDraft(@Valid @RequestBody ZoneTransferRequest r) {
        return detail(transfers.createDraft(actor(), r));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('transfer.zk')")
    @Operation(summary = "Qoralamani tahrirlash", description = "Ombor, zonalar, izoh va qatorlar almashtiriladi. Faqat qoralama.")
    ZoneTransferDetail update(@PathVariable long id, @Valid @RequestBody ZoneTransferRequest r) {
        transfers.update(actor(), id, r);
        return detail(id);
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAuthority('transfer.zk')")
    @Operation(summary = "Qoralamani o'tkazish",
            description = "Darhol o'tkaziladi. Karantindan sotuvga ochiq zonaga — transfer.quar ruxsati bo'lmasa «Tasdiqda» holatiga o'tadi.")
    ZoneTransferDetail submit(@PathVariable long id, Authentication auth) {
        transfers.submit(actor(), id, canApprove(auth));
        return detail(id);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('transfer.zk')")
    @Operation(summary = "Bekor qilish", description = "Faqat qoralama.")
    ZoneTransferDetail cancel(@PathVariable long id) {
        transfers.cancel(actor(), id);
        return detail(id);
    }

    private static boolean canApprove(Authentication auth) {
        return auth.getAuthorities().stream().anyMatch(a -> "transfer.quar".equals(a.getAuthority()));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('transfer.quar')")
    @Operation(summary = "Tasdiqlash va o'tkazish")
    ZoneTransferDetail approve(@PathVariable long id) {
        transfers.approve(actor(), id);
        return detail(id);
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('transfer.quar')")
    @Operation(summary = "Rad etish", description = "Tovar joyida qoladi.")
    ZoneTransferDetail reject(@PathVariable long id, @Valid @RequestBody ZoneTransferRejectRequest r) {
        transfers.reject(actor(), id, r.reason());
        return detail(id);
    }
}
