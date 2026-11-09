package uz.medix.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.TestcontainersConfig;

/** V2 migratsiyasidagi bazadagi himoyalar: zonalar, rollar, xodim logini, audit jurnali. */
@SpringBootTest
@Import(TestcontainersConfig.class)
@Transactional
class IdentitySchemaIT {

    @Autowired
    JdbcClient jdbc;

    /**
     * Rad etilishi kerak bo'lgan so'rov. Test tranzaksiyasi ichida savepoint bilan — PostgreSQL xatodan keyin
     * tranzaksiyani to'xtatadi, keyingi tekshiruvlar soxta o'tib ketmasin.
     */
    private void assertRejected(String sql, Map<String, Object> params) {
        jdbc.sql("SAVEPOINT expected_failure").update();
        try {
            assertThatThrownBy(() -> jdbc.sql(sql).params(params).update()).isInstanceOf(DataAccessException.class);
        } finally {
            jdbc.sql("ROLLBACK TO SAVEPOINT expected_failure").update();
        }
    }

    private void assertRejected(String sql) {
        assertRejected(sql, Map.of());
    }

    private long warehouse() {
        jdbc.sql("INSERT INTO company (name) VALUES ('Medix Group') ON CONFLICT DO NOTHING").update();
        long company = jdbc.sql("SELECT id FROM company").query(Long.class).single();
        long branch = jdbc.sql("""
                INSERT INTO branch (company_id, code, name, legal_name, tin)
                VALUES (:c, 'SMQ', 'Samarqand', 'Medix SMQ MChJ', '987654321') RETURNING id""")
                .param("c", company)
                .query(Long.class)
                .single();
        return jdbc.sql("INSERT INTO warehouse (branch_id, name) VALUES (:b, 'Markaziy ombor') RETURNING id")
                .param("b", branch)
                .query(Long.class)
                .single();
    }

    @Test
    void standardRolesSeeded() {
        List<String> codes = jdbc.sql("SELECT code FROM role WHERE system ORDER BY id").query(String.class).list();
        assertThat(codes).containsExactly("DIRECTOR", "ADMIN", "BRANCH_MANAGER", "OPERATOR", "PURCHASER", "ACCOUNTANT",
                "CASHIER", "WAREHOUSE_MANAGER", "PICKER", "MARKER", "DRIVER");
    }

    @Test
    void sellableZonesAreDerivedFromType() {
        long wh = warehouse();
        jdbc.sql("""
                INSERT INTO zone (warehouse_id, type, name) VALUES
                (:w, 'RECEIVING', 'Qabul'), (:w, 'MAIN', 'Asosiy saqlash'), (:w, 'QUARANTINE', 'Karantin'),
                (:w, 'SHIPPING', 'Jo''natish'), (:w, 'COLD', 'Sovuq'), (:w, 'SAFE', 'Seyf')""")
                .param("w", wh)
                .update();
        List<String> sellable = jdbc.sql("SELECT type FROM zone WHERE warehouse_id = :w AND sellable ORDER BY type")
                .param("w", wh)
                .query(String.class)
                .list();
        assertThat(sellable).containsExactly("COLD", "MAIN", "SAFE");
        // E12: saqlash zonasi bir nechta boʻlishi mumkin; Qabul/Karantin/Joʻnatish — bittadan; oqim zonasi sotuvga ochilmaydi
        jdbc.sql("INSERT INTO zone (warehouse_id, type, name) VALUES (:w, 'MAIN', 'Ikkinchi')").param("w", wh).update();
        assertRejected("INSERT INTO zone (warehouse_id, type, name) VALUES (:w, 'SHIPPING', 'Ikkinchi joʻnatish')", Map.of("w", wh));
        assertRejected("UPDATE zone SET sellable = true WHERE warehouse_id = :w AND type = 'QUARANTINE'", Map.of("w", wh));
        assertThat(jdbc.sql("UPDATE zone SET sellable = false WHERE warehouse_id = :w AND name = 'Ikkinchi'").param("w", wh).update())
                .isEqualTo(1);
    }

    @Test
    void branchCodeAndTinValidated() {
        warehouse();
        assertRejected("INSERT INTO branch (company_id, code, name, legal_name, tin) SELECT id, 'bxr', 'Buxoro', 'Medix BXR', '111111111' FROM company");
        assertRejected("INSERT INTO branch (company_id, code, name, legal_name, tin) SELECT id, 'BXR', 'Buxoro', 'Medix BXR', '12345' FROM company");
    }

    @Test
    void systemRoleCannotBeDeletedOrRecoded() {
        assertRejected("DELETE FROM role WHERE code = 'DRIVER'");
        assertRejected("UPDATE role SET code = 'BOSS' WHERE code = 'DIRECTOR'");
        int renamed = jdbc.sql("UPDATE role SET name = 'Direktor (CEO)' WHERE code = 'DIRECTOR'").update();
        assertThat(renamed).isEqualTo(1);
    }

    @Test
    void employeeLoginIsLowercaseAndUnique() {
        jdbc.sql("INSERT INTO employee (login, full_name, role_id, password_hash) SELECT 'ceo', 'CEO', id, 'h' FROM role WHERE code = 'DIRECTOR'")
                .update();
        assertRejected("INSERT INTO employee (login, full_name, role_id, password_hash) SELECT 'ceo', 'X', id, 'h' FROM role WHERE code = 'OPERATOR'");
        assertRejected("INSERT INTO employee (login, full_name, role_id, password_hash) SELECT 'Ali', 'X', id, 'h' FROM role WHERE code = 'OPERATOR'");
    }

    @Test
    void auditLogIsAppendOnly() {
        long id = jdbc.sql("INSERT INTO audit_log (action, entity_type, entity_id) VALUES ('employee.create', 'employee', '1') RETURNING id")
                .query(Long.class)
                .single();
        assertRejected("UPDATE audit_log SET action = 'x' WHERE id = :id", Map.of("id", id));
        assertRejected("DELETE FROM audit_log WHERE id = :id", Map.of("id", id));
        long count = jdbc.sql("SELECT count(*) FROM audit_log WHERE id = :id").param("id", id).query(Long.class).single();
        assertThat(count).isEqualTo(1);
    }
}
