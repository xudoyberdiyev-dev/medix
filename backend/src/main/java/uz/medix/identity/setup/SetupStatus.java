package uz.medix.identity.setup;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import uz.medix.identity.employee.Employees;
import uz.medix.identity.organization.Organization;
import uz.medix.inventory.Warehouses;

/** Usta holati: frontend qadamlarni shu bo'yicha ko'rsatadi. */
record SetupStatus(
        boolean completed,
        @Schema(nullable = true) Organization.Company company,
        List<Organization.Branch> branches,
        List<Warehouses.Warehouse> warehouses,
        List<Employees.Employee> employees,
        @Schema(description = "Yakunlashga to'sqinlik qilayotgan sabablar (i18n matni)") List<String> blockers) {}
