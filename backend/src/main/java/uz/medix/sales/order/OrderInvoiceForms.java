package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.PrintSetup;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/**
 * O18 (egasi 17.11.2026, shablon `docs/notes/faktura-shablonlar-egasi.xlsx`): 5 xil faktura (Excel) va chiqarishdan oldin qo'lda
 * tuzatish. Asl qatorlar — buyurtma qatorlari × yig'ilgan partiyalar (har partiya alohida qator: seriya, muddat); tuzatishlar faqat
 * faylga ta'sir qiladi va buyurtmaga saqlanadi (5 turda umumiy), «Asl holatiga» — o'chiriladi. Ombor fakturalari Худуд bo'yicha.
 */
@Service
class OrderInvoiceForms {

    /** Faktura turi — ustunlar AYNAN shablondagidek. */
    enum FormType {
        WAREHOUSE("Фактура для склада", true, List.of("№", "Худуд", "Махсулот номи", "Ишлаб чикарувчиси", "Серия", "Сони", "Яроклик муддати",
                "Ул/Бирлиги", "ККС билан Нархи", "ККС билан Жами киймати (Сумма)")),
        WAREHOUSE2("Фактура для склада №2", false, List.of("№", "Худуд", "Махсулот номи", "Ишлаб чикарувчиси", "Серия", "Сони",
                "Яроклик муддати", "Ул/Бирлиги")),
        CLIENT_SEND("Фактура для Клиентов отправка", true, List.of("№", "Фарм ИД", "Махсулот номи", "Ишлаб чикарувчиси", "Серия", "Сони",
                "Яроклик муддати", "Ул/Бирлиги", "ККС билан Нархи", "ККС билан Жами киймати (Сумма)")),
        CLIENT1("Фактура Для клиента №1", true, List.of("№", "Махсулот номи", "Ишлаб чикарувчиси", "Серия", "Сони", "Яроклик муддати",
                "Ул/Бирлиги", "ККС билан Нархи", "ККС билан Жами киймати (Сумма)")),
        CLIENT2("Фактура Для Клиента №2", true, List.of("№", "Махсулот номи", "Ишлаб чикарувчиси", "Сони", "Яроклик муддати", "Ул/Бирлиги",
                "ККС билан Нархи", "ККС билан Жами киймати (Сумма)"));

        final String title;
        final boolean priced;
        final List<String> columns;

        FormType(String title, boolean priced, List<String> columns) {
            this.title = title;
            this.priced = priced;
            this.columns = columns;
        }

        boolean warehouse() {
            return this == WAREHOUSE || this == WAREHOUSE2;
        }
    }

    record FormRow(
            @Schema(nullable = true, description = "Худуд — buyurtma omboridagi joy (O13)") @Size(max = 60) String area,
            @Schema(nullable = true) @Size(max = 50) String farmId,
            @NotBlank(message = "{validation.required}") @Size(max = 300) String name,
            @Schema(nullable = true) @Size(max = 200) String manufacturer,
            @Schema(nullable = true, description = "Серия (partiya)") @Size(max = 60) String series,
            @Min(0) int qty,
            @Schema(nullable = true, description = "Яроклик муддати — DD.MM.YYYY yoki erkin matn") @Size(max = 20) String expiry,
            @Schema(nullable = true) @Size(max = 20) String unit,
            @Schema(nullable = true, description = "ККС билан Нархи (narx ko'rish ruxsatisiz — null)") @Pattern(regexp = "\\d{1,16}(\\.\\d{1,2})?")
            String price,
            @Schema(nullable = true, description = "ККС билан Жами — qty × price") String total) {}

    record InvoiceForms(
            long orderId,
            String orderNumber,
            LocalDate date,
            String customer,
            @Schema(nullable = true) String tin,
            String warehouse,
            @Schema(description = "Joriy qatorlar (tuzatilgan bo'lsa — tuzatilgani)") List<FormRow> rows,
            @Schema(description = "Asl qatorlar (buyurtmadan)") List<FormRow> original,
            boolean edited,
            @Schema(nullable = true) String editedBy,
            @Schema(nullable = true) Instant editedAt,
            boolean canEdit,
            boolean canSeePrices) {}

    record SaveRequest(@NotNull @Size(max = 1000) List<@Valid FormRow> rows) {}

    private record Head(long id, String number, LocalDate date, String customer, String tin, String warehouse, long warehouseId, long branchId) {}

    private static final DateTimeFormatter DMY = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final AuditLog audit;

    OrderInvoiceForms(JdbcClient jdbc, AuditLog audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    private Head head(Actor actor, long id) {
        return jdbc.sql("""
                SELECT o.id, o.number, o.created_at, coalesce(nullif(btrim(c.legal_name), ''), c.name) AS customer, c.tin, w.name AS warehouse,
                       o.warehouse_id, o.branch_id
                FROM sales_order o JOIN counterparty c ON c.id = o.customer_id JOIN warehouse w ON w.id = o.warehouse_id WHERE o.id = :id""")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"),
                        rs.getTimestamp("created_at").toInstant().atZone(TASHKENT).toLocalDate(), rs.getString("customer"), rs.getString("tin"),
                        rs.getString("warehouse"), rs.getLong("warehouse_id"), rs.getLong("branch_id")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    /** Asl qatorlar: har buyurtma qatori × sof yig'ilgan partiya; yig'ilmagan qator — partiyasiz bitta qator. */
    List<FormRow> original(long orderId, long warehouseId) {
        record Raw(long lineId, int lineNo, String area, String farmId, String name, String manufacturer, String unit, int lineQty, BigDecimal price,
                String series, Date expiry, Integer pickedQty) {}
        List<Raw> raw = jdbc.sql("""
                SELECT l.id, l.line_no, pl.location AS area, p.farm_id, p.name, m.name AS manufacturer, coalesce(u.short_name, u.name) AS unit, l.qty,
                       l.price, b.number AS series, b.expiry_date, t.qty AS picked
                FROM sales_order_line l
                JOIN product p ON p.id = l.product_id
                LEFT JOIN manufacturer m ON m.id = p.manufacturer_id
                LEFT JOIN unit u ON u.id = p.unit_id
                LEFT JOIN product_location pl ON pl.product_id = p.id AND pl.warehouse_id = :w
                LEFT JOIN LATERAL (
                    SELECT x.batch_id, sum(x.qty)::int AS qty FROM (
                        SELECT batch_id, qty FROM sales_order_pick WHERE order_id = l.order_id AND line_id = l.id
                        UNION ALL
                        SELECT r.batch_id, -r.qty FROM sales_order_pick_return r WHERE r.order_id = l.order_id
                          AND r.batch_id IN (SELECT batch_id FROM sales_order_pick WHERE order_id = l.order_id AND line_id = l.id)) x
                    GROUP BY x.batch_id HAVING sum(x.qty) > 0) t ON true
                LEFT JOIN batch b ON b.id = t.batch_id
                WHERE l.order_id = :o
                ORDER BY l.line_no, b.expiry_date NULLS LAST, b.id""")
                .param("o", orderId)
                .param("w", warehouseId)
                .query((rs, n) -> new Raw(rs.getLong("id"), rs.getInt("line_no"), rs.getString("area"), rs.getString("farm_id"), rs.getString("name"),
                        rs.getString("manufacturer"), rs.getString("unit"), rs.getInt("qty"), rs.getBigDecimal("price"), rs.getString("series"),
                        rs.getDate("expiry_date"), (Integer) rs.getObject("picked")))
                .list();
        List<FormRow> out = new ArrayList<>();
        for (Raw r : raw) {
            int qty = r.pickedQty() == null ? r.lineQty() : r.pickedQty();
            BigDecimal price = r.price() == null ? BigDecimal.ZERO : r.price();
            out.add(row(r.area(), r.farmId(), r.name(), r.manufacturer(), r.series(), qty,
                    r.expiry() == null ? null : DMY.format(r.expiry().toLocalDate()), r.unit(), price));
        }
        return out;
    }

    private static FormRow row(String area, String farmId, String name, String manufacturer, String series, int qty, String expiry, String unit,
            BigDecimal price) {
        BigDecimal p = price.setScale(2, RoundingMode.HALF_UP);
        return new FormRow(area, farmId, name, manufacturer, series, qty, expiry, unit, p.toPlainString(),
                p.multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP).toPlainString());
    }

    private static FormRow hidePrice(FormRow r) {
        return new FormRow(r.area(), r.farmId(), r.name(), r.manufacturer(), r.series(), r.qty(), r.expiry(), r.unit(), null, null);
    }

    private List<FormRow> saved(long orderId) {
        return jdbc.sql("""
                SELECT area, farm_id, name, manufacturer, series, qty, expiry, unit, price FROM order_invoice_edit_row WHERE order_id = :o ORDER BY pos""")
                .param("o", orderId)
                .query((rs, n) -> row(rs.getString("area"), rs.getString("farm_id"), rs.getString("name"), rs.getString("manufacturer"),
                        rs.getString("series"), rs.getInt("qty"), rs.getString("expiry"), rs.getString("unit"), rs.getBigDecimal("price")))
                .list();
    }

    @Transactional(readOnly = true)
    InvoiceForms get(Actor actor, long id, boolean prices, boolean canEdit) {
        Head h = head(actor, id);
        List<FormRow> original = original(id, h.warehouseId());
        record Meta(String by, Instant at) {}
        Meta meta = jdbc.sql("""
                SELECT e.full_name, x.updated_at FROM order_invoice_edit x JOIN employee e ON e.id = x.updated_by WHERE x.order_id = :o""")
                .param("o", id)
                .query((rs, n) -> new Meta(rs.getString("full_name"), rs.getTimestamp("updated_at").toInstant()))
                .optional()
                .orElse(null);
        List<FormRow> rows = meta == null ? original : saved(id);
        if (!prices) {
            rows = rows.stream().map(OrderInvoiceForms::hidePrice).toList();
            original = original.stream().map(OrderInvoiceForms::hidePrice).toList();
        }
        return new InvoiceForms(h.id(), h.number(), h.date(), h.customer(), h.tin(), h.warehouse(), rows, original, meta != null,
                meta == null ? null : meta.by(), meta == null ? null : meta.at(), canEdit, prices);
    }

    /** Tuzatilgan holatni saqlaydi (avtosaqlash): faqat fayl uchun — buyurtma, qoldiq, qarz o'zgarmaydi. Audit — nechta qator o'zgardi. */
    @Transactional
    InvoiceForms save(Actor actor, long id, List<FormRow> rows, boolean prices) {
        Head h = head(actor, id);
        jdbc.sql("SELECT id FROM sales_order WHERE id = :id FOR UPDATE").param("id", id).query(Long.class).single();
        List<FormRow> before = jdbc.sql("SELECT 1 FROM order_invoice_edit WHERE order_id = :o").param("o", id).query(Integer.class).optional()
                .isPresent() ? saved(id) : original(id, h.warehouseId());
        jdbc.sql("DELETE FROM order_invoice_edit_row WHERE order_id = :o").param("o", id).update();
        jdbc.sql("""
                INSERT INTO order_invoice_edit (order_id, updated_by) VALUES (:o, :by)
                ON CONFLICT (order_id) DO UPDATE SET updated_by = :by, updated_at = now()""")
                .param("o", id).param("by", actor.employeeId()).update();
        int pos = 0;
        for (FormRow r : rows) {
            jdbc.sql("""
                    INSERT INTO order_invoice_edit_row (order_id, pos, area, farm_id, name, manufacturer, series, qty, expiry, unit, price)
                    VALUES (:o, :p, :area, :farm, :name, :man, :ser, :qty, :exp, :unit, :price)""")
                    .param("o", id)
                    .param("p", ++pos)
                    .param("area", blank(r.area()))
                    .param("farm", blank(r.farmId()))
                    .param("name", r.name().strip())
                    .param("man", blank(r.manufacturer()))
                    .param("ser", blank(r.series()))
                    .param("qty", r.qty())
                    .param("exp", blank(r.expiry()))
                    .param("unit", blank(r.unit()))
                    .param("price", r.price() == null ? BigDecimal.ZERO : new BigDecimal(r.price()))
                    .update();
        }
        int changed = 0;
        for (int i = 0; i < Math.max(before.size(), rows.size()); i++) {
            FormRow a = i < before.size() ? before.get(i) : null;
            FormRow b = i < rows.size() ? rows.get(i) : null;
            if (a == null || b == null || !same(a, b)) {
                changed++;
            }
        }
        audit.record(AuditEntry.of("order.invoiceEdit", "sales_order", id)
                .change(Map.of("rows", before.size()), Map.of("rows", rows.size(), "changedRows", changed)), actor);
        return get(actor, id, prices, true);
    }

    /** «Asl holatiga qaytarish» — saqlangan tuzatishlar o'chiriladi. */
    @Transactional
    InvoiceForms revert(Actor actor, long id, boolean prices) {
        head(actor, id);
        int n = jdbc.sql("DELETE FROM order_invoice_edit WHERE order_id = :o").param("o", id).update();
        if (n > 0) {
            audit.record(AuditEntry.of("order.invoiceRevert", "sales_order", id).change(Map.of("edited", true), Map.of("edited", false)), actor);
        }
        return get(actor, id, prices, true);
    }

    private static boolean same(FormRow a, FormRow b) {
        return java.util.Objects.equals(blank(a.area()), blank(b.area())) && java.util.Objects.equals(blank(a.farmId()), blank(b.farmId()))
                && a.name().strip().equals(b.name().strip()) && java.util.Objects.equals(blank(a.manufacturer()), blank(b.manufacturer()))
                && java.util.Objects.equals(blank(a.series()), blank(b.series())) && a.qty() == b.qty()
                && java.util.Objects.equals(blank(a.expiry()), blank(b.expiry())) && java.util.Objects.equals(blank(a.unit()), blank(b.unit()))
                && (a.price() == null || b.price() == null || new BigDecimal(a.price()).compareTo(new BigDecimal(b.price())) == 0);
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    /** Excel: sarlavha bloki, ustunlar shablondagidek, «Жами» (soni va summa); albom, sahifaga sig'adi, sarlavha har sahifada. */
    @Transactional(readOnly = true)
    byte[] xlsx(Actor actor, long id, FormType type, boolean prices) {
        if (type.priced && !prices) {
            throw MedixException.forbidden("invoiceForms.noPrices");
        }
        InvoiceForms f = get(actor, id, prices, false);
        List<FormRow> rows = new ArrayList<>(f.rows());
        if (type.warehouse() && !f.edited()) {
            rows.sort(Comparator.comparing((FormRow r) -> r.area() == null ? "￿" : r.area().toLowerCase(java.util.Locale.ROOT)));
        }
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet s = wb.createSheet(type.title.replace("№", "N"));
            Font bf = wb.createFont();
            bf.setBold(true);
            CellStyle bold = wb.createCellStyle();
            bold.setFont(bf);
            CellStyle head = box(wb, true);
            head.setAlignment(HorizontalAlignment.CENTER);
            CellStyle text = box(wb, false);
            CellStyle qty = box(wb, false);
            qty.setAlignment(HorizontalAlignment.RIGHT);
            CellStyle money = box(wb, false);
            money.setDataFormat(wb.createDataFormat().getFormat("#,##0.00"));
            CellStyle totText = box(wb, true);
            CellStyle totMoney = box(wb, true);
            totMoney.setDataFormat(wb.createDataFormat().getFormat("#,##0.00"));
            int cols = type.columns.size();
            int r = 0;
            r = line(s, r, type.title, bold, cols);
            r = line(s, r, "Буюртма № " + f.orderNumber() + " · " + DMY.format(f.date()), null, cols);
            r = line(s, r, "Мижоз: " + f.customer() + (f.tin() == null ? "" : " · СТИР " + f.tin()), null, cols);
            r = line(s, r, "Омбор: " + f.warehouse(), null, cols);
            r++;
            int headerRow = r;
            Row hr = s.createRow(r++);
            for (int i = 0; i < cols; i++) {
                hr.createCell(i).setCellValue(type.columns.get(i));
                hr.getCell(i).setCellStyle(head);
            }
            long qtySum = 0;
            BigDecimal sum = BigDecimal.ZERO;
            int n = 0;
            for (FormRow x : rows) {
                Row row = s.createRow(r++);
                int c = 0;
                for (String col : type.columns) {
                    var cell = row.createCell(c++);
                    switch (col) {
                        case "№" -> {
                            cell.setCellValue(++n);
                            cell.setCellStyle(qty);
                        }
                        case "Худуд" -> text(cell, x.area(), text);
                        case "Фарм ИД" -> text(cell, x.farmId(), text);
                        case "Махсулот номи" -> text(cell, x.name(), text);
                        case "Ишлаб чикарувчиси" -> text(cell, x.manufacturer(), text);
                        case "Серия" -> text(cell, x.series(), text);
                        case "Сони" -> {
                            cell.setCellValue(x.qty());
                            cell.setCellStyle(qty);
                        }
                        case "Яроклик муддати" -> text(cell, x.expiry(), text);
                        case "Ул/Бирлиги" -> text(cell, x.unit(), text);
                        case "ККС билан Нархи" -> {
                            cell.setCellValue(new BigDecimal(x.price() == null ? "0" : x.price()).doubleValue());
                            cell.setCellStyle(money);
                        }
                        default -> {
                            cell.setCellValue(new BigDecimal(x.total() == null ? "0" : x.total()).doubleValue());
                            cell.setCellStyle(money);
                        }
                    }
                }
                qtySum += x.qty();
                sum = sum.add(x.total() == null ? BigDecimal.ZERO : new BigDecimal(x.total()));
            }
            Row tot = s.createRow(r);
            for (int i = 0; i < cols; i++) {
                tot.createCell(i).setCellStyle(totText);
            }
            tot.getCell(0).setCellValue("Жами");
            int qtyCol = type.columns.indexOf("Сони");
            tot.getCell(qtyCol).setCellValue(qtySum);
            if (type.priced) {
                tot.getCell(cols - 1).setCellValue(sum.doubleValue());
                tot.getCell(cols - 1).setCellStyle(totMoney);
            }
            for (int i = 0; i < cols; i++) {
                String col = type.columns.get(i);
                s.setColumnWidth(i, (switch (col) {
                    case "№" -> 5;
                    case "Махсулот номи" -> 42;
                    case "Ишлаб чикарувчиси" -> 24;
                    case "Худуд", "Фарм ИД", "Серия", "Яроклик муддати" -> 14;
                    case "Сони", "Ул/Бирлиги" -> 9;
                    default -> 16;
                }) * 256);
            }
            s.setRepeatingRows(new CellRangeAddress(headerRow, headerRow, -1, -1));
            s.getPrintSetup().setLandscape(true);
            s.getPrintSetup().setPaperSize(PrintSetup.A4_PAPERSIZE);
            s.setFitToPage(true);
            s.getPrintSetup().setFitWidth((short) 1);
            s.getPrintSetup().setFitHeight((short) 0);
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    String fileName(long id, FormType type) {
        String number = jdbc.sql("SELECT number FROM sales_order WHERE id = :id").param("id", id).query(String.class).optional().orElse("faktura");
        return "faktura-" + type.name().toLowerCase(java.util.Locale.ROOT) + "-" + number.replaceAll("[^A-Za-z0-9-]", "") + ".xlsx";
    }

    private static void text(org.apache.poi.ss.usermodel.Cell cell, String v, CellStyle style) {
        cell.setCellValue(v == null ? "" : v);
        cell.setCellStyle(style);
    }

    private static int line(Sheet s, int r, String text, CellStyle style, int cols) {
        Row row = s.createRow(r);
        row.createCell(0).setCellValue(text);
        if (style != null) {
            row.getCell(0).setCellStyle(style);
        }
        s.addMergedRegion(new CellRangeAddress(r, r, 0, cols - 1));
        return r + 1;
    }

    private static CellStyle box(XSSFWorkbook wb, boolean bold) {
        CellStyle c = wb.createCellStyle();
        c.setBorderTop(BorderStyle.THIN);
        c.setBorderBottom(BorderStyle.THIN);
        c.setBorderLeft(BorderStyle.THIN);
        c.setBorderRight(BorderStyle.THIN);
        c.setVerticalAlignment(VerticalAlignment.CENTER);
        c.setWrapText(true);
        if (bold) {
            Font f = wb.createFont();
            f.setBold(true);
            c.setFont(f);
        }
        return c;
    }
}
