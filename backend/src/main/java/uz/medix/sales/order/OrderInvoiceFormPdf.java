package uz.medix.sales.order;

import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.pdf.PdfDocument;
import uz.medix.shared.pdf.PdfFormat;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.security.Actor;

/** O18: 5 xil fakturaning PDF varianti (Excel bilan bir xil ustunlar va tuzatishlar); ommaviy — har buyurtma yangi sahifadan. */
@Service
class OrderInvoiceFormPdf {

    private static final DateTimeFormatter DMY = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private final OrderInvoiceForms forms;
    private final PdfRenderer pdf;

    OrderInvoiceFormPdf(OrderInvoiceForms forms, PdfRenderer pdf) {
        this.forms = forms;
        this.pdf = pdf;
    }

    @Transactional(readOnly = true)
    PdfDocument render(Actor actor, List<Long> ids, OrderInvoiceForms.FormType type, boolean prices) {
        if (type.priced && !prices) {
            throw MedixException.forbidden("invoiceForms.noPrices");
        }
        List<Long> unique = ids == null ? List.of() : ids.stream().distinct().toList();
        if (unique.isEmpty() || unique.size() > OrderInvoiceForms.MAX_BULK) {
            throw MedixException.badRequest("order.invoiceBulkSize", OrderInvoiceForms.MAX_BULK);
        }
        List<Map<String, Object>> docs = new ArrayList<>();
        String first = null;
        for (Long id : unique) {
            OrderInvoiceForms.InvoiceForms f = forms.get(actor, id, prices, false);
            if (first == null) {
                first = f.orderNumber();
            }
            docs.add(doc(f, type));
        }
        Map<String, Object> vars = new HashMap<>();
        vars.put("title", type.title);
        vars.put("columns", type.columns.stream().map(c -> Map.<String, Object>of("name", c, "right", right(c))).toList());
        vars.put("docs", docs);
        String name = "faktura-" + type.name().toLowerCase(java.util.Locale.ROOT) + "-"
                + (unique.size() == 1 ? first.replaceAll("[^A-Za-z0-9-]", "") : String.valueOf(unique.size()));
        return new PdfDocument(name, pdf.render("invoice-form", vars));
    }

    private static boolean right(String col) {
        return col.equals("№") || col.equals("Сони") || col.startsWith("ККС");
    }

    static Map<String, Object> doc(OrderInvoiceForms.InvoiceForms f, OrderInvoiceForms.FormType type) {
        List<List<Map<String, Object>>> rows = new ArrayList<>();
        long qty = 0;
        BigDecimal sum = BigDecimal.ZERO;
        int n = 0;
        for (OrderInvoiceForms.FormRow x : OrderInvoiceForms.printRows(f, type)) {
            n++;
            List<Map<String, Object>> cells = new ArrayList<>();
            for (String col : type.columns) {
                String v = switch (col) {
                    case "№" -> String.valueOf(n);
                    case "Худуд" -> x.area();
                    case "Фарм ИД" -> x.farmId();
                    case "Махсулот номи" -> x.name();
                    case "Ишлаб чикарувчиси" -> x.manufacturer();
                    case "Серия" -> x.series();
                    case "Сони" -> PdfFormat.qty(x.qty());
                    case "Яроклик муддати" -> x.expiry();
                    case "Ул/Бирлиги" -> x.unit();
                    case "ККС билан Нархи" -> x.price() == null ? "" : PdfFormat.money(x.price());
                    default -> x.total() == null ? "" : PdfFormat.money(x.total());
                };
                cells.add(Map.of("v", v == null ? "" : v, "right", right(col)));
            }
            rows.add(cells);
            qty += x.qty();
            sum = sum.add(x.total() == null ? BigDecimal.ZERO : new BigDecimal(x.total()));
        }
        Map<String, Object> m = new HashMap<>();
        m.put("number", "Буюртма № " + f.orderNumber() + " · " + DMY.format(f.date()));
        m.put("customer", "Мижоз: " + f.customer() + (f.tin() == null ? "" : " · СТИР " + f.tin()));
        m.put("warehouse", "Омбор: " + f.warehouse());
        m.put("rows", rows);
        m.put("qtyCol", type.columns.indexOf("Сони"));
        m.put("cols", type.columns.size());
        m.put("totalQty", PdfFormat.qty(qty));
        m.put("totalSum", type.priced ? PdfFormat.money(sum.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString()) : "");
        return m;
    }
}
