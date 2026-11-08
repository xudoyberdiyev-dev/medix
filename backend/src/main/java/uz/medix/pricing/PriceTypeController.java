package uz.medix.pricing;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/** Narx turlari (SPEC 6: o'zgarmas ro'yxat; nom, muqobil nom va faollik tahrirlanadi). */
@RestController
@RequestMapping("/api/price-types")
@Tag(name = "pricing", description = "Narxlar")
class PriceTypeController {

    record PriceType(long id, String code, String name, boolean base, boolean batch) {}

    /** «Narx turlari» jadvali (prototip `Prices`): narxi bor mahsulotlar / jami faol, biriktirilgan mijozlar, oxirgi narx o'zgarishi. */
    record PriceTypeOverview(long id, String code, String name, @Schema(nullable = true) String altName, boolean base, boolean batch,
            boolean active, long priced, long total, long customers, @Schema(nullable = true) LocalDate lastChange) {}

    record PriceTypeUpdate(@NotBlank @Size(max = 100) String name, @Schema(nullable = true) @Size(max = 100) String altName, boolean active) {}

    record PriceTypeHistoryRow(Instant at, @Schema(nullable = true) String employee, String action, @Schema(nullable = true) String oldValue,
            @Schema(nullable = true) String newValue) {}

    private final JdbcClient jdbc;
    private final CurrentActor actor;
    private final AuditLog audit;

    PriceTypeController(JdbcClient jdbc, CurrentActor actor, AuditLog audit) {
        this.jdbc = jdbc;
        this.actor = actor;
        this.audit = audit;
    }

    @GetMapping("/overview")
    @PreAuthorize("hasAuthority('prices.view')")
    @Transactional(readOnly = true)
    @Operation(summary = "Narx turlari jadvali (filial bo'yicha statistika bilan, nofaollari ham)")
    List<PriceTypeOverview> overview(@RequestParam long branchId) {
        if (!actor.current().map(a -> a.canAccessBranch(branchId)).orElse(false)) {
            throw MedixException.notFound("error.notFound");
        }
        long total = jdbc.sql("SELECT count(*) FROM product WHERE active").query(Long.class).single();
        return jdbc.sql("""
                SELECT t.id, t.code, t.name, t.alt_name, t.base, t.batch, t.active,
                       (SELECT count(DISTINCT p.product_id) FROM price p JOIN product pr ON pr.id = p.product_id AND pr.active
                         WHERE p.price_type_id = t.id AND p.branch_id = :b AND p.effective_from <= current_date)
                     + (SELECT count(DISTINCT bt.product_id) FROM batch_price bp JOIN batch bt ON bt.id = bp.batch_id
                         JOIN product pr ON pr.id = bt.product_id AND pr.active
                         WHERE bp.price_type_id = t.id AND bp.branch_id = :b AND bp.effective_from <= current_date
                           AND NOT EXISTS (SELECT 1 FROM price p2 WHERE p2.product_id = bt.product_id AND p2.price_type_id = t.id
                                           AND p2.branch_id = :b AND p2.effective_from <= current_date)) AS priced,
                       (SELECT count(*) FROM counterparty_branch_terms c WHERE c.price_type_id = t.id AND c.branch_id = :b) AS customers,
                       GREATEST(
                            (SELECT max(p.effective_from) FROM price p WHERE p.price_type_id = t.id AND p.branch_id = :b),
                            (SELECT max(bp.effective_from) FROM batch_price bp WHERE bp.price_type_id = t.id AND bp.branch_id = :b)) AS last_change
                FROM price_type t
                ORDER BY t.sort_order""")
                .param("b", branchId)
                .query((rs, n) -> new PriceTypeOverview(rs.getLong("id"), rs.getString("code"), rs.getString("name"), rs.getString("alt_name"),
                        rs.getBoolean("base"), rs.getBoolean("batch"), rs.getBoolean("active"), Math.min(rs.getLong("priced"), total), total,
                        rs.getLong("customers"), rs.getObject("last_change", LocalDate.class)))
                .list();
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('lookups.ptypes')")
    @Transactional
    @Operation(summary = "Narx turini tahrirlash (nom, muqobil nom, faollik)",
            description = "Bazaviy turni yoki mijozlarga biriktirilgan turni nofaol qilib bo'lmaydi. Ro'yxat tarkibi (SPEC 6) o'zgarmaydi.")
    PriceTypeOverview update(@PathVariable long id, @RequestParam long branchId, @Valid @RequestBody PriceTypeUpdate r) {
        Map<String, Object> before = jdbc.sql("SELECT name, alt_name, active, base FROM price_type WHERE id = :id FOR UPDATE").param("id", id)
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("name", rs.getString("name"));
                    m.put("altName", rs.getString("alt_name"));
                    m.put("active", rs.getBoolean("active"));
                    m.put("base", rs.getBoolean("base"));
                    return m;
                })
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        String name = r.name().strip();
        boolean dup = jdbc.sql("SELECT EXISTS (SELECT 1 FROM price_type WHERE lower(name) = lower(:n) AND id <> :id)")
                .param("n", name).param("id", id).query(Boolean.class).single();
        if (dup) {
            throw MedixException.conflict("priceType.duplicate", name);
        }
        if (!r.active() && Boolean.TRUE.equals(before.get("active"))) {
            if (Boolean.TRUE.equals(before.get("base"))) {
                throw MedixException.conflict("priceType.baseOff");
            }
            long inUse = jdbc.sql("SELECT count(*) FROM counterparty_branch_terms WHERE price_type_id = :id").param("id", id)
                    .query(Long.class).single();
            if (inUse > 0) {
                throw MedixException.conflict("priceType.inUse", inUse);
            }
        }
        String alt = r.altName() == null || r.altName().isBlank() ? null : r.altName().strip();
        jdbc.sql("UPDATE price_type SET name = :n, alt_name = :a, active = :act WHERE id = :id")
                .param("n", name).param("a", alt).param("act", r.active()).param("id", id).update();
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("name", name);
        after.put("altName", alt);
        after.put("active", r.active());
        before.remove("base");
        audit.record(AuditEntry.of("priceType.update", "price_type", String.valueOf(id)).change(before, after));
        return overview(branchId).stream().filter(t -> t.id() == id).findFirst().orElseThrow();
    }

    @GetMapping("/{id}/history")
    @PreAuthorize("hasAuthority('prices.view')")
    @Transactional(readOnly = true)
    @Operation(summary = "Narx turi o'zgarishlari tarixi")
    List<PriceTypeHistoryRow> history(@PathVariable long id) {
        return jdbc.sql("""
                SELECT a.occurred_at, e.full_name, a.action, a.old_value::text AS old_value, a.new_value::text AS new_value
                FROM audit_log a LEFT JOIN employee e ON e.id = a.employee_id
                WHERE a.entity_type = 'price_type' AND a.entity_id = :id
                ORDER BY a.occurred_at DESC, a.id DESC LIMIT 200""")
                .param("id", String.valueOf(id))
                .query((rs, n) -> new PriceTypeHistoryRow(rs.getTimestamp("occurred_at").toInstant(), rs.getString("full_name"),
                        rs.getString("action"), rs.getString("old_value"), rs.getString("new_value")))
                .list();
    }

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "Narx turlari")
    List<PriceType> list() {
        return jdbc.sql("SELECT id, code, name, base, batch FROM price_type WHERE active ORDER BY sort_order").query(PriceType.class).list();
    }
}
