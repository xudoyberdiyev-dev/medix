package uz.medix.inventory.writeoff;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
import uz.medix.inventory.writeoff.WriteOffModels.Reason;
import uz.medix.inventory.writeoff.WriteOffModels.Status;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffDetail;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffPage;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffRejectRequest;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffRequest;
import uz.medix.inventory.writeoff.WriteOffModels.WriteOffStockRow;
import uz.medix.inventory.writeoff.WriteOffs.Approver;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * HC — hisobdan chiqarish. Ruxsatlar (T12): ko'rish — hc.view, yaratish — hc.create, tasdiqlash / rad etish — hc.approve; tannarx
 * summasi 5 000 000 dan katta bo'lsa — hc.director ham. Tannarx (summa) faqat prices.cost bilan. Filial doirasi serverda.
 */
@RestController
@RequestMapping("/api/write-offs")
@Tag(name = "write-off", description = "Hisobdan chiqarish (HC)")
class WriteOffController {

    private static final String VIEW = "hasAnyAuthority('hc.view', 'hc.create', 'hc.approve')";

    private final WriteOffs writeOffs;
    private final WriteOffPdf pdf;
    private final CurrentActor currentActor;

    WriteOffController(WriteOffs writeOffs, WriteOffPdf pdf, CurrentActor currentActor) {
        this.writeOffs = writeOffs;
        this.pdf = pdf;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private static boolean has(Authentication auth, String permission) {
        return auth.getAuthorities().stream().anyMatch(a -> permission.equals(a.getAuthority()));
    }

    private static Approver approver(Authentication auth) {
        return new Approver(has(auth, "hc.approve"), has(auth, "hc.director"));
    }

    private WriteOffDetail detail(long id, Authentication auth) {
        WriteOffDetail d = writeOffs.find(id, actor()).orElseThrow(() -> MedixException.notFound("error.notFound"));
        return has(auth, "prices.cost") ? d : d.withoutCost();
    }

    @GetMapping
    @PreAuthorize(VIEW)
    @Operation(summary = "HC hujjatlari", description = "Tannarx summasi — faqat prices.cost.")
    WriteOffPage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) Status status,
            @RequestParam(required = false) Reason reason,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            Authentication auth) {
        WriteOffPage p = writeOffs.list(actor(), branchId, warehouseId, status, reason, Math.max(page, 0), Math.clamp(size, 1, 200));
        if (has(auth, "prices.cost")) {
            return p;
        }
        return new WriteOffPage(p.items().stream().map(s -> new WriteOffModels.WriteOffSummary(s.id(), s.number(), s.branchId(),
                s.warehouseId(), s.warehouse(), s.zone(), s.reason(), s.status(), s.needsDirector(), s.lines(), s.qty(), null, s.createdBy(),
                s.createdAt(), s.postedAt(), s.postedBy())).toList(), p.total(), p.page(), p.size());
    }

    @GetMapping("/{id}")
    @PreAuthorize(VIEW)
    @Operation(summary = "HC hujjati")
    WriteOffDetail get(@PathVariable long id, Authentication auth) {
        return detail(id, auth);
    }

    @GetMapping(value = "/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize(VIEW)
    @Operation(summary = "HC dalolatnomasi — PDF (chop etish)", description = "Tannarx ustunlari — faqat prices.cost.")
    ResponseEntity<byte[]> pdf(@PathVariable long id, Authentication auth) {
        WriteOffPdf.Rendered r = pdf.render(actor(), id, has(auth, "prices.cost"));
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(r.number() + ".pdf").build().toString())
                .body(r.body());
    }

    @GetMapping("/zone-stock")
    @PreAuthorize("hasAuthority('hc.create')")
    @Operation(summary = "Zonadagi partiyalar", description = "Hisobdan chiqarish uchun: qoldiq, faol zahira, bo'sh miqdor, muddati o'tganmi (tannarxsiz).")
    List<WriteOffStockRow> zoneStock(@RequestParam long zoneId) {
        return writeOffs.zoneStock(actor(), zoneId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('hc.create')")
    @Operation(summary = "Hisobdan chiqarish",
            description = "«Tasdiqda» holatida yaratiladi; yaratuvchida hc.approve (summa 5 000 000 dan katta bo'lsa — hc.director ham) bo'lsa darhol o'tkaziladi.")
    WriteOffDetail create(@Valid @RequestBody WriteOffRequest r, Authentication auth) {
        return detail(writeOffs.create(actor(), r, approver(auth)), auth);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('hc.approve')")
    @Operation(summary = "Tasdiqlash va o'tkazish", description = "Tovar zonadan chiqadi. Direktor darajasidagi hujjat — hc.director.")
    WriteOffDetail approve(@PathVariable long id, Authentication auth) {
        writeOffs.approve(actor(), id, approver(auth));
        return detail(id, auth);
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('hc.approve')")
    @Operation(summary = "Rad etish", description = "Tovar joyida qoladi.")
    WriteOffDetail reject(@PathVariable long id, @Valid @RequestBody WriteOffRejectRequest r, Authentication auth) {
        writeOffs.reject(actor(), id, r.reason(), approver(auth));
        return detail(id, auth);
    }
}
