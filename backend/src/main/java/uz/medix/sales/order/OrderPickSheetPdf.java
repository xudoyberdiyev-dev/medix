package uz.medix.sales.order;

import java.text.Collator;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.order.OrderModels.OrderDetail;
import uz.medix.sales.order.OrderModels.OrderLine;
import uz.medix.sales.order.OrderModels.ReservedBatch;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.pdf.PdfDocument;
import uz.medix.shared.pdf.PdfFormat;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.security.Actor;

/**
 * Terish varag'i — server PDF (frontend {@code features/orders/pick-sheet.ts} bilan bir xil): bir necha buyurtmaning zahiradagi
 * partiyalari zona → mahsulot → muddat → partiya bo'yicha jamlanadi; zahirasi yo'q qator «—» zonasi bilan oxirida.
 */
@Service
class OrderPickSheetPdf {

    static final int MAX_ORDERS = 20;

    /** Jamlangan qator. */
    record Row(String zone, String productCode, String productName, String batch, LocalDate expiryDate, int qty,
            Map<String, Integer> orders) {}

    private final Orders orders;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;

    OrderPickSheetPdf(Orders orders, PdfRenderer pdf, JdbcClient jdbc) {
        this.orders = orders;
        this.pdf = pdf;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    PdfDocument render(Actor actor, List<Long> ids) {
        List<Long> unique = ids.stream().distinct().toList();
        if (unique.isEmpty() || unique.size() > MAX_ORDERS) {
            throw MedixException.badRequest("order.pickSheetSize", MAX_ORDERS);
        }
        List<OrderDetail> list = unique.stream()
                .map(id -> orders.find(id, actor).orElseThrow(() -> MedixException.notFound("error.notFound")))
                .toList();
        List<Row> rows = build(list);
        String printedBy = jdbc.sql("SELECT full_name FROM employee WHERE id = :e").param("e", actor.employeeId())
                .query(String.class).optional().orElse(PdfFormat.DASH);
        long totalQty = rows.stream().mapToLong(Row::qty).sum();

        Map<String, Object> vars = new HashMap<>();
        vars.put("warehouses", list.stream().map(OrderDetail::warehouse).collect(Collectors.toCollection(LinkedHashSet::new)).stream()
                .collect(Collectors.joining(", ")));
        vars.put("printedAt", PdfFormat.dateTime(Instant.now()));
        vars.put("printedBy", printedBy);
        vars.put("counts", PdfFormat.qty(list.size()) + " buyurtma · " + PdfFormat.qty(rows.size()) + " qator · " + PdfFormat.qty(totalQty)
                + " dona");
        vars.put("orders", list.stream().map(OrderPickSheetPdf::orderRow).toList());
        vars.put("rows", rows.stream().map(OrderPickSheetPdf::asMap).toList());
        vars.put("unallocated", rows.stream().anyMatch(r -> r.zone().isEmpty()));
        String name = list.size() == 1 ? "Terish-" + list.getFirst().number() : "Terish-varagi";
        return new PdfDocument(name, pdf.render("pick-sheet", vars));
    }

    static List<Row> build(List<OrderDetail> list) {
        Map<String, Row> map = new LinkedHashMap<>();
        for (OrderDetail o : list) {
            for (OrderLine l : o.lines()) {
                List<ReservedBatch> parts = l.reserved().isEmpty() ? List.of(new ReservedBatch("", null, "", l.qty())) : l.reserved();
                for (ReservedBatch r : parts) {
                    String zone = r.zone() == null ? "" : r.zone();
                    String batch = r.batch() == null ? "" : r.batch();
                    String key = zone + '\u0000' + l.productCode() + '\u0000' + batch;
                    Row prev = map.get(key);
                    Map<String, Integer> refs = prev == null ? new LinkedHashMap<>() : prev.orders();
                    refs.merge(o.number(), r.qty(), Integer::sum);
                    map.put(key, new Row(zone, l.productCode(), l.productName(), batch, r.expiryDate(),
                            (prev == null ? 0 : prev.qty()) + r.qty(), refs));
                }
            }
        }
        Collator uz = Collator.getInstance(Locale.forLanguageTag("uz"));
        Comparator<Row> order = Comparator.<Row, Boolean>comparing(r -> r.zone().isEmpty())
                .thenComparing(Row::zone, uz)
                .thenComparing(Row::productName, uz)
                .thenComparing(Row::expiryDate, Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparing(Row::batch, uz);
        List<Row> rows = new ArrayList<>(map.values());
        rows.sort(order);
        return rows;
    }

    private static Map<String, Object> orderRow(OrderDetail o) {
        Map<String, Object> m = new HashMap<>();
        m.put("number", o.number());
        m.put("customer", o.customer());
        m.put("lines", PdfFormat.qty(o.lines().size()));
        m.put("qty", PdfFormat.qty(o.lines().stream().mapToLong(OrderLine::qty).sum()));
        m.put("note", o.lines().stream().anyMatch(OrderLine::marked) ? "Markirovka" : "");
        return m;
    }

    private static Map<String, Object> asMap(Row r) {
        Map<String, Object> m = new HashMap<>();
        m.put("zone", r.zone().isEmpty() ? PdfFormat.DASH : r.zone());
        m.put("code", r.productCode());
        m.put("name", r.productName());
        m.put("batch", r.batch().isEmpty() ? PdfFormat.DASH : r.batch());
        m.put("expiry", PdfFormat.date(r.expiryDate()));
        m.put("qty", PdfFormat.qty(r.qty()));
        m.put("orders", r.orders().entrySet().stream()
                .map(e -> tail(e.getKey()) + " — " + PdfFormat.qty(e.getValue()))
                .collect(Collectors.joining("; ")));
        return m;
    }

    private static String tail(String number) {
        return number.length() <= 6 ? number : number.substring(number.length() - 6);
    }
}
