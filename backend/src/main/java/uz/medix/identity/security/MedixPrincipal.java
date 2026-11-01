package uz.medix.identity.security;

import java.io.Serializable;
import java.util.Set;

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
        Set<String> permissions) implements Serializable {

    public MedixPrincipal {
        permissions = Set.copyOf(permissions);
    }

    public MedixPrincipal withPasswordChanged() {
        return new MedixPrincipal(id, login, fullName, roleCode, roleName, branchId, false, permissions);
    }
}
