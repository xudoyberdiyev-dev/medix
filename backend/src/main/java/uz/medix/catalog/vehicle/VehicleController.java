package uz.medix.catalog.vehicle;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
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
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Mashinalar (Ma'lumotnomalar → Mashinalar): filialga tegishli, reys tuzishda tanlanadi (SPEC 5.2).
 * Ko'rish — filial doirasida; o'zgartirish — Direktor, Bosh administrator, Filial rahbari, Ombor mudiri.
 */
@RestController
@RequestMapping("/api/vehicles")
@Tag(name = "vehicles", description = "Mashinalar")
class VehicleController {

    private static final String MANAGE = "hasAnyRole('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER')";

    record Vehicle(long id, long branchId, String plateNumber, String model, @Schema(nullable = true) Integer capacityBoxes,
            boolean active) {}

    record VehicleRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotBlank(message = "{validation.required}") @Size(max = 20) String plateNumber,
            @NotBlank(message = "{validation.required}") @Size(max = 100) String model,
            @Schema(nullable = true, description = "Sig'imi — joylar (quti) soni") @Min(1) @Max(100000) Integer capacityBoxes) {}

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final CurrentActor currentActor;

    VehicleController(JdbcClient jdbc, AuditLog audit, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "Mashinalar (filial doirasida)")
    List<Vehicle> list() {
        Actor a = actor();
        if (!a.allBranches() && a.branchId() == null) {
            return List.of();
        }
        return jdbc.sql("""
                SELECT id, branch_id, plate_number, model, capacity_boxes, active FROM vehicle
                WHERE (:all OR branch_id = :b) ORDER BY active DESC, plate_number""")
                .param("all", a.allBranches())
                .param("b", a.branchId() == null ? -1L : a.branchId())
                .query(Vehicle.class)
                .list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(MANAGE)
    @Transactional
    @Operation(summary = "Mashina qo'shish")
    Vehicle create(@Valid @RequestBody VehicleRequest r) {
        ensureBranch(r.branchId());
        String plate = normalizePlate(r.plateNumber());
        ensureUniquePlate(plate, 0L);
        long id = jdbc.sql("""
                INSERT INTO vehicle (branch_id, plate_number, model, capacity_boxes) VALUES (:b, :p, :m, :c) RETURNING id""")
                .param("b", r.branchId())
                .param("p", plate)
                .param("m", r.model().strip())
                .param("c", r.capacityBoxes())
                .query(Long.class)
                .single();
        Vehicle v = find(id);
        audit.record(AuditEntry.of("vehicle.create", "vehicle", id).change(null, snapshot(v)));
        return v;
    }

    @PutMapping("/{id}")
    @PreAuthorize(MANAGE)
    @Transactional
    @Operation(summary = "Mashinani tahrirlash")
    Vehicle update(@PathVariable long id, @Valid @RequestBody VehicleRequest r) {
        Vehicle before = scopedForUpdate(id);
        ensureBranch(r.branchId());
        String plate = normalizePlate(r.plateNumber());
        ensureUniquePlate(plate, id);
        jdbc.sql("""
                UPDATE vehicle SET branch_id = :b, plate_number = :p, model = :m, capacity_boxes = :c,
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("b", r.branchId())
                .param("p", plate)
                .param("m", r.model().strip())
                .param("c", r.capacityBoxes())
                .param("id", id)
                .update();
        Vehicle after = find(id);
        audit.record(AuditEntry.of("vehicle.update", "vehicle", id).change(snapshot(before), snapshot(after)));
        return after;
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize(MANAGE)
    @Transactional
    @Operation(summary = "Nofaol qilish")
    Vehicle deactivate(@PathVariable long id) {
        return setActive(id, false);
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize(MANAGE)
    @Transactional
    @Operation(summary = "Faollashtirish")
    Vehicle activate(@PathVariable long id) {
        return setActive(id, true);
    }

    private Vehicle setActive(long id, boolean active) {
        Vehicle before = scopedForUpdate(id);
        if (before.active() == active) {
            return before;
        }
        jdbc.sql("UPDATE vehicle SET active = :a, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("a", active)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of(active ? "vehicle.activate" : "vehicle.deactivate", "vehicle", id)
                .change(Map.of("active", before.active()), Map.of("active", active)));
        return find(id);
    }

    /** «01 a 123 bc» → «01 A 123 BC». */
    static String normalizePlate(String raw) {
        String p = raw.strip().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT);
        if (!p.matches("^[0-9A-Z ]{5,20}$")) {
            throw MedixException.badRequest("vehicle.plate");
        }
        return p;
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

    private void ensureUniquePlate(String plate, long exceptId) {
        boolean taken = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM vehicle WHERE replace(plate_number, ' ', '') = replace(:p, ' ', '') AND id <> :id)""")
                .param("p", plate)
                .param("id", exceptId)
                .query(Boolean.class)
                .single();
        if (taken) {
            throw MedixException.conflict("vehicle.duplicate", plate);
        }
    }

    private Vehicle find(long id) {
        return jdbc.sql("SELECT id, branch_id, plate_number, model, capacity_boxes, active FROM vehicle WHERE id = :id")
                .param("id", id)
                .query(Vehicle.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    /** Boshqa filial mashinasi — 404. */
    private Vehicle scopedForUpdate(long id) {
        jdbc.sql("SELECT id FROM vehicle WHERE id = :id FOR UPDATE").param("id", id).query(Long.class).optional();
        Vehicle v = find(id);
        if (!actor().canAccessBranch(v.branchId())) {
            throw MedixException.notFound("error.notFound");
        }
        return v;
    }

    private static Map<String, Object> snapshot(Vehicle v) {
        Map<String, Object> m = new HashMap<>();
        m.put("branchId", v.branchId());
        m.put("plateNumber", v.plateNumber());
        m.put("model", v.model());
        m.put("capacityBoxes", v.capacityBoxes());
        return m;
    }
}
