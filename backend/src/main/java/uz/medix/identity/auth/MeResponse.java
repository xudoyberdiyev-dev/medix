package uz.medix.identity.auth;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import uz.medix.identity.security.MedixPrincipal;

/** Joriy foydalanuvchi: frontend menyu va tugmalarni {@code permissions} bo'yicha ko'rsatadi (yakuniy qaror serverda). */
record MeResponse(
        long id,
        String login,
        String fullName,
        RoleRef role,
        @Schema(nullable = true, description = "Asosiy filial; null — biriktirilmagan") Long branchId,
        boolean mustChangePassword,
        @Schema(description = "Barcha filiallar ma'lumotini ko'radi") boolean allBranches,
        List<String> permissions) {

    record RoleRef(String code, String name,
            @Schema(description = "Bosh sahifa turi (Rollar matritsasidan)", allowableValues = {"director", "branch", "operator", "purchase",
                    "keeper", "cashier", "accountant", "picker", "marker", "driver"}) String home) {}

    static MeResponse of(MedixPrincipal p, String home) {
        return new MeResponse(p.id(), p.login(), p.fullName(), new RoleRef(p.roleCode(), p.roleName(), home), p.branchId(),
                p.mustChangePassword(), p.allBranches(), p.permissions().stream().sorted().toList());
    }
}
