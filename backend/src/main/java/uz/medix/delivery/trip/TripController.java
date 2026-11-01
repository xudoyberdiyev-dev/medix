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
}
