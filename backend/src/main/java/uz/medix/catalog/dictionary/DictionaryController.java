package uz.medix.catalog.dictionary;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Kichik ma'lumotnomalar (Ma'lumotnomalar → ...). Ko'rish — har bir kirgan xodim; o'zgartirish — Direktor,
 * Bosh administrator va Xarid (ruxsatlar matritsasi 1.3 kelguncha rol bo'yicha).
 */
@RestController
@RequestMapping("/api/dictionaries/{kind}")
@Tag(name = "dictionaries", description = "Kichik ma'lumotnomalar")
class DictionaryController {

    private static final String MANAGE = "hasAnyRole('DIRECTOR', 'ADMIN', 'PURCHASER')";

    record EntryRequest(
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @Schema(nullable = true, description = "Birlik — qisqa yozuvi, davlat — ISO kodi (UZ)") @Size(max = 50) String shortName) {}

    private final Dictionaries dictionaries;

    DictionaryController(Dictionaries dictionaries) {
        this.dictionaries = dictionaries;
    }

    @GetMapping
    @Operation(summary = "Ma'lumotnoma yozuvlari (faollari birinchi)")
    List<Dictionaries.Entry> list(@PathVariable DictionaryKind kind) {
        return dictionaries.list(kind);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(MANAGE)
    @Operation(summary = "Yozuv qo'shish")
    Dictionaries.Entry create(@PathVariable DictionaryKind kind, @Valid @RequestBody EntryRequest r) {
        return dictionaries.create(kind, r.name(), r.shortName());
    }

    @PutMapping("/{id}")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Yozuvni tahrirlash")
    Dictionaries.Entry update(@PathVariable DictionaryKind kind, @PathVariable long id, @Valid @RequestBody EntryRequest r) {
        return dictionaries.update(kind, id, r.name(), r.shortName());
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Nofaol qilish", description = "Yozuv o'chirilmaydi; yangi hujjatlarda tanlanmaydi.")
    Dictionaries.Entry deactivate(@PathVariable DictionaryKind kind, @PathVariable long id) {
        return dictionaries.setActive(kind, id, false);
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Faollashtirish")
    Dictionaries.Entry activate(@PathVariable DictionaryKind kind, @PathVariable long id) {
        return dictionaries.setActive(kind, id, true);
    }
}
