package uz.medix.inventory;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Mahsulot kartochkasi (prototip `Products` → «Umumiy» yon xulosasi, «Qoldiqlar», «Harakatlar»): filial doirasidagi qoldiq
 * (zona × partiya, rezerv va mavjud), filiallar bo'yicha qoldiq, hujjatlar bo'yicha harakatlar (kirim/chiqim va qoldiq).
 * Tannarx faqat {@code special.cost} ruxsati bilan.
 */
@RestController
@RequestMapping("/api/stock/product-card")
@Tag(name = "stock", description = "Qoldiqlar")
class ProductStockCardController {

    private static final int MAX_MOVES = 200;

    record BranchQty(long branchId, String code, String name, long qty) {}

    record StockLine(
            long branchId,
            String branch,
            String warehouse,
            String zone,
            @Schema(description = "RECEIVING, MAIN, QUARANTINE, SHIPPING, COLD, SAFE") String zoneType,
            boolean sellable,
            long batchId,
            String batch,
            LocalDate expiryDate,
            @Schema(nullable = true, description = "Faqat special.cost bilan") String cost,
            long qty,
            long reserved,
            long available) {}

    record MoveRow(
            Instant at,
            String docType,
            long docId,
            String docNumber,
            String branch,
            String warehouse,
            long in,
            long out,
            @Schema(description = "Shu harakatdan keyingi qoldiq (filial doirasida)") long balance) {}

    record ProductStockCard(
            long total,
            long reserved,
            long available,
            long batches,
            @Schema(nullable = true) LocalDate nearestExpiry,
            @Schema(nullable = true, description = "O'rtacha tortilgan tannarx — faqat special.cost bilan") String avgCost,
            List<BranchQty> byBranch,
            List<StockLine> lines,
            List<MoveRow> moves) {}

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;

    ProductStockCardController(JdbcClient jdbc, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
    }

    @GetMapping("/{productId}")
    @Transactional(readOnly = true)
    @Operation(summary = "Mahsulot kartochkasi — qoldiq va harakatlar", description = "Filial doirasida; branchId — bitta filial.")
    ProductStockCard card(@PathVariable long productId, @Parameter(description = "Bitta filial") @RequestParam(required = false) Long branchId,
            Authentication auth) {
        Actor actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        if (branchId != null && !actor.canAccessBranch(branchId)) {
            throw MedixException.forbidden("auth.forbidden");
        }
        boolean exists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM product WHERE id = :p)").param("p", productId).query(Boolean.class).single();
        if (!exists) {
            throw MedixException.notFound("error.notFound");
        }
        boolean showCost = auth.getAuthorities().stream().anyMatch(a -> "special.cost".equals(a.getAuthority()));
        Map<String, Object> params = new HashMap<>();
        params.put("p", productId);
        StringBuilder scope = new StringBuilder();
        if (!actor.allBranches()) {
            scope.append(" AND x.branch_id = :own");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        if (branchId != null) {
            scope.append(" AND x.branch_id = :branch");
            params.put("branch", branchId);
        }
        List<StockLine> lines = jdbc.sql("""
                SELECT x.branch_id, br.name AS branch, w.name AS warehouse, z.name AS zone, z.type AS zone_type, z.sellable,
                       b.id AS batch_id, b.number AS batch, b.expiry_date, b.cost, x.qty, coalesce(r.qty, 0) AS reserved
                FROM stock_balance x
                JOIN batch b ON b.id = x.batch_id
                JOIN zone z ON z.id = x.zone_id
                JOIN warehouse w ON w.id = x.warehouse_id
                JOIN branch br ON br.id = x.branch_id
                LEFT JOIN (SELECT zone_id, batch_id, sum(qty) AS qty FROM stock_reservation WHERE status = 'ACTIVE'
                           GROUP BY zone_id, batch_id) r ON r.zone_id = x.zone_id AND r.batch_id = x.batch_id
                WHERE x.product_id = :p AND x.qty > 0""" + scope + """
                 ORDER BY br.name, br.id, w.name, w.id, b.expiry_date, b.number, z.id""")
                .params(params)
                .query((rs, n) -> {
                    long qty = rs.getLong("qty");
                    long reserved = Math.min(qty, rs.getLong("reserved"));
                    return new StockLine(rs.getLong("branch_id"), rs.getString("branch"), rs.getString("warehouse"), rs.getString("zone"),
                            rs.getString("zone_type"), rs.getBoolean("sellable"), rs.getLong("batch_id"), rs.getString("batch"),
                            rs.getDate("expiry_date").toLocalDate(), showCost ? new Money(rs.getBigDecimal("cost")).toString() : null, qty,
                            reserved, rs.getBoolean("sellable") ? qty - reserved : 0);
                })
                .list();

        long total = lines.stream().mapToLong(StockLine::qty).sum();
        long reserved = lines.stream().mapToLong(StockLine::reserved).sum();
        long available = lines.stream().mapToLong(StockLine::available).sum();
        long batches = lines.stream().map(StockLine::batchId).distinct().count();
        LocalDate nearest = lines.stream().map(StockLine::expiryDate).min(LocalDate::compareTo).orElse(null);
        String avgCost = null;
        if (showCost && total > 0) {
            BigDecimal value = jdbc.sql("SELECT coalesce(sum(x.qty * b.cost), 0) FROM stock_balance x JOIN batch b ON b.id = x.batch_id"
                            + " WHERE x.product_id = :p AND x.qty > 0" + scope)
                    .params(params)
                    .query(BigDecimal.class)
                    .single();
            avgCost = new Money(value.divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP)).toString();
        }
        List<BranchQty> byBranch = jdbc.sql("""
                SELECT br.id AS branch_id, br.code, br.name, coalesce(sum(x.qty), 0) AS qty
                FROM stock_balance x JOIN branch br ON br.id = x.branch_id
                WHERE x.product_id = :p AND x.qty > 0""" + scope + """
                 GROUP BY br.id, br.code, br.name ORDER BY qty DESC, br.name""")
                .params(params)
                .query(BranchQty.class)
                .list();
        // Harakatlar — hujjat × ombor bo'yicha; qoldiq — doiradagi barcha harakatlar yig'indisi (oyna funksiyasi LIMIT'dan oldin).
        List<MoveRow> moves = jdbc.sql("""
                SELECT at, doc_type, doc_id, doc_number, branch, warehouse, qty_in, qty_out,
                       sum(qty_in - qty_out) OVER (ORDER BY at, first_id) AS balance
                FROM (SELECT min(x.occurred_at) AS at, min(x.id) AS first_id, x.doc_type, x.doc_id, x.doc_number,
                             br.code AS branch, w.name AS warehouse,
                             coalesce(sum(x.qty) FILTER (WHERE x.qty > 0), 0) AS qty_in,
                             coalesce(-sum(x.qty) FILTER (WHERE x.qty < 0), 0) AS qty_out
                      FROM stock_move x JOIN branch br ON br.id = x.branch_id JOIN warehouse w ON w.id = x.warehouse_id
                      WHERE x.product_id = :p""" + scope + """
                      GROUP BY x.doc_type, x.doc_id, x.doc_number, br.code, w.id, w.name) g
                ORDER BY at DESC, first_id DESC LIMIT :limit""")
                .params(params)
                .param("limit", MAX_MOVES)
                .query((rs, n) -> new MoveRow(rs.getTimestamp("at").toInstant(), rs.getString("doc_type"), rs.getLong("doc_id"),
                        rs.getString("doc_number"), rs.getString("branch"), rs.getString("warehouse"), rs.getLong("qty_in"),
                        rs.getLong("qty_out"), rs.getLong("balance")))
                .list();
        return new ProductStockCard(total, reserved, available, batches, nearest, avgCost, byBranch, lines, moves);
    }
}
