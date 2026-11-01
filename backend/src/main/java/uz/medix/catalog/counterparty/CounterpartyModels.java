package uz.medix.catalog.counterparty;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

/** Kontragent API shakllari. Pul — satr ({@code "15000000.00"}), float ishlatilmaydi. */
final class CounterpartyModels {

    private CounterpartyModels() {}

    enum Role { CUSTOMER, SUPPLIER, ALL }

    enum Status { ACTIVE, BLOCKED, INACTIVE, ALL }

    enum PaymentType { CASH, TRANSFER, ONLINE }

    record Ref(long id, String name) {}

    record CounterpartyRow(
            long id,
            String tin,
            String name,
            @Schema(nullable = true) String legalName,
            boolean customer,
            boolean supplier,
            @Schema(nullable = true) String region,
            @Schema(nullable = true) String phone,
            @Schema(nullable = true, description = "Eng uzoq amal qiladigan litsenziya muddati") LocalDate licenseValidUntil,
            boolean blocked,
            boolean active) {}

    record CounterpartyPage(List<CounterpartyRow> items, long total, int page, int size) {}

    record License(long id, String number, String kind, @Schema(nullable = true) LocalDate issuedOn,
            @Schema(nullable = true) LocalDate validUntil, boolean controlledAllowed) {}

    record Contract(long id, long branchId, String number, @Schema(nullable = true) LocalDate signedOn,
            @Schema(nullable = true) LocalDate validUntil, @Schema(nullable = true) String note) {}

    record Terms(
            long branchId,
            @Schema(nullable = true, description = "Kredit limiti, so'm") String creditLimit,
            @Schema(nullable = true) Integer paymentDays,
            @Schema(nullable = true) Ref priceType,
            @Schema(nullable = true) Integer minShelfLifeDays,
            @Schema(nullable = true) Ref operator,
            @Schema(nullable = true) Integer supplierPaymentDays,
            @Schema(nullable = true) PaymentType defaultPaymentType,
            @Schema(nullable = true) Ref supplyEmployee) {}

    record CounterpartyDetail(
            long id,
            String tin,
            String name,
            @Schema(nullable = true) String legalName,
            boolean customer,
            boolean supplier,
            @Schema(nullable = true) Ref region,
            @Schema(nullable = true) String address,
            @Schema(nullable = true) String phone,
            @Schema(nullable = true) String contactPerson,
            @Schema(nullable = true) String email,
            @Schema(nullable = true) String bankName,
            @Schema(nullable = true) String bankAccount,
            @Schema(nullable = true) String bankMfo,
            @Schema(nullable = true) String vatCode,
            @Schema(nullable = true) String note,
            boolean blocked,
            @Schema(nullable = true) String blockedReason,
            boolean active,
            List<License> licenses,
            @Schema(description = "Faqat xodim ko'ra oladigan filiallar") List<Contract> contracts,
            @Schema(description = "Faqat xodim ko'ra oladigan filiallar") List<Terms> terms) {}

    record CounterpartyRequest(
            @NotBlank(message = "{validation.required}") @Pattern(regexp = "^([0-9]{9}|[0-9]{14})$", message = "{validation.counterpartyTin}") String tin,
            @NotBlank(message = "{validation.required}") @Size(max = 300) String name,
            @Schema(nullable = true) @Size(max = 300) String legalName,
            boolean customer,
            boolean supplier,
            @Schema(nullable = true) Long regionId,
            @Schema(nullable = true) @Size(max = 500) String address,
            @Schema(nullable = true) @Size(max = 64) String phone,
            @Schema(nullable = true) @Size(max = 200) String contactPerson,
            @Schema(nullable = true) @Size(max = 200) @Pattern(regexp = "^$|^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", message = "{validation.email}") String email,
            @Schema(nullable = true) @Size(max = 200) String bankName,
            @Schema(nullable = true) @Pattern(regexp = "^$|^[0-9]{20}$", message = "{validation.bankAccount}") String bankAccount,
            @Schema(nullable = true) @Pattern(regexp = "^$|^[0-9]{5}$", message = "{validation.bankMfo}") String bankMfo,
            @Schema(nullable = true) @Pattern(regexp = "^$|^[0-9]{12}$", message = "{validation.vatCode}") String vatCode,
            @Schema(nullable = true) @Size(max = 1000) String note) {}

    record ReasonRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    record LicenseRequest(
            @NotBlank(message = "{validation.required}") @Size(max = 100) String number,
            @NotBlank(message = "{validation.required}") @Size(max = 200) String kind,
            @Schema(nullable = true) LocalDate issuedOn,
            @Schema(nullable = true) LocalDate validUntil,
            boolean controlledAllowed) {}

    record ContractRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotBlank(message = "{validation.required}") @Size(max = 100) String number,
            @Schema(nullable = true) LocalDate signedOn,
            @Schema(nullable = true) LocalDate validUntil,
            @Schema(nullable = true) @Size(max = 500) String note) {}

    record TermsRequest(
            @Schema(nullable = true, description = "So'm, masalan 15000000 yoki 15000000.50")
                    @Pattern(regexp = "^$|^\\d{1,16}(\\.\\d{1,2})?$", message = "{validation.money}") String creditLimit,
            @Schema(nullable = true) @Min(0) @Max(365) Integer paymentDays,
            @Schema(nullable = true) Long priceTypeId,
            @Schema(nullable = true) @Min(0) @Max(3650) Integer minShelfLifeDays,
            @Schema(nullable = true) Long operatorId,
            @Schema(nullable = true) @Min(0) @Max(365) Integer supplierPaymentDays,
            @Schema(nullable = true) PaymentType defaultPaymentType,
            @Schema(nullable = true) Long supplyEmployeeId) {}
}
