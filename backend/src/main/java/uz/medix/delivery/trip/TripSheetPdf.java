package uz.medix.delivery.trip;

import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.delivery.trip.TripModels.TripDetail;
import uz.medix.delivery.trip.TripModels.TripStop;
import uz.medix.shared.money.Money;
import uz.medix.shared.pdf.PdfDocument;
import uz.medix.shared.pdf.PdfFormat;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.security.Actor;

/** Yo'l varaqasi — server PDF (frontend {@code /print/trip} bilan bir xil shakl). */
@Service
class TripSheetPdf {

    private static final Map<String, String> PAYMENT = Map.of("TRANSFER", "Perechisleniye", "CASH", "Naqd", "ONLINE", "Online");

    private final Trips trips;
    private final PdfRenderer pdf;
    private final JdbcClient jdbc;

    TripSheetPdf(Trips trips, PdfRenderer pdf, JdbcClient jdbc) {
        this.trips = trips;
        this.pdf = pdf;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    PdfDocument render(Actor actor, long id) {
        TripDetail t = trips.find(actor, id);
        List<TripStop> stops = t.stops().stream().sorted(Comparator.comparingInt(TripStop::seq)).toList();
        Money cash = stops.stream().filter(s -> "CASH".equals(s.paymentType())).map(s -> Money.of(s.total())).reduce(Money.ZERO, Money::plus);
        String printedBy = jdbc.sql("SELECT full_name FROM employee WHERE id = :e").param("e", actor.employeeId())
                .query(String.class).optional().orElse(PdfFormat.DASH);

        Map<String, Object> vars = new HashMap<>();
        vars.put("number", t.number());
        vars.put("subtitle", PdfFormat.date(t.tripDate()) + " · " + t.vehicle() + " · Haydovchi: " + t.driver());
        vars.put("printedAt", PdfFormat.dateTime(Instant.now()));
        vars.put("printedBy", printedBy);
        vars.put("counts", PdfFormat.qty(stops.size()) + " buyurtma · " + PdfFormat.qty(t.places()) + " joy");
        vars.put("stops", stops.stream().map(TripSheetPdf::row).toList());
        vars.put("places", PdfFormat.qty(t.places()));
        vars.put("total", PdfFormat.money(t.total()));
        vars.put("cash", cash.format());
        vars.put("note", t.note());
        return new PdfDocument(t.number(), pdf.render("trip-sheet", vars));
    }

    static Map<String, Object> row(TripStop s) {
        Map<String, Object> m = new HashMap<>();
        m.put("seq", s.seq());
        m.put("orderNumber", s.orderNumber());
        m.put("waybill", PdfFormat.orDash(s.waybillNumber()));
        m.put("customer", s.customer());
        m.put("contacts", PdfFormat.orDash(Stream.of(s.address(), s.phone()).filter(x -> x != null && !x.isBlank())
                .collect(Collectors.joining(" · "))));
        m.put("places", PdfFormat.qty(s.places()));
        m.put("payment", PAYMENT.getOrDefault(s.paymentType(), s.paymentType()));
        m.put("total", PdfFormat.money(s.total()));
        return m;
    }
}
