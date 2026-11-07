package uz.medix.inventory;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
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
 * Qoldiqlar va Muddat nazorati (SPEC 4). Filial doirasi serverda. Tannarx faqat {@code special.cost} ruxsati borlarga yuboriladi
 * (SPEC 13: «API ham tannarx maydonini yubormaydi»).
 */
@RestController
@RequestMapping("/api/stock")
@Tag(name = "stock", description = "Qoldiqlar")
class StockController {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    static final int MAX_EXPORT_ROWS = 50_000;

    record StockRow(
            long productId,
            String productCode,
            String productName,
            @Schema(nullable = true) String manufacturer,
            long batchId,
            String batchNumber,
            LocalDate expiryDate,
            @Schema(description = "Yaroqlilikka qolgan kunlar (manfiy — o'tgan)") long daysLeft,
            long warehouseId,
            String warehouse,
            long zoneId,
            String zone,
            ZoneType zoneType,
            boolean sellable,
            int qty,
            @Schema(nullable = true, description = "Faqat special.cost ruxsati bilan") String cost,
            boolean bonus) {}

    record StockPage(List<StockRow> items, long total, int page, int size, @Schema(description = "Sahifadagi emas, filtr bo'yicha jami") long totalQty) {}

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;
    private final Clock clock;

    StockController(JdbcClient jdbc, CurrentActor currentActor, Clock clock) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
        this.clock = clock;
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('stock.view', 'expiry.view')")
    @Transactional(readOnly = true)
    @Operation(summary = "Qoldiqlar (zona × partiya)", description = "expiringWithinDays — muddat nazorati: shu kun ichida tugaydigan yoki o'tganlar.")
    StockPage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "false") boolean sellableOnly,
            @RequestParam(required = false) Integer expiringWithinDays,
            @Parameter(description = "Berilmasa: nom (muddat nazoratida — yaroqlilik)") @RequestParam(required = false) StockSort sort,
            @RequestParam(defaultValue = "false") boolean desc,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            Authentication auth) {
        return query(branchId, warehouseId, q, sellableOnly, expiringWithinDays, orderBy(sort, desc, expiringWithinDays != null),
                Math.max(page, 0), Math.clamp(size, 1, 200), auth);
    }

    /** Qoldiqlar .xlsx — jadvaldagi filtrlar bilan, ko'pi bilan {@value #MAX_EXPORT_ROWS} qator. Tannarx faqat special.cost bilan. */
    @GetMapping("/export")
    @PreAuthorize("hasAnyAuthority('stock.view', 'expiry.view')")
    @Transactional(readOnly = true)
    @Operation(summary = "Excel'ga eksport (.xlsx)")
    void export(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "false") boolean sellableOnly,
            @RequestParam(required = false) Integer expiringWithinDays,
            @RequestParam(required = false) StockSort sort,
            @RequestParam(defaultValue = "false") boolean desc,
            Authentication auth,
            HttpServletResponse response) throws IOException {
        StockPage data = query(branchId, warehouseId, q, sellableOnly, expiringWithinDays, orderBy(sort, desc, expiringWithinDays != null), 0,
                MAX_EXPORT_ROWS, auth);
        boolean showCost = auth.getAuthorities().stream().anyMatch(a -> "special.cost".equals(a.getAuthority()));
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition",
                "attachment; filename=\"" + (expiringWithinDays != null ? "muddat-nazorati.xlsx" : "qoldiqlar.xlsx") + "\"");
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet(expiringWithinDays != null ? "Muddat nazorati" : "Qoldiqlar");
            CellStyle header = wb.createCellStyle();
            Font font = wb.createFont();
            font.setBold(true);
            header.setFont(font);
            CellStyle date = wb.createCellStyle();
            date.setDataFormat(wb.createDataFormat().getFormat("dd.mm.yyyy"));
            CellStyle money = wb.createCellStyle();
            money.setAlignment(org.apache.poi.ss.usermodel.HorizontalAlignment.RIGHT);
            List<String> titles = new java.util.ArrayList<>(List.of("Kod", "Mahsulot", "Ishlab chiqaruvchi", "Partiya", "Bonus", "Yaroqlilik",
                    "Qolgan kun", "Ombor", "Zona", "Sotuvga ochiq", "Miqdor"));
            if (showCost) {
                titles.addAll(List.of("Tannarx", "Summa (tannarx)"));
            }
            Row h = sheet.createRow(0);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(header);
            }
            int r = 1;
            for (StockRow s : data.items()) {
                Row row = sheet.createRow(r++);
                int i = 0;
                row.createCell(i++).setCellValue(s.productCode());
                row.createCell(i++).setCellValue(s.productName());
                row.createCell(i++).setCellValue(s.manufacturer() == null ? "" : s.manufacturer());
                row.createCell(i++).setCellValue(s.batchNumber());
                row.createCell(i++).setCellValue(s.bonus() ? "ha" : "yoʻq");
                Cell exp = row.createCell(i++);
                exp.setCellValue(s.expiryDate());
                exp.setCellStyle(date);
                row.createCell(i++).setCellValue(s.daysLeft());
                row.createCell(i++).setCellValue(s.warehouse());
                row.createCell(i++).setCellValue(s.zone());
                row.createCell(i++).setCellValue(s.sellable() ? "ha" : "yoʻq");
                row.createCell(i++).setCellValue(s.qty());
                if (showCost && s.cost() != null) {
                    // Pul matn sifatida (1.250.000,00): float/double ishlatilmaydi (CLAUDE.md), hisob BigDecimal da.
                    Money cost = Money.of(s.cost());
                    Cell c1 = row.createCell(i++);
                    c1.setCellValue(cost.format());
                    c1.setCellStyle(money);
                    Cell c2 = row.createCell(i);
                    c2.setCellValue(cost.times(s.qty()).format());
                    c2.setCellStyle(money);
                }
            }
            int[] widths = {11, 45, 24, 16, 8, 12, 10, 20, 16, 12, 10, 16, 18};
            for (int i = 0; i < titles.size(); i++) {
                sheet.setColumnWidth(i, widths[i] * 256);
            }
            sheet.createFreezePane(0, 1);
            wb.write(response.getOutputStream());
        }
    }

    /** Jadval saralash ustuni (SPEC 4 «Jadvallar standarti»). */
    enum StockSort { NAME, CODE, EXPIRY, QTY, WAREHOUSE }

    static String orderBy(StockSort sort, boolean desc, boolean expiryControl) {
        String dir = desc ? " DESC" : "";
        StockSort s = sort != null ? sort : expiryControl ? StockSort.EXPIRY : StockSort.NAME;
        return switch (s) {
            case NAME -> "lower(p.name)" + dir + ", b.expiry_date";
            case CODE -> "p.code" + dir + ", b.expiry_date";
            case EXPIRY -> "b.expiry_date" + dir + ", lower(p.name)";
            case QTY -> "s.qty" + dir + ", lower(p.name)";
            case WAREHOUSE -> "lower(w.name)" + dir + ", lower(z.name), lower(p.name)";
        };
    }

    private StockPage query(Long branchId, Long warehouseId, String q, boolean sellableOnly, Integer expiringWithinDays, String orderBy,
            int safePage, int safeSize, Authentication auth) {
        Actor actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        boolean showCost = auth.getAuthorities().stream().anyMatch(a -> "special.cost".equals(a.getAuthority()));
        LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
        StringBuilder where = new StringBuilder(" WHERE s.qty > 0");
        Map<String, Object> params = new HashMap<>();
        if (!actor.allBranches()) {
            where.append(" AND s.branch_id = :own");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        if (branchId != null) {
            where.append(" AND s.branch_id = :branch");
            params.put("branch", branchId);
        }
        if (warehouseId != null) {
            where.append(" AND s.warehouse_id = :wh");
            params.put("wh", warehouseId);
        }
        if (sellableOnly) {
            where.append(" AND z.sellable");
        }
        if (expiringWithinDays != null) {
            where.append(" AND b.expiry_date <= :limit");
            params.put("limit", Date.valueOf(today.plusDays(Math.max(0, expiringWithinDays))));
        }
        String nq = SearchText.normalize(q);
        if (!nq.isEmpty()) {
            String[] parts = nq.split(" ");
            where.append(" AND (p.code = :exact OR b.number = :exact OR (true");
            for (int i = 0; i < parts.length && i < 8; i++) {
                where.append(" AND p.search_text LIKE :w").append(i).append(" ESCAPE '\\'");
                params.put("w" + i, "%" + SearchText.likeEscape(parts[i]) + "%");
            }
            where.append("))");
            params.put("exact", q.strip());
        }
        // Bo'sh joy bilan boshlanadi: matn bloki boshidagi bo'shliqlarni olib tashlaydi.
        String from = " FROM stock_balance s JOIN batch b ON b.id = s.batch_id JOIN product p ON p.id = s.product_id"
                + " JOIN zone z ON z.id = s.zone_id JOIN warehouse w ON w.id = s.warehouse_id"
                + " LEFT JOIN manufacturer m ON m.id = p.manufacturer_id";
        record Totals(long total, long totalQty) {}
        Totals totals = jdbc.sql("SELECT count(*) AS total, coalesce(sum(s.qty), 0) AS total_qty" + from + where)
                .params(params)
                .query(Totals.class)
                .single();
        List<StockRow> items = jdbc.sql("""
                SELECT p.id AS product_id, p.code, p.name, m.name AS manufacturer, b.id AS batch_id, b.number, b.expiry_date,
                       w.id AS warehouse_id, w.name AS warehouse, z.id AS zone_id, z.name AS zone, z.type, z.sellable, s.qty, b.cost, b.bonus
                """ + from + where + " ORDER BY " + orderBy
                        + ", s.zone_id, s.batch_id LIMIT :l OFFSET :o")
                .params(params)
                .param("l", safeSize)
                .param("o", (long) safePage * safeSize)
                .query((rs, n) -> {
                    LocalDate expiry = rs.getDate("expiry_date").toLocalDate();
                    return new StockRow(rs.getLong("product_id"), rs.getString("code"), rs.getString("name"), rs.getString("manufacturer"),
                            rs.getLong("batch_id"), rs.getString("number"), expiry, java.time.temporal.ChronoUnit.DAYS.between(today, expiry),
                            rs.getLong("warehouse_id"), rs.getString("warehouse"), rs.getLong("zone_id"), rs.getString("zone"),
                            ZoneType.valueOf(rs.getString("type")), rs.getBoolean("sellable"), rs.getInt("qty"),
                            showCost ? new Money(rs.getBigDecimal("cost")).toString() : null, rs.getBoolean("bonus"));
                })
                .list();
        return new StockPage(items, totals.total(), safePage, safeSize, totals.totalQty());
    }
}
