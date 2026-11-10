package uz.medix.shared.settings;

import java.math.BigDecimal;
import java.time.LocalDate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import uz.medix.shared.money.Money;

/**
 * Tizim sozlamalarini o'qish (barcha modullar uchun ochiq). Qiymatlar {@code app_setting} jadvalida; yozish — identity
 * modulidagi Sozlamalar API (audit bilan). Har chaqiruv bazadan o'qiydi — o'zgarish darhol amal qiladi.
 */
@Service
public class SystemSettings {

    private final JdbcClient jdbc;

    public SystemSettings(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public BigDecimal value(SettingKey key) {
        return jdbc.sql("SELECT value FROM app_setting WHERE key = :k")
                .param("k", key.name())
                .query(BigDecimal.class)
                .optional()
                .orElseThrow(() -> new IllegalStateException("Sozlama yo'q: " + key));
    }

    public int intValue(SettingKey key) {
        return value(key).intValueExact();
    }

    public Money money(SettingKey key) {
        return Money.of(value(key).toPlainString());
    }

    /** Berilgan sanada amaldagi QQS stavkasi (foiz). */
    public BigDecimal vatRate(LocalDate on) {
        return jdbc.sql("SELECT rate FROM vat_rate WHERE valid_from <= :d ORDER BY valid_from DESC LIMIT 1")
                .param("d", on)
                .query(BigDecimal.class)
                .optional()
                .orElse(new BigDecimal("12.00"));
    }
}
