package uz.medix.identity.role;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
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

    @GetMapping
    @PreAuthorize("hasAnyRole('DIRECTOR', 'ADMIN')")
    @Operation(summary = "Rollar ro'yxati")
    List<Roles.Role> list() {
        return roles.list();
    }
}
