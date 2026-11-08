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
            List<Zone> zones, WarehouseKind kind, @Schema(nullable = true) Long keeperId) {}

    /**
     * Ombor kartasi (prototip WarehousePanel): nom, manzil, tur, masʼul, ixtiyoriy zonalar (Sovuq, Seyf) va zona nomlari.
     * {@code zoneNames} da yoʻq zona — standart nomida qoladi (yangi) yoki oʻzgarmaydi (mavjud).
     */
    public record Spec(String name, String address, WarehouseKind kind, Long keeperId, Set<ZoneType> extraZones,
            Map<ZoneType, String> zoneNames) {}

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

    /** Ombor kartasidan yaratish: tur, masʼul va zona nomlari bilan. */
    @Transactional(propagation = Propagation.REQUIRED)
    public Warehouse create(long branchId, Spec spec) {
        checkZoneNames(spec, EnumSet.copyOf(ZoneType.REQUIRED), spec.extraZones());
        Warehouse created = create(branchId, spec.name(), spec.address(), spec.extraZones());
        return configure(created.id(), spec);
    }

    /**
     * Ombor kartasini saqlaydi: nom, manzil, tur, masʼul; ixtiyoriy zonalar qoʻshiladi yoki olib tashlanadi
     * (harakati bor zona olib tashlanmaydi), zona nomlari yangilanadi. Majburiy zonalar doim qoladi.
     */
    @Transactional
    public Warehouse configure(long id, Spec spec) {
        Warehouse before = lock(id);
        Set<ZoneType> extra = spec.extraZones() == null ? Set.of() : spec.extraZones();
        if (extra.stream().anyMatch(ZoneType.REQUIRED::contains)) {
            throw MedixException.badRequest("warehouse.extraZones");
        }
        checkZoneNames(spec, EnumSet.copyOf(ZoneType.REQUIRED), extra);
        if (!before.name().equals(spec.name().strip()) || !java.util.Objects.equals(before.address(), blankToNull(spec.address()))) {
            update(id, spec.name(), spec.address());
        }
        jdbc.sql("UPDATE warehouse SET kind = :k, keeper_id = :kp, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("k", (spec.kind() == null ? WarehouseKind.NORMAL : spec.kind()).name())
                .param("kp", spec.keeperId())
                .param("id", id)
                .update();
        for (Zone z : before.zones()) {
            if (!ZoneType.REQUIRED.contains(z.type()) && !extra.contains(z.type())) {
                removeZone(id, z);
            }
        }
        for (ZoneType t : extra) {
            if (before.zones().stream().noneMatch(z -> z.type() == t)) {
                addZone(id, t);
            }
        }
        Map<ZoneType, String> names = spec.zoneNames() == null ? Map.of() : spec.zoneNames();
        // Avval vaqtinchalik nomlar — zonalar nomlarini almashtirganda UNIQUE (warehouse_id, name) toʻqnashmasin
        List<Zone> current = find(id).zones();
        List<Zone> renamed = current.stream()
                .filter(z -> names.containsKey(z.type()) && !names.get(z.type()).strip().equals(z.name()))
                .toList();
        for (Zone z : renamed) {
            jdbc.sql("UPDATE zone SET name = :n WHERE id = :id").param("n", "~" + z.id()).param("id", z.id()).update();
        }
        for (Zone z : renamed) {
            String name = names.get(z.type()).strip();
            jdbc.sql("UPDATE zone SET name = :n, updated_at = now(), version = version + 1 WHERE id = :id")
                    .param("n", name)
                    .param("id", z.id())
                    .update();
            audit.record(AuditEntry.of("zone.update", "zone", z.id())
                    .change(Map.of("name", z.name()), Map.of("name", name)));
        }
        Warehouse after = find(id);
        if (before.kind() != after.kind() || !java.util.Objects.equals(before.keeperId(), after.keeperId())) {
            Map<String, Object> b = new java.util.HashMap<>();
            b.put("kind", before.kind().name());
            b.put("keeperId", before.keeperId());
            Map<String, Object> a = new java.util.HashMap<>();
            a.put("kind", after.kind().name());
            a.put("keeperId", after.keeperId());
            audit.record(AuditEntry.of("warehouse.update", "warehouse", id).change(b, a));
        }
        return after;
    }

    /**
     * Xodimni filialdagi omborlarga omborchi (masʼul) qilib biriktiradi (prototip WizStaff «Omborlari»): berilgan omborlar
     * unga oʻtadi, avval unga biriktirilgan, roʻyxatda yoʻq omborlar boʻshatiladi. Boshqa filial ombori — xato.
     */
    @Transactional
    public void assignKeeper(long employeeId, Long branchId, java.util.Collection<Long> warehouseIds) {
        Set<Long> ids = warehouseIds == null ? Set.of() : new java.util.TreeSet<>(warehouseIds);
        if (!ids.isEmpty()) {
            long ok = jdbc.sql("SELECT count(*) FROM warehouse WHERE id IN (:ids) AND branch_id = :b")
                    .param("ids", ids)
                    .param("b", branchId == null ? -1L : branchId)
                    .query(Long.class)
                    .single();
            if (ok != ids.size()) {
                throw MedixException.badRequest("employee.warehouseInvalid");
            }
        }
        List<Long> before = keeperWarehouses(employeeId);
        jdbc.sql("UPDATE warehouse SET keeper_id = NULL, updated_at = now(), version = version + 1 WHERE keeper_id = :e"
                        + (ids.isEmpty() ? "" : " AND id NOT IN (:ids)"))
                .param("e", employeeId)
                .param("ids", ids.isEmpty() ? List.of(-1L) : ids)
                .update();
        if (!ids.isEmpty()) {
            jdbc.sql("UPDATE warehouse SET keeper_id = :e, updated_at = now(), version = version + 1 WHERE id IN (:ids) AND keeper_id IS DISTINCT FROM :e")
                    .param("e", employeeId)
                    .param("ids", ids)
                    .update();
        }
        if (!new java.util.TreeSet<>(before).equals(ids)) {
            audit.record(AuditEntry.of("warehouse.keeper", "employee", employeeId)
                    .change(Map.of("warehouseIds", before), Map.of("warehouseIds", List.copyOf(ids))));
        }
    }

    /** Xodim omborchi boʻlgan omborlar. */
    @Transactional(readOnly = true)
    public List<Long> keeperWarehouses(long employeeId) {
        return jdbc.sql("SELECT id FROM warehouse WHERE keeper_id = :e ORDER BY id").param("e", employeeId).query(Long.class).list();
    }

    /**
     * Hali ishlatilmagan omborni oʻchiradi (sozlash ustasi). Harakati yoki hujjati bor ombor oʻchirilmaydi —
     * u faqat nofaol qilinadi (SPEC 13).
     */
    @Transactional
    public void delete(long id) {
        Warehouse before = lock(id);
        try {
            jdbc.sql("DELETE FROM zone WHERE warehouse_id = :id").param("id", id).update();
            jdbc.sql("DELETE FROM warehouse WHERE id = :id").param("id", id).update();
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            throw MedixException.conflict("warehouse.inUse", before.name());
        }
        audit.record(AuditEntry.of("warehouse.delete", "warehouse", id)
                .change(Map.of("branchId", before.branchId(), "name", before.name()), null));
    }

    private void removeZone(long warehouseId, Zone z) {
        try {
            jdbc.sql("DELETE FROM zone WHERE id = :id").param("id", z.id()).update();
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            throw MedixException.conflict("warehouse.zoneInUse", z.name());
        }
        audit.record(AuditEntry.of("zone.delete", "zone", z.id())
                .change(Map.of("warehouseId", warehouseId, "type", z.type().name()), null));
    }

    private static void checkZoneNames(Spec spec, Set<ZoneType> required, Set<ZoneType> extra) {
        Map<ZoneType, String> names = spec.zoneNames() == null ? Map.of() : spec.zoneNames();
        Set<String> seen = new java.util.HashSet<>();
        Set<ZoneType> all = EnumSet.copyOf(required);
        if (extra != null) {
            all.addAll(extra);
        }
        for (ZoneType t : all) {
            String n = names.getOrDefault(t, t.defaultName());
            if (n == null || n.isBlank() || n.strip().length() > 100) {
                throw MedixException.badRequest("warehouse.zoneName");
            }
            if (!seen.add(n.strip().toLowerCase(java.util.Locale.ROOT))) {
                throw MedixException.conflict("warehouse.zoneDuplicateName", n.strip());
            }
        }
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

    /** Barcha omborlar (filial doirasini chaqiruvchi qo'llaydi). */
    @Transactional(readOnly = true)
    public List<Warehouse> listAll() {
        List<Long> branchIds = jdbc.sql("SELECT id FROM branch ORDER BY id").query(Long.class).list();
        return listByBranches(branchIds);
    }

    @Transactional(readOnly = true)
    public java.util.Optional<Warehouse> findById(long id) {
        boolean exists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM warehouse WHERE id = :id)")
                .param("id", id)
                .query(Boolean.class)
                .single();
        return exists ? java.util.Optional.of(find(id)) : java.util.Optional.empty();
    }

    /** Faol filial bormi — ombor faqat faol filialga qo'shiladi. */
    @Transactional(readOnly = true)
    public boolean branchActive(long branchId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM branch WHERE id = :b AND active)")
                .param("b", branchId)
                .query(Boolean.class)
                .single();
    }

    @Transactional
    public Warehouse update(long id, String name, String address) {
        Warehouse before = lock(id);
        boolean duplicate = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM warehouse WHERE branch_id = :b AND lower(name) = lower(:n) AND id <> :id)""")
                .param("b", before.branchId())
                .param("n", name.strip())
                .param("id", id)
                .query(Boolean.class)
                .single();
        if (duplicate) {
            throw MedixException.conflict("warehouse.duplicateName", name.strip());
        }
        jdbc.sql("UPDATE warehouse SET name = :n, address = :a, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("n", name.strip())
                .param("a", blankToNull(address))
                .param("id", id)
                .update();
        Warehouse after = find(id);
        audit.record(AuditEntry.of("warehouse.update", "warehouse", id)
                .change(snapshot(before), snapshot(after)));
        return after;
    }

    /** Ixtiyoriy zona (Sovuq yoki Seyf) qo'shadi. Majburiy zonalar ombor yaratilganda bor. */
    @Transactional
    public Warehouse addZone(long id, ZoneType type) {
        lock(id);
        if (ZoneType.REQUIRED.contains(type)) {
            throw MedixException.badRequest("warehouse.extraZones");
        }
        boolean exists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM zone WHERE warehouse_id = :w AND type = :t)")
                .param("w", id)
                .param("t", type.name())
                .query(Boolean.class)
                .single();
        if (exists) {
            throw MedixException.conflict("warehouse.zoneExists", type.defaultName());
        }
        long zoneId = jdbc.sql("INSERT INTO zone (warehouse_id, type, name) VALUES (:w, :t, :n) RETURNING id")
                .param("w", id)
                .param("t", type.name())
                .param("n", type.defaultName())
                .query(Long.class)
                .single();
        audit.record(AuditEntry.of("zone.create", "zone", zoneId)
                .change(null, Map.of("warehouseId", id, "type", type.name())));
        return find(id);
    }

    /** Zona nomini o'zgartiradi (turi va sotuvga ochiqligi o'zgarmaydi). */
    @Transactional
    public Warehouse renameZone(long warehouseId, long zoneId, String name) {
        Warehouse w = lock(warehouseId);
        Zone zone = w.zones().stream().filter(z -> z.id() == zoneId).findFirst()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        boolean duplicate = w.zones().stream().anyMatch(z -> z.id() != zoneId && z.name().equalsIgnoreCase(name.strip()));
        if (duplicate) {
            throw MedixException.conflict("warehouse.zoneDuplicateName", name.strip());
        }
        jdbc.sql("UPDATE zone SET name = :n, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("n", name.strip())
                .param("id", zoneId)
                .update();
        audit.record(AuditEntry.of("zone.update", "zone", zoneId)
                .change(Map.of("name", zone.name()), Map.of("name", name.strip())));
        return find(warehouseId);
    }

    /**
     * Omborni faollashtirish / nofaol qilish (SPEC 13-qoida: o'chirilmaydi).
     * Qoldig'i bor yoki o'tkazilmagan BQ qoralamasi bor omborni nofaol qilib bo'lmaydi.
     */
    @Transactional
    public Warehouse setActive(long id, boolean active, String reason) {
        Warehouse before = lock(id);
        if (before.active() == active) {
            return before;
        }
        if (active && !branchActive(before.branchId())) {
            throw MedixException.conflict("warehouse.branchInactive");
        }
        if (!active) {
            long stock = jdbc.sql("SELECT coalesce(sum(qty), 0) FROM stock_balance WHERE warehouse_id = :w")
                    .param("w", id)
                    .query(Long.class)
                    .single();
            if (stock > 0) {
                throw MedixException.conflict("warehouse.hasStock", String.valueOf(stock));
            }
            List<String> drafts = jdbc.sql("SELECT number FROM opening_balance WHERE warehouse_id = :w AND status = 'DRAFT' ORDER BY id LIMIT 3")
                    .param("w", id)
                    .query(String.class)
                    .list();
            if (!drafts.isEmpty()) {
                throw MedixException.conflict("warehouse.hasDrafts", String.join(", ", drafts));
            }
        }
        jdbc.sql("UPDATE warehouse SET active = :a, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("a", active)
                .param("id", id)
                .update();
        var entry = AuditEntry.of(active ? "warehouse.activate" : "warehouse.deactivate", "warehouse", id)
                .change(Map.of("active", before.active()), Map.of("active", active));
        audit.record(reason == null || reason.isBlank() ? entry : entry.withReason(reason.strip()));
        return find(id);
    }

    private Warehouse lock(long id) {
        jdbc.sql("SELECT id FROM warehouse WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query(Long.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        return find(id);
    }

    private static Map<String, Object> snapshot(Warehouse w) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("name", w.name());
        m.put("address", w.address());
        return m;
    }

    private record Row(long id, long branchId, String name, String address, boolean active, String kind, Long keeperId) {}

    private Warehouse find(long id) {
        Row w = jdbc.sql("SELECT id, branch_id, name, address, active, kind, keeper_id FROM warehouse WHERE id = :id")
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
        return new Warehouse(w.id(), w.branchId(), w.name(), w.address(), w.active(), List.copyOf(zones.values()),
                WarehouseKind.valueOf(w.kind()), w.keeperId());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
