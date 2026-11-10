package uz.medix.identity.security;

import org.springframework.stereotype.Component;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.settings.SettingKey;
import uz.medix.shared.settings.SystemSettings;

/** Parol siyosati: minimal uzunlik — Sozlamalar → Xavfsizlik ({@code pwMin}); maksimal 128 — so'rov validatsiyasida. */
@Component
public class PasswordPolicy {

    private final SystemSettings settings;

    PasswordPolicy(SystemSettings settings) {
        this.settings = settings;
    }

    public void check(String password) {
        int min = settings.intValue(SettingKey.pwMin);
        if (password == null || password.length() < min) {
            throw MedixException.badRequest("validation.password.min", String.valueOf(min));
        }
    }
}
