package uz.medix.identity.auth;

import java.util.List;
import uz.medix.identity.security.MedixPrincipal;

/** Joriy foydalanuvchi: frontend menyu va tugmalarni {@code permissions} bo'yicha ko'rsatadi (yakuniy qaror serverda). */
record MeResponse(
        long id,
        String login,
        String fullName,
        RoleRef role,
        Long branchId,
        boolean mustChangePassword,
        List<String> permissions) {

    record RoleRef(String code, String name) {}

    static MeResponse of(MedixPrincipal p) {
        return new MeResponse(p.id(), p.login(), p.fullName(), new RoleRef(p.roleCode(), p.roleName()), p.branchId(),
                p.mustChangePassword(), p.permissions().stream().sorted().toList());
    }
}
