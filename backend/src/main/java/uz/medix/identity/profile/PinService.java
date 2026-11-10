package uz.medix.identity.profile;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.PinVerifier;
import uz.medix.shared.settings.SettingKey;
import uz.medix.shared.settings.SystemSettings;

/** PIN o'rnatish va tekshirish. PIN — 4–6 raqam, xeshlangan holda saqlanadi. */
@Service
class PinService implements PinVerifier {


    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    private final Clock clock;
    private final AuditLog audit;
    private final SystemSettings settings;

    PinService(JdbcClient jdbc, PasswordEncoder encoder, Clock clock, AuditLog audit, SystemSettings settings) {
        this.settings = settings;
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.clock = clock;
        this.audit = audit;
    }

    private record PinRow(String pinHash, int pinFailedCount, Timestamp pinLockedUntil, String passwordHash) {}

    private PinRow row(long employeeId) {
        return jdbc.sql("SELECT pin_hash, pin_failed_count, pin_locked_until, password_hash FROM employee WHERE id = :id FOR UPDATE")
                .param("id", employeeId)
                .query(PinRow.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    /** O'z PIN'ini o'rnatish yoki almashtirish — joriy parol bilan tasdiqlanadi. */
    @Transactional
    void setPin(long employeeId, String currentPassword, String pin) {
        PinRow r = row(employeeId);
        if (!encoder.matches(currentPassword, r.passwordHash())) {
            throw MedixException.badRequest("auth.currentPasswordWrong");
        }
        if (!pin.matches("^[0-9]{4,6}$") || isTrivial(pin)) {
            throw MedixException.badRequest("pin.weak");
        }
        boolean hadPin = r.pinHash() != null;
        jdbc.sql("""
                UPDATE employee SET pin_hash = :h, pin_failed_count = 0, pin_locked_until = NULL, pin_set_at = :at,
                       updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("h", encoder.encode(pin))
                .param("at", Timestamp.from(clock.instant()))
                .param("id", employeeId)
                .update();
        audit.record(AuditEntry.of(hadPin ? "pin.change" : "pin.set", "employee", employeeId));
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, noRollbackFor = MedixException.class)
    public void verify(long employeeId, String pin) {
        PinRow r = row(employeeId);
        Instant now = clock.instant();
        if (r.pinHash() == null) {
            throw MedixException.badRequest("pin.notSet");
        }
        if (r.pinLockedUntil() != null && r.pinLockedUntil().toInstant().isAfter(now)) {
            throw MedixException.forbidden("pin.locked");
        }
        if (pin == null || !encoder.matches(pin, r.pinHash())) {
            int failed = (r.pinLockedUntil() != null ? 0 : r.pinFailedCount()) + 1;
            int maxAttempts = settings.intValue(SettingKey.pinTries);
            boolean lock = failed >= maxAttempts;
            jdbc.sql("UPDATE employee SET pin_failed_count = :f, pin_locked_until = :u WHERE id = :id")
                    .param("f", lock ? 0 : failed)
                    .param("u", lock ? Timestamp.from(now.plus(Duration.ofMinutes(settings.intValue(SettingKey.pinLockMin)))) : null)
                    .param("id", employeeId)
                    .update();
            audit.record(AuditEntry.of(lock ? "pin.locked" : "pin.failed", "employee", employeeId));
            if (lock) {
                throw MedixException.forbidden("pin.locked");
            }
            throw MedixException.badRequest("pin.wrong", maxAttempts - failed);
        }
        if (r.pinFailedCount() > 0 || r.pinLockedUntil() != null) {
            jdbc.sql("UPDATE employee SET pin_failed_count = 0, pin_locked_until = NULL WHERE id = :id")
                    .param("id", employeeId)
                    .update();
        }
    }

    /** 1111, 1234, 4321 kabi oson PIN'lar qabul qilinmaydi. */
    static boolean isTrivial(String pin) {
        boolean same = pin.chars().distinct().count() == 1;
        boolean up = true;
        boolean down = true;
        for (int i = 1; i < pin.length(); i++) {
            int d = pin.charAt(i) - pin.charAt(i - 1);
            up &= d == 1;
            down &= d == -1;
        }
        return same || up || down;
    }
}
