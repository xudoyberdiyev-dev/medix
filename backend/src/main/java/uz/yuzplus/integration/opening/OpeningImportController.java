package uz.yuzplus.integration.opening;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import uz.yuzplus.integration.opening.OpeningImportModels.OpeningImportPreview;
import uz.yuzplus.integration.opening.OpeningImportModels.OpeningImportResult;
import uz.yuzplus.shared.error.YuzplusException;
import uz.yuzplus.shared.security.Actor;
import uz.yuzplus.shared.security.CurrentActor;

/**
 * BQ1 — «SmartUp dan ko'chirish»: bitta Excel fayl (varaqlar: Tovar, Mijozlar qarzi, YB qarzi, Kassa va bank). Ruxsat — opening.create;
 * tovar varag'i — qo'shimcha opening.goods; «Hammasini o'tkazish» — opening.approve. Filial doirasi serverda.
 */
@RestController
@RequestMapping("/api/opening-import")
@Tag(name = "opening-import", description = "Boshlang'ich qoldiq — bitta fayl bilan ko'chirish")
class OpeningImportController {

    private final OpeningImports imports;
    private final CurrentActor currentActor;

    OpeningImportController(OpeningImports imports, CurrentActor currentActor) {
        this.imports = imports;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> YuzplusException.unauthorized("auth.unauthorized"));
    }

    private static boolean has(Authentication auth, String key) {
        return auth.getAuthorities().stream().anyMatch(a -> key.equals(a.getAuthority()));
    }

    private static OpeningImports.Rights rights(Authentication auth) {
        return new OpeningImports.Rights(has(auth, "opening.goods"), has(auth, "special.cost"), has(auth, "opening.approve"));
    }

    private static void checkSize(MultipartFile file) {
        if (file.isEmpty()) {
            throw YuzplusException.badRequest("import.empty");
        }
        if (file.getSize() > OpeningImportModels.MAX_FILE_BYTES) {
            throw YuzplusException.badRequest("openingImport.tooLarge", 10);
        }
    }

    @GetMapping("/template")
    @PreAuthorize("hasAuthority('opening.create')")
    @Operation(summary = "Shablon (.xlsx, 4 varaq)")
    void template(HttpServletResponse response) throws IOException {
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"boshlangich-qoldiq-bitta-fayl.xlsx\"");
        OpeningImportTemplate.write(response.getOutputStream());
    }

    @PostMapping(path = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority('opening.create')")
    @Operation(summary = "Faylni tekshirish", description = "Hech narsa yozilmaydi: bo'limlar jami, filial/ombor guruhlari, xato va ogohlantirishlar.")
    OpeningImportPreview preview(@RequestPart("file") MultipartFile file,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate cutoffDate, Authentication auth) throws IOException {
        checkSize(file);
        try (InputStream in = file.getInputStream()) {
            return imports.preview(actor(), rights(auth), in, file.getOriginalFilename(), cutoffDate);
        }
    }

    @PostMapping(path = "/apply", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority('opening.create')")
    @Operation(summary = "Qoralamalarni yaratish (va o'tkazish)",
            description = "Xato bo'lmasa — bitta tranzaksiyada: har ombor uchun tovar BQ, har filial×tur uchun pul BQ qoralamasi (mavjud qoralama "
                    + "almashtiriladi). post=true — hammasi o'tkaziladi (opening.approve).")
    OpeningImportResult apply(@RequestPart("file") MultipartFile file,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate cutoffDate,
            @RequestParam(defaultValue = "false") boolean post, Authentication auth) throws IOException {
        checkSize(file);
        try (InputStream in = file.getInputStream()) {
            return imports.apply(actor(), rights(auth), in, file.getOriginalFilename(), cutoffDate, post);
        }
    }
}
