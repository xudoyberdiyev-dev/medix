package uz.medix.inventory;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;
import uz.medix.shared.text.SearchText;

/**
 * Qoldiqlar ekrani (prototip «Stock»): mahsulot bo'yicha jamlanma (jami / band / mavjud / yopiq / jo'natish zonasida, partiyalar,
 * eng yaqin yaroqlilik, tannarx va sotuv narxida summa, oxirgi kirim) hamda kartalar va filtr variantlari (soni bilan).
 * «Yopiq» — Qabul, Karantin zonalari va muddati o'tgan partiyalar; «Mavjud» — sotuvga ochiq zonada, muddati o'tmagan, band qilinmagan.
 */
@RestController
@RequestMapping("/api/stock")
@Tag(name = "stock", description = "Qoldiqlar")
class StockOverviewController {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    /** Muddat nazorati chegarasi (sidebar nishoni bilan bir xil). */
    static final int EXPIRY_WARN_DAYS = 90;

    enum ExpiryBucket { EXPIRED, D0_30, D31_60, D61_90, D90_PLUS }

    enum StockState { HAS, ZERO, ALL_RESERVED }

    enum StockFlag { MARKED, CONTROLLED, PRESCRIPTION, BONUS }

    enum ProductSort { NAME, CODE, TOTAL, AVAILABLE, RESERVED, BATCHES, NEAREST_EXPIRY, COST_SUM, SALE_SUM, LAST_IN }

    record ProductStockRow(
            long productId,
            String code,
            String name,
            @Schema(nullable = true) String manufacturer,
            @Schema(nullable = true) String category,
            @Schema(nullable = true) String country,
            String unit,
            int total,
            int reserved,
            int available,
            @Schema(description = "Qabul, Karantin va muddati o'tgan") int closed,
            int shipping,
            int batches,
            @Schema(nullable = true) LocalDate nearestExpiry,
            @Schema(nullable = true, description = "Eng yaqin yaroqlilikka qolgan kun (manfiy — o'tgan)") Long nearestDays,
            @Schema(nullable = true, description = "Faqat special.cost ruxsati bilan") String costSum,
            @Schema(description = "Bazaviy narx turida (partiya narxi, bo'lmasa mahsulot narxi), QQS bilan") String saleSum,
            @Schema(nullable = true) LocalDate lastIn,
            @Schema(nullable = true) String supplyBy,
            boolean marked,
            boolean controlled,
            boolean prescription,
            @Schema(description = "Qoldiqda bonus partiya bor") boolean bonus) {}

    record ProductStockPage(
            List<ProductStockRow> items,
            long total,
            int page,
            int size,
            @Schema(description = "Filtr bo'yicha jami (sahifadagi emas)") long totalQty,
            long availableQty,
            @Schema(nullable = true) String costSum,
            String saleSum) {}

    record Facet(@Schema(description = "0 — belgilanmagan (masalan, boshlang'ich qoldiq: yetkazib beruvchi yo'q)") long id,
            @Schema(nullable = true) String name, long count) {}

    record CodeCount(String code, long count) {}

    record StockSummary(
            @Schema(description = "Qoldig'i bor mahsulotlar") long products,
            @Schema(nullable = true, description = "Tannarxda qoldiq — faqat special.cost") String value,
            @Schema(description = "0–90 kun ichida tugaydigan partiyalar") long near,
            long expired,
            @Schema(description = "Karantindagi partiyalar") long quarantine,
            @Schema(description = "Yo'lda (ombor ko'chirishi jo'natilgan, qabul qilinmagan) — dona") long transitQty,
            long transitDocs,
            @Schema(description = "Variantlar soni — partiya × zona qatorlari, filial doirasida") List<Facet> warehouses,
            List<Facet> manufacturers,
            List<Facet> categories,
            List<Facet> countries,
            List<Facet> supplyBy,
            List<Facet> suppliers,
            List<CodeCount> zoneTypes,
            List<CodeCount> expiry) {}

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;
    private final Clock clock;

    StockOverviewController(JdbcClient jdbc, CurrentActor currentActor, Clock clock) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
        this.clock = clock;
    }

    @GetMapping("/products")
    @PreAuthorize("hasAuthority('stock.view')")
    @Transactional(readOnly = true)
    @Operation(summary = "Qoldiqlar — mahsulot bo'yicha", description = "Partiya filtrlari (ombor, zona, muddat, yetkazib beruvchi, bonus) "
            + "jamlanadigan qatorlarni tanlaydi; mahsulot filtrlari — mahsulotni. stock=ZERO — qoldig'i yo'q faol mahsulotlar.")
    ProductStockPage products(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) List<Long> warehouseId,
            @RequestParam(required = false) List<ZoneType> zoneType,
            @RequestParam(required = false) List<ExpiryBucket> expiry,
            @RequestParam(required = false) List<StockState> stock,
            @RequestParam(required = false) List<Long> manufacturerId,
            @RequestParam(required = false) List<Long> categoryId,
            @Parameter(description = "0 — davlati belgilanmagan") @RequestParam(required = false) List<Long> countryId,
            @Parameter(description = "0 — ta'minot mas'uli belgilanmagan") @RequestParam(required = false) List<Long> supplyEmployeeId,
            @Parameter(description = "0 — yetkazib beruvchisiz (boshlang'ich qoldiq va b.)") @RequestParam(required = false) List<Long> supplierId,
            @RequestParam(required = false) List<StockFlag> flag,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) ProductSort sort,
            @RequestParam(defaultValue = "false") boolean desc,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            Authentication auth) {
        Actor actor = actor();
        boolean showCost = showCost(auth);
        LocalDate today = today();
        Map<String, Object> params = new HashMap<>();
        params.put("today", Date.valueOf(today));
        StringBuilder w = new StringBuilder(" WHERE s.qty > 0");
        scope(actor, branchId, w, params);
        in(w, params, "s.warehouse_id", "wh", warehouseId, false);
        if (zoneType != null && !zoneType.isEmpty()) {
            w.append(" AND z.type IN (:zt)");
            params.put("zt", zoneType.stream().map(Enum::name).toList());
        }
        if (expiry != null && !expiry.isEmpty()) {
            List<String> or = new ArrayList<>();
            for (ExpiryBucket e : expiry) {
                or.add(switch (e) {
                    case EXPIRED -> "b.expiry_date < :today";
                    case D0_30 -> "(b.expiry_date - :today) BETWEEN 0 AND 30";
                    case D31_60 -> "(b.expiry_date - :today) BETWEEN 31 AND 60";
                    case D61_90 -> "(b.expiry_date - :today) BETWEEN 61 AND 90";
                    case D90_PLUS -> "(b.expiry_date - :today) > 90";
                });
            }
            w.append(" AND (").append(String.join(" OR ", or)).append(")");
        }
        in(w, params, "rc.supplier_id", "sup", supplierId, true);
        if (flag != null && !flag.isEmpty()) {
            List<String> or = new ArrayList<>();
            for (StockFlag f : flag) {
                or.add(switch (f) {
                    case MARKED -> "p.marked";
                    case CONTROLLED -> "p.controlled";
                    case PRESCRIPTION -> "p.prescription";
                    case BONUS -> "b.bonus";
                });
            }
            w.append(" AND (").append(String.join(" OR ", or)).append(")");
        }
        // Mahsulot filtrlari (qoldig'i yo'q mahsulotlarga ham)
        StringBuilder pw = new StringBuilder();
        in(pw, params, "p.manufacturer_id", "mf", manufacturerId, false);
        in(pw, params, "p.category_id", "cat", categoryId, false);
        in(pw, params, "p.country_id", "cn", countryId, true);
        in(pw, params, "p.supply_employee_id", "se", supplyEmployeeId, true);
        if (flag != null && !flag.isEmpty() && !flag.contains(StockFlag.BONUS)) {
            List<String> or = new ArrayList<>();
            flag.forEach(f -> or.add(switch (f) {
                case MARKED -> "p.marked";
                case CONTROLLED -> "p.controlled";
                case PRESCRIPTION -> "p.prescription";
                case BONUS -> "false";
            }));
            pw.append(" AND (").append(String.join(" OR ", or)).append(")");
        }
        String nq = SearchText.normalize(q);
        if (!nq.isEmpty()) {
            String[] parts = nq.split(" ");
            pw.append(" AND (p.code = :exact OR EXISTS (SELECT 1 FROM bal x WHERE x.product_id = p.id AND (x.batch_number = :exact OR x.receipt_number = :exact))"
                    + " OR (true");
            for (int i = 0; i < parts.length && i < 8; i++) {
                pw.append(" AND p.search_text LIKE :q").append(i).append(" ESCAPE '\\'");
                params.put("q" + i, "%" + SearchText.likeEscape(parts[i]) + "%");
            }
            pw.append("))");
            params.put("exact", q.strip());
        }
        List<String> st = new ArrayList<>();
        boolean zero = stock != null && stock.contains(StockState.ZERO);
        if (stock == null || stock.isEmpty() || stock.contains(StockState.HAS)) {
            st.add("a.product_id IS NOT NULL");
        }
        if (stock != null && stock.contains(StockState.ALL_RESERVED)) {
            st.add("(a.product_id IS NOT NULL AND a.available = 0 AND a.reserved > 0)");
        }
        if (zero) {
            st.add("(a.product_id IS NULL AND p.active)");
        }
        String base = cte(w) + """
                , agg AS (
                    SELECT product_id, sum(qty) AS total, sum(res) AS reserved,
                           sum(CASE WHEN sellable AND NOT expired THEN qty - res ELSE 0 END) AS available,
                           sum(CASE WHEN zone_type IN ('RECEIVING', 'QUARANTINE') OR expired THEN qty ELSE 0 END) AS closed,
                           sum(CASE WHEN zone_type = 'SHIPPING' AND NOT expired THEN qty ELSE 0 END) AS shipping,
                           count(DISTINCT batch_id) AS batches, min(expiry_date) AS nearest,
                           sum(qty * cost) AS cost_sum, coalesce(sum(qty * sale_price), 0) AS sale_sum,
                           max(receipt_date) AS last_in, bool_or(bonus) AS bonus
                    FROM bal GROUP BY product_id)
                """;
        String from = " FROM product p LEFT JOIN agg a ON a.product_id = p.id"
                + " LEFT JOIN manufacturer m ON m.id = p.manufacturer_id LEFT JOIN category c ON c.id = p.category_id"
                + " LEFT JOIN country co ON co.id = p.country_id JOIN unit u ON u.id = p.unit_id"
                + " LEFT JOIN employee se ON se.id = p.supply_employee_id"
                + " WHERE (" + String.join(" OR ", st) + ")" + pw;
        record Totals(long total, long totalQty, long availableQty, BigDecimal costSum, BigDecimal saleSum) {}
        Totals totals = jdbc.sql(base + "SELECT count(*) AS total, coalesce(sum(a.total), 0) AS total_qty, coalesce(sum(a.available), 0) AS available_qty,"
                        + " coalesce(sum(a.cost_sum), 0) AS cost_sum, coalesce(sum(a.sale_sum), 0) AS sale_sum" + from)
                .params(params)
                .query(Totals.class)
                .single();
        int safePage = Math.max(page, 0);
        int safeSize = Math.clamp(size, 1, 200);
        List<ProductStockRow> items = jdbc.sql(base + """
                SELECT p.id, p.code, p.name, m.name AS manufacturer, c.name AS category, co.name AS country,
                       coalesce(u.short_name, u.name) AS unit, coalesce(a.total, 0) AS total, coalesce(a.reserved, 0) AS reserved,
                       coalesce(a.available, 0) AS available, coalesce(a.closed, 0) AS closed, coalesce(a.shipping, 0) AS shipping,
                       coalesce(a.batches, 0) AS batches, a.nearest, coalesce(a.cost_sum, 0) AS cost_sum, coalesce(a.sale_sum, 0) AS sale_sum,
                       a.last_in, se.full_name AS supply_by, p.marked, p.controlled, p.prescription, coalesce(a.bonus, false) AS bonus
                """ + from + " ORDER BY " + orderBy(sort, desc) + ", p.id LIMIT :l OFFSET :o")
                .params(params)
                .param("l", safeSize)
                .param("o", (long) safePage * safeSize)
                .query((rs, n) -> {
                    Date nearest = rs.getDate("nearest");
                    Date lastIn = rs.getDate("last_in");
                    LocalDate ne = nearest == null ? null : nearest.toLocalDate();
                    return new ProductStockRow(rs.getLong("id"), rs.getString("code"), rs.getString("name"), rs.getString("manufacturer"),
                            rs.getString("category"), rs.getString("country"), rs.getString("unit"), rs.getInt("total"), rs.getInt("reserved"),
                            rs.getInt("available"), rs.getInt("closed"), rs.getInt("shipping"), rs.getInt("batches"), ne,
                            ne == null ? null : ChronoUnit.DAYS.between(today, ne),
                            showCost ? new Money(rs.getBigDecimal("cost_sum")).toString() : null,
                            new Money(rs.getBigDecimal("sale_sum")).toString(), lastIn == null ? null : lastIn.toLocalDate(),
                            rs.getString("supply_by"), rs.getBoolean("marked"), rs.getBoolean("controlled"), rs.getBoolean("prescription"),
                            rs.getBoolean("bonus"));
                })
                .list();
        return new ProductStockPage(items, totals.total(), safePage, safeSize, totals.totalQty(), totals.availableQty(),
                showCost ? new Money(totals.costSum()).toString() : null, new Money(totals.saleSum()).toString());
    }

    @GetMapping("/summary")
    @PreAuthorize("hasAuthority('stock.view')")
    @Transactional(readOnly = true)
    @Operation(summary = "Qoldiqlar — kartalar va filtr variantlari", description = "Filial doirasida (boshqa filtrlarsiz).")
    StockSummary summary(@RequestParam(required = false) Long branchId, Authentication auth) {
        Actor actor = actor();
        Map<String, Object> params = new HashMap<>();
        params.put("today", Date.valueOf(today()));
        StringBuilder w = new StringBuilder(" WHERE s.qty > 0");
        scope(actor, branchId, w, params);
        String cte = cte(w);
        record Kpi(long products, BigDecimal value, long near, long expired, long quarantine) {}
        Kpi k = jdbc.sql(cte + """
                SELECT count(DISTINCT product_id) AS products, coalesce(sum(qty * cost), 0) AS value,
                       count(DISTINCT batch_id) FILTER (WHERE NOT expired AND expiry_date - :today <= :warn) AS near,
                       count(DISTINCT batch_id) FILTER (WHERE expired) AS expired,
                       count(DISTINCT batch_id) FILTER (WHERE zone_type = 'QUARANTINE') AS quarantine
                FROM bal""")
                .params(params)
                .param("warn", EXPIRY_WARN_DAYS)
                .query(Kpi.class)
                .single();
        StringBuilder tw = new StringBuilder(" WHERE t.status = 'IN_TRANSIT'");
        if (params.containsKey("own")) {
            tw.append(" AND t.branch_id = :own");
        }
        if (params.containsKey("branch")) {
            tw.append(" AND t.branch_id = :branch");
        }
        record Transit(long qty, long docs) {}
        Transit tr = jdbc.sql("SELECT coalesce(sum(l.qty), 0) AS qty, count(DISTINCT t.id) AS docs FROM warehouse_transfer t"
                        + " JOIN warehouse_transfer_line l ON l.transfer_id = t.id" + tw)
                .params(params)
                .query(Transit.class)
                .single();
        boolean all = !params.containsKey("own") && !params.containsKey("branch");
        String whName = all ? "w.name || ' · ' || br.code" : "w.name";
        List<Facet> warehouses = facets(cte, "bal.warehouse_id", whName,
                "JOIN warehouse w ON w.id = bal.warehouse_id JOIN branch br ON br.id = w.branch_id", params);
        List<Facet> manufacturers = facets(cte, "p.manufacturer_id", "m.name",
                "JOIN product p ON p.id = bal.product_id LEFT JOIN manufacturer m ON m.id = p.manufacturer_id", params);
        List<Facet> categories = facets(cte, "p.category_id", "c.name",
                "JOIN product p ON p.id = bal.product_id LEFT JOIN category c ON c.id = p.category_id", params);
        List<Facet> countries = facets(cte, "p.country_id", "c.name",
                "JOIN product p ON p.id = bal.product_id LEFT JOIN country c ON c.id = p.country_id", params);
        List<Facet> supplyBy = facets(cte, "p.supply_employee_id", "e.full_name",
                "JOIN product p ON p.id = bal.product_id LEFT JOIN employee e ON e.id = p.supply_employee_id", params);
        List<Facet> suppliers = facets(cte, "bal.supplier_id", "cp.name", "LEFT JOIN counterparty cp ON cp.id = bal.supplier_id", params);
        List<CodeCount> zones = jdbc.sql(cte + "SELECT zone_type AS code, count(*) AS count FROM bal GROUP BY zone_type ORDER BY zone_type")
                .params(params)
                .query(CodeCount.class)
                .list();
        List<CodeCount> exp = jdbc.sql(cte + """
                SELECT b AS code, count(*) AS count FROM (
                    SELECT CASE WHEN expired THEN 'EXPIRED' WHEN expiry_date - :today <= 30 THEN 'D0_30'
                                WHEN expiry_date - :today <= 60 THEN 'D31_60' WHEN expiry_date - :today <= 90 THEN 'D61_90'
                                ELSE 'D90_PLUS' END AS b FROM bal) x GROUP BY b ORDER BY b""")
                .params(params)
                .query(CodeCount.class)
                .list();
        return new StockSummary(k.products(), showCost(auth) ? new Money(k.value()).toString() : null, k.near(), k.expired(), k.quarantine(),
                tr.qty(), tr.docs(), warehouses, manufacturers, categories, countries, supplyBy, suppliers, zones, exp);
    }

    private List<Facet> facets(String cte, String idExpr, String nameExpr, String joins, Map<String, Object> params) {
        return jdbc.sql(cte + "SELECT coalesce(" + idExpr + ", 0) AS id, " + nameExpr + " AS name, count(*) AS count FROM bal " + joins
                        + " GROUP BY 1, 2 ORDER BY count(*) DESC, 2 NULLS LAST LIMIT 500")
                .params(params)
                .query(Facet.class)
                .list();
    }

    /**
     * Partiya × zona qatorlari (qoldiq > 0): band qilingan miqdor, muddati o'tganmi, kirim hujjati (yetkazib beruvchi, sana) va
     * bazaviy sotuv narxi (partiya narxi, bo'lmasa mahsulot narxi — shu filialda, bugungi sanada).
     */
    private static String cte(CharSequence where) {
        return """
                WITH bal AS (
                    SELECT s.product_id, s.batch_id, s.zone_id, s.warehouse_id, s.branch_id, s.qty, z.type AS zone_type, z.sellable,
                           b.number AS batch_number, b.expiry_date, b.expiry_date < :today AS expired, b.cost, b.bonus,
                           rc.supplier_id, rc.number AS receipt_number, rc.receipt_date,
                           coalesce((SELECT sum(r.qty) FROM stock_reservation r
                                     WHERE r.zone_id = s.zone_id AND r.batch_id = s.batch_id AND r.status = 'ACTIVE'), 0) AS res,
                           coalesce((SELECT bp.amount FROM batch_price bp
                                     WHERE bp.batch_id = s.batch_id AND bp.branch_id = s.branch_id AND bp.effective_from <= :today
                                       AND bp.price_type_id = (SELECT id FROM price_type WHERE base)
                                     ORDER BY bp.effective_from DESC, bp.id DESC LIMIT 1),
                                    (SELECT pr.amount FROM price pr
                                     WHERE pr.product_id = s.product_id AND pr.branch_id = s.branch_id AND pr.effective_from <= :today
                                       AND pr.price_type_id = (SELECT id FROM price_type WHERE base)
                                     ORDER BY pr.effective_from DESC, pr.id DESC LIMIT 1)) AS sale_price
                    FROM stock_balance s JOIN batch b ON b.id = s.batch_id JOIN zone z ON z.id = s.zone_id JOIN product p ON p.id = s.product_id
                    LEFT JOIN LATERAL (SELECT r.supplier_id, r.number, r.receipt_date FROM receipt_line l JOIN receipt r ON r.id = l.receipt_id
                                       WHERE b.source_type = 'KR' AND l.id = b.source_id) rc ON true
                """ + where + ")\n";
    }

    private static void scope(Actor actor, Long branchId, StringBuilder w, Map<String, Object> params) {
        if (!actor.allBranches()) {
            w.append(" AND s.branch_id = :own");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        if (branchId != null) {
            w.append(" AND s.branch_id = :branch");
            params.put("branch", branchId);
        }
    }

    /** {@code col IN (:name)}; {@code nullable} bo'lsa 0 qiymati — «belgilanmagan» (IS NULL). */
    private static void in(StringBuilder w, Map<String, Object> params, String col, String name, List<Long> ids, boolean nullable) {
        if (ids == null || ids.isEmpty()) {
            return;
        }
        List<Long> real = ids.stream().filter(i -> i != null && i > 0).distinct().toList();
        boolean none = nullable && ids.contains(0L);
        List<String> or = new ArrayList<>();
        if (!real.isEmpty()) {
            or.add(col + " IN (:" + name + ")");
            params.put(name, real);
        }
        if (none) {
            or.add(col + " IS NULL");
        }
        w.append(or.isEmpty() ? " AND false" : " AND (" + String.join(" OR ", or) + ")");
    }

    static String orderBy(ProductSort sort, boolean desc) {
        String d = desc ? " DESC NULLS LAST" : " NULLS LAST";
        return switch (sort == null ? ProductSort.NAME : sort) {
            case NAME -> "lower(p.name)" + (desc ? " DESC" : "");
            case CODE -> "p.code" + (desc ? " DESC" : "");
            case TOTAL -> "a.total" + d + ", lower(p.name)";
            case AVAILABLE -> "a.available" + d + ", lower(p.name)";
            case RESERVED -> "a.reserved" + d + ", lower(p.name)";
            case BATCHES -> "a.batches" + d + ", lower(p.name)";
            case NEAREST_EXPIRY -> "a.nearest" + d + ", lower(p.name)";
            case COST_SUM -> "a.cost_sum" + d + ", lower(p.name)";
            case SALE_SUM -> "a.sale_sum" + d + ", lower(p.name)";
            case LAST_IN -> "a.last_in" + d + ", lower(p.name)";
        };
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(TASHKENT));
    }

    private static boolean showCost(Authentication auth) {
        return auth.getAuthorities().stream().anyMatch(a -> "special.cost".equals(a.getAuthority()));
    }
}
