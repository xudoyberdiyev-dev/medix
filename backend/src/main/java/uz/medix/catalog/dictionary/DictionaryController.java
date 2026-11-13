package uz.medix.catalog.dictionary;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;

/**
 * Kichik ma'lumotnomalar (Ma'lumotnomalar → ...). Ko'rish — har bir kirgan xodim; o'zgartirish — tur bo'yicha ruxsat kaliti
 * ({@link #editPermission}).
 */
@RestController
@RequestMapping("/api/dictionaries/{kind}")
@Tag(name = "dictionaries", description = "Kichik ma'lumotnomalar")
class DictionaryController {


    record EntryRequest(
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @Schema(nullable = true, description = "Birlik — qisqa yozuvi, davlat — ISO kodi (UZ)") @Size(max = 50) String shortName,
            @Schema(nullable = true, description = "Faqat birlik — soliq klassifikatori kodi (raqam)") @Size(max = 10) String code) {}

    private final Dictionaries dictionaries;

    /** Ruxsat kaliti (1.3): ishlab chiqaruvchi va davlat — lookups.makers, kategoriya — lookups.cats, birlik — lookups.units, hudud — lookups.regions. */
    static String editPermission(DictionaryKind kind) {
        return switch (kind) {
            case MANUFACTURER, COUNTRY -> "lookups.makers";
            case CATEGORY -> "lookups.cats";
            case UNIT -> "lookups.units";
            case REGION -> "lookups.regions";
        };
    }

    private static void requireEdit(Authentication auth, DictionaryKind kind) {
        String key = editPermission(kind);
        if (auth.getAuthorities().stream().noneMatch(a -> key.equals(a.getAuthority()))) {
            throw MedixException.forbidden("auth.forbidden");
        }
    }

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
    @Operation(summary = "Yozuv qo'shish")
    Dictionaries.Entry create(@PathVariable DictionaryKind kind, @Valid @RequestBody EntryRequest r, Authentication auth) {
        requireEdit(auth, kind);
        return dictionaries.create(kind, r.name(), r.shortName(), r.code());
    }

    @PutMapping("/{id}")
    @Operation(summary = "Yozuvni tahrirlash")
    Dictionaries.Entry update(@PathVariable DictionaryKind kind, @PathVariable long id, @Valid @RequestBody EntryRequest r,
            Authentication auth) {
        requireEdit(auth, kind);
        return dictionaries.update(kind, id, r.name(), r.shortName(), r.code());
    }

    @PostMapping("/{id}/deactivate")
    @Operation(summary = "Nofaol qilish", description = "Yozuv o'chirilmaydi; yangi hujjatlarda tanlanmaydi.")
    Dictionaries.Entry deactivate(@PathVariable DictionaryKind kind, @PathVariable long id, Authentication auth) {
        requireEdit(auth, kind);
        return dictionaries.setActive(kind, id, false);
    }

    @PostMapping("/{id}/activate")
    @Operation(summary = "Faollashtirish")
    Dictionaries.Entry activate(@PathVariable DictionaryKind kind, @PathVariable long id, Authentication auth) {
        requireEdit(auth, kind);
        return dictionaries.setActive(kind, id, true);
    }
}
