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

    // ===== Haydovchi (SPEC 5.2 №8–9) =====

    @Transactional(readOnly = true)
    java.util.Optional<TripDetail> mine(Actor actor) {
        return jdbc.sql("""
                SELECT id FROM trip WHERE driver_id = :d AND status IN ('PLANNED', 'IN_TRANSIT', 'RETURN_WAIT') ORDER BY id LIMIT 1""")
                .param("d", actor.employeeId())
                .query(Long.class)
                .optional()
                .map(id -> find(actor, id));
    }

    private record Own(long id, String number, TripStatus status) {}

    private Own lockOwn(Actor actor, long id) {
        return lockOwn(actor, id, TripStatus.PLANNED);
    }

    private Own lockOwn(Actor actor, long id, TripStatus expected) {
        Own t = jdbc.sql("SELECT id, number, status, driver_id, branch_id FROM trip WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id")) && rs.getLong("driver_id") == actor.employeeId()
                        ? new Own(rs.getLong("id"), rs.getString("number"), TripStatus.valueOf(rs.getString("status")))
                        : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .findFirst()
                .orElseThrow(() -> MedixException.forbidden("trip.notDriver"));
        if (t.status() != expected) {
            throw MedixException.conflict(expected == TripStatus.PLANNED ? "trip.notPlanned" : "trip.notInTransit");
        }
        return t;
    }

    /** «Qabul qildim»: haydovchi buyurtmani joylar soni bo'yicha oladi (son hujjatdagiga teng bo'lishi shart). */
    @Transactional
    void load(Actor actor, long tripId, long stopId, int places) {
        lockOwn(actor, tripId);
        Integer expected = jdbc.sql("SELECT places FROM trip_stop WHERE id = :s AND trip_id = :t AND active")
                .param("s", stopId)
                .param("t", tripId)
                .query(Integer.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (expected != places) {
            throw MedixException.conflict("trip.placesMismatch", expected);
        }
        jdbc.sql("UPDATE trip_stop SET loaded_by = :by, loaded_at = now() WHERE id = :s AND loaded_at IS NULL")
                .param("by", actor.employeeId())
                .param("s", stopId)
                .update();
        audit.record(AuditEntry.of("trip.load", "trip", tripId).change(null, Map.of("stop", stopId, "places", places)));
    }

    /** «Yuklab bo'lindi — reysni boshlash»: barcha buyurtmalar qabul qilingan; har biriga sotuv va HF, «Yo'lda». */
    @Transactional
    List<String> start(Actor actor, long tripId) {
        Own t = lockOwn(actor, tripId);
        record S(long orderId, boolean loaded) {}
        List<S> stops = jdbc.sql("SELECT order_id, loaded_at IS NOT NULL AS loaded FROM trip_stop WHERE trip_id = :t AND active ORDER BY seq")
                .param("t", tripId)
                .query((rs, n) -> new S(rs.getLong("order_id"), rs.getBoolean("loaded")))
                .list();
        long notLoaded = stops.stream().filter(x -> !x.loaded()).count();
        if (notLoaded > 0) {
            throw MedixException.conflict("trip.notLoaded", notLoaded);
        }
        List<String> sales = new ArrayList<>();
        for (S x : stops) {
            sales.add(dispatch.ship(actor, x.orderId(), tripId));
        }
        jdbc.sql("UPDATE trip SET status = 'IN_TRANSIT', started_at = now(), updated_at = now(), version = version + 1 WHERE id = :id")
                .param("id", tripId)
                .update();
        audit.record(AuditEntry.of("trip.start", "trip", tripId).change(Map.of("status", "PLANNED"), Map.of("status", "IN_TRANSIT", "sales", sales)));
        return sales;
    }

    private record OpenStop(long id, long orderId) {}

    private OpenStop openStop(long tripId, long stopId) {
        record X(long id, long orderId, String outcome) {}
        X x = jdbc.sql("SELECT id, order_id, outcome FROM trip_stop WHERE id = :s AND trip_id = :t AND active FOR UPDATE")
                .param("s", stopId)
                .param("t", tripId)
                .query((rs, n) -> new X(rs.getLong("id"), rs.getLong("order_id"), rs.getString("outcome")))
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (x.outcome() != null) {
            throw MedixException.conflict("trip.stopDone");
        }
        return new OpenStop(x.id(), x.orderId());
    }

    private static final java.util.Set<String> IMAGE_TYPES = java.util.Set.of("image/jpeg", "image/png", "image/webp");

    /** Yetkazish rasmi (yoki imzo) — manzil natijasi belgilanmaguncha. */
    @Transactional
    long addPhoto(Actor actor, long tripId, long stopId, String contentType, byte[] data, boolean signature) {
        lockOwn(actor, tripId, TripStatus.IN_TRANSIT);
        openStop(tripId, stopId);
        if (contentType == null || !IMAGE_TYPES.contains(contentType) || data.length == 0 || data.length > 5 * 1024 * 1024) {
            throw MedixException.badRequest("trip.photoInvalid");
        }
        return jdbc.sql("""
                INSERT INTO delivery_photo (stop_id, content_type, size_bytes, data, kind, created_by) VALUES (:s, :ct, :sz, :d, :k, :by) RETURNING id""")
                .param("s", stopId)
                .param("ct", contentType)
                .param("sz", data.length)
                .param("d", data)
                .param("k", signature ? "SIGNATURE" : "PHOTO")
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
    }

    /** «Yetkazildi»: kamida 1 rasm; naqd to'lovda olingan summa (0 … buyurtma summasi). */
    @Transactional
    void deliver(Actor actor, long tripId, long stopId, String cash) {
        lockOwn(actor, tripId, TripStatus.IN_TRANSIT);
        OpenStop s = openStop(tripId, stopId);
        boolean photo = jdbc.sql("SELECT EXISTS (SELECT 1 FROM delivery_photo WHERE stop_id = :s AND kind = 'PHOTO')")
                .param("s", stopId).query(Boolean.class).single();
        if (!photo) {
            throw MedixException.conflict("trip.photoRequired");
        }
        Money total = Money.of(dispatch.total(s.orderId()));
        Money collected = null;
        if (cash != null && !cash.isBlank()) {
            try {
                collected = Money.of(cash.strip());
            } catch (RuntimeException e) {
                throw MedixException.badRequest("trip.cashInvalid", total.format());
            }
            if (collected.isNegative() || collected.compareTo(total) > 0) {
                throw MedixException.badRequest("trip.cashInvalid", total.format());
            }
        }
        dispatch.delivered(actor, s.orderId());
        jdbc.sql("""
                UPDATE trip_stop SET outcome = 'DELIVERED', outcome_by = :by, outcome_at = now(), cash_collected = :c WHERE id = :s""")
                .param("by", actor.employeeId())
                .param("c", collected == null ? null : collected.amount())
                .param("s", stopId)
                .update();
        audit.record(AuditEntry.of("trip.delivered", "trip", tripId).change(null, Map.of("stop", stopId, "cash", collected == null ? "0" : collected.toString())));
    }

    /** «Yetkazilmadi» (sabab majburiy): sotuv va qarz bekor, tovar «Qaytmoqda». */
    @Transactional
    void undeliver(Actor actor, long tripId, long stopId, String reason) {
        lockOwn(actor, tripId, TripStatus.IN_TRANSIT);
        OpenStop s = openStop(tripId, stopId);
        dispatch.undelivered(actor, s.orderId(), reason.strip());
        jdbc.sql("""
                UPDATE trip_stop SET outcome = 'UNDELIVERED', outcome_by = :by, outcome_at = now(), outcome_reason = :r WHERE id = :s""")
                .param("by", actor.employeeId())
                .param("r", reason.strip())
                .param("s", stopId)
                .update();
        audit.record(AuditEntry.of("trip.undelivered", "trip", tripId).change(null, Map.of("stop", stopId)).withReason(reason.strip()));
    }

    /** «Reysni yakunlash»: barcha manzillarda natija; qaytgan tovar yoki naqd pul bo'lsa — «Qaytish kutilmoqda», aks holda yakunlangan. */
    @Transactional
    TripStatus finish(Actor actor, long tripId) {
        lockOwn(actor, tripId, TripStatus.IN_TRANSIT);
        record F(long open, long undelivered, BigDecimal cash) {}
        F f = jdbc.sql("""
                SELECT count(*) FILTER (WHERE outcome IS NULL) AS open, count(*) FILTER (WHERE outcome = 'UNDELIVERED') AS undelivered,
                       coalesce(sum(cash_collected), 0) AS cash
                FROM trip_stop WHERE trip_id = :t AND active""")
                .param("t", tripId)
                .query((rs, n) -> new F(rs.getLong("open"), rs.getLong("undelivered"), rs.getBigDecimal("cash")))
                .single();
        if (f.open() > 0) {
            throw MedixException.conflict("trip.stopsOpen", f.open());
        }
        TripStatus next = f.undelivered() > 0 || f.cash().signum() > 0 ? TripStatus.RETURN_WAIT : TripStatus.DONE;
        jdbc.sql("UPDATE trip SET status = :s, finished_at = now(), updated_at = now(), version = version + 1 WHERE id = :id")
                .param("s", next.name())
                .param("id", tripId)
                .update();
        audit.record(AuditEntry.of("trip.finish", "trip", tripId).change(Map.of("status", "IN_TRANSIT"), Map.of("status", next.name())));
        return next;
    }

    /** «O'zi olib ketadi»: mijoz tovarni olib chiqdi — sotuv va HF, «Yo'lda» (SPEC 5.2). */
    @Transactional
    String handover(Actor actor, long orderId) {
        if (!dispatch.isPickup(orderId)) {
            throw MedixException.badRequest("trip.notPickup");
        }
        return dispatch.ship(actor, orderId, null);
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
                SELECT s.id, s.seq, s.order_id, o.number, o.waybill_number, c.name AS customer, o.address, c.phone, o.payment_type, s.places, o.total,
                       s.loaded_at, s.outcome, s.outcome_reason, s.cash_collected,
                       (SELECT count(*) FROM delivery_photo ph WHERE ph.stop_id = s.id AND ph.kind = 'PHOTO')::int AS photos
                FROM trip_stop s JOIN sales_order o ON o.id = s.order_id JOIN counterparty c ON c.id = o.customer_id
                WHERE s.trip_id = :id AND (s.active OR :cancelled) ORDER BY s.seq""")
                .param("id", id)
                .param("cancelled", head.status() == TripStatus.CANCELLED)
                .query((rs, n) -> new TripStop(rs.getLong("id"), rs.getInt("seq"), rs.getLong("order_id"), rs.getString("number"),
                        rs.getString("waybill_number"), rs.getString("customer"), rs.getString("address"), rs.getString("phone"),
                        rs.getString("payment_type"), rs.getInt("places"), money(rs.getBigDecimal("total")),
                        rs.getTimestamp("loaded_at") == null ? null : rs.getTimestamp("loaded_at").toInstant(), rs.getString("outcome"),
                        rs.getString("outcome_reason"), rs.getBigDecimal("cash_collected") == null ? null : money(rs.getBigDecimal("cash_collected")),
                        rs.getInt("photos")))
                .list());
        return new TripDetail(head.id(), head.number(), head.branchId(), head.tripDate(), head.status(), head.vehicleId(), head.vehicle(),
                head.capacityBoxes(), head.driverId(), head.driver(), head.note(), head.places(), head.total(), head.createdBy(), head.createdAt(),
                head.startedAt(), head.cancelReason(), stops);
    }

    private static String money(BigDecimal v) {
        return new Money(v).toString();
    }
}
