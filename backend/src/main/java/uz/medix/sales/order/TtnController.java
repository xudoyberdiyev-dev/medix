package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** O10e TTN (tovar-transport yuk xati) — PDF: buyurtma, reys, faktura vazifasi bo'yicha. */
@RestController
@RequestMapping("/api")
@Tag(name = "ttn", description = "Tovar-transport yuk xati")
class TtnController {

    private final OrderTtnPdf ttn;
    private final InvoiceTasks tasks;
    private final CurrentActor currentActor;

    TtnController(OrderTtnPdf ttn, InvoiceTasks tasks, CurrentActor currentActor) {
        this.ttn = ttn;
        this.tasks = tasks;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping(value = "/orders/{id}/ttn/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize("hasAnyAuthority('orders.view', 'invoices.view')")
    @Operation(summary = "TTN — PDF (buyurtma)", description = "Nakladnoy berilmagan bo'lsa — 409.")
    ResponseEntity<byte[]> order(@PathVariable long id) {
        return ttn.order(actor(), id).response();
    }

    @GetMapping(value = "/orders/ttn/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize("hasAnyAuthority('orders.view', 'invoices.view')")
    @Operation(summary = "TTN — PDF (reysdagi barcha buyurtmalar)", description = "Har buyurtma alohida varaqda.")
    ResponseEntity<byte[]> trip(@RequestParam long tripId) {
        return ttn.trip(actor(), tripId).response();
    }

    @GetMapping(value = "/invoice-tasks/{id}/ttn/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize("hasAuthority('invoices.view')")
    @Operation(summary = "TTN — PDF (faktura vazifasi)")
    ResponseEntity<byte[]> task(@PathVariable long id) {
        return ttn.order(actor(), tasks.get(actor(), id).orderId()).response();
    }
}
