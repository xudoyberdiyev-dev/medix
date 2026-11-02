package uz.medix.delivery.trip;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
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
import uz.medix.delivery.trip.TripModels.PickupRequest;
import uz.medix.delivery.trip.TripModels.ReadyOrder;
import uz.medix.delivery.trip.TripModels.TripDetail;
import uz.medix.delivery.trip.TripModels.TripOptions;
import uz.medix.delivery.trip.TripModels.TripRequest;
import uz.medix.delivery.trip.TripModels.TripSummary;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** Reyslar (RS) va hujjatlashtirish. Ruxsatlar (T12): ko'rish — shipments.view, reys tuzish/bekor qilish — shipments.trip. */
@RestController
@RequestMapping("/api/trips")
@Tag(name = "trips", description = "Reyslar")
class TripController {

    record ReasonRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record PickupResult(String waybillNumber) {}

    record LoadRequest(@jakarta.validation.constraints.NotNull(message = "{validation.required}") @jakarta.validation.constraints.Min(1) Integer places) {}

    record StartResult(List<String> sales) {}

    record HandoverResult(String sale) {}

    record DeliverRequest(@io.swagger.v3.oas.annotations.media.Schema(nullable = true, description = "Naqd olingan summa, masalan «25000.00»")
            @Size(max = 24) String cash) {}

    record PhotoResult(long id) {}

    record FinishResult(TripModels.TripStatus status) {}

    record ReturnedLine(@jakarta.validation.constraints.NotNull(message = "{validation.required}") Long saleLineId,
            @jakarta.validation.constraints.NotNull(message = "{validation.required}") @jakarta.validation.constraints.Min(0) Integer qty) {}

    record PartialRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason,
            @jakarta.validation.constraints.NotNull(message = "{validation.required}") @Size(min = 1, max = 200) List<@Valid ReturnedLine> lines,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true, description = "Naqd olingan summa (qolgan summagacha)") @Size(max = 24)
            String cash) {}

    private final Trips trips;
    private final CurrentActor currentActor;

    TripController(Trips trips, CurrentActor currentActor) {
        this.trips = trips;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('shipments.view')")
    @Operation(summary = "Reyslar", description = "active=true — Rejalashtirilgan, Yo'lda, Qaytish kutilmoqda.")
    List<TripSummary> list(@RequestParam(required = false) Long branchId, @RequestParam(defaultValue = "true") boolean active) {
        return trips.list(actor(), branchId, active);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('shipments.view')")
    @Operation(summary = "Reys")
    TripDetail get(@PathVariable long id) {
        return trips.find(actor(), id);
    }

    @GetMapping("/ready")
    @PreAuthorize("hasAuthority('shipments.view')")
    @Operation(summary = "Jo'natishga tayyor buyurtmalar", description = "«Hujjatlashtirilmoqda» holatidagilar.")
    List<ReadyOrder> ready(@RequestParam(required = false) Long branchId) {
        return trips.ready(actor(), branchId);
    }

    @GetMapping("/options")
    @PreAuthorize("hasAuthority('shipments.trip')")
    @Operation(summary = "Mashina va haydovchilar", description = "Filialning faol mashinalari (band joylar bilan) va haydovchilari.")
    TripOptions options(@RequestParam long branchId) {
        return trips.options(actor(), branchId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('shipments.trip')")
    @Operation(summary = "Reys tuzish", description = "Sig'im tekshiruvi; har buyurtmaga nakladnoy raqami, «Yuklanmoqda».")
    TripDetail create(@Valid @RequestBody TripRequest r) {
        return trips.find(actor(), trips.create(actor(), r));
    }

    @PostMapping("/pickup")
    @PreAuthorize("hasAuthority('shipments.trip')")
    @Operation(summary = "«O'zi olib ketadi» — nakladnoy", description = "Reyssiz, «Yuklanmoqda»ga.")
    PickupResult pickup(@Valid @RequestBody PickupRequest r) {
        return new PickupResult(trips.pickup(actor(), r.orderId()));
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('shipments.trip')")
    @Operation(summary = "Reysni bekor qilish", description = "Faqat yuklash boshlanmagan «Rejalashtirilgan» reys.")
    TripDetail cancel(@PathVariable long id, @Valid @RequestBody ReasonRequest r) {
        trips.cancel(actor(), id, r.reason());
        return trips.find(actor(), id);
    }

    @GetMapping("/mine")
    @PreAuthorize("hasAuthority('trip.driver')")
    @Operation(summary = "Reysim (haydovchi)", description = "Faol reys bo'lmasa — 204.")
    org.springframework.http.ResponseEntity<TripDetail> mine() {
        return trips.mine(actor()).map(org.springframework.http.ResponseEntity::ok)
                .orElseGet(() -> org.springframework.http.ResponseEntity.noContent().build());
    }

    @PostMapping("/{id}/stops/{stopId}/load")
    @PreAuthorize("hasAuthority('trip.driver')")
    @Operation(summary = "«Qabul qildim»", description = "Haydovchi buyurtmani joylar soni bo'yicha qabul qiladi.")
    TripDetail load(@PathVariable long id, @PathVariable long stopId, @Valid @RequestBody LoadRequest r) {
        trips.load(actor(), id, stopId, r.places());
        return trips.find(actor(), id);
    }

    @PostMapping("/{id}/start")
    @PreAuthorize("hasAuthority('trip.driver')")
    @Operation(summary = "«Yuklab bo'lindi — reysni boshlash»", description = "Har buyurtmaga sotuv (SV) va hisob-faktura (HF); «Yo'lda».")
    StartResult start(@PathVariable long id) {
        return new StartResult(trips.start(actor(), id));
    }

    @PostMapping("/pickup/{orderId}/handover")
    @PreAuthorize("hasAuthority('shipments.ship')")
    @Operation(summary = "«O'zi olib ketadi» — mijoz olib chiqdi", description = "Sotuv va hisob-faktura; «Yo'lda».")
    HandoverResult handover(@PathVariable long orderId) {
        return new HandoverResult(trips.handover(actor(), orderId));
    }

    @PostMapping(value = "/{id}/stops/{stopId}/photos", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('trip.driver')")
    @Operation(summary = "Yetkazish rasmi", description = "JPEG/PNG/WEBP, ≤ 5 MB. signature=true — mijoz imzosi (ixtiyoriy).")
    PhotoResult photo(@PathVariable long id, @PathVariable long stopId, @RequestParam("file") org.springframework.web.multipart.MultipartFile file,
            @RequestParam(defaultValue = "false") boolean signature) throws java.io.IOException {
        return new PhotoResult(trips.addPhoto(actor(), id, stopId, file.getContentType(), file.getBytes(), signature));
    }

    @PostMapping("/{id}/stops/{stopId}/deliver")
    @PreAuthorize("hasAuthority('trip.driver')")
    @Operation(summary = "«Yetkazildi»", description = "Kamida 1 rasm majburiy; naqd to'lovda olingan summa.")
    TripDetail deliver(@PathVariable long id, @PathVariable long stopId, @Valid @RequestBody DeliverRequest r) {
        trips.deliver(actor(), id, stopId, r.cash());
        return trips.find(actor(), id);
    }

    @PostMapping("/{id}/stops/{stopId}/undeliver")
    @PreAuthorize("hasAuthority('trip.driver')")
    @Operation(summary = "«Yetkazilmadi»", description = "Sabab majburiy; sotuv va qarz bekor, tovar «Qaytmoqda».")
    TripDetail undeliver(@PathVariable long id, @PathVariable long stopId, @Valid @RequestBody ReasonRequest r) {
        trips.undeliver(actor(), id, stopId, r.reason());
        return trips.find(actor(), id);
    }

    @PostMapping("/{id}/finish")
    @PreAuthorize("hasAuthority('trip.driver')")
    @Operation(summary = "«Reysni yakunlash»", description = "Qaytgan tovar yoki naqd pul bo'lsa — «Qaytish kutilmoqda».")
    FinishResult finish(@PathVariable long id) {
        return new FinishResult(trips.finish(actor(), id));
    }

    @GetMapping("/{id}/stops/{stopId}/lines")
    @PreAuthorize("hasAuthority('trip.driver')")
    @Operation(summary = "Manzildagi sotuv qatorlari (qisman yetkazish uchun)")
    List<uz.medix.sales.OrderDispatch.SaleLine> stopLines(@PathVariable long id, @PathVariable long stopId) {
        return trips.stopLines(actor(), id, stopId);
    }

    @PostMapping("/{id}/stops/{stopId}/partial")
    @PreAuthorize("hasAuthority('trip.driver')")
    @Operation(summary = "Qisman yetkazildi: qaytgan qism QM (asl sotuv narxida), mijoz qarzi kamayadi, tovar «Qaytmoqda»")
    TripModels.TripDetail partial(@PathVariable long id, @PathVariable long stopId, @Valid @RequestBody PartialRequest r) {
        java.util.Map<Long, Integer> returned = new java.util.LinkedHashMap<>();
        for (ReturnedLine l : r.lines()) {
            returned.merge(l.saleLineId(), l.qty(), Integer::sum);
        }
        trips.partial(actor(), id, stopId, r.reason(), returned, r.cash());
        return trips.find(actor(), id);
    }
}
