package uz.medix.sales.order;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.order.OrderModels.OrderDetail;
import uz.medix.sales.order.OrderModels.OrderLine;
import uz.medix.sales.order.OrderModels.PaymentType;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.pdf.PdfDocument;
import uz.medix.shared.pdf.PdfFormat;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.pdf.PrintSettings;
import uz.medix.shared.security.Actor;

/** Nakladnoy — server PDF (frontend {@code /print/waybill} bilan bir xil shakl). */
@Service
class OrderWaybillPdf {

    private static final Map<PaymentType, String> PAYMENT = Map.of(
            PaymentType.TRANSFER, "Perechisleniye",
            PaymentType.CASH, "Naqd",
            PaymentType.ONLINE, "Online");

    private final Orders orders;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;
    private final PrintSettings print;

    OrderWaybillPdf(Orders orders, PdfRenderer pdf, JdbcClient jdbc, PrintSettings print) {
        this.orders = orders;
        this.pdf = pdf;
        this.jdbc = jdbc;
        this.print = print;
    }

    /** Nakladnoy PDF; nakladnoy hali berilmagan bo'lsa — 409. Narxlar — Sozlamalar → Chop etish → yuk xati varianti. */
    @Transactional(readOnly = true)
    PdfDocument render(Actor actor, long id) {
        OrderDetail o = load(actor, id);
        String number = waybill(o);
        Map<String, Object> seller = jdbc.sql("SELECT legal_name, tin, address, phone FROM branch WHERE id = :b")
                .param("b", o.branchId()).query().singleRow();
        boolean withPrice = print.waybillWithPrice() && o.lines().stream().anyMatch(l -> l.price() != null);
        long qty = o.lines().stream().mapToLong(OrderLine::qty).sum();

        Map<String, Object> vars = new HashMap<>();
        vars.put("number", number);
        vars.put("orderNumber", o.number());
        vars.put("date", PdfFormat.date(o.deliveryDate() != null ? o.deliveryDate() : o.orderDate()));
        vars.put("sellerName", seller.get("legal_name"));
        vars.put("sellerTin", seller.get("tin"));
        vars.put("sellerContacts", contacts((String) seller.get("address"), (String) seller.get("phone")));
        vars.put("warehouse", o.warehouse());
        vars.put("customer", o.customer());
        vars.put("customerTin", PdfFormat.orDash(o.customerTin()));
        vars.put("address", PdfFormat.orDash(o.address()));
        vars.put("payment", PAYMENT.get(o.paymentType()) + (o.documents().tripNumber() == null ? "" : " · Reys " + o.documents().tripNumber()));
        vars.put("withPrice", withPrice);
        vars.put("lines", o.lines().stream().map(OrderWaybillPdf::row).toList());
        vars.put("totalQty", PdfFormat.qty(qty));
        vars.put("total", PdfFormat.money(o.total()));
        vars.put("note", o.note());
        vars.put("reprint", print.registerPrint("NK", number, actor.employeeId()));
        return new PdfDocument(number, pdf.render("waybill", vars));
    }

    private OrderDetail load(Actor actor, long id) {
        return orders.find(id, actor).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static String waybill(OrderDetail o) {
        String n = o.documents().waybillNumber();
        if (n == null) {
            throw MedixException.conflict("order.waybillNotIssued");
        }
        return n;
    }

    static Map<String, Object> row(OrderLine l) {
        String batches = l.reserved().isEmpty() ? PdfFormat.DASH
                : l.reserved().stream()
                        .map(r -> r.batch() + " · " + PdfFormat.date(r.expiryDate()) + " — " + PdfFormat.qty(r.qty()))
                        .collect(Collectors.joining("; "));
        Map<String, Object> m = new HashMap<>();
        m.put("code", l.productCode());
        m.put("name", l.productName());
        m.put("manufacturer", l.manufacturer());
        m.put("batches", batches);
        m.put("qty", PdfFormat.qty(l.qty()));
        m.put("price", PdfFormat.money(l.price()));
        m.put("amount", PdfFormat.money(l.amount()));
        return m;
    }

    private static String contacts(String address, String phone) {
        String s = List.of(address == null ? "" : address, phone == null ? "" : phone).stream()
                .filter(x -> !x.isBlank()).collect(Collectors.joining(" · "));
        return PdfFormat.orDash(s);
    }
}
