package uz.medix.identity.setup;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Set;
import uz.medix.inventory.ZoneType;

/** Sozlash ustasi so'rovlari. */
final class SetupRequests {

    private SetupRequests() {}

    /** {@code defaultLocale} — tizimning asosiy tili; null — oʻzgarmaydi (yangi kompaniyada uz-Latn). */
    record CompanyRequest(
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @Schema(nullable = true) @Pattern(regexp = "^(uz-Latn|uz-Cyrl|ru)$", message = "{validation.locale}") String defaultLocale) {}

    record BranchRequest(
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[A-Za-z]{3}$", message = "{validation.branchCode}") String code,
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @NotBlank(message = "{validation.required}") @Size(max = 300) String legalName,
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[0-9]{9}$", message = "{validation.tin}") String tin,
            @Schema(nullable = true) @Size(max = 500) String address,
            @Schema(nullable = true) @Size(max = 32) String phone) {}

    record WarehouseRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @Schema(nullable = true) @Size(max = 500) String address,
            @Schema(nullable = true) Set<ZoneType> extraZones) {}

    record EmployeeRequest(
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^[A-Za-z0-9._-]{3,64}$", message = "{validation.login}") String login,
            @NotBlank(message = "{validation.required}") @Size(max = 200) String fullName,
            @Schema(nullable = true) @Size(max = 32) String phone,
            @Schema(nullable = true) @Size(max = 100) String position,
            @NotBlank(message = "{validation.required}") String roleCode,
            @Schema(nullable = true) Long branchId,
            @NotBlank(message = "{validation.required}") @Size(min = 8, max = 128, message = "{validation.password.length}") String temporaryPassword) {}
}
