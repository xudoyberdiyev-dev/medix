package uz.medix.inventory.opening;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.io.InputStream;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import uz.medix.inventory.opening.OpeningModels.ImportResult;
import uz.medix.inventory.opening.OpeningModels.OpeningDetail;
import uz.medix.inventory.opening.OpeningModels.OpeningPage;
import uz.medix.inventory.opening.OpeningModels.OpeningRequest;
import uz.medix.inventory.opening.OpeningModels.ReasonRequest;
import uz.medix.inventory.opening.OpeningModels.Status;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * BQ — boshlang'ich qoldiq (tovar). Ruxsatlar (T12): yaratish — opening.create + opening.goods, o'tkazish — opening.approve,
 * o'tkazilganni bekor qilish — opening.cancel (Direktor). Filial doirasi serverda; tannarx faqat special.cost bilan.
 */
@RestController
@RequestMapping("/api/opening-balances")
@Tag(name = "opening", description = "Boshlang'ich qoldiq")
class OpeningController {

    private static final String EDIT = "hasAuthority('opening.create') and hasAuthority('opening.goods')";

    private final OpeningBalances openings;
    private final OpeningExcel excel;
    private final CurrentActor currentActor;

    OpeningController(OpeningBalances openings, OpeningExcel excel, CurrentActor currentActor) {
        this.openings = openings;
        this.excel = excel;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private static boolean has(Authentication auth, String key) {
        return auth.getAuthorities().stream().anyMatch(a -> key.equals(a.getAuthority()));
    }

    private OpeningDetail detail(long id, Authentication auth) {
        return openings.find(id, actor(), has(auth, "special.cost")).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('opening.list', 'opening.view')")
    @Operation(summary = "BQ hujjatlari")
    OpeningPage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Status status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            Authentication auth) {
        return openings.list(actor(), branchId, status, Math.max(page, 0), Math.clamp(size, 1, 200), has(auth, "special.cost"));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('opening.list', 'opening.view')")
    @Operation(summary = "BQ hujjati")
    OpeningDetail get(@PathVariable long id, Authentication auth) {
        return detail(id, auth);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(EDIT)
    @Operation(summary = "BQ qoralamasi", description = "Raqam darhol beriladi (BQ-TSH-000001). Qoralama qoldiqqa ta'sir qilmaydi.")
    OpeningDetail create(@Valid @RequestBody OpeningRequest r, Authentication auth) {
        return detail(openings.create(actor(), r), auth);
    }

    @PutMapping("/{id}")
    @PreAuthorize(EDIT)
    @Operation(summary = "Qoralamani tahrirlash", description = "Qatorlar to'liq almashtiriladi.")
    OpeningDetail update(@PathVariable long id, @Valid @RequestBody OpeningRequest r, Authentication auth) {
        openings.update(actor(), id, r);
        return detail(id, auth);
    }

    @PostMapping("/{id}/post")
    @PreAuthorize("hasAuthority('opening.approve')")
    @Operation(summary = "O'tkazish", description = "Partiyalar yaratiladi va qoldiqqa kirim yoziladi (bitta tranzaksiya).")
    OpeningDetail post(@PathVariable long id, Authentication auth) {
        openings.post(actor(), id);
        return detail(id, auth);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('opening.cancel') or (hasAuthority('opening.create') and hasAuthority('opening.goods'))")
    @Operation(summary = "Bekor qilish",
            description = "Qoralama — yaratish ruxsati bilan. O'tkazilgan — faqat opening.cancel, partiyalar ishlatilmagan bo'lsa.")
    OpeningDetail cancel(@PathVariable long id, @Valid @RequestBody ReasonRequest r, Authentication auth) {
        openings.cancel(actor(), id, r.reason(), has(auth, "opening.cancel"));
        return detail(id, auth);
    }

    @GetMapping("/import-template")
    @PreAuthorize(EDIT)
    @Operation(summary = "Import shabloni (.xlsx)")
    void template(HttpServletResponse response) throws IOException {
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"boshlangich-qoldiq-shablon.xlsx\"");
        excel.template(response.getOutputStream());
    }

    @PostMapping(path = "/{id}/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(EDIT)
    @Operation(summary = "Qatorlarni Excel'dan yuklash",
            description = "apply=false — faqat tekshiruv. apply=true — xato bo'lmasa qoralama qatorlari almashtiriladi (hammasi yoki hech narsa).")
    ImportResult importFile(@PathVariable long id, @RequestPart("file") MultipartFile file,
            @RequestParam(defaultValue = "false") boolean apply) throws IOException {
        try (InputStream in = file.getInputStream()) {
            return excel.importFile(actor(), id, in, file.getOriginalFilename(), apply);
        }
    }
}
