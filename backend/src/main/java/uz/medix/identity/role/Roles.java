package uz.medix.identity.role;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Rollar (SPEC 3: 11 ta standart rol + nusxalar). Ruxsatlar matritsasi — 1.3. */
@Service
public class Roles {

    public record Role(
            long id,
            String code,
            String name,
            @Schema(description = "Standart rol: o'chirilmaydi") boolean system,
            @Schema(description = "Biriktirilgan xodimlar soni") long employeeCount) {}

    private final JdbcClient jdbc;

    Roles(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<Role> list() {
        return jdbc.sql("""
                SELECT r.id, r.code, r.name, r.system, count(e.id) AS employee_count
                FROM role r LEFT JOIN employee e ON e.role_id = r.id
                GROUP BY r.id ORDER BY r.id""")
                .query(Role.class)
                .list();
    }
}
