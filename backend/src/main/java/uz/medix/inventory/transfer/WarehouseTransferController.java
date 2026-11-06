package uz.medix.inventory.transfer;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.inventory.transfer.WarehouseTransferModels.ReceiveRequest;
import uz.medix.inventory.transfer.WarehouseTransferModels.Status;
import uz.medix.inventory.transfer.WarehouseTransferModels.WarehouseTransferDetail;
import uz.medix.inventory.transfer.WarehouseTransferModels.WarehouseTransferPage;
import uz.medix.inventory.transfer.WarehouseTransferModels.WarehouseTransferRequest;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * OK — ombor ko'chirishi. Ruxsatlar (T12): ko'rish — transfer.view / transfer.ok / transfer.send / transfer.receive, qoralama —
 * transfer.ok, jo'natish — transfer.send, qabul qilish — transfer.receive, bekor qilish — transfer.cancel. Filial doirasi serverda.
 */
@RestController
@RequestMapping("/api/warehouse-transfers")
@Tag(name = "warehouse-transfer", description = "Ombor ko'chirishi (OK)")
class WarehouseTransferController {

    private static final String VIEW = "hasAnyAuthority('transfer.view', 'transfer.ok', 'transfer.send', 'transfer.receive')";

    private final WarehouseTransfers transfers;
    private final CurrentActor currentActor;

    WarehouseTransferController(WarehouseTransfers transfers, CurrentActor currentActor) {
        this.transfers = transfers;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private WarehouseTransferDetail detail(long id) {
        return transfers.find(id, actor()).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @GetMapping
    @PreAuthorize(VIEW)
    @Operation(summary = "OK hujjatlari", description = "warehouseId — jo'natuvchi yoki qabul qiluvchi ombor.")
    WarehouseTransferPage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) Status status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return transfers.list(actor(), branchId, warehouseId, status, Math.max(page, 0), Math.clamp(size, 1, 200));
    }

    @GetMapping("/{id}")
    @PreAuthorize(VIEW)
    @Operation(summary = "OK hujjati")
    WarehouseTransferDetail get(@PathVariable long id) {
        return detail(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('transfer.ok')")
    @Operation(summary = "Ombor ko'chirishi (qoralama)", description = "Bitta filial ichida. Tovar joʻnatilguncha joyida qoladi.")
    WarehouseTransferDetail create(@Valid @RequestBody WarehouseTransferRequest r) {
        return detail(transfers.create(actor(), r));
    }

    @PostMapping("/{id}/send")
    @PreAuthorize("hasAuthority('transfer.send')")
    @Operation(summary = "Jo'natish", description = "Tovar manba zonadan chiqadi, hujjat «Yo'lda».")
    WarehouseTransferDetail send(@PathVariable long id) {
        transfers.send(actor(), id);
        return detail(id);
    }

    @PostMapping("/{id}/receive")
    @PreAuthorize("hasAuthority('transfer.receive')")
    @Operation(summary = "Qabul qilish", description = "Kelgan miqdor qabul zonasiga kiradi; kamomad bo'lsa izoh majburiy.")
    WarehouseTransferDetail receive(@PathVariable long id, @Valid @RequestBody ReceiveRequest r) {
        transfers.receive(actor(), id, r);
        return detail(id);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('transfer.cancel')")
    @Operation(summary = "Bekor qilish", description = "Faqat qoralama.")
    WarehouseTransferDetail cancel(@PathVariable long id) {
        transfers.cancel(actor(), id);
        return detail(id);
    }
}
