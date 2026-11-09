package uz.medix.identity.setup;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.Set;
import uz.medix.identity.organization.Organization;
import uz.medix.inventory.WarehouseKind;
import uz.medix.inventory.ZoneType;

/** Sozlash ustasi so'rovlari. */
final class SetupRequests {

    private SetupRequests() {}

    /** {@code defaultLocale} — tizimning asosiy tili; null — oʻzgarmaydi (yangi kompaniyada uz-Latn). */
    record CompanyRequest(
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @Schema(nullable = true) @Pattern(regexp = "^(uz-Latn|uz-Cyrl|ru)$", message = "{validation.locale}") String defaultLocale) {}

    record BranchRequest(
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[A-Za-z]{2,4}$", message = "{validation.branchCode}") String code,
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
            @Valid @Schema(nullable = true) @Size(max = 10) List<Organization.BankAccount> bankAccounts) {

        Organization.BranchExtra extra() {
            return vatPayer == null
                    ? null
                    : new Organization.BranchExtra(vatPayer, vatCertNo, region, actualAddress, directorName, accountantName, bankAccounts);
        }
    }

    record WarehouseRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @Schema(nullable = true) @Size(max = 500) String address,
            @Schema(nullable = true) Set<ZoneType> extraZones,
            @Schema(nullable = true, description = "Ombor turi; berilmasa — NORMAL") WarehouseKind kind,
            @Schema(nullable = true, description = "Masʼul ombor mudiri (shu filial xodimi)") Long keeperId,
            @Schema(nullable = true, description = "Zona nomlari turi boʻyicha; berilmagani — standart nom")
            Map<ZoneType, String> zoneNames) {}

    record EmployeeRequest(
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[A-Za-z0-9._-]{3,64}$", message = "{validation.login}") String login,
            @NotBlank(message = "{validation.required}") @Size(max = 200) String fullName,
            @Schema(nullable = true) @Size(max = 32) String phone,
            @Schema(nullable = true) @Size(max = 100) String position,
            @NotBlank(message = "{validation.required}") String roleCode,
            @Schema(nullable = true) Long branchId,
            @NotBlank(message = "{validation.required}") @Size(min = 8, max = 128, message = "{validation.password.length}") String temporaryPassword) {}
}
