package uz.medix.identity.employee;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/**
 * Xodim tanlash ro'yxati (masalan, mahsulotning ta'minot mas'uli, reys haydovchisi): faqat faol xodimlar, faqat ism va rol —
 * login, telefon va holat yuborilmaydi. Filial doirasi saqlanadi.
 */
@RestController
@RequestMapping("/api/employee-lookup")
@Tag(name = "employees", description = "Xodimlar")
class EmployeeLookupController {

    record EmployeeOption(long id, String fullName, String roleCode, String roleName) {}

    private final Employees employees;
    private final CurrentActor currentActor;

    EmployeeLookupController(Employees employees, CurrentActor currentActor) {
        this.employees = employees;
        this.currentActor = currentActor;
    }

    @GetMapping
    @Operation(summary = "Faol xodimlar (tanlash uchun)")
    List<EmployeeOption> list() {
        var actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        return employees.list(actor).stream()
                .filter(e -> "ACTIVE".equals(e.status()))
                .map(e -> new EmployeeOption(e.id(), e.fullName(), e.roleCode(), e.roleName()))
                .toList();
    }
}
