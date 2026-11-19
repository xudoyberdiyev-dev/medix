package uz.yuzplus.sales.order;

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
import uz.yuzplus.inventory.StockReservations;
import uz.yuzplus.shared.audit.AuditEntry;
import uz.yuzplus.shared.audit.AuditLog;
import uz.yuzplus.shared.error.YuzplusException;
import uz.yuzplus.shared.security.Actor;

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
            @Schema(nullable = true, description = "ККС билан Жами — qty × price") String total,
            @Schema(nullable = true, description = "O25: seriya manbai — RESERVED (zahira) yoki PROPOSED (FEFO taklifi); yig'ilgan/oddiy — null")
            @Pattern(regexp = "RESERVED|PROPOSED") String batchHint,
            @Schema(nullable = true, description = "O25: qoldiq yetmagan miqdor (shu qator — partiyasiz qolgan qism)") @Min(1) Integer shortage) {}

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
            boolean canSeePrices,
            @Schema(description = "O25: buyurtmadan tovar yig'ilganmi (yig'ilmagan bo'lsa — FEFO so'rovi ko'rsatiladi)") boolean picked,
            @Schema(description = "O25: seriya/muddat FEFO bo'yicha to'ldirildimi") boolean fefo) {}

    record InvoiceFormSave(@NotNull @Size(max = 1000) List<@Valid FormRow> rows) {}

    private record Head(long id, String number, LocalDate date, String customer, String tin, String warehouse, long warehouseId, long branchId,
            long customerId, String status) {}

    /** O25: zahira olinmagan holatlar — FEFO faqat taklif (hech narsa yozilmaydi). */
    private static final java.util.Set<String> PROPOSAL_STATUSES = java.util.Set.of("DRAFT", "PENDING_APPROVAL");
    /** O25: bekor qilingan buyurtmada zahira yo'q — oddiy faktura. */
    private static final java.util.Set<String> NO_FEFO_STATUSES = java.util.Set.of("CANCELLED", "REJECTED");

    private static final DateTimeFormatter DMY = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final StockReservations reservations;
    private final java.time.Clock clock;

    OrderInvoiceForms(JdbcClient jdbc, AuditLog audit, StockReservations reservations, java.time.Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.reservations = reservations;
        this.clock = clock;
    }

    private Head head(Actor actor, long id) {
        return jdbc.sql("""
                SELECT o.id, o.number, o.created_at, coalesce(nullif(btrim(c.legal_name), ''), c.name) AS customer, c.tin, w.name AS warehouse,
                       o.warehouse_id, o.branch_id, o.customer_id, o.status
                FROM sales_order o JOIN counterparty c ON c.id = o.customer_id JOIN warehouse w ON w.id = o.warehouse_id WHERE o.id = :id""")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"),
                        rs.getTimestamp("created_at").toInstant().atZone(TASHKENT).toLocalDate(), rs.getString("customer"), rs.getString("tin"),
                        rs.getString("warehouse"), rs.getLong("warehouse_id"), rs.getLong("branch_id"), rs.getLong("customer_id"),
                        rs.getString("status")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> YuzplusException.notFound("error.notFound"));
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

    /**
     * O25: yig'ilmagan buyurtma — har qator partiyalarga bo'linadi. «Navbatda» va undan keyin — faol zahira (RESERVED); undan oldin — FEFO
     * taklifi (PROPOSED, {@link StockReservations#plan} — sotuvga ochiq zona, mijozning minimal muddat talabi; hech narsa yozilmaydi).
     * Yetmagan qism — partiyasiz qator {@code shortage} bilan.
     */
    private List<FormRow> fefoRows(Head h) {
        record Line(long id, long productId, String area, String farmId, String name, String manufacturer, String unit, int qty, BigDecimal price) {}
        List<Line> lines = jdbc.sql("""
                SELECT l.id, l.product_id, pl.location AS area, p.farm_id, p.name, m.name AS manufacturer, coalesce(u.short_name, u.name) AS unit,
                       l.qty, l.price
                FROM sales_order_line l
                JOIN product p ON p.id = l.product_id
                LEFT JOIN manufacturer m ON m.id = p.manufacturer_id
                LEFT JOIN unit u ON u.id = p.unit_id
                LEFT JOIN product_location pl ON pl.product_id = p.id AND pl.warehouse_id = :w
                WHERE l.order_id = :o
                ORDER BY l.line_no""")
                .param("o", h.id())
                .param("w", h.warehouseId())
                .query((rs, n) -> new Line(rs.getLong("id"), rs.getLong("product_id"), rs.getString("area"), rs.getString("farm_id"),
                        rs.getString("name"), rs.getString("manufacturer"), rs.getString("unit"), rs.getInt("qty"), rs.getBigDecimal("price")))
                .list();
        record Part(long batchId, int qty) {}
        Map<Long, List<Part>> byLine = new java.util.HashMap<>();
        boolean proposal = PROPOSAL_STATUSES.contains(h.status());
        if (proposal) {
            Integer days = jdbc.sql("SELECT min_shelf_life_days FROM counterparty_branch_terms WHERE counterparty_id = :c AND branch_id = :b")
                    .param("c", h.customerId())
                    .param("b", h.branchId())
                    .query(Integer.class)
                    .optional()
                    .orElse(null);
            LocalDate minExpiry = LocalDate.now(clock.withZone(TASHKENT)).plusDays(days == null ? 0 : days);
            Map<Long, Integer> need = new java.util.LinkedHashMap<>();
            lines.forEach(l -> need.merge(l.productId(), l.qty(), Integer::sum));
            Map<Long, java.util.ArrayDeque<long[]>> pool = new java.util.HashMap<>();
            reservations.plan(h.warehouseId(), minExpiry, need).forEach((product, planned) -> pool.put(product,
                    planned.stream().map(x -> new long[] {x.batchId(), x.qty()}).collect(java.util.stream.Collectors.toCollection(java.util.ArrayDeque::new))));
            for (Line l : lines) {
                java.util.ArrayDeque<long[]> q = pool.getOrDefault(l.productId(), new java.util.ArrayDeque<>());
                int left = l.qty();
                while (left > 0 && !q.isEmpty()) {
                    long[] head = q.peekFirst();
                    int take = (int) Math.min(left, head[1]);
                    byLine.computeIfAbsent(l.id(), k -> new ArrayList<>()).add(new Part(head[0], take));
                    head[1] -= take;
                    left -= take;
                    if (head[1] == 0) {
                        q.pollFirst();
                    }
                }
            }
        } else {
            for (StockReservations.Allocation a : reservations.active(Orders.DOC_TYPE, h.id())) {
                List<Part> parts = byLine.computeIfAbsent(a.lineId(), k -> new ArrayList<>());
                // bir partiya bir necha zonada zahiralangan bo'lsa — bitta qator
                if (!parts.isEmpty() && parts.getLast().batchId() == a.batchId()) {
                    parts.set(parts.size() - 1, new Part(a.batchId(), parts.getLast().qty() + a.qty()));
                } else {
                    parts.add(new Part(a.batchId(), a.qty()));
                }
            }
        }
        record Batch(String number, LocalDate expiry) {}
        java.util.Set<Long> batchIds = new java.util.HashSet<>();
        byLine.values().forEach(ps -> ps.forEach(x -> batchIds.add(x.batchId())));
        Map<Long, Batch> batches = new java.util.HashMap<>();
        if (!batchIds.isEmpty()) {
            jdbc.sql("SELECT id, number, expiry_date FROM batch WHERE id IN (:ids)")
                    .param("ids", batchIds)
                    .query((rs, n) -> Map.entry(rs.getLong("id"), new Batch(rs.getString("number"), rs.getObject("expiry_date", LocalDate.class))))
                    .list()
                    .forEach(e -> batches.put(e.getKey(), e.getValue()));
        }
        String hint = proposal ? "PROPOSED" : "RESERVED";
        List<FormRow> out = new ArrayList<>();
        for (Line l : lines) {
            BigDecimal price = l.price() == null ? BigDecimal.ZERO : l.price();
            int covered = 0;
            for (Part x : byLine.getOrDefault(l.id(), List.of())) {
                Batch b = batches.get(x.batchId());
                FormRow r = row(l.area(), l.farmId(), l.name(), l.manufacturer(), b.number(), x.qty(), b.expiry() == null ? null : DMY.format(b.expiry()),
                        l.unit(), price);
                out.add(withHint(r, hint, null));
                covered += x.qty();
            }
            if (covered < l.qty()) {
                int missing = l.qty() - covered;
                out.add(withHint(row(l.area(), l.farmId(), l.name(), l.manufacturer(), null, missing, null, l.unit(), price), null, missing));
            }
        }
        return out;
    }

    private static FormRow withHint(FormRow r, String hint, Integer shortage) {
        return new FormRow(r.area(), r.farmId(), r.name(), r.manufacturer(), r.series(), r.qty(), r.expiry(), r.unit(), r.price(), r.total(), hint, shortage);
    }

    /** O25: chop etishdagi «Серия» katagi — zahira/taklif belgisi yoki «Етишмайди: N». */
    static String printSeries(FormRow r) {
        if (r.shortage() != null) {
            return "Етишмайди: " + r.shortage();
        }
        if (r.series() == null || r.batchHint() == null) {
            return r.series();
        }
        return r.series() + ("RESERVED".equals(r.batchHint()) ? " (захира)" : " (таклиф)");
    }

    static final String FEFO_NOTE = "Серия ва муддат — тизим таклифи (FEFO). Йиғувчи бошқа партиядан олса, панелда «Бошқа партиядан олдим» ни танлайди.";

    private static FormRow row(String area, String farmId, String name, String manufacturer, String series, int qty, String expiry, String unit,
            BigDecimal price) {
        BigDecimal p = price.setScale(2, RoundingMode.HALF_UP);
        return new FormRow(area, farmId, name, manufacturer, series, qty, expiry, unit, p.toPlainString(),
                p.multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP).toPlainString(), null, null);
    }

    private static FormRow hidePrice(FormRow r) {
        return new FormRow(r.area(), r.farmId(), r.name(), r.manufacturer(), r.series(), r.qty(), r.expiry(), r.unit(), null, null, r.batchHint(),
                r.shortage());
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
        return get(actor, id, prices, canEdit, false);
    }

    /** {@code fefo} — O25: yig'ilmagan buyurtmada seriya/muddat zahira yoki FEFO taklifidan. */
    @Transactional(readOnly = true)
    InvoiceForms get(Actor actor, long id, boolean prices, boolean canEdit, boolean fefo) {
        Head h = head(actor, id);
        boolean picked = jdbc.sql("SELECT EXISTS (SELECT 1 FROM sales_order_pick WHERE order_id = :o)").param("o", id).query(Boolean.class).single();
        boolean useFefo = fefo && !picked && !NO_FEFO_STATUSES.contains(h.status());
        List<FormRow> original = useFefo ? fefoRows(h) : original(id, h.warehouseId());
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
                meta == null ? null : meta.by(), meta == null ? null : meta.at(), canEdit, prices, picked, useFefo && meta == null);
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
    byte[] xlsx(Actor actor, long id, FormType type, boolean prices, boolean fefo) {
        return xlsxMany(actor, List.of(id), type, prices, fefo);
    }

    static final int MAX_BULK = 50;

    /** Ommaviy (reys / ro'yxat): bitta fayl, har buyurtma — alohida varaq (varaq nomi = buyurtma raqami). */
    @Transactional(readOnly = true)
    byte[] xlsxMany(Actor actor, List<Long> ids, FormType type, boolean prices, boolean fefo) {
        if (type.priced && !prices) {
            throw YuzplusException.forbidden("invoiceForms.noPrices");
        }
        List<Long> unique = ids == null ? List.of() : ids.stream().distinct().toList();
        if (unique.isEmpty() || unique.size() > MAX_BULK) {
            throw YuzplusException.badRequest("order.invoiceBulkSize", MAX_BULK);
        }
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            java.util.Set<String> names = new java.util.HashSet<>();
            for (Long id : unique) {
                InvoiceForms f = get(actor, id, prices, false, fefo && type.warehouse());
                String name = unique.size() == 1 ? type.title.replace("№", "N") : f.orderNumber().replaceAll("[\\\\/?*\\[\\]:]", "-");
                if (name.length() > 31) {
                    name = name.substring(name.length() - 31);
                }
                String base = name;
                for (int k = 2; !names.add(name.toLowerCase(java.util.Locale.ROOT)); k++) {
                    name = (base.length() > 27 ? base.substring(0, 27) : base) + " (" + k + ")";
                }
                sheet(wb, wb.createSheet(name), f, type);
            }
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Chiqariladigan qatorlar: ombor turlari tuzatilmagan bo'lsa Худуд bo'yicha. */
    static List<FormRow> printRows(InvoiceForms f, FormType type) {
        List<FormRow> rows = new ArrayList<>(f.rows());
        if (type.warehouse() && !f.edited()) {
            rows.sort(Comparator.comparing((FormRow r) -> r.area() == null ? "￿" : r.area().toLowerCase(java.util.Locale.ROOT)));
        }
        return rows;
    }

    private static void sheet(XSSFWorkbook wb, Sheet s, InvoiceForms f, FormType type) {
        List<FormRow> rows = printRows(f, type);
        {
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
            CellStyle hinted = box(wb, false);
            ((org.apache.poi.xssf.usermodel.XSSFCellStyle) hinted).setFillForegroundColor(new org.apache.poi.xssf.usermodel.XSSFColor(new byte[] {(byte) 0xFF, (byte) 0xF4, (byte) 0xCC}, null));
            hinted.setFillPattern(org.apache.poi.ss.usermodel.FillPatternType.SOLID_FOREGROUND);
            CellStyle missing = box(wb, false);
            Font rf = wb.createFont();
            rf.setColor(org.apache.poi.ss.usermodel.IndexedColors.RED.getIndex());
            missing.setFont(rf);
            CellStyle totMoney = box(wb, true);
            totMoney.setDataFormat(wb.createDataFormat().getFormat("#,##0.00"));
            int cols = type.columns.size();
            int r = 0;
            r = line(s, r, type.title, bold, cols);
            r = line(s, r, "Буюртма № " + f.orderNumber() + " · " + DMY.format(f.date()), null, cols);
            r = line(s, r, "Мижоз: " + f.customer() + (f.tin() == null ? "" : " · СТИР " + f.tin()), null, cols);
            r = line(s, r, "Омбор: " + f.warehouse(), null, cols);
            if (f.fefo() && rows.stream().anyMatch(x -> x.batchHint() != null || x.shortage() != null)) {
                r = line(s, r, FEFO_NOTE, null, cols);
            }
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
                        case "Серия" -> text(cell, printSeries(x), x.shortage() != null ? missing : x.batchHint() != null ? hinted : text);
                        case "Сони" -> {
                            cell.setCellValue(x.qty());
                            cell.setCellStyle(qty);
                        }
                        case "Яроклик муддати" -> text(cell, x.expiry(), x.batchHint() != null ? hinted : text);
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
        }
    }

    String bulkFileName(List<Long> ids, FormType type) {
        long n = ids == null ? 0 : ids.stream().distinct().count();
        return n == 1 ? fileName(ids.getFirst(), type) : "faktura-" + type.name().toLowerCase(java.util.Locale.ROOT) + "-" + n + ".xlsx";
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
