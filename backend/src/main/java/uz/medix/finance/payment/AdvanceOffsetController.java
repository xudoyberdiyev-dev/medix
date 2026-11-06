package uz.medix.finance.payment;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.finance.payment.PaymentModels.PaymentCancelRequest;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Avansni hisobga olish (AH). Ko'rish — payments.view; mijoz avansi — payments.mt, YB avansi — payments.yt; bekor qilish —
 * payments.cancel.
 */
@RestController
@Tag(name = "advance-offsets", description = "Avansni hisobga olish (AH)")
class AdvanceOffsetController {

    private final AdvanceOffsets offsets;
    private final CurrentActor currentActor;

    AdvanceOffsetController(AdvanceOffsets offsets, CurrentActor currentActor) {
        this.offsets = offsets;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping("/api/advance-offsets/customer")
    @PreAuthorize("hasAuthority('payments.view')")
    @Operation(summary = "Mijoz avanslari hisobga olingan hujjatlar (AH)")
    List<AdvanceOffsets.Offset> listCustomer(@RequestParam(required = false) Long branchId) {
        return offsets.list(actor(), Side.CUSTOMER, branchId);
    }

    @GetMapping("/api/advance-offsets/supplier")
    @PreAuthorize("hasAuthority('payments.view')")
    @Operation(summary = "YB avanslari hisobga olingan hujjatlar (AH)")
    List<AdvanceOffsets.Offset> listSupplier(@RequestParam(required = false) Long branchId) {
        return offsets.list(actor(), Side.SUPPLIER, branchId);
    }

    @GetMapping("/api/advance-offsets/customer/preview")
    @PreAuthorize("hasAuthority('payments.view')")
    @Operation(summary = "Mijoz: avans, qarz va hisobga olinadigan qatorlar (eng eskisidan)")
    AdvanceOffsets.OffsetPreview previewCustomer(@RequestParam long branchId, @RequestParam long counterpartyId) {
        return offsets.preview(actor(), Side.CUSTOMER, branchId, counterpartyId);
    }

    @GetMapping("/api/advance-offsets/supplier/preview")
    @PreAuthorize("hasAuthority('payments.view')")
    @Operation(summary = "YB: avans, qarz va hisobga olinadigan qatorlar (eng eskisidan)")
    AdvanceOffsets.OffsetPreview previewSupplier(@RequestParam long branchId, @RequestParam long counterpartyId) {
        return offsets.preview(actor(), Side.SUPPLIER, branchId, counterpartyId);
    }

    @PostMapping("/api/advance-offsets/customer")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('payments.mt')")
    @Operation(summary = "Mijoz avansini qarzga hisoblash (AH)")
    AdvanceOffsets.Offset createCustomer(@Valid @RequestBody AdvanceOffsets.OffsetRequest r) {
        Actor a = actor();
        return offsets.find(a, offsets.create(a, Side.CUSTOMER, r));
    }

    @PostMapping("/api/advance-offsets/supplier")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('payments.yt')")
    @Operation(summary = "YB avansini qarzga hisoblash (AH)")
    AdvanceOffsets.Offset createSupplier(@Valid @RequestBody AdvanceOffsets.OffsetRequest r) {
        Actor a = actor();
        return offsets.find(a, offsets.create(a, Side.SUPPLIER, r));
    }

    @PostMapping("/api/advance-offsets/{id}/cancel")
    @PreAuthorize("hasAuthority('payments.cancel')")
    @Operation(summary = "AH ni bekor qilish (teskari yozuvlar)")
    AdvanceOffsets.Offset cancel(@PathVariable long id, @Valid @RequestBody PaymentCancelRequest r) {
        Actor a = actor();
        offsets.cancel(a, id, r.reason());
        return offsets.find(a, id);
    }
}
