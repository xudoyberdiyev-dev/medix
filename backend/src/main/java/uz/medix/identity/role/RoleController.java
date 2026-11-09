package uz.medix.identity.role;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/roles")
@Tag(name = "roles", description = "Rollar va ruxsatlar")
class RoleController {

    private final Roles roles;

    RoleController(Roles roles) {
        this.roles = roles;
    }

    record PermissionsRequest(@NotNull(message = "{validation.required}") Set<String> permissions) {}

    record CopyRequest(@NotBlank(message = "{validation.required}") @Size(max = 100) String name) {}

    @GetMapping("/matrix")
    @PreAuthorize("hasAuthority('roles.view')")
    @Operation(summary = "Ruxsatlar matritsasi", description = "Barcha rollar, 132 ruxsat kaliti va rol → kalitlar.")
    Roles.Matrix matrix() {
        return roles.matrix();
    }

    record SaveRequest(@NotNull(message = "{validation.required}") List<Roles.RoleDraft> roles) {}

    @PutMapping("/matrix")
    @PreAuthorize("hasAuthority('roles.view')")
    @Operation(summary = "Matritsani saqlash", description = "Rollar (nom, tavsif, doira, bosh sahifa, faollik), ruxsatlar va yangi rollar — "
            + "bitta tranzaksiyada. Direktor roli o'zgarmaydi. Xodimning keyingi kirishida kuchga kiradi.")
    Roles.Matrix save(@Valid @RequestBody SaveRequest r) {
        return roles.save(r.roles());
    }

    @PutMapping("/{code}/permissions")
    @PreAuthorize("hasAuthority('roles.view')")
    @Operation(summary = "Rol ruxsatlarini saqlash", description = "Direktor roli himoyalangan. Xodimning keyingi kirishida kuchga kiradi.")
    Roles.Matrix setPermissions(@PathVariable String code, @Valid @RequestBody PermissionsRequest r) {
        roles.setPermissions(code, r.permissions());
        return roles.matrix();
    }

    @PostMapping("/{code}/copy")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('roles.view')")
    @Operation(summary = "Rol nusxasi")
    Roles.Role copy(@PathVariable String code, @Valid @RequestBody CopyRequest r) {
        return roles.copy(code, r.name());
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('roles.view', 'staff.view')")
    @Operation(summary = "Rollar ro'yxati")
    List<Roles.Role> list() {
        return roles.list();
    }
}
