package uz.medix.sales.order;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.order.OrderModels.OrderDetail;
import uz.medix.sales.order.OrderModels.OrderLine;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.pdf.PdfDocument;
import uz.medix.shared.pdf.PdfFormat;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.security.Actor;

/**
 * O10e TTN (tovar-transport yuk xati) — MEDIX o'zi chop etadi: buyurtma bo'yicha yoki reys bo'yicha (har buyurtma alohida varaqda).
 * Jo'natuvchi, qabul qiluvchi, mashina, haydovchi, joylar, mahsulotlar (partiya), summa, imzolar. TTN raqami — nakladnoy raqami
 * (bitta yuk hujjati). Imzolangan nusxa buxgalter navbatida (O10d) yuklanadi.
 */
@Service
class OrderTtnPdf {

    private final Orders orders;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;

    OrderTtnPdf(Orders orders, PdfRenderer pdf, JdbcClient jdbc) {
        this.orders = orders;
        this.pdf = pdf;
        this.jdbc = jdbc;
    }

    record Trip(String number, java.time.LocalDate date, String plate, String model, String driver, String driverPhone) {}

    private Optional<Trip> trip(long orderId) {
        return jdbc.sql("""
                SELECT t.number, t.trip_date, v.plate_number, v.model, e.full_name, e.phone
                FROM trip_stop s JOIN trip t ON t.id = s.trip_id JOIN vehicle v ON v.id = t.vehicle_id JOIN employee e ON e.id = t.driver_id
                WHERE s.order_id = :o AND s.active AND t.status <> 'CANCELLED' ORDER BY s.id DESC LIMIT 1""")
                .param("o", orderId)
                .query((rs, n) -> new Trip(rs.getString("number"), rs.getDate("trip_date").toLocalDate(), rs.getString("plate_number"),
                        rs.getString("model"), rs.getString("full_name"), rs.getString("phone")))
                .optional();
    }

    /** Bitta buyurtma TTN; nakladnoy hali berilmagan bo'lsa — 409. */
    @Transactional(readOnly = true)
    PdfDocument order(Actor actor, long orderId) {
        Map<String, Object> doc = doc(actor, orderId);
        return new PdfDocument("TTN-" + doc.get("number"), pdf.render("ttn", Map.of("docs", List.of(doc))));
    }

    /** Reysdagi barcha buyurtmalar TTN — bitta PDF, har biri alohida varaqda. */
    @Transactional(readOnly = true)
    PdfDocument trip(Actor actor, long tripId) {
        record Head(String number, long branchId) {}
        Head h = jdbc.sql("SELECT number, branch_id FROM trip WHERE id = :t")
                .param("t", tripId)
                .query((rs, n) -> new Head(rs.getString("number"), rs.getLong("branch_id")))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        List<Long> ids = jdbc.sql("SELECT order_id FROM trip_stop WHERE trip_id = :t AND active ORDER BY seq, id")
                .param("t", tripId).query(Long.class).list();
        if (ids.isEmpty()) {
            throw MedixException.notFound("error.notFound");
        }
        List<Map<String, Object>> docs = new ArrayList<>();
        for (long id : ids) {
            docs.add(doc(actor, id));
        }
        return new PdfDocument("TTN-" + h.number(), pdf.render("ttn", Map.of("docs", docs)));
    }

    private Map<String, Object> doc(Actor actor, long orderId) {
        OrderDetail o = orders.find(orderId, actor).orElseThrow(() -> MedixException.notFound("error.notFound"));
        String number = o.documents().waybillNumber();
        if (number == null) {
            throw MedixException.conflict("order.waybillNotIssued");
        }
        Map<String, Object> seller = jdbc.sql("SELECT legal_name, tin, address, phone FROM branch WHERE id = :b")
                .param("b", o.branchId()).query().singleRow();
        Optional<Trip> t = trip(orderId);
        long qty = o.lines().stream().mapToLong(OrderLine::qty).sum();
        boolean pickup = o.deliveryType() == OrderModels.DeliveryType.PICKUP;
        Map<String, Object> v = new HashMap<>();
        v.put("number", number);
        v.put("orderNumber", o.number());
        v.put("date", PdfFormat.date(t.map(Trip::date).orElse(o.deliveryDate() != null ? o.deliveryDate() : o.orderDate())));
        v.put("sellerName", seller.get("legal_name"));
        v.put("sellerTin", PdfFormat.orDash((String) seller.get("tin")));
        v.put("sellerAddress", PdfFormat.orDash((String) seller.get("address")));
        v.put("sellerPhone", PdfFormat.orDash((String) seller.get("phone")));
        v.put("warehouse", o.warehouse());
        v.put("customer", o.customer());
        v.put("customerTin", PdfFormat.orDash(o.customerTin()));
        v.put("address", pickup ? "Mijoz oʻzi olib ketadi" : PdfFormat.orDash(o.address()));
        v.put("trip", t.map(Trip::number).orElse(PdfFormat.DASH));
        v.put("vehicle", t.map(x -> x.plate() + (x.model() == null || x.model().isBlank() ? "" : " · " + x.model()))
                .orElse(pickup ? "Mijoz transporti" : PdfFormat.DASH));
        v.put("driver", t.map(x -> x.driver() + (x.driverPhone() == null ? "" : " · " + x.driverPhone())).orElse(PdfFormat.DASH));
        v.put("places", o.places() == null ? PdfFormat.DASH : PdfFormat.qty(o.places()));
        Map<Long, String> sold = OrderWaybillPdf.soldBatches(jdbc, orderId);
        v.put("lines", o.lines().stream().map(l -> OrderWaybillPdf.row(l, sold)).toList());
        v.put("totalQty", PdfFormat.qty(qty));
        v.put("total", PdfFormat.money(o.total()));
        v.put("vat", PdfFormat.money(o.vatTotal()));
        return v;
    }
}
