package uz.yuzplus.reporting.setup;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * U16: Direktor bosh sahifasidagi «Sozlash roʻyxati» — ishga tushirish uchun asosiy maʼlumotlar kiritilganmi.
 * Hammasi bajarilgach frontend kartani yashiradi.
 */
@RestController
@RequestMapping("/api/setup-checklist")
@Tag(name = "setup-checklist", description = "Ishga tushirish: sozlash roʻyxati")
class SetupChecklistController {

    enum Step { COMPANY, BRANCHES, WAREHOUSES, EMPLOYEES, PRICES, CUSTOMERS, PRODUCTS, OPENING_STOCK }

    record ChecklistItem(Step step, boolean done, @Schema(description = "Hozirgi soni (kompaniya — 0/1)") long count, String link) {}

    record SetupChecklist(List<ChecklistItem> items, int donePercent) {}

    private final JdbcClient jdbc;

    SetupChecklistController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('DIRECTOR')")
    @Operation(summary = "Sozlash roʻyxati: kompaniya, filiallar, omborlar, xodimlar, narxlar, mijozlar, mahsulotlar, boshlangʻich qoldiq")
    SetupChecklist checklist() {
        List<ChecklistItem> items = List.of(
                item(Step.COMPANY, "SELECT count(*) FROM company WHERE setup_completed_at IS NOT NULL", 1, "/company"),
                item(Step.BRANCHES, "SELECT count(*) FROM branch WHERE active", 1, "/settings/branches"),
                item(Step.WAREHOUSES, "SELECT count(*) FROM warehouse WHERE active", 1, "/settings/warehouses"),
                item(Step.EMPLOYEES, "SELECT count(*) FROM employee WHERE status = 'ACTIVE'", 2, "/settings/employees"),
                item(Step.PRICES, "SELECT count(*) FROM price", 1, "/prices"),
                item(Step.CUSTOMERS, "SELECT count(*) FROM counterparty WHERE is_customer", 1, "/customers"),
                item(Step.PRODUCTS, "SELECT count(*) FROM product", 1, "/products"),
                item(Step.OPENING_STOCK, """
                        SELECT (SELECT count(*) FROM opening_balance WHERE status = 'POSTED')
                             + (SELECT count(*) FROM stock_balance WHERE qty > 0)""", 1, "/opening"));
        long done = items.stream().filter(ChecklistItem::done).count();
        return new SetupChecklist(items, (int) (done * 100 / items.size()));
    }

    private ChecklistItem item(Step step, String sql, long need, String link) {
        long count = jdbc.sql(sql).query(Long.class).single();
        return new ChecklistItem(step, count >= need, count, link);
    }
}
