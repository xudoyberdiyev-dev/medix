package uz.yuzplus.identity.setup;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import uz.yuzplus.identity.employee.Employees;
import uz.yuzplus.identity.organization.Organization;
import uz.yuzplus.inventory.Warehouses;

/** Usta holati: frontend qadamlarni shu bo'yicha ko'rsatadi. */
record SetupStatus(
        boolean completed,
        @Schema(nullable = true) Organization.Company company,
        List<Organization.Branch> branches,
        List<Warehouses.Warehouse> warehouses,
        List<Employees.Employee> employees,
        @Schema(description = "Yakunlashga to'sqinlik qilayotgan sabablar (i18n matni)") List<String> blockers) {}
