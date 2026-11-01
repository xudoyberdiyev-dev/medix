package uz.medix.delivery.trip;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.delivery.trip.TripModels.DriverOption;
import uz.medix.delivery.trip.TripModels.ReadyOrder;
import uz.medix.delivery.trip.TripModels.TripDetail;
import uz.medix.delivery.trip.TripModels.TripOptions;
import uz.medix.delivery.trip.TripModels.TripRequest;
import uz.medix.delivery.trip.TripModels.TripStatus;
import uz.medix.delivery.trip.TripModels.TripStop;
import uz.medix.delivery.trip.TripModels.TripSummary;
import uz.medix.delivery.trip.TripModels.VehicleOption;
import uz.medix.sales.OrderDispatch;
import uz.medix.sales.OrderDispatch.DispatchOrder;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * Hujjatlashtirish va reys (SPEC 5.2 №7). Reys tuzish: mashina (filial, faol), haydovchi (Haydovchi roli, filial, faol, boshqa faol
 * reysi yo'q), sig'im tekshiruvi — reysdagi joylar soni mashina sig'imidan oshmaydi. Har buyurtma nakladnoy raqami bilan
 * «Yuklanmoqda»ga o'tadi — barchasi bitta tranzaksiyada.
 */
@Service
class Trips {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final OrderDispatch dispatch;
    private final DocumentSequenceService numbers;
    private final AuditLog audit;

    Trips(JdbcClient jdbc, OrderDispatch dispatch, DocumentSequenceService numbers, AuditLog audit) {
        this.jdbc = jdbc;
        this.dispatch = dispatch;
        this.numbers = numbers;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    List<ReadyOrder> ready(Actor actor, Long branchId) {
        return dispatch.ready(actor, branchId).stream().map(Trips::ready).toList();
    }

    private static ReadyOrder ready(DispatchOrder o) {
        return new ReadyOrder(o.id(), o.number(), o.branchId(), o.customer(), o.address(), o.delivery().name(), o.places(), o.total());
    }

    @Transactional(readOnly = true)
    TripOptions options(Actor actor, long branchId) {
        if (!actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        List<VehicleOption> vehicles = jdbc.sql("""
                SELECT v.id, v.plate_number, v.model, v.capacity_boxes,
                       coalesce((SELECT sum(t.places) FROM trip t WHERE t.vehicle_id = v.id AND t.status IN ('PLANNED', 'IN_TRANSIT')), 0) AS busy
                FROM vehicle v WHERE v.branch_id = :b AND v.active ORDER BY v.plate_number""")
                .param("b", branchId)
                .query((rs, n) -> new VehicleOption(rs.getLong("id"), rs.getString("plate_number"), rs.getString("model"),
                        (Integer) rs.getObject("capacity_boxes"), rs.getInt("busy")))
                .list();
        List<DriverOption> drivers = jdbc.sql("""
                SELECT e.id, e.full_name, e.phone,
                       (SELECT t.number FROM trip t WHERE t.driver_id = e.id AND t.status IN ('PLANNED', 'IN_TRANSIT', 'RETURN_WAIT') LIMIT 1) AS active_trip
                FROM employee e JOIN role r ON r.id = e.role_id
                WHERE r.code = 'DRIVER' AND e.branch_id = :b AND e.status = 'ACTIVE' ORDER BY e.full_name""")
                .param("b", branchId)
                .query((rs, n) -> new DriverOption(rs.getLong("id"), rs.getString("full_name"), rs.getString("phone"), rs.getString("active_trip")))
                .list();
        return new TripOptions(vehicles, drivers);
    }

    private record Vehicle(long id, long branchId, String plate, Integer capacity, boolean active) {}

    @Transactional
    long create(Actor actor, TripRequest r) {
        List<DispatchOrder> orders = dispatch.lockDocumenting(actor, r.orderIds());
        long branchId = orders.getFirst().branchId();
        if (orders.stream().anyMatch(o -> o.delivery() == OrderDispatch.Delivery.PICKUP)) {
            throw MedixException.badRequest("trip.pickupInTrip");
        }
        Vehicle v = jdbc.sql("SELECT id, branch_id, plate_number, capacity_boxes, active FROM vehicle WHERE id = :id FOR UPDATE")
                .param("id", r.vehicleId())
                .query((rs, n) -> new Vehicle(rs.getLong("id"), rs.getLong("branch_id"), rs.getString("plate_number"),
                        (Integer) rs.getObject("capacity_boxes"), rs.getBoolean("active")))
                .optional()
                .filter(x -> x.active() && x.branchId() == branchId)
                .orElseThrow(() -> MedixException.badRequest("trip.vehicleUnknown"));
        boolean driverOk = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM employee e JOIN role r ON r.id = e.role_id
                               WHERE e.id = :d AND r.code = 'DRIVER' AND e.branch_id = :b AND e.status = 'ACTIVE')""")
                .param("d", r.driverId())
                .param("b", branchId)
                .query(Boolean.class)
                .single();
        if (!driverOk) {
            throw MedixException.badRequest("trip.driverUnknown");
        }
        // Haydovchi bir vaqtda bitta faol reysda; mashina band bo'lsa — sig'im birga hisoblanadi
        jdbc.sql("SELECT id FROM employee WHERE id = :d FOR UPDATE").param("d", r.driverId()).query(Long.class).single();
        String busyTrip = jdbc.sql("SELECT number FROM trip WHERE driver_id = :d AND status IN ('PLANNED', 'IN_TRANSIT', 'RETURN_WAIT') LIMIT 1")
                .param("d", r.driverId())
                .query(String.class)
                .optional()
                .orElse(null);
        if (busyTrip != null) {
            throw MedixException.conflict("trip.driverBusy", busyTrip);
        }
        int places = orders.stream().mapToInt(DispatchOrder::places).sum();
        if (v.capacity() != null) {
            int busy = jdbc.sql("SELECT coalesce(sum(places), 0) FROM trip WHERE vehicle_id = :v AND status IN ('PLANNED', 'IN_TRANSIT')")
                    .param("v", v.id())
                    .query(Integer.class)
                    .single();
            if (busy + places > v.capacity()) {
                throw MedixException.conflict("trip.overCapacity", busy + places, v.capacity(), v.plate());
            }
        }
        LocalDate today = LocalDate.now(TASHKENT);
        if (r.tripDate().isBefore(today)) {
            throw MedixException.badRequest("trip.datePast");
        }
        String branchCode = jdbc.sql("SELECT code FROM branch WHERE id = :b").param("b", branchId).query(String.class).single();
        String number = numbers.next(DocumentPrefix.RS, branchCode).toString();
        long id = jdbc.sql("""
                INSERT INTO trip (number, branch_id, vehicle_id, driver_id, trip_date, places, note, created_by)
                VALUES (:n, :b, :v, :d, :date, :p, :note, :by) RETURNING id""")
                .param("n", number)
                .param("b", branchId)
                .param("v", v.id())
                .param("d", r.driverId())
                .param("date", java.sql.Date.valueOf(r.tripDate()))
                .param("p", places)
                .param("note", r.note() == null || r.note().isBlank() ? null : r.note().strip())
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        int seq = 1;
        for (DispatchOrder o : orders) {
            jdbc.sql("INSERT INTO trip_stop (trip_id, order_id, seq, places) VALUES (:t, :o, :s, :p)")
                    .param("t", id)
                    .param("o", o.id())
                    .param("s", seq++)
                    .param("p", o.places())
                    .update();
            dispatch.toLoading(actor, o.id());
        }
        audit.record(AuditEntry.of("trip.create", "trip", id).change(null, Map.of("number", number, "orders", orders.size(), "places", places)));
        return id;
    }

    /** «O'zi olib ketadi»: reyssiz, nakladnoy bilan «Yuklanmoqda». */
    @Transactional
    String pickup(Actor actor, long orderId) {
        DispatchOrder o = dispatch.lockDocumenting(actor, List.of(orderId)).getFirst();
        if (o.delivery() != OrderDispatch.Delivery.PICKUP) {
            throw MedixException.badRequest("trip.notPickup");
        }
        return dispatch.toLoading(actor, orderId);
    }

    /** Bekor qilish — faqat «Rejalashtirilgan» (yuklash boshlanmagan); buyurtmalar «Hujjatlashtirilmoqda»ga qaytadi. */
    @Transactional
    void cancel(Actor actor, long id, String reason) {
        TripStatus st = jdbc.sql("SELECT status, branch_id FROM trip WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id")) ? TripStatus.valueOf(rs.getString("status")) : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .findFirst()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (st != TripStatus.PLANNED) {
            throw MedixException.conflict("trip.cannotCancel");
        }
        List<Long> orders = jdbc.sql("SELECT order_id FROM trip_stop WHERE trip_id = :id AND active ORDER BY order_id")
                .param("id", id)
                .query(Long.class)
                .list();
        boolean loaded = jdbc.sql("SELECT EXISTS (SELECT 1 FROM trip_stop WHERE trip_id = :id AND active AND loaded_at IS NOT NULL)")
                .param("id", id).query(Boolean.class).single();
        if (loaded) {
            throw MedixException.conflict("trip.alreadyLoading");
        }
        for (long o : orders) {
            dispatch.backToDocumenting(actor, o, reason.strip());
        }
        jdbc.sql("UPDATE trip_stop SET active = false WHERE trip_id = :id").param("id", id).update();
        jdbc.sql("""
                UPDATE trip SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r, updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", reason.strip())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("trip.cancel", "trip", id).withReason(reason.strip()));
    }

    private static final String SUMMARY = """
            SELECT t.id, t.number, t.branch_id, t.trip_date, t.status, v.plate_number || ' · ' || v.model AS vehicle, v.capacity_boxes,
                   d.full_name AS driver, t.places, t.created_at, t.note, t.vehicle_id, t.driver_id, cb.full_name AS created_by, t.started_at,
                   t.cancel_reason,
                   (SELECT count(*) FROM trip_stop s WHERE s.trip_id = t.id AND (s.active OR t.status = 'CANCELLED')) AS orders,
                   (SELECT coalesce(sum(o.total), 0) FROM trip_stop s JOIN sales_order o ON o.id = s.order_id
                    WHERE s.trip_id = t.id AND (s.active OR t.status = 'CANCELLED')) AS total
            FROM trip t JOIN vehicle v ON v.id = t.vehicle_id JOIN employee d ON d.id = t.driver_id JOIN employee cb ON cb.id = t.created_by""";

    @Transactional(readOnly = true)
    List<TripSummary> list(Actor actor, Long branchId, boolean activeOnly) {
        return jdbc.sql(SUMMARY + """
                 WHERE (CAST(:b AS BIGINT) IS NULL OR t.branch_id = :b) AND (NOT :active OR t.status IN ('PLANNED', 'IN_TRANSIT', 'RETURN_WAIT'))
                ORDER BY t.trip_date DESC, t.id DESC LIMIT 200""")
                .param("b", branchId)
                .param("active", activeOnly)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id"))
                        ? new TripSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getDate("trip_date").toLocalDate(),
                                TripStatus.valueOf(rs.getString("status")), rs.getString("vehicle"), (Integer) rs.getObject("capacity_boxes"),
                                rs.getString("driver"), rs.getInt("orders"), rs.getInt("places"), money(rs.getBigDecimal("total")),
                                rs.getTimestamp("created_at").toInstant())
                        : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .toList();
    }

    @Transactional(readOnly = true)
    TripDetail find(Actor actor, long id) {
        TripDetail head = jdbc.sql(SUMMARY + " WHERE t.id = :id")
                .param("id", id)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id"))
                        ? new TripDetail(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getDate("trip_date").toLocalDate(),
                                TripStatus.valueOf(rs.getString("status")), rs.getLong("vehicle_id"), rs.getString("vehicle"),
                                (Integer) rs.getObject("capacity_boxes"), rs.getLong("driver_id"), rs.getString("driver"), rs.getString("note"),
                                rs.getInt("places"), money(rs.getBigDecimal("total")), rs.getString("created_by"),
                                rs.getTimestamp("created_at").toInstant(),
                                rs.getTimestamp("started_at") == null ? null : rs.getTimestamp("started_at").toInstant(), rs.getString("cancel_reason"),
                                List.of())
                        : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .findFirst()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        List<TripStop> stops = new ArrayList<>(jdbc.sql("""
                SELECT s.id, s.seq, s.order_id, o.number, o.waybill_number, c.name AS customer, o.address, s.places, o.total, s.loaded_at
                FROM trip_stop s JOIN sales_order o ON o.id = s.order_id JOIN counterparty c ON c.id = o.customer_id
                WHERE s.trip_id = :id AND (s.active OR :cancelled) ORDER BY s.seq""")
                .param("id", id)
                .param("cancelled", head.status() == TripStatus.CANCELLED)
                .query((rs, n) -> new TripStop(rs.getLong("id"), rs.getInt("seq"), rs.getLong("order_id"), rs.getString("number"),
                        rs.getString("waybill_number"), rs.getString("customer"), rs.getString("address"), rs.getInt("places"),
                        money(rs.getBigDecimal("total")), rs.getTimestamp("loaded_at") == null ? null : rs.getTimestamp("loaded_at").toInstant()))
                .list());
        return new TripDetail(head.id(), head.number(), head.branchId(), head.tripDate(), head.status(), head.vehicleId(), head.vehicle(),
                head.capacityBoxes(), head.driverId(), head.driver(), head.note(), head.places(), head.total(), head.createdBy(), head.createdAt(),
                head.startedAt(), head.cancelReason(), stops);
    }

    private static String money(BigDecimal v) {
        return new Money(v).toString();
    }
}
