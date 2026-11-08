package uz.medix.identity.organization;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
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
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Filiallar: ro'yxat — har bir kirgan xodim uchun (filial doirasi bilan); qo'shish, tahrirlash, nofaol qilish —
 * Direktor va Bosh administrator (SPEC 3, Boshqaruv → Filiallar). Filial kodi yaratilgandan keyin o'zgarmaydi —
 * u hujjat raqamlarida ishlatiladi ({@code BY-TSH-000355}).
 */
@RestController
@RequestMapping("/api/branches")
@Tag(name = "branches", description = "Filiallar")
class BranchController {

    record CreateBranchRequest(
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[A-Za-z]{3}$", message = "{validation.branchCode}") String code,
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @NotBlank(message = "{validation.required}") @Size(max = 300) String legalName,
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[0-9]{9}$", message = "{validation.tin}") String tin,
            @Schema(nullable = true) @Size(max = 500) String address,
            @Schema(nullable = true) @Size(max = 32) String phone,
            @Schema(nullable = true, description = "null — qoʻshimchalar oʻzgarmaydi") Boolean vatPayer,
            @Schema(nullable = true) @Pattern(regexp = "^[0-9]{6,20}$", message = "{validation.vatCertNo}") String vatCertNo,
            @Schema(nullable = true) @Size(max = 100) String region,
            @Schema(nullable = true) @Size(max = 500) String actualAddress,
            @Schema(nullable = true) @Size(max = 200) String directorName,
            @Schema(nullable = true) @Size(max = 200) String accountantName,
            @Schema(nullable = true) @Size(max = 10) List<@Valid Organization.BankAccount> bankAccounts) {

        Organization.BranchExtra extra() {
            return vatPayer == null
                    ? null
                    : new Organization.BranchExtra(vatPayer, vatCertNo, region, actualAddress, directorName, accountantName, bankAccounts);
        }
    }

    record UpdateBranchRequest(
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @NotBlank(message = "{validation.required}") @Size(max = 300) String legalName,
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[0-9]{9}$", message = "{validation.tin}") String tin,
            @Schema(nullable = true) @Size(max = 500) String address,
            @Schema(nullable = true) @Size(max = 32) String phone,
            @Schema(nullable = true, description = "null — qoʻshimchalar oʻzgarmaydi") Boolean vatPayer,
            @Schema(nullable = true) @Pattern(regexp = "^[0-9]{6,20}$", message = "{validation.vatCertNo}") String vatCertNo,
            @Schema(nullable = true) @Size(max = 100) String region,
            @Schema(nullable = true) @Size(max = 500) String actualAddress,
            @Schema(nullable = true) @Size(max = 200) String directorName,
            @Schema(nullable = true) @Size(max = 200) String accountantName,
            @Schema(nullable = true) @Size(max = 10) List<@Valid Organization.BankAccount> bankAccounts) {

        Organization.BranchExtra extra() {
            return vatPayer == null
                    ? null
                    : new Organization.BranchExtra(vatPayer, vatCertNo, region, actualAddress, directorName, accountantName, bankAccounts);
        }
    }

    record DeactivateRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    private final Organization organization;
    private final CurrentActor currentActor;

    BranchController(Organization organization, CurrentActor currentActor) {
        this.organization = organization;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @Operation(summary = "Ko'rish mumkin bo'lgan filiallar")
    List<Organization.Branch> list() {
        Actor actor = actor();
        return organization.branches().stream().filter(b -> actor.canAccessBranch(b.id())).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('branches.view')")
    @Operation(summary = "Filial qo'shish")
    Organization.Branch create(@Valid @RequestBody CreateBranchRequest r) {
        return organization.createBranch(new Organization.BranchData(r.code(), r.name(), r.legalName(), r.tin(), r.address(), r.phone(), r.extra()));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('branches.view')")
    @Operation(summary = "Filialni tahrirlash", description = "Kod o'zgarmaydi.")
    Organization.Branch update(@PathVariable long id, @Valid @RequestBody UpdateBranchRequest r) {
        Organization.Branch current = scoped(id);
        return organization.updateBranch(id,
                new Organization.BranchData(current.code(), r.name(), r.legalName(), r.tin(), r.address(), r.phone(), r.extra()));
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize("hasAuthority('branches.view')")
    @Operation(summary = "Filialni nofaol qilish", description = "Oxirgi faol filial nofaol qilinmaydi.")
    Organization.Branch deactivate(@PathVariable long id, @Valid @RequestBody DeactivateRequest r) {
        scoped(id);
        return organization.setActive(id, false, r.reason());
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize("hasAuthority('branches.view')")
    @Operation(summary = "Filialni faollashtirish")
    Organization.Branch activate(@PathVariable long id) {
        scoped(id);
        return organization.setActive(id, true, null);
    }

    /** Boshqa filialga murojaat — 404 (mavjudligi oshkor qilinmaydi). */
    private Organization.Branch scoped(long id) {
        Actor a = actor();
        return organization.branch(id)
                .filter(b -> a.canAccessBranch(b.id()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }
}
