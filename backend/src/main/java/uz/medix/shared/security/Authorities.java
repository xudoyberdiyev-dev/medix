package uz.medix.shared.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** Joriy so'rovdagi xodimning ruxsat kalitlari (servis ichidagi qo'shimcha tekshiruvlar uchun; asosiy nazorat — @PreAuthorize). */
public final class Authorities {

    private Authorities() {}

    /** Joriy so'rovda xodim shu ruxsat kalitiga egami. So'rovdan tashqarida (tizim ishi) — {@code false}. */
    public static boolean has(String key) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.isAuthenticated() && auth.getAuthorities().stream().anyMatch(a -> key.equals(a.getAuthority()));
    }
}
