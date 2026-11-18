package uz.yuzplus.identity.security;

import org.springframework.stereotype.Component;
import uz.yuzplus.shared.error.YuzplusException;
import uz.yuzplus.shared.settings.SettingKey;
import uz.yuzplus.shared.settings.SystemSettings;

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
            throw YuzplusException.badRequest("validation.password.min", String.valueOf(min));
        }
    }
}
