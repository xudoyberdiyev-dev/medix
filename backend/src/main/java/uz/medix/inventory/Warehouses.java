package uz.medix.inventory;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;

/** Omborlar va zonalar — inventory modulining ochiq API'si. */
@Service
public class Warehouses {

    public record Zone(long id, ZoneType type, String name, boolean sellable) {}

    public record Warehouse(long id, long branchId, String name, @Schema(nullable = true) String address, boolean active,
            List<Zone> zones) {}

    private final JdbcClient jdbc;
    private final AuditLog audit;

    Warehouses(JdbcClient jdbc, AuditLog audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    /**
     * Ombor yaratadi; majburiy zonalar (Qabul, Asosiy saqlash, Karantin, Jo'natish) doim qo'shiladi,
     * {@code extraZones} — ixtiyoriy Sovuq va Seyf.
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public Warehouse create(long branchId, String name, String address, Set<ZoneType> extraZones) {
        boolean duplicate = jdbc.sql("SELECT EXISTS (SELECT 1 FROM warehouse WHERE branch_id = :b AND lower(name) = lower(:n))")
                .param("b", branchId)
                .param("n", name.strip())
                .query(Boolean.class)
                .single();
        if (duplicate) {
            throw MedixException.conflict("warehouse.duplicateName", name.strip());
        }
        long id = jdbc.sql("INSERT INTO warehouse (branch_id, name, address) VALUES (:b, :n, :a) RETURNING id")
                .param("b", branchId)
                .param("n", name.strip())
                .param("a", blankToNull(address))
                .query(Long.class)
                .single();
        Set<ZoneType> types = EnumSet.copyOf(ZoneType.REQUIRED);
        types.addAll(extraZones);
        for (ZoneType t : types) {
            jdbc.sql("INSERT INTO zone (warehouse_id, type, name) VALUES (:w, :t, :n)")
                    .param("w", id)
                    .param("t", t.name())
                    .param("n", t.defaultName())
                    .update();
        }
        Warehouse created = find(id);
        audit.record(AuditEntry.of("warehouse.create", "warehouse", id)
                .change(null, Map.of("branchId", branchId, "name", created.name(), "zones",
                        created.zones().stream().map(z -> z.type().name()).toList())));
        return created;
    }

    @Transactional(readOnly = true)
    public List<Warehouse> listByBranches(List<Long> branchIds) {
        if (branchIds.isEmpty()) {
            return List.of();
        }
        List<Long> ids = jdbc.sql("SELECT id FROM warehouse WHERE branch_id IN (:b) ORDER BY branch_id, name")
                .param("b", branchIds)
                .query(Long.class)
                .list();
        List<Warehouse> result = new ArrayList<>();
        for (Long id : ids) {
            result.add(find(id));
        }
        return result;
    }

    @Transactional(readOnly = true)
    public long countByBranch(long branchId) {
        return jdbc.sql("SELECT count(*) FROM warehouse WHERE branch_id = :b AND active")
                .param("b", branchId)
                .query(Long.class)
                .single();
    }

    private record Row(long id, long branchId, String name, String address, boolean active) {}

    private Warehouse find(long id) {
        Row w = jdbc.sql("SELECT id, branch_id, name, address, active FROM warehouse WHERE id = :id")
                .param("id", id)
                .query(Row.class)
                .single();
        Map<Long, Zone> zones = new LinkedHashMap<>();
        jdbc.sql("SELECT id, type, name, sellable FROM zone WHERE warehouse_id = :id ORDER BY id")
                .param("id", id)
                .query((rs, n) -> new Zone(rs.getLong("id"), ZoneType.valueOf(rs.getString("type")), rs.getString("name"),
                        rs.getBoolean("sellable")))
                .list()
                .forEach(z -> zones.put(z.id(), z));
        return new Warehouse(w.id(), w.branchId(), w.name(), w.address(), w.active(), List.copyOf(zones.values()));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
