package uz.medix.catalog.saleszone;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.HashMap;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Savdo zonalari (egasi talabi O6, 13.11.2026): filialga tegishli maʼlumotnoma, mijozning filial shartlarida tanlanadi.
 * Ko'rish — filial doirasida (Direktor / «Barcha filiallar» — hammasi); o'zgartirish — {@code salesZones.edit}.
 * O'chirilmaydi — faolsizlantiriladi (mijozlari saqlanib qoladi).
 */
@RestController
@RequestMapping("/api/sales-zones")
@Tag(name = "sales-zones", description = "Savdo zonalari")
class SalesZoneController {

    private static final String VIEW = "hasAnyAuthority('salesZones.view', 'salesZones.edit', 'clients.view', 'orders.view', 'reports.view',"
            + " 'reports.own', 'cdebt.view')";
    private static final String EDIT = "hasAuthority('salesZones.edit')";

    record SalesZone(long id, long branchId, String branch, String name, @Schema(nullable = true) String note, boolean active,
            @Schema(description = "Shu zonadagi mijozlar soni (filial shartlari bo'yicha)") long customers) {}

    record SalesZoneRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotBlank(message = "{validation.required}") @Size(max = 100) String name,
            @Schema(nullable = true) @Size(max = 300) String note) {}

    record ZoneCustomer(long id, String name, @Schema(nullable = true) String tin, @Schema(nullable = true) String region, boolean active) {}

    private static final String SELECT = """
            SELECT z.id, z.branch_id, b.name AS branch, z.name, z.note, z.active,
                   (SELECT count(*) FROM counterparty_branch_terms t JOIN counterparty c ON c.id = t.counterparty_id
                    WHERE t.sales_zone_id = z.id AND c.is_customer) AS customers
            FROM sales_zone z JOIN branch b ON b.id = z.branch_id""";

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final CurrentActor currentActor;

    SalesZoneController(JdbcClient jdbc, AuditLog audit, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @PreAuthorize(VIEW)
    @Transactional(readOnly = true)
    @Operation(summary = "Savdo zonalari (filial doirasida)", description = "branchId — bitta filial; activeOnly — faqat faollari; q — nom bo'yicha.")
    List<SalesZone> list(@RequestParam(required = false) Long branchId, @RequestParam(defaultValue = "false") boolean activeOnly,
            @RequestParam(required = false) String q) {
        Actor a = actor();
        if (branchId != null && !a.canAccessBranch(branchId)) {
            return List.of();
        }
        if (!a.allBranches() && a.branchId() == null) {
            return List.of();
        }
        String query = q == null ? "" : q.strip();
        return jdbc.sql(SELECT + """
                 WHERE (:all OR z.branch_id = :own) AND (CAST(:b AS BIGINT) IS NULL OR z.branch_id = :b) AND (NOT :ao OR z.active)
                   AND (:q = '' OR z.name ILIKE '%' || :q || '%')
                ORDER BY z.active DESC, b.name, z.name LIMIT 1000""")
                .param("all", a.allBranches())
                .param("own", a.branchId() == null ? -1L : a.branchId())
                .param("b", branchId)
                .param("ao", activeOnly)
                .param("q", query)
                .query(SalesZone.class)
                .list();
    }

    @GetMapping("/{id}/customers")
    @PreAuthorize(VIEW)
    @Transactional(readOnly = true)
    @Operation(summary = "Zona mijozlari")
    List<ZoneCustomer> customers(@PathVariable long id) {
        SalesZone z = scoped(id);
        return jdbc.sql("""
                SELECT c.id, c.name, c.tin, r.name AS region, c.active FROM counterparty_branch_terms t
                JOIN counterparty c ON c.id = t.counterparty_id LEFT JOIN region r ON r.id = c.region_id
                WHERE t.sales_zone_id = :z AND c.is_customer ORDER BY c.name LIMIT 2000""")
                .param("z", z.id())
                .query(ZoneCustomer.class)
                .list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(EDIT)
    @Transactional
    @Operation(summary = "Savdo zonasi qo'shish")
    SalesZone create(@Valid @RequestBody SalesZoneRequest r) {
        ensureBranch(r.branchId());
        String name = r.name().strip().replaceAll("\\s+", " ");
        ensureUnique(r.branchId(), name, 0L);
        long id = jdbc.sql("INSERT INTO sales_zone (branch_id, name, note) VALUES (:b, :n, :note) RETURNING id")
                .param("b", r.branchId())
                .param("n", name)
                .param("note", blankToNull(r.note()))
                .query(Long.class)
                .single();
        SalesZone z = find(id);
        audit.record(AuditEntry.of("salesZone.create", "sales_zone", id).change(null, snapshot(z)));
        return z;
    }

    @PutMapping("/{id}")
    @PreAuthorize(EDIT)
    @Transactional
    @Operation(summary = "Savdo zonasini tahrirlash", description = "Mijozlari bor zonaning filiali o'zgarmaydi.")
    SalesZone update(@PathVariable long id, @Valid @RequestBody SalesZoneRequest r) {
        SalesZone before = scopedForUpdate(id);
        ensureBranch(r.branchId());
        if (before.branchId() != r.branchId() && before.customers() > 0) {
            throw MedixException.conflict("salesZone.branchLocked", before.name());
        }
        String name = r.name().strip().replaceAll("\\s+", " ");
        ensureUnique(r.branchId(), name, id);
        jdbc.sql("UPDATE sales_zone SET branch_id = :b, name = :n, note = :note, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("b", r.branchId())
                .param("n", name)
                .param("note", blankToNull(r.note()))
                .param("id", id)
                .update();
        SalesZone after = find(id);
        audit.record(AuditEntry.of("salesZone.update", "sales_zone", id).change(snapshot(before), snapshot(after)));
        return after;
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize(EDIT)
    @Transactional
    @Operation(summary = "Faolsizlantirish", description = "Mijozlari zonada qoladi; yangi biriktirishda tanlanmaydi.")
    SalesZone deactivate(@PathVariable long id) {
        return setActive(id, false);
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize(EDIT)
    @Transactional
    @Operation(summary = "Faollashtirish")
    SalesZone activate(@PathVariable long id) {
        return setActive(id, true);
    }

    private SalesZone setActive(long id, boolean active) {
        SalesZone before = scopedForUpdate(id);
        if (before.active() == active) {
            return before;
        }
        jdbc.sql("UPDATE sales_zone SET active = :a, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("a", active)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of(active ? "salesZone.activate" : "salesZone.deactivate", "sales_zone", id)
                .change(Map.of("active", before.active()), Map.of("active", active)));
        return find(id);
    }

    private void ensureBranch(long branchId) {
        boolean ok = actor().canAccessBranch(branchId)
                && jdbc.sql("SELECT EXISTS (SELECT 1 FROM branch WHERE id = :b AND active)")
                        .param("b", branchId)
                        .query(Boolean.class)
                        .single();
        if (!ok) {
            throw MedixException.badRequest("employee.branchUnknown");
        }
    }

    private void ensureUnique(long branchId, String name, long exceptId) {
        boolean taken = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM sales_zone WHERE branch_id = :b AND lower(btrim(name)) = lower(:n) AND id <> :id)""")
                .param("b", branchId)
                .param("n", name)
                .param("id", exceptId)
                .query(Boolean.class)
                .single();
        if (taken) {
            throw MedixException.conflict("salesZone.duplicate", name);
        }
    }

    private SalesZone find(long id) {
        return jdbc.sql(SELECT + " WHERE z.id = :id")
                .param("id", id)
                .query(SalesZone.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    /** Boshqa filial zonasi — 404. */
    private SalesZone scoped(long id) {
        SalesZone z = find(id);
        if (!actor().canAccessBranch(z.branchId())) {
            throw MedixException.notFound("error.notFound");
        }
        return z;
    }

    private SalesZone scopedForUpdate(long id) {
        jdbc.sql("SELECT id FROM sales_zone WHERE id = :id FOR UPDATE").param("id", id).query(Long.class).optional();
        return scoped(id);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static Map<String, Object> snapshot(SalesZone z) {
        Map<String, Object> m = new HashMap<>();
        m.put("branchId", z.branchId());
        m.put("name", z.name());
        m.put("note", z.note());
        return m;
    }
}
