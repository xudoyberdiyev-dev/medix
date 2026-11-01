package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.sales.order.MarkingModels.MarkCodePage;
import uz.medix.sales.order.MarkingModels.MarkQueueItem;
import uz.medix.sales.order.MarkingModels.MarkWork;
import uz.medix.sales.order.MarkingModels.ScanRequest;
import uz.medix.sales.order.MarkingModels.ScanResult;
import uz.medix.sales.order.OrderModels.OrderReasonRequest;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** Markirovkachi paneli (SPEC 5.4). Ruxsatlar (T12): skanerlash — marking.scan; kodlar jurnali — marking.view yoki orders.queue. */
@RestController
@RequestMapping("/api/marking")
@Tag(name = "marking", description = "Markirovka")
class MarkingController {

    private final OrderMarking marking;
    private final CurrentActor currentActor;

    MarkingController(OrderMarking marking, CurrentActor currentActor) {
        this.marking = marking;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping("/queue")
    @PreAuthorize("hasAnyAuthority('marking.scan', 'orders.queue')")
    @Operation(summary = "Markirovka navbati", description = "«Markirovkada» buyurtmalar; boshlanganlari — markirovkachi nomi bilan («Band: …»).")
    List<MarkQueueItem> queue() {
        return marking.queue(actor());
    }

    @GetMapping("/mine")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Mening markirovkam", description = "Faol ish bo'lmasa — 204.")
    ResponseEntity<MarkWork> mine() {
        return marking.mine(actor()).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/orders/{id}")
    @PreAuthorize("hasAnyAuthority('marking.scan', 'marking.view', 'orders.queue')")
    @Operation(summary = "Buyurtma markirovkasi", description = "Qatorlar, partiyalar, hisoblagichlar va faol kodlar.")
    MarkWork get(@PathVariable long id) {
        return marking.get(actor(), id);
    }

    @PostMapping("/orders/{id}/start")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Markirovkani boshlash", description = "Bir markirovkachida bitta faol buyurtma.")
    MarkWork start(@PathVariable long id) {
        return marking.start(actor(), id);
    }

    @PostMapping("/orders/{id}/scan")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Kodni skanerlash",
            description = "Tekshiruv tartibi: format → takror (global) → mahsulot (GTIN) → partiya → tur (quti/dona) → qator to'lganmi.")
    ScanResult scan(@PathVariable long id, @Valid @RequestBody ScanRequest r) {
        return marking.scan(actor(), id, r.code());
    }

    @PostMapping("/orders/{id}/codes/{markId}/remove")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Kodni olib tashlash", description = "Yakunlashdan oldin, sabab bilan.")
    MarkWork remove(@PathVariable long id, @PathVariable long markId, @Valid @RequestBody OrderReasonRequest r) {
        return marking.remove(actor(), id, markId, r.reason());
    }

    @PostMapping("/orders/{id}/finish")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Markirovkani yakunlash", description = "Barcha kodlar skanerlangan bo'lsa → «Hisobdan o'tkazilmoqda».")
    MarkWork finish(@PathVariable long id) {
        marking.finish(actor(), id);
        return marking.get(actor(), id);
    }

    @GetMapping("/codes")
    @PreAuthorize("hasAnyAuthority('marking.view', 'orders.queue')")
    @Operation(summary = "Kodlar jurnali")
    MarkCodePage codes(
            @RequestParam(required = false) Long orderId,
            @RequestParam(defaultValue = "false") boolean mine,
            @RequestParam(defaultValue = "false") boolean today,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return marking.codes(actor(), orderId, mine, today, q, Math.max(page, 0), Math.clamp(size, 1, 200));
    }
}
