package uz.medix.pricing.change;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.pricing.change.PriceChangeModels.MarkupLine;
import uz.medix.pricing.change.PriceChangeModels.MarkupRequest;
import uz.medix.pricing.change.PriceChangeModels.PinRequest;
import uz.medix.pricing.change.PriceChangeModels.PriceChangeDetail;
import uz.medix.pricing.change.PriceChangeModels.PriceChangePage;
import uz.medix.pricing.change.PriceChangeModels.PriceChangeRequest;
import uz.medix.pricing.change.PriceChangeModels.PriceGrid;
import uz.medix.pricing.change.PriceChangeModels.PricePage;
import uz.medix.pricing.change.PriceChangeModels.PriceSort;
import uz.medix.pricing.change.PriceChangeModels.ReceiptBatches;
import uz.medix.pricing.change.PriceChangeModels.ReasonRequest;
import uz.medix.pricing.change.PriceChangeModels.Status;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Narxlar va NO hujjatlari. Narx o'rnatish — Direktor, Bosh administrator, Xarid, Filial rahbari (o'z filiali);
 * Direktor tasdig'i (tannarxdan past narx) — faqat Direktor, PIN bilan. Ruxsatlar matritsasi (1.3) kelguncha rol bo'yicha.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "pricing", description = "Narxlar")
class PriceChangeController {

    private static final String SET_PRICES = "hasAuthority('prices.create')";

    private final PriceChanges changes;
    private final PriceChangePdf pdf;
    private final CurrentActor currentActor;
    private final PriceExcel excel;

    PriceChangeController(PriceChanges changes, PriceChangePdf pdf, CurrentActor currentActor, PriceExcel excel) {
        this.changes = changes;
        this.pdf = pdf;
        this.currentActor = currentActor;
        this.excel = excel;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private PriceChangeDetail detail(long id) {
        return changes.find(id, actor(), showCost()).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static boolean showCost() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> "special.cost".equals(a.getAuthority()));
    }

    @GetMapping("/prices")
    @Operation(summary = "Amaldagi narxlar (mahsulot × narx turi)", description = "Filial va sana bo'yicha; sana berilmasa — bugun.")
    PricePage prices(
            @RequestParam long branchId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long manufacturerId,
            @RequestParam(required = false) LocalDate at,
            @RequestParam(defaultValue = "NAME") PriceSort sort,
            @RequestParam(defaultValue = "false") boolean desc,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        if (!actor().canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        return changes.prices(branchId, q, manufacturerId, at == null ? changes.today() : at, sort, desc, Math.max(page, 0),
                Math.clamp(size, 1, 200));
    }

    @GetMapping("/prices/grid")
    @PreAuthorize(SET_PRICES)
    @Operation(summary = "«Narx o'rnatish» jadvali", description = "Faol mahsulotlar × narx turi: amaldagi, kelgusi, bazaviy narx; kirim narxlari — faqat special.cost bilan.")
    PriceGrid grid(@RequestParam long branchId, @RequestParam long priceTypeId, Authentication auth) {
        return changes.grid(actor(), branchId, priceTypeId, auth.getAuthorities().stream().anyMatch(a -> "special.cost".equals(a.getAuthority())));
    }

    @GetMapping("/prices/export")
    @Operation(summary = "Amaldagi narxlar — Excel'ga eksport (.xlsx)",
            description = "Jadvaldagi filtr, sana va saralash bilan; har narx turi alohida ustun; ko'pi bilan 50 000 qator.")
    void exportPrices(
            @RequestParam long branchId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long manufacturerId,
            @RequestParam(required = false) LocalDate at,
            @RequestParam(defaultValue = "NAME") PriceSort sort,
            @RequestParam(defaultValue = "false") boolean desc,
            HttpServletResponse response) throws IOException {
        if (!actor().canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"narxlar.xlsx\"");
        excel.export(changes.prices(branchId, q, manufacturerId, at == null ? changes.today() : at, sort, desc, 0, PriceExcel.MAX_EXPORT_ROWS),
                response.getOutputStream());
    }

    @GetMapping("/price-changes")
    @Operation(summary = "NO hujjatlari")
    PriceChangePage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Status status,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) List<Long> priceTypeIds,
            @RequestParam(required = false) List<Long> branchIds,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return changes.list(actor(), new PriceChanges.ListFilter(branchId, status, q, priceTypeIds, branchIds, from, to),
                Math.max(page, 0), Math.clamp(size, 1, 200));
    }

    @GetMapping("/price-changes/{id}")
    @Operation(summary = "NO hujjati")
    PriceChangeDetail get(@PathVariable long id) {
        return detail(id);
    }

    @GetMapping(value = "/price-changes/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @Operation(summary = "NO hujjati — PDF (chop etish)")
    ResponseEntity<byte[]> pdf(@PathVariable long id) {
        byte[] body = pdf.render(actor(), id);
        String number = detail(id).number();
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(number + ".pdf").build().toString())
                .body(body);
    }

    @PostMapping("/price-changes")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(SET_PRICES)
    @Operation(summary = "NO qoralamasi", description = "Raqam darhol beriladi (NO-TSH-000001).")
    PriceChangeDetail create(@Valid @RequestBody PriceChangeRequest r) {
        return detail(changes.create(actor(), r));
    }

    @PutMapping("/price-changes/{id}")
    @PreAuthorize(SET_PRICES)
    @Operation(summary = "Qoralamani tahrirlash")
    PriceChangeDetail update(@PathVariable long id, @Valid @RequestBody PriceChangeRequest r) {
        changes.update(actor(), id, r);
        return detail(id);
    }

    @PostMapping("/price-changes/{id}/submit")
    @PreAuthorize(SET_PRICES)
    @Operation(summary = "O'tkazish", description = "Tannarxdan past narx bo'lsa — Direktor tasdig'iga, aks holda darhol kuchga kiradi.")
    PriceChangeDetail submit(@PathVariable long id, Authentication auth) {
        boolean director = auth.getAuthorities().stream().anyMatch(a -> "prices.below".equals(a.getAuthority()));
        changes.submit(actor(), id, director);
        return detail(id);
    }

    @PostMapping("/price-changes/{id}/approve")
    @PreAuthorize("hasAuthority('prices.below')")
    @Operation(summary = "Direktor tasdig'i (PIN)")
    PriceChangeDetail approve(@PathVariable long id, @Valid @RequestBody PinRequest r) {
        changes.approve(actor(), id, r.pin());
        return detail(id);
    }

    @PostMapping("/price-changes/{id}/reject")
    @PreAuthorize("hasAuthority('prices.below')")
    @Operation(summary = "Rad etish")
    PriceChangeDetail reject(@PathVariable long id, @Valid @RequestBody ReasonRequest r) {
        changes.reject(actor(), id, r.reason());
        return detail(id);
    }

    @PostMapping("/price-changes/{id}/cancel")
    @PreAuthorize(SET_PRICES)
    @Operation(summary = "Bekor qilish", description = "Faqat qoralama yoki tasdiq kutayotgan hujjat.")
    PriceChangeDetail cancel(@PathVariable long id, @Valid @RequestBody ReasonRequest r) {
        changes.cancel(actor(), id, r.reason());
        return detail(id);
    }

    @GetMapping("/price-changes/receipt-batches/{receiptId}")
    @PreAuthorize(SET_PRICES)
    @Operation(summary = "«Kirim bo'yicha»: o'tkazilgan kirim partiyalari", description = "Tannarx — faqat special.cost bilan.")
    ReceiptBatches receiptBatches(@PathVariable long receiptId, Authentication auth) {
        return changes.receiptBatches(actor(), receiptId, auth.getAuthorities().stream().anyMatch(a -> "special.cost".equals(a.getAuthority())));
    }

    @PostMapping("/price-changes/markup")
    @PreAuthorize(SET_PRICES)
    @Operation(summary = "Ommaviy ustama hisoblash", description = "Hech narsa yozilmaydi; natija NO qatorlariga qo'yiladi.")
    List<MarkupLine> markup(@Valid @RequestBody MarkupRequest r, Authentication auth) {
        return changes.markup(actor(), r, auth.getAuthorities().stream().anyMatch(a -> "special.cost".equals(a.getAuthority())));
    }
}
