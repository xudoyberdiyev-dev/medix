package uz.medix.identity.setup;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Set;
import uz.medix.inventory.ZoneType;

/** Sozlash ustasi so'rovlari. */
final class SetupRequests {

    private SetupRequests() {}

    record CompanyRequest(@NotBlank(message = "{validation.required}") @Size(max = 200) String name) {}

    record BranchRequest(
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[A-Za-z]{3}$", message = "{validation.branchCode}") String code,
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @NotBlank(message = "{validation.required}") @Size(max = 300) String legalName,
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[0-9]{9}$", message = "{validation.tin}") String tin,
            @Size(max = 500) String address,
            @Size(max = 32) String phone) {}

    record WarehouseRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @Size(max = 500) String address,
            Set<ZoneType> extraZones) {}

    record EmployeeRequest(
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[A-Za-z0-9._-]{3,64}$", message = "{validation.login}") String login,
            @NotBlank(message = "{validation.required}") @Size(max = 200) String fullName,
            @Size(max = 32) String phone,
            @Size(max = 100) String position,
            @NotBlank(message = "{validation.required}") String roleCode,
            Long branchId,
            @NotBlank(message = "{validation.required}") @Size(min = 8, max = 128, message = "{validation.password.length}") String temporaryPassword) {}
}
