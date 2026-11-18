package uz.yuzplus.finance.debt;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.yuzplus.finance.PartyLedger.Side;
import uz.yuzplus.shared.error.YuzplusException;
import uz.yuzplus.shared.security.Actor;
import uz.yuzplus.shared.security.CurrentActor;

/** Mijozlar qarzi (cdebt.view) va YB qarzi (sdebt.view): muddat guruhlari, kontragent bo'yicha ochiq hujjatlar. */
@RestController
@Tag(name = "debts", description = "Mijozlar va yetkazib beruvchilar qarzi (muddat guruhlari)")
class DebtController {

    private final Debts debts;
    private final CurrentActor currentActor;

    private final DebtActPdf actPdf;
    private final ReconActDoc actDocs;

    DebtController(Debts debts, DebtActPdf actPdf, ReconActDoc actDocs, CurrentActor currentActor) {
        this.actDocs = actDocs;
        this.actPdf = actPdf;
        this.debts = debts;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> YuzplusException.unauthorized("auth.unauthorized"));
    }

    @GetMapping("/api/debts/customers")
    @PreAuthorize("hasAuthority('cdebt.view')")
    @Operation(summary = "Mijozlar qarzi", description = "Muddati kelmagan / 1–30 / 31–60 / 61–90 / 90+ kun; avans qarzdan eng eskisidan ayriladi.")
    Debts.DebtReport customers(@RequestParam(required = false) Long branchId) {
        return debts.report(actor(), Side.CUSTOMER, branchId);
    }

    @GetMapping("/api/debts/customers/{id}/docs")
    @PreAuthorize("hasAuthority('cdebt.view')")
    @Operation(summary = "Mijozning ochiq hujjatlari (eng eskisi birinchi)")
    List<Debts.DebtDoc> customerDocs(@PathVariable long id, @RequestParam(required = false) Long branchId) {
        return debts.docs(actor(), Side.CUSTOMER, branchId, id);
    }

    @GetMapping("/api/debts/suppliers")
    @PreAuthorize("hasAuthority('sdebt.view')")
    @Operation(summary = "Yetkazib beruvchilar qarzi", description = "Kompaniyaning YB oldidagi qarzi, muddat guruhlari bilan.")
    Debts.DebtReport suppliers(@RequestParam(required = false) Long branchId) {
        return debts.report(actor(), Side.SUPPLIER, branchId);
    }

    @GetMapping("/api/debts/suppliers/invoices")
    @PreAuthorize("hasAuthority('sdebt.view')")
    @Operation(summary = "YB qarzi — kirimlar boʻyicha (summa, toʻlangan, qoldiq, toʻlov kuni)")
    Debts.SupplierInvoices supplierInvoices(@RequestParam(required = false) Long branchId) {
        return debts.supplierInvoices(actor(), branchId);
    }

    @GetMapping("/api/debts/suppliers/{id}/docs")
    @PreAuthorize("hasAuthority('sdebt.view')")
    @Operation(summary = "Yetkazib beruvchi bo'yicha ochiq hujjatlar")
    List<Debts.DebtDoc> supplierDocs(@PathVariable long id, @RequestParam(required = false) Long branchId) {
        return debts.docs(actor(), Side.SUPPLIER, branchId, id);
    }

    @GetMapping("/api/debts/customers/{id}/act")
    @PreAuthorize("hasAuthority('cdebt.view')")
    @Operation(summary = "Akt sverka (mijoz)", description = "Davr boshi + qarz oshdi − kamaydi = davr oxiri. Standart davr — joriy oy.")
    Debts.Act customerAct(@PathVariable long id, @RequestParam long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return debts.act(actor(), Side.CUSTOMER, branchId, id, from, to);
    }

    @GetMapping("/api/debts/suppliers/{id}/act")
    @PreAuthorize("hasAuthority('sdebt.view')")
    @Operation(summary = "Akt sverka (yetkazib beruvchi)")
    Debts.Act supplierAct(@PathVariable long id, @RequestParam long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return debts.act(actor(), Side.SUPPLIER, branchId, id, from, to);
    }

    @GetMapping(value = "/api/debts/customers/{id}/act/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize("hasAuthority('cdebt.view')")
    @Operation(summary = "Akt sverka (mijoz) — PDF", description = "O17: egasi shabloni, ikki tomonlama. lang: ru (standart), uz-Latn, uz-Cyrl; "
            + "letter — qarzni tan olish xati (mijoz qarzdor bo'lsa, standart — ha).")
    ResponseEntity<byte[]> customerActPdf(@PathVariable long id, @RequestParam long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String lang, @RequestParam(defaultValue = "true") boolean letter) {
        return actPdf.render(actor(), Side.CUSTOMER, branchId, id, from, to, lang, letter).response();
    }

    @GetMapping(value = "/api/debts/suppliers/{id}/act/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize("hasAuthority('sdebt.view')")
    @Operation(summary = "Akt sverka (yetkazib beruvchi) — PDF")
    ResponseEntity<byte[]> supplierActPdf(@PathVariable long id, @RequestParam long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String lang, @RequestParam(defaultValue = "true") boolean letter) {
        return actPdf.render(actor(), Side.SUPPLIER, branchId, id, from, to, lang, letter).response();
    }

    @GetMapping("/api/debts/customers/{id}/act/xlsx")
    @PreAuthorize("hasAuthority('cdebt.view')")
    @Operation(summary = "Akt sverka (mijoz) — Excel (O17)")
    ResponseEntity<byte[]> customerActXlsx(@PathVariable long id, @RequestParam long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String lang, @RequestParam(defaultValue = "true") boolean letter) {
        return actPdf.xlsxResponse(actDocs.build(actor(), Side.CUSTOMER, branchId, id, from, to, lang, null, null, null, letter));
    }

    @GetMapping("/api/debts/suppliers/{id}/act/xlsx")
    @PreAuthorize("hasAuthority('sdebt.view')")
    @Operation(summary = "Akt sverka (yetkazib beruvchi) — Excel (O17)")
    ResponseEntity<byte[]> supplierActXlsx(@PathVariable long id, @RequestParam long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String lang, @RequestParam(defaultValue = "true") boolean letter) {
        return actPdf.xlsxResponse(actDocs.build(actor(), Side.SUPPLIER, branchId, id, from, to, lang, null, null, null, letter));
    }
}
