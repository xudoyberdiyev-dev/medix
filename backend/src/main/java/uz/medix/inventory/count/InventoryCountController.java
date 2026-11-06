package uz.medix.inventory.count;

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
import uz.medix.inventory.count.InventoryCountModels.BatchHit;
import uz.medix.inventory.count.InventoryCountModels.CancelRequest;
import uz.medix.inventory.count.InventoryCountModels.CountDetail;
import uz.medix.inventory.count.InventoryCountModels.CountEntriesRequest;
import uz.medix.inventory.count.InventoryCountModels.CountPage;
import uz.medix.inventory.count.InventoryCountModels.CountRequest;
import uz.medix.inventory.count.InventoryCountModels.CountSummary;
import uz.medix.inventory.count.InventoryCountModels.Status;
import uz.medix.inventory.count.InventoryCounts.Approver;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * IN — inventarizatsiya. Ruxsatlar (T12): ko'rish — inventory.view, yaratish / bekor qilish — inventory.create, sanoqni ochish /
 * qayta sanash — inventory.openCount, sanash / tekshiruvga yuborish — inventory.count, tasdiqlash — inventory.approve (Direktor
 * darajasi — inventory.director). Tannarx faqat prices.cost bilan; ko'r sanoqda hisob qoldig'i sanoq davomida faqat
 * inventory.openCount egalariga. Filial doirasi serverda.
 */
@RestController
@RequestMapping("/api/inventory-counts")
@Tag(name = "inventory-count", description = "Inventarizatsiya (IN)")
class InventoryCountController {

    private static final String VIEW = "hasAnyAuthority('inventory.view', 'inventory.create', 'inventory.count', 'inventory.approve')";

    private final InventoryCounts counts;
    private final CurrentActor currentActor;

    InventoryCountController(InventoryCounts counts, CurrentActor currentActor) {
        this.counts = counts;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private static boolean has(Authentication auth, String permission) {
        return auth.getAuthorities().stream().anyMatch(a -> permission.equals(a.getAuthority()));
    }

    private CountDetail detail(long id, Authentication auth) {
        CountDetail d = counts.find(id, actor()).orElseThrow(() -> MedixException.notFound("error.notFound"));
        boolean hideBook = d.blind() && d.status() == Status.COUNTING && !has(auth, "inventory.openCount");
        return d.restricted(has(auth, "prices.cost"), hideBook);
    }

    @GetMapping
    @PreAuthorize(VIEW)
    @Operation(summary = "Inventarizatsiyalar", description = "Kamomad / ortiqcha tannarxi — faqat prices.cost.")
    CountPage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) Status status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            Authentication auth) {
        CountPage p = counts.list(actor(), branchId, warehouseId, status, Math.max(page, 0), Math.clamp(size, 1, 200));
        if (has(auth, "prices.cost")) {
            return p;
        }
        return new CountPage(p.items().stream().map(s -> new CountSummary(s.id(), s.number(), s.branchId(), s.warehouseId(), s.warehouse(),
                s.zone(), s.blind(), s.status(), s.needsDirector(), s.lines(), s.counted(), s.shortageQty(), s.surplusQty(), null, null,
                s.createdBy(), s.createdAt(), s.postedAt())).toList(), p.total(), p.page(), p.size());
    }

    @GetMapping("/{id}")
    @PreAuthorize(VIEW)
    @Operation(summary = "Inventarizatsiya hujjati", description = "Ko'r sanoqda sanoq davomida hisob qoldig'i — faqat inventory.openCount.")
    CountDetail get(@PathVariable long id, Authentication auth) {
        return detail(id, auth);
    }

    @GetMapping("/{id}/batches")
    @PreAuthorize("hasAuthority('inventory.count')")
    @Operation(summary = "Topilgan partiyani qidirish", description = "Partiya raqami, mahsulot kodi yoki nomi bo'yicha (20 ta).")
    List<BatchHit> batches(@PathVariable long id, @RequestParam String q) {
        return counts.findBatches(actor(), id, q);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('inventory.create')")
    @Operation(summary = "Inventarizatsiya yaratish", description = "Qoralama. Bitta omborda bitta faol inventarizatsiya.")
    CountDetail create(@Valid @RequestBody CountRequest r, Authentication auth) {
        return detail(counts.create(actor(), r), auth);
    }

    @PostMapping("/{id}/start")
    @PreAuthorize("hasAuthority('inventory.openCount')")
    @Operation(summary = "Sanoqni ochish", description = "Qoldiq surati olinadi, qamrovdagi zonalarda ombor harakati to'xtatiladi.")
    CountDetail start(@PathVariable long id, Authentication auth) {
        counts.start(actor(), id);
        return detail(id, auth);
    }

    @PutMapping("/{id}/counts")
    @PreAuthorize("hasAuthority('inventory.count')")
    @Operation(summary = "Sanalgan miqdorlar", description = "Mavjud qatorlar (lineId) yoki topilgan partiyalar (zoneId + batchId).")
    CountDetail count(@PathVariable long id, @Valid @RequestBody CountEntriesRequest r, Authentication auth) {
        counts.count(actor(), id, r.entries());
        return detail(id, auth);
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAuthority('inventory.count')")
    @Operation(summary = "Tekshiruvga yuborish", description = "Hamma qator sanalgan bo'lishi shart. Tasdiqlovchilarga bildirishnoma.")
    CountDetail submit(@PathVariable long id, Authentication auth) {
        counts.submit(actor(), id);
        return detail(id, auth);
    }

    @PostMapping("/{id}/recount")
    @PreAuthorize("hasAuthority('inventory.openCount')")
    @Operation(summary = "Qayta sanashga qaytarish")
    CountDetail recount(@PathVariable long id, Authentication auth) {
        counts.recount(actor(), id);
        return detail(id, auth);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('inventory.approve')")
    @Operation(summary = "Tasdiqlash", description = "Farqlar qoldiqqa yoziladi, qulf yechiladi. Direktor darajasi — inventory.director.")
    CountDetail approve(@PathVariable long id, Authentication auth) {
        counts.approve(actor(), id, new Approver(has(auth, "inventory.approve"), has(auth, "inventory.director")));
        return detail(id, auth);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('inventory.create')")
    @Operation(summary = "Bekor qilish", description = "Qoldiq o'zgarmaydi, qulf yechiladi.")
    CountDetail cancel(@PathVariable long id, @Valid @RequestBody CancelRequest r, Authentication auth) {
        counts.cancel(actor(), id, r.reason());
        return detail(id, auth);
    }
}
