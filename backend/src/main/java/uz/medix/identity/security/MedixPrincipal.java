package uz.medix.identity.security;

import java.io.Serializable;
import java.util.Set;
import org.springframework.security.core.AuthenticatedPrincipal;
import uz.medix.shared.security.Actor;

/**
 * Sessiyadagi foydalanuvchi. Spring Session JDBC uni seriyalashtiradi — faqat oddiy qiymatlar.
 *
 * @param branchId asosiy filial; {@code null} — filial biriktirilmagan (CEO sozlash ustasigacha)
 * @param allBranchesGrant Direktor bergan «barcha filiallar» belgisi (faqat Buxgalter uchun, E3)
 */
public record MedixPrincipal(
        long id,
        String login,
        String fullName,
        String roleCode,
        String roleName,
        Long branchId,
        boolean mustChangePassword,
        Set<String> permissions,
        boolean allBranchesGrant) implements AuthenticatedPrincipal, Serializable {

    public MedixPrincipal {
        permissions = Set.copyOf(permissions);
    }

    /** Spring Session'da {@code principal_name} — login. */
    @Override
    public String getName() {
        return login;
    }

    /** Rol bo'yicha barcha filiallar doirasi (SPEC 13). */
    public static final Set<String> ALL_BRANCH_ROLES = Set.of("DIRECTOR", "ADMIN");

    /** Belgi bilan barcha filiallarni ko'ra oladigan rol (egasi qarori 07.11.2026, E3). */
    public static final String GRANTABLE_ROLE = "ACCOUNTANT";

    public static boolean allBranches(String roleCode, boolean grant) {
        return ALL_BRANCH_ROLES.contains(roleCode) || (grant && GRANTABLE_ROLE.equals(roleCode));
    }

    public boolean allBranches() {
        return allBranches(roleCode, allBranchesGrant);
    }

    public Actor toActor() {
        return new Actor(id, branchId, allBranches());
    }

    public MedixPrincipal withPasswordChanged() {
        return new MedixPrincipal(id, login, fullName, roleCode, roleName, branchId, false, permissions, allBranchesGrant);
    }
}
