package uz.yuzplus.identity.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uz.yuzplus.shared.audit.AuditEntry;
import uz.yuzplus.shared.audit.AuditLog;
import uz.yuzplus.shared.error.YuzplusException;

/**
 * Haydovchi mobil ilovasi qurilma tokeni (M2). Faqat DRIVER roli; bazada token emas, SHA-256 xeshi saqlanadi.
 * Token {@code Authorization: Bearer …} sarlavhasida keladi ({@link MobileTokenFilter}). 30 kun ishlatilmasa eskiradi.
 */
@Service
public class MobileTokens {

    public static final String DRIVER_ROLE = "DRIVER";
    static final String IDLE_DAYS = "30";

    private static final SecureRandom RANDOM = new SecureRandom();

    public record Issued(String token, UsernamePasswordAuthenticationToken authentication) {}

    private final AuthService auth;
    private final JdbcClient jdbc;
    private final AuditLog audit;

    MobileTokens(AuthService auth, JdbcClient jdbc, AuditLog audit) {
        this.auth = auth;
        this.jdbc = jdbc;
        this.audit = audit;
    }

    /**
     * Login + parol → yangi qurilma tokeni. Parol tekshiruvi, urinishlar cheklovi va bloklash — {@link AuthService#login}.
     * Haydovchi boʻlmasa yoki vaqtinchalik parol almashtirilmagan boʻlsa — token berilmaydi.
     */
    @Transactional(noRollbackFor = YuzplusException.class, propagation = Propagation.REQUIRED)
    public Issued login(String login, String password, String device) {
        var authentication = auth.login(login, password);
        var p = (YuzplusPrincipal) authentication.getPrincipal();
        if (!DRIVER_ROLE.equals(p.roleCode())) {
            audit.record(AuditEntry.of("mobile.loginDenied", "employee", p.id()).change(null, Map.of("role", p.roleCode())), p.toActor());
            throw YuzplusException.forbidden("mobile.driverOnly");
        }
        if (p.mustChangePassword()) {
            throw YuzplusException.forbidden("mobile.passwordChangeRequired");
        }
        return issue(authentication, device);
    }

    /**
     * Vaqtinchalik (yoki joriy) parol bilan kirib, shu yerning oʻzida yangi parol oʻrnatish → token. Parol qoidalari va audit —
     * {@link AuthService#changePassword}; haydovchi boʻlmasa — token ham, parol almashishi ham yoʻq.
     */
    @Transactional(noRollbackFor = YuzplusException.class, propagation = Propagation.REQUIRED)
    public Issued loginWithNewPassword(String login, String currentPassword, String newPassword, String device) {
        var authentication = auth.login(login, currentPassword);
        var p = (YuzplusPrincipal) authentication.getPrincipal();
        if (!DRIVER_ROLE.equals(p.roleCode())) {
            audit.record(AuditEntry.of("mobile.loginDenied", "employee", p.id()).change(null, Map.of("role", p.roleCode())), p.toActor());
            throw YuzplusException.forbidden("mobile.driverOnly");
        }
        auth.changePassword(p.id(), currentPassword, newPassword);
        return issue(auth.reload(p.id()), device);
    }

    private Issued issue(UsernamePasswordAuthenticationToken authentication, String device) {
        var p = (YuzplusPrincipal) authentication.getPrincipal();
        String token = newToken();
        String dev = device == null || device.isBlank() ? null : truncate(device.strip());
        long id = jdbc.sql("""
                INSERT INTO mobile_device_token (employee_id, branch_id, token_hash, device)
                VALUES (:e, :b, :h, :d) RETURNING id""")
                .param("e", p.id())
                .param("b", p.branchId())
                .param("h", hash(token))
                .param("d", dev)
                .query(Long.class)
                .single();
        audit.record(AuditEntry.of("mobile.tokenIssued", "mobile_device_token", id)
                .change(null, dev == null ? Map.of("employee", p.id()) : Map.of("employee", p.id(), "device", dev)), p.toActor());
        return new Issued(token, authentication);
    }

    /**
     * Token haqiqiy, bekor qilinmagan, eskirmagan, xodim bloklanmagan va hamon haydovchi boʻlsa — autentifikatsiya.
     * Tranzaksiyasiz: {@link AuthService#reload} xatosi (bloklangan) umumiy tranzaksiyani «rollback-only» qilmasin.
     */
    public Optional<UsernamePasswordAuthenticationToken> authenticate(String token) {
        if (token == null || token.isBlank() || token.length() > 128) {
            return Optional.empty();
        }
        var row = jdbc.sql("""
                SELECT id, employee_id FROM mobile_device_token
                WHERE token_hash = :h AND revoked_at IS NULL
                  AND last_used_at > now() - CAST(:idle || ' days' AS interval)""")
                .param("h", hash(token))
                .param("idle", IDLE_DAYS)
                .query((rs, i) -> new long[] {rs.getLong(1), rs.getLong(2)})
                .optional();
        if (row.isEmpty()) {
            return Optional.empty();
        }
        UsernamePasswordAuthenticationToken authentication;
        try {
            authentication = auth.reload(row.get()[1]);
        } catch (YuzplusException blockedOrMissing) {
            return Optional.empty();
        }
        if (!DRIVER_ROLE.equals(((YuzplusPrincipal) authentication.getPrincipal()).roleCode())) {
            return Optional.empty();
        }
        jdbc.sql("UPDATE mobile_device_token SET last_used_at = now() WHERE id = :id AND last_used_at < now() - interval '5 minutes'")
                .param("id", row.get()[0])
                .update();
        return Optional.of(authentication);
    }

    /** Ilovadan chiqish — shu qurilma tokeni bekor qilinadi. */
    @Transactional
    public void logout(String token, YuzplusPrincipal principal) {
        int n = jdbc.sql("""
                UPDATE mobile_device_token SET revoked_at = now(), revoke_reason = 'LOGOUT'
                WHERE token_hash = :h AND employee_id = :e AND revoked_at IS NULL""")
                .param("h", hash(token == null ? "" : token))
                .param("e", principal.id())
                .update();
        if (n > 0) {
            audit.record(AuditEntry.of("mobile.logout", "employee", principal.id()), principal.toActor());
        }
    }

    static String bearer(String header) {
        return header != null && header.regionMatches(true, 0, "Bearer ", 0, 7) ? header.substring(7).strip() : null;
    }

    static String newToken() {
        byte[] b = new byte[32];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String truncate(String s) {
        return s.length() > 160 ? s.substring(0, 160) : s;
    }
}
