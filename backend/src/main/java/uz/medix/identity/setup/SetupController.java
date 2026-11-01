package uz.medix.identity.setup;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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
import uz.medix.identity.employee.Employees;
import uz.medix.identity.organization.Organization;
import uz.medix.inventory.Warehouses;

/** Sozlash ustasi API — faqat CEO (Direktor roli), faqat birinchi ishga tushirishda. */
@RestController
@RequestMapping("/api/setup")
@PreAuthorize("hasRole('DIRECTOR')")
@Tag(name = "setup", description = "Sozlash ustasi")
class SetupController {

    private final SetupService setup;

    SetupController(SetupService setup) {
        this.setup = setup;
    }

    @GetMapping
    @Operation(summary = "Usta holati")
    SetupStatus status() {
        return setup.status();
    }

    @PutMapping("/company")
    @Operation(summary = "Kompaniya nomini saqlash")
    Organization.Company company(@Valid @RequestBody SetupRequests.CompanyRequest body) {
        return setup.saveCompany(body);
    }

    @PostMapping("/branches")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Filial qo'shish")
    Organization.Branch createBranch(@Valid @RequestBody SetupRequests.BranchRequest body) {
        return setup.createBranch(body);
    }

    @PutMapping("/branches/{id}")
    @Operation(summary = "Filialni tahrirlash")
    Organization.Branch updateBranch(@PathVariable long id, @Valid @RequestBody SetupRequests.BranchRequest body) {
        return setup.updateBranch(id, body);
    }

    @PostMapping("/warehouses")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Ombor va zonalarni qo'shish")
    Warehouses.Warehouse createWarehouse(@Valid @RequestBody SetupRequests.WarehouseRequest body) {
        return setup.createWarehouse(body);
    }

    @PostMapping("/employees")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Xodim qo'shish (vaqtinchalik parol bilan)")
    Employees.Employee createEmployee(@Valid @RequestBody SetupRequests.EmployeeRequest body) {
        return setup.createEmployee(body);
    }

    @PostMapping("/complete")
    @Operation(summary = "Ustani yakunlash")
    SetupStatus complete() {
        return setup.complete();
    }
}
