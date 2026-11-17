package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** O18: 5 xil faktura (Excel) va chiqarishdan oldin qo'lda tuzatish (faqat faylga). */
@RestController
@Tag(name = "invoice-forms", description = "Buyurtma fakturalari: 5 tur, oldindan ko'rish va tuzatish (O18)")
class OrderInvoiceFormController {

    private final OrderInvoiceForms forms;
    private final CurrentActor currentActor;

    OrderInvoiceFormController(OrderInvoiceForms forms, CurrentActor currentActor) {
        this.forms = forms;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private static boolean has(Authentication auth, String key) {
        return auth.getAuthorities().stream().anyMatch(a -> key.equals(a.getAuthority()));
    }

    @GetMapping("/api/orders/{id}/invoice-forms")
    @PreAuthorize("hasAuthority('orders.view')")
    @Operation(summary = "Faktura qatorlari (joriy va asl)", description = "Narx ko'rish ruxsatisiz (prices.view) — narx va summa null.")
    OrderInvoiceForms.InvoiceForms get(@PathVariable long id, Authentication auth) {
        return forms.get(actor(), id, has(auth, "prices.view"), has(auth, "invoices.edit"));
    }

    @PutMapping("/api/orders/{id}/invoice-forms")
    @PreAuthorize("hasAuthority('invoices.edit') and hasAuthority('prices.view')")
    @Operation(summary = "Tuzatilgan holatni saqlash (avtosaqlash)", description = "Faqat faylga — buyurtma, qoldiq va qarz o'zgarmaydi; audit.")
    OrderInvoiceForms.InvoiceForms save(@PathVariable long id, @Valid @RequestBody OrderInvoiceForms.InvoiceFormSave r, Authentication auth) {
        return forms.save(actor(), id, r.rows(), has(auth, "prices.view"));
    }

    @DeleteMapping("/api/orders/{id}/invoice-forms")
    @PreAuthorize("hasAuthority('invoices.edit')")
    @Operation(summary = "Asl holatiga qaytarish")
    OrderInvoiceForms.InvoiceForms revert(@PathVariable long id, Authentication auth) {
        return forms.revert(actor(), id, has(auth, "prices.view"));
    }

    @GetMapping("/api/orders/{id}/invoice-forms/{type}/xlsx")
    @PreAuthorize("hasAuthority('orders.view')")
    @Operation(summary = "Faktura .xlsx (5 tur)", description = "WAREHOUSE — «Фактура для склада», WAREHOUSE2 — narxsiz, CLIENT_SEND, CLIENT1, CLIENT2. "
            + "Narxli turlar — prices.view.")
    ResponseEntity<byte[]> xlsx(@PathVariable long id, @PathVariable OrderInvoiceForms.FormType type, Authentication auth) {
        byte[] body = forms.xlsx(actor(), id, type, has(auth, "prices.view"));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + forms.fileName(id, type) + "\"")
                .body(body);
    }

    @GetMapping("/api/orders/invoice-forms/{type}/xlsx")
    @PreAuthorize("hasAuthority('orders.view')")
    @Operation(summary = "Faktura .xlsx — ommaviy (reys / ro'yxat)", description = "50 tagacha buyurtma; har buyurtma alohida varaqda. "
            + "Narxli turlar — prices.view.")
    ResponseEntity<byte[]> xlsxMany(@PathVariable OrderInvoiceForms.FormType type, @RequestParam List<Long> ids, Authentication auth) {
        byte[] body = forms.xlsxMany(actor(), ids, type, has(auth, "prices.view"));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + forms.bulkFileName(ids, type) + "\"")
                .body(body);
    }
}
