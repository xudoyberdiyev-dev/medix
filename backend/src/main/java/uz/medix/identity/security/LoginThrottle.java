package uz.medix.identity.security;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import uz.medix.shared.error.MedixException;

/**
 * Kirishdagi noto'g'ri urinishlarni cheklash: {@value #MAX_ATTEMPTS} ta noto'g'ri urinishdan keyin login
 * {@link #LOCK} ga yopiladi. Login matni bo'yicha hisoblanadi (mavjud bo'lmagan login ham) — javob bir xil.
 */
@Component
class LoginThrottle {

    static final int MAX_ATTEMPTS = 5;
    static final Duration LOCK = Duration.ofMinutes(15);

    private final JdbcClient jdbc;

    LoginThrottle(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Login yopiq bo'lsa — {@code auth.locked} (qolgan daqiqalar bilan). */
    void checkNotLocked(String login, Instant now) {
        Optional<Timestamp> until = jdbc.sql("SELECT locked_until FROM login_throttle WHERE login = :l AND locked_until > :now")
                .param("l", login)
                .param("now", Timestamp.from(now))
                .query(Timestamp.class)
                .optional();
        if (until.isPresent()) {
            throw locked(until.get().toInstant(), now);
        }
    }

    /** Noto'g'ri urinishni yozadi va xatoni qaytaradi: qolgan urinishlar soni yoki yopilganlik. */
    MedixException fail(String login, Instant now) {
        Instant lockUntil = now.plus(LOCK);
        var row = jdbc.sql("""
                INSERT INTO login_throttle (login, failed_count, updated_at) VALUES (:l, 1, :now)
                ON CONFLICT (login) DO UPDATE SET
                    failed_count = CASE WHEN login_throttle.failed_count + 1 >= :max THEN 0 ELSE login_throttle.failed_count + 1 END,
                    locked_until = CASE WHEN login_throttle.failed_count + 1 >= :max THEN :until ELSE login_throttle.locked_until END,
                    updated_at = :now
                RETURNING failed_count, locked_until""")
                .param("l", login)
                .param("now", Timestamp.from(now))
                .param("max", MAX_ATTEMPTS)
                .param("until", Timestamp.from(lockUntil))
                .query((rs, i) -> new Row(rs.getInt(1), rs.getTimestamp(2)))
                .single();
        if (row.lockedUntil() != null && row.lockedUntil().toInstant().isAfter(now)) {
            return locked(row.lockedUntil().toInstant(), now);
        }
        return MedixException.unauthorized("auth.badCredentialsLeft", MAX_ATTEMPTS - row.failed());
    }

    void reset(String login) {
        jdbc.sql("DELETE FROM login_throttle WHERE login = :l").param("l", login).update();
    }

    private static MedixException locked(Instant until, Instant now) {
        long minutes = Math.max(1, (Duration.between(now, until).toSeconds() + 59) / 60);
        return new MedixException(HttpStatus.TOO_MANY_REQUESTS, "auth.locked", minutes);
    }

    private record Row(int failed, Timestamp lockedUntil) {}
}
