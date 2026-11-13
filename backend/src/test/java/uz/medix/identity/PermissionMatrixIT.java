package uz.medix.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import uz.medix.TestcontainersConfig;

/** 1.3: 136 ta ruxsat kaliti (132 + E7 orders.discount + settings.edit, settings.security + qm.cancelPosted; O6 salesZones.view, salesZones.edit; O8 qm.late = 139) va 11 rolning standart matritsasi (T12-topshirish §7). */
@SpringBootTest
@Import(TestcontainersConfig.class)
class PermissionMatrixIT {

    @Autowired
    JdbcClient jdbc;

    private List<String> of(String role) {
        return jdbc.sql("""
                SELECT rp.permission_key FROM role_permission rp JOIN role r ON r.id = rp.role_id
                WHERE r.code = :c ORDER BY rp.permission_key""")
                .param("c", role)
                .query(String.class)
                .list();
    }

    @Test
    void catalogAndDefaults() {
        assertThat(jdbc.sql("SELECT count(*) FROM permission").query(Long.class).single()).isEqualTo(139);
        assertThat(of("DIRECTOR")).contains("prices.below", "approvals.director", "staff.edit").doesNotContain("marking.scan");
        assertThat(of("ADMIN")).contains("staff.edit", "roles.view").doesNotContain("prices.below", "approvals.director");
        assertThat(of("BRANCH_MANAGER")).contains("staff.view", "clients.terms", "approvals.branch").doesNotContain("staff.edit", "warehouses.view");
        assertThat(of("OPERATOR")).contains("orders.create", "clients.create", "reports.own").doesNotContain("prices.create");
        assertThat(of("PURCHASER")).contains("products.create", "prices.create", "suppliers.terms").doesNotContain("clients.create");
        assertThat(of("WAREHOUSE_MANAGER")).contains("receipt.accept", "special.whs").doesNotContain("receipt.post", "prices.cost");
        assertThat(of("CASHIER")).contains("cash.create", "special.till").doesNotContain("cash.closeDiff");
        assertThat(of("ACCOUNTANT")).contains("receipt.post", "lookups.items").doesNotContain("stock.view");
        assertThat(of("MARKER")).containsExactlyInAnyOrder("marking.export", "marking.scan", "marking.view", "orders.view");
        assertThat(of("PICKER")).containsExactlyInAnyOrder("orders.view", "picking.do");
        assertThat(of("DRIVER")).containsExactly("trip.driver");
        // E5 (07.11): reys — faqat Ombor mudiri (Direktor/Admin — to'liq huquqli)
        assertThat(of("WAREHOUSE_MANAGER")).contains("shipments.trip");
        assertThat(of("DIRECTOR")).contains("shipments.trip");
        assertThat(of("OPERATOR")).doesNotContain("shipments.trip");
        assertThat(of("BRANCH_MANAGER")).doesNotContain("shipments.trip");
    }
}
