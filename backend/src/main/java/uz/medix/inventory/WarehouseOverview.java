package uz.medix.inventory;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * «Omborlar va zonalar» sahifasi (prototip AdminOrg → warehouses): filial → ombor daraxti, ombor maʼlumotlari
 * (manzil, omborchi, nazoratdagi / sovuq) va zonalar jadvali — har zona qoldigʻi (dona, mahsulotlar soni).
 */
@Service
public class WarehouseOverview {

    public record WarehouseZoneStock(long id, ZoneType type, String name, boolean sellable, boolean active, long qty, long products) {}

    public record WarehouseOverviewItem(long id, long branchId, String branchName, String branchCode, String name,
            @Schema(nullable = true) String address, boolean active, WarehouseKind kind,
            @Schema(nullable = true) Long keeperId, @Schema(nullable = true) String keeperName,
            long qty, long products, List<WarehouseZoneStock> zones) {}

    private final JdbcClient jdbc;

    WarehouseOverview(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private record Head(long id, long branchId, String branchName, String branchCode, String name, String address,
            boolean active, String kind, Long keeperId, String keeperName) {}

    /** {@code branchId == null} — barcha filiallar (chaqiruvchi filial doirasini tekshiradi). */
    @Transactional(readOnly = true)
    public List<WarehouseOverviewItem> list(Long branchId) {
        List<Head> heads = jdbc.sql("""
                SELECT w.id, w.branch_id, b.name AS branch_name, b.code AS branch_code, w.name, w.address, w.active, w.kind,
                       w.keeper_id, e.full_name AS keeper_name
                FROM warehouse w
                JOIN branch b ON b.id = w.branch_id
                LEFT JOIN employee e ON e.id = w.keeper_id
                WHERE CAST(:b AS BIGINT) IS NULL OR w.branch_id = :b
                ORDER BY b.name, b.id, w.name, w.id""")
                .param("b", branchId)
                .query(Head.class)
                .list();
        if (heads.isEmpty()) {
            return List.of();
        }
        Map<Long, List<WarehouseZoneStock>> zones = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT z.id, z.warehouse_id, z.type, z.name, z.sellable, z.active,
                       coalesce(sum(s.qty), 0) AS qty, count(DISTINCT s.product_id) AS products
                FROM zone z
                LEFT JOIN stock_balance s ON s.zone_id = z.id AND s.qty > 0
                WHERE z.warehouse_id IN (:w)
                GROUP BY z.id
                ORDER BY z.warehouse_id, z.id""")
                .param("w", heads.stream().map(Head::id).toList())
                .query((rs, n) -> {
                    zones.computeIfAbsent(rs.getLong("warehouse_id"), k -> new ArrayList<>())
                            .add(new WarehouseZoneStock(rs.getLong("id"), ZoneType.valueOf(rs.getString("type")), rs.getString("name"),
                                    rs.getBoolean("sellable"), rs.getBoolean("active"), rs.getLong("qty"), rs.getLong("products")));
                    return 0;
                })
                .list();
        Map<Long, Long> products = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT warehouse_id, count(DISTINCT product_id) AS n FROM stock_balance
                WHERE warehouse_id IN (:w) AND qty > 0 GROUP BY warehouse_id""")
                .param("w", heads.stream().map(Head::id).toList())
                .query((rs, n) -> {
                    products.put(rs.getLong("warehouse_id"), rs.getLong("n"));
                    return 0;
                })
                .list();
        List<WarehouseOverviewItem> out = new ArrayList<>();
        for (Head h : heads) {
            List<WarehouseZoneStock> zs = zones.getOrDefault(h.id(), List.of());
            long qty = zs.stream().mapToLong(WarehouseZoneStock::qty).sum();
            out.add(new WarehouseOverviewItem(h.id(), h.branchId(), h.branchName(), h.branchCode(), h.name(), h.address(), h.active(),
                    WarehouseKind.valueOf(h.kind()), h.keeperId(), h.keeperName(), qty, products.getOrDefault(h.id(), 0L),
                    List.copyOf(zs)));
        }
        return out;
    }
}
