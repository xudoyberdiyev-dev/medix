package uz.medix.catalog.expense;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;

/**
 * Xarajat va kirim moddalari (SPEC 5.5: KO/BO). Standart moddalar (SPEC ro'yxati) o'zgartirilmaydi.
 * O'zgartirish — Direktor, Bosh administrator, Buxgalter.
 */
@RestController
@RequestMapping("/api/expense-items")
@Tag(name = "expense-items", description = "Xarajat va kirim moddalari")
class ExpenseItemController {

    private static final String MANAGE = "hasAnyRole('DIRECTOR', 'ADMIN', 'ACCOUNTANT')";

    enum Direction { EXPENSE, INCOME }

    record ExpenseItem(long id, Direction direction, String name, boolean system, boolean active) {}

    record CreateRequest(@NotNull(message = "{validation.required}") Direction direction,
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name) {}

    record RenameRequest(@NotBlank(message = "{validation.required}") @Size(max = 200) String name) {}

    private final JdbcClient jdbc;
    private final AuditLog audit;

    ExpenseItemController(JdbcClient jdbc, AuditLog audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "Moddalar")
    List<ExpenseItem> list() {
        return jdbc.sql("SELECT id, direction, name, system, active FROM expense_item ORDER BY direction, active DESC, system DESC, lower(name)")
                .query((rs, n) -> new ExpenseItem(rs.getLong("id"), Direction.valueOf(rs.getString("direction")), rs.getString("name"),
                        rs.getBoolean("system"), rs.getBoolean("active")))
                .list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(MANAGE)
    @Transactional
    @Operation(summary = "Modda qo'shish")
    ExpenseItem create(@Valid @RequestBody CreateRequest r) {
        ensureUnique(r.direction(), r.name(), 0L);
        long id = jdbc.sql("INSERT INTO expense_item (direction, name) VALUES (:d, :n) RETURNING id")
                .param("d", r.direction().name())
                .param("n", r.name().strip())
                .query(Long.class)
                .single();
        audit.record(AuditEntry.of("expenseItem.create", "expense_item", id)
                .change(null, Map.of("direction", r.direction().name(), "name", r.name().strip())));
        return find(id);
    }

    @PutMapping("/{id}")
    @PreAuthorize(MANAGE)
    @Transactional
    @Operation(summary = "Nomini o'zgartirish")
    ExpenseItem rename(@PathVariable long id, @Valid @RequestBody RenameRequest r) {
        ExpenseItem before = editable(id);
        ensureUnique(before.direction(), r.name(), id);
        jdbc.sql("UPDATE expense_item SET name = :n, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("n", r.name().strip())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("expenseItem.update", "expense_item", id)
                .change(Map.of("name", before.name()), Map.of("name", r.name().strip())));
        return find(id);
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize(MANAGE)
    @Transactional
    @Operation(summary = "Nofaol qilish")
    ExpenseItem deactivate(@PathVariable long id) {
        return setActive(editable(id), false);
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize(MANAGE)
    @Transactional
    @Operation(summary = "Faollashtirish")
    ExpenseItem activate(@PathVariable long id) {
        return setActive(editable(id), true);
    }

    private ExpenseItem setActive(ExpenseItem before, boolean active) {
        if (before.active() == active) {
            return before;
        }
        jdbc.sql("UPDATE expense_item SET active = :a, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("a", active)
                .param("id", before.id())
                .update();
        audit.record(AuditEntry.of(active ? "expenseItem.activate" : "expenseItem.deactivate", "expense_item", before.id())
                .change(Map.of("active", before.active()), Map.of("active", active)));
        return find(before.id());
    }

    private ExpenseItem editable(long id) {
        jdbc.sql("SELECT id FROM expense_item WHERE id = :id FOR UPDATE").param("id", id).query(Long.class).optional();
        ExpenseItem item = find(id);
        if (item.system()) {
            throw MedixException.conflict("expenseItem.system");
        }
        return item;
    }

    private void ensureUnique(Direction d, String name, long exceptId) {
        boolean taken = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM expense_item WHERE direction = :d AND lower(name) = lower(:n) AND id <> :id)""")
                .param("d", d.name())
                .param("n", name.strip())
                .param("id", exceptId)
                .query(Boolean.class)
                .single();
        if (taken) {
            throw MedixException.conflict("dictionary.duplicate", name.strip());
        }
    }

    private ExpenseItem find(long id) {
        return jdbc.sql("SELECT id, direction, name, system, active FROM expense_item WHERE id = :id")
                .param("id", id)
                .query((rs, n) -> new ExpenseItem(rs.getLong("id"), Direction.valueOf(rs.getString("direction")), rs.getString("name"),
                        rs.getBoolean("system"), rs.getBoolean("active")))
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }
}
