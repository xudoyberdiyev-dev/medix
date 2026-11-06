package uz.medix.identity.security;

import java.io.Serializable;
import java.util.Set;
import org.springframework.security.core.AuthenticatedPrincipal;
import uz.medix.shared.security.Actor;

/**
 * Sessiyadagi foydalanuvchi. Spring Session JDBC uni seriyalashtiradi — faqat oddiy qiymatlar.
 *
 * @param branchId asosiy filial; {@code null} — filial biriktirilmagan (CEO sozlash ustasigacha)
 */
public record MedixPrincipal(
        long id,
        String login,
        String fullName,
        String roleCode,
        String roleName,
        Long branchId,
        boolean mustChangePassword,
        Set<String> permissions) implements AuthenticatedPrincipal, Serializable {

    public MedixPrincipal {
        permissions = Set.copyOf(permissions);
    }

    /** Spring Session'da {@code principal_name} — login. */
    @Override
    public String getName() {
        return login;
    }

    /**
     * Barcha filiallar doirasi. Hozircha rol bo'yicha (SPEC 13); ruxsatlar matritsasi (1.3) kelganda
     * alohida ruxsat kalitiga o'tkaziladi.
     */
    public static final Set<String> ALL_BRANCH_ROLES = Set.of("DIRECTOR", "ADMIN", "ACCOUNTANT");

    public boolean allBranches() {
        return ALL_BRANCH_ROLES.contains(roleCode);
    }

    public Actor toActor() {
        return new Actor(id, branchId, allBranches());
    }

    public MedixPrincipal withPasswordChanged() {
        return new MedixPrincipal(id, login, fullName, roleCode, roleName, branchId, false, permissions);
    }
}
