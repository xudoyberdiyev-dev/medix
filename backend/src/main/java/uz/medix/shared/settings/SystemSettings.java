package uz.medix.shared.settings;

import java.math.BigDecimal;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/** Tizim sozlamalarini o'qish — har modul shu orqali (qiymat darhol amal qiladi, keshsiz). */
@Service
public class SystemSettings {

    private final JdbcClient jdbc;

    SystemSettings(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public String raw(String key) {
        return jdbc.sql("SELECT value FROM system_setting WHERE key = :k").param("k", key).query(String.class).optional().orElse(null);
    }

    public int intValue(SettingKey key) {
        String v = raw(key.name());
        return v == null ? 0 : Integer.parseInt(v);
    }

    public BigDecimal money(SettingKey key) {
        String v = raw(key.name());
        return v == null ? BigDecimal.ZERO : new BigDecimal(v);
    }
}
