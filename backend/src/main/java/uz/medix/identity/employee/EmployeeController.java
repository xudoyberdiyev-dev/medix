package uz.medix.identity.employee;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** Xodimlar boshqaruvi — Direktor va Bosh administrator (SPEC 3). Filial doirasi serverda. */
@RestController
@RequestMapping("/api/employees")
@PreAuthorize("hasAuthority('staff.view')")
@Tag(name = "employees", description = "Xodimlar")
class EmployeeController {

    record CreateEmployeeRequest(
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[A-Za-z0-9._-]{3,64}$", message = "{validation.login}") String login,
            @Schema(nullable = true, description = "Boʻsh boʻlsa — «Ism Familiya» qismlardan") @Size(max = 200) String fullName,
            @Schema(nullable = true) @Size(max = 100) String lastName,
            @Schema(nullable = true) @Size(max = 100) String firstName,
            @Schema(nullable = true) @Size(max = 100) String middleName,
            @Schema(nullable = true) @Size(max = 32) String phone,
            @Schema(nullable = true) @Size(max = 100) String position,
            @NotBlank(message = "{validation.required}") String roleCode,
            @Schema(nullable = true) Long branchId,
            @NotBlank(message = "{validation.required}") @Size(min = 8, max = 128, message = "{validation.password.length}") String temporaryPassword,
            @Schema(nullable = true) List<Long> warehouseIds,
            @Schema(nullable = true) List<Long> cashAccountIds) {}

    record UpdateEmployeeRequest(
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[A-Za-z0-9._-]{3,64}$", message = "{validation.login}") String login,
            @NotBlank(message = "{validation.required}") @Size(max = 100) String lastName,
            @NotBlank(message = "{validation.required}") @Size(max = 100) String firstName,
            @Schema(nullable = true) @Size(max = 100) String middleName,
            @Schema(nullable = true) @Size(max = 32) String phone,
            @Schema(nullable = true) @Size(max = 100) String position,
            @NotBlank(message = "{validation.required}") String roleCode,
            @Schema(nullable = true) Long branchId,
            @Schema(nullable = true) List<Long> warehouseIds,
            @Schema(nullable = true) List<Long> cashAccountIds) {}

    record BlockRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record ResetPasswordRequest(
            @NotBlank(message = "{validation.required}") @Size(min = 8, max = 128, message = "{validation.password.length}") String temporaryPassword) {}

    record AllBranchesRequest(@NotNull(message = "{validation.required}") Boolean enabled) {}

    private final Employees employees;
    private final CurrentActor currentActor;

    EmployeeController(Employees employees, CurrentActor currentActor) {
        this.employees = employees;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @Operation(summary = "Xodimlar ro'yxati")
    List<Employees.Employee> list() {
        return employees.list(actor());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('staff.edit')")
    @Operation(summary = "Xodim qo'shish")
    Employees.Employee create(@Valid @RequestBody CreateEmployeeRequest r) {
        Actor a = actor();
        if (!a.allBranches() && (r.branchId() == null || !a.canAccessBranch(r.branchId()))) {
            throw MedixException.forbidden("auth.forbidden");
        }
        return employees.create(new Employees.NewEmployee(r.login(), r.fullName(), r.lastName(), r.firstName(), r.middleName(),
                r.phone(), r.position(), r.roleCode(), r.branchId(), r.temporaryPassword(), r.warehouseIds(), r.cashAccountIds()));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('staff.edit')")
    @Operation(summary = "Xodimni tahrirlash", description = "Login, rol yoki filial oʻzgarsa ochiq sessiyalari tugatiladi.")
    Employees.Employee update(@PathVariable long id, @Valid @RequestBody UpdateEmployeeRequest r) {
        Actor a = actor();
        if (!a.allBranches() && (r.branchId() == null || !a.canAccessBranch(r.branchId()))) {
            throw MedixException.forbidden("auth.forbidden");
        }
        return employees.update(a, id, new Employees.EmployeeChange(r.login(), r.lastName(), r.firstName(), r.middleName(),
                r.phone(), r.position(), r.roleCode(), r.branchId(), r.warehouseIds(), r.cashAccountIds()));
    }

    @GetMapping("/login-check")
    @PreAuthorize("hasAuthority('staff.edit')")
    @Operation(summary = "Login taklifi va boʻshligi")
    Employees.LoginCheck loginCheck(@RequestParam(required = false) String firstName, @RequestParam(required = false) String lastName,
            @RequestParam(required = false) String login, @RequestParam(required = false) Long exceptId) {
        return employees.checkLogin(firstName, lastName, login, exceptId);
    }

    @GetMapping("/seats")
    @Operation(summary = "Xodim oʻrinlari (bloklanmaganlar / litsenziya chegarasi)")
    Employees.Seats seats() {
        return employees.seats();
    }

    @PostMapping("/{id}/block")
    @PreAuthorize("hasAuthority('staff.edit')")
    @Operation(summary = "Xodimni bloklash", description = "Ochiq sessiyalari darhol tugatiladi.")
    Employees.Employee block(@PathVariable long id, @Valid @RequestBody BlockRequest r) {
        return employees.block(actor(), id, r.reason());
    }

    @PostMapping("/{id}/unblock")
    @PreAuthorize("hasAuthority('staff.edit')")
    @Operation(summary = "Blokdan chiqarish")
    Employees.Employee unblock(@PathVariable long id) {
        return employees.unblock(actor(), id);
    }

    @PostMapping("/{id}/reset-password")
    @PreAuthorize("hasAuthority('staff.edit')")
    @Operation(summary = "Vaqtinchalik parol berish")
    Employees.Employee resetPassword(@PathVariable long id, @Valid @RequestBody ResetPasswordRequest r) {
        return employees.resetPassword(actor(), id, r.temporaryPassword());
    }

    @PostMapping("/{id}/all-branches")
    @PreAuthorize("hasRole('DIRECTOR')")
    @Operation(summary = "Buxgalterga barcha filiallar doirasi (faqat Direktor)",
            description = "Standart holatda Buxgalter faqat o'z filialini ko'radi (E3). Ochiq sessiyalari tugatiladi.")
    Employees.Employee allBranches(@PathVariable long id, @Valid @RequestBody AllBranchesRequest r) {
        return employees.setAllBranches(actor(), id, r.enabled());
    }

    @GetMapping("/{id}/journal")
    @Operation(summary = "Xodim kartasi: kirishlar, harakatlar, sessiyalar, PIN holati")
    Employees.Journal journal(@PathVariable long id) {
        return employees.journal(actor(), id);
    }

    record EndSessionsResult(int ended) {}

    @PostMapping("/{id}/end-sessions")
    @PreAuthorize("hasAuthority('staff.edit')")
    @Operation(summary = "Ochiq sessiyalarni tugatish")
    EndSessionsResult endSessions(@PathVariable long id) {
        return new EndSessionsResult(employees.endSessions(actor(), id));
    }

    @PostMapping("/{id}/reset-pin")
    @PreAuthorize("hasAuthority('staff.edit')")
    @Operation(summary = "PIN-kodni bekor qilish (xodim yangisini oʻrnatadi)")
    Employees.Employee resetPin(@PathVariable long id) {
        return employees.resetPin(actor(), id);
    }
}
