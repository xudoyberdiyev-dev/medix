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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.inventory.transfer.BranchSaleModels.BranchSaleDetail;
import uz.medix.inventory.transfer.BranchSaleModels.BranchSalePage;
import uz.medix.inventory.transfer.BranchSaleModels.BranchSaleRequest;
import uz.medix.inventory.transfer.BranchSaleModels.TargetWarehouse;
import uz.medix.inventory.transfer.WarehouseTransferModels.ReceiveRequest;
import uz.medix.inventory.transfer.WarehouseTransferModels.Status;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneStockRow;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * FS — filiallararo savdo. Ruxsatlar (T12): ko'rish — transfer.view / transfer.fs / transfer.send / transfer.receive, qoralama —
 * transfer.fs, jo'natish — transfer.send (sotuvchi filial), qabul — transfer.receive (xaridor filial), bekor qilish — transfer.cancel.
 * Hujjatni sotuvchi va xaridor filial xodimlari ko'radi; summalar — faqat special.cost bilan.
 */
@RestController
@RequestMapping("/api/branch-sales")
@Tag(name = "branch-sale", description = "Filiallararo savdo (FS)")
class BranchSaleController {

    private static final String VIEW = "hasAnyAuthority('transfer.view', 'transfer.fs', 'transfer.send', 'transfer.receive')";

    private final BranchSales sales;
    private final ZoneTransfers zones;
    private final CurrentActor currentActor;

    BranchSaleController(BranchSales sales, ZoneTransfers zones, CurrentActor currentActor) {
        this.sales = sales;
        this.zones = zones;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private static boolean canSeeCost(Authentication auth) {
        return auth.getAuthorities().stream().anyMatch(a -> "special.cost".equals(a.getAuthority()));
    }

    private BranchSaleDetail detail(long id, Authentication auth) {
        return sales.find(id, actor(), canSeeCost(auth)).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @GetMapping
    @PreAuthorize(VIEW)
    @Operation(summary = "FS hujjatlari", description = "branchId — sotuvchi yoki xaridor filial.")
    BranchSalePage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Status status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            Authentication auth) {
        return sales.list(actor(), branchId, status, Math.max(page, 0), Math.clamp(size, 1, 200), canSeeCost(auth));
    }

    @GetMapping("/{id}")
    @PreAuthorize(VIEW)
    @Operation(summary = "FS hujjati")
    BranchSaleDetail get(@PathVariable long id, Authentication auth) {
        return detail(id, auth);
    }

    @GetMapping("/zone-stock")
    @PreAuthorize("hasAuthority('transfer.fs')")
    @Operation(summary = "Sotuvchi zonadagi partiyalar", description = "Qoldiq, faol zahira va bo'sh miqdor (tannarxsiz).")
    List<ZoneStockRow> zoneStock(@RequestParam long zoneId) {
        return zones.zoneStock(actor(), zoneId);
    }

    @GetMapping("/targets")
    @PreAuthorize("hasAuthority('transfer.fs')")
    @Operation(summary = "Xaridor omborlari", description = "Boshqa filiallarning faol omborlari.")
    List<TargetWarehouse> targets(@RequestParam long sellerBranchId) {
        return sales.targets(actor(), sellerBranchId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('transfer.fs')")
    @Operation(summary = "Filiallararo savdo (qoralama)", description = "Tovar joʻnatilguncha joyida qoladi.")
    BranchSaleDetail create(@Valid @RequestBody BranchSaleRequest r, Authentication auth) {
        return detail(sales.create(actor(), r), auth);
    }

    @PostMapping("/{id}/send")
    @PreAuthorize("hasAuthority('transfer.send')")
    @Operation(summary = "Jo'natish", description = "Tovar chiqadi, HF raqami beriladi, xaridor filial qarzi oshadi; hujjat «Yo'lda».")
    BranchSaleDetail send(@PathVariable long id, Authentication auth) {
        sales.send(actor(), id);
        return detail(id, auth);
    }

    @PostMapping("/{id}/receive")
    @PreAuthorize("hasAuthority('transfer.receive')")
    @Operation(summary = "Qabul qilish", description = "Xaridor filial. Kelgan miqdor qabul zonasiga kiradi; kamomad bo'lsa izoh majburiy.")
    BranchSaleDetail receive(@PathVariable long id, @Valid @RequestBody ReceiveRequest r, Authentication auth) {
        sales.receive(actor(), id, r);
        return detail(id, auth);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('transfer.cancel')")
    @Operation(summary = "Bekor qilish", description = "Faqat qoralama.")
    BranchSaleDetail cancel(@PathVariable long id, Authentication auth) {
        sales.cancel(actor(), id);
        return detail(id, auth);
    }
}
