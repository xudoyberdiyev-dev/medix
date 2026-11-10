package uz.medix.shared.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.callback.Callback;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Production holati: V69 gacha qo'llangan, ichida yakunlangan buyurtma bor baza. V70 guard'siz yiqiladi (Railway
 * «Crashed», 10.11.2026), guard bilan oxirigacha o'tadi va trigger qayta yoqiladi.
 */
@Testcontainers
class LegacyMigrationGuardsIT {

    @Container
    static final PostgreSQLContainer PG = new PostgreSQLContainer("postgres:18-alpine");

    @Test
    void v70PassesOnDatabaseWithDeliveredOrders() throws SQLException {
        String url = createDatabase("guard_on");
        migrate(url, "69");
        seedOrders(url);

        MigrateResult result = migrate(url, null, new LegacyMigrationGuards());

        assertThat(result.success).isTrue();
        try (Connection c = connect(url);
                Statement st = c.createStatement()) {
            ResultSet rs = st.executeQuery("SELECT count(*) FROM sales_order_line WHERE list_price = price");
            rs.next();
            assertThat(rs.getInt(1)).isEqualTo(2);
            rs = st.executeQuery("SELECT tgenabled FROM pg_trigger WHERE tgname = 'sales_order_line_locked'");
            rs.next();
            assertThat(rs.getString(1)).isEqualTo("O");
            // Trigger yana ishlaydi: yakunlangan buyurtma qatori o'zgarmaydi
            assertThatThrownBy(() -> st.executeUpdate("UPDATE sales_order_line SET qty = 2 WHERE id = 900001"))
                    .hasMessageContaining("qoralamada");
        }
    }

    @Test
    void v70FailsWithoutGuard() throws SQLException {
        String url = createDatabase("guard_off");
        migrate(url, "69");
        seedOrders(url);

        assertThatThrownBy(() -> migrate(url, null)).hasStackTraceContaining("qoralamada");
    }

    private static MigrateResult migrate(String url, String target, Callback... callbacks) {
        var cfg = Flyway.configure()
                .dataSource(url, PG.getUsername(), PG.getPassword())
                .locations("classpath:db/migration")
                .callbacks(callbacks);
        if (target != null) {
            cfg.target(target);
        }
        return cfg.load().migrate();
    }

    private static void seedOrders(String url) throws SQLException {
        try (Connection c = connect(url);
                Statement st = c.createStatement()) {
            // FK/triggerlarsiz: faqat buyurtma va qatorlari kerak (production'da tasdiqlangan/yakunlangan buyurtmalar)
            st.execute("SET session_replication_role = replica");
            st.execute(
                    """
                    INSERT INTO sales_order (id, number, branch_id, warehouse_id, customer_id, order_date, delivery_type,
                                             payment_type, created_by, status, total) OVERRIDING SYSTEM VALUE
                    VALUES (900001, 'BY-TSH-999001', 1, 1, 1, current_date, 'DELIVERY', 'CASH', 1, 'DELIVERED', 1000),
                           (900002, 'BY-TSH-999002', 1, 1, 1, current_date, 'DELIVERY', 'CASH', 1, 'DRAFT', 1000)
                    """);
            st.execute(
                    """
                    INSERT INTO sales_order_line (id, order_id, line_no, product_id, qty, price) OVERRIDING SYSTEM VALUE
                    VALUES (900001, 900001, 1, 1, 1, 1000), (900002, 900002, 1, 1, 1, 1000)
                    """);
        }
    }

    private static String createDatabase(String name) throws SQLException {
        try (Connection c = connect(PG.getJdbcUrl());
                Statement st = c.createStatement()) {
            st.execute("CREATE DATABASE " + name);
        }
        return PG.getJdbcUrl().replaceFirst("/[^/?]+(\\?|$)", "/" + name + "$1");
    }

    private static Connection connect(String url) throws SQLException {
        return DriverManager.getConnection(url, PG.getUsername(), PG.getPassword());
    }
}
