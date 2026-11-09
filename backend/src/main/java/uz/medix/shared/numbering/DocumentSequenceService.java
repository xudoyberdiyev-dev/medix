package uz.medix.shared.numbering;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.stereotype.Service;

/**
 * Hujjat raqamini beradi. Raqam bir marta beriladi va qayta ishlatilmaydi:
 * hisoblagich asosiy tranzaksiyadan tashqarida (avtokommit) oshiriladi, shuning uchun
 * asosiy tranzaksiya orqaga qaytsa ham raqam takrorlanmaydi (bo'shliq bo'lishi mumkin — bu ruxsat etilgan).
 *
 * <p>Hisoblagich <b>alohida kichik ulanish hovuzi</b> orqali oshiriladi. Avval {@code REQUIRES_NEW} edi:
 * hujjat yaratayotgan tranzaksiya asosiy hovuzdan bitta ulanishni ushlab turib, ikkinchisini so'rardi —
 * parallel so'rovlar asosiy hovuzni to'ldirsa (LISTEN ulanishi ham doim band), hammasi bir-birini
 * kutib qolardi (CashIT beqarorligi, production'da ham xavf). Alohida hovuzdagi ulanish faqat bitta
 * qisqa UPSERT uchun olinadi va darhol qaytariladi, asosiy hovuzni kutmaydi — o'zaro qulflanish yo'q.
 */
@Service
public class DocumentSequenceService implements DisposableBean {

    static final int POOL_SIZE = 3;

    private static final String UPSERT = """
            INSERT INTO document_sequence (prefix, branch_code, last_value)
            VALUES (?, ?, 1)
            ON CONFLICT (prefix, branch_code)
            DO UPDATE SET last_value = document_sequence.last_value + 1, updated_at = now()
            RETURNING last_value
            """;

    private final DataSource main;
    private volatile DataSource own;
    private HikariDataSource created;

    public DocumentSequenceService(DataSource dataSource) {
        this.main = dataSource;
    }

    public DocumentNumber next(DocumentPrefix prefix, String branchCode) {
        try (Connection c = pool().getConnection()) {
            c.setAutoCommit(true);
            try (PreparedStatement ps = c.prepareStatement(UPSERT)) {
                ps.setString(1, prefix.name());
                ps.setString(2, branchCode);
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    return new DocumentNumber(prefix, branchCode, rs.getLong(1));
                }
            }
        } catch (SQLException e) {
            throw new DataAccessResourceFailureException("document_sequence: " + e.getMessage(), e);
        }
    }

    /** Alohida hovuz birinchi chaqiruvda asosiy hovuz sozlamalaridan (URL, foydalanuvchi, parol) yaratiladi. */
    DataSource pool() throws SQLException {
        DataSource ds = own;
        if (ds != null) {
            return ds;
        }
        synchronized (this) {
            if (own == null) {
                own = create();
            }
            return own;
        }
    }

    private DataSource create() throws SQLException {
        if (!main.isWrapperFor(HikariDataSource.class)) {
            return main;
        }
        HikariDataSource m = main.unwrap(HikariDataSource.class);
        HikariConfig cfg = new HikariConfig();
        cfg.setPoolName("medix-numbering");
        cfg.setJdbcUrl(m.getJdbcUrl());
        cfg.setUsername(m.getUsername());
        cfg.setPassword(m.getPassword());
        if (m.getDriverClassName() != null) {
            cfg.setDriverClassName(m.getDriverClassName());
        }
        cfg.setDataSourceProperties(m.getDataSourceProperties());
        cfg.setMaximumPoolSize(POOL_SIZE);
        cfg.setMinimumIdle(0);
        cfg.setAutoCommit(true);
        cfg.setConnectionTimeout(10_000);
        cfg.setIdleTimeout(60_000);
        created = new HikariDataSource(cfg);
        return created;
    }

    @Override
    public synchronized void destroy() {
        if (created != null) {
            created.close();
        }
    }
}
