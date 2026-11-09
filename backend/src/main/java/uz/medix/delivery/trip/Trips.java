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
import uz.medix.delivery.trip.TripModels.HandedSale;
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
    private final uz.medix.finance.CustomerPayments payments;
    private final TripOrderListener settle;

    Trips(JdbcClient jdbc, OrderDispatch dispatch, DocumentSequenceService numbers, AuditLog audit, uz.medix.finance.CustomerPayments payments,
            TripOrderListener settle) {
        this.payments = payments;
        this.settle = settle;
        this.jdbc = jdbc;
        this.dispatch = dispatch;
        this.numbers = numbers;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    List<ReadyOrder> ready(Actor actor, Long branchId) {
        List<DispatchOrder> orders = dispatch.ready(actor, branchId);
        if (orders.isEmpty()) {
            return List.of();
        }
        Map<Long, ReadyExtra> extra = new java.util.HashMap<>();
        jdbc.sql("""
                SELECT o.id, c.phone, r.name AS region, o.delivery_date, o.status_changed_at,
                       (SELECT count(*) FROM sales_order_line l WHERE l.order_id = o.id)::int AS lines,
                       (SELECT coalesce(sum(l.qty), 0) FROM sales_order_line l WHERE l.order_id = o.id)::int AS qty,
                       EXISTS (SELECT 1 FROM sales_order_line l JOIN product p ON p.id = l.product_id
                               WHERE l.order_id = o.id AND p.controlled) AS controlled,
                       (SELECT coalesce(sum(qty), 0) FROM sales_order_pick WHERE order_id = o.id)::int AS picked,
                       (SELECT coalesce(sum(qty), 0) FROM sales_order_pick_return WHERE order_id = o.id)::int AS returned
                FROM sales_order o JOIN counterparty c ON c.id = o.customer_id LEFT JOIN region r ON r.id = c.region_id
                WHERE o.id IN (:ids)""")
                .param("ids", orders.stream().map(DispatchOrder::id).toList())
                .query((rs, n) -> extra.put(rs.getLong("id"), new ReadyExtra(rs.getString("phone"), rs.getString("region"),
                        rs.getDate("delivery_date") == null ? null : rs.getDate("delivery_date").toLocalDate(),
                        rs.getInt("lines"), rs.getInt("qty"), rs.getTimestamp("status_changed_at").toInstant(), rs.getBoolean("controlled"),
                        Math.max(0, rs.getInt("qty") - Math.max(0, rs.getInt("picked") - rs.getInt("returned"))))))
                .list();
        return orders.stream().map(o -> ready(o, extra.get(o.id()))).toList();
    }

    private record ReadyExtra(String phone, String region, LocalDate deliveryDate, int lines, int qty, java.time.Instant readyAt, boolean controlled,
            int shortQty) {}

    private static ReadyOrder ready(DispatchOrder o, ReadyExtra x) {
        return new ReadyOrder(o.id(), o.number(), o.branchId(), o.customer(), o.address(), o.delivery().name(), o.places(), o.total(),
                x.phone(), x.region(), x.deliveryDate(), x.lines(), x.qty(), x.readyAt(), x.controlled(), x.shortQty());
    }

    /** «Topshirilgan» (prototip Shipping): so'nggi 30 kundagi o'tkazilgan sotuvlar — o'zi olib ketdi yoki reys bilan. */
    @Transactional(readOnly = true)
    List<HandedSale> handed(Actor actor, Long branchId) {
        return jdbc.sql("""
                SELECT s.id, s.number, s.order_id, o.number AS order_number, s.customer_id, c.name AS customer, r.name AS region,
                       s.branch_id, t.number AS trip_number, s.created_at, s.total, e.full_name AS by_name
                FROM sale s JOIN sales_order o ON o.id = s.order_id JOIN counterparty c ON c.id = s.customer_id
                LEFT JOIN region r ON r.id = c.region_id LEFT JOIN trip t ON t.id = s.trip_id JOIN employee e ON e.id = s.created_by
                WHERE s.status = 'POSTED' AND s.created_at >= now() - INTERVAL '30 days'
                  AND (CAST(:b AS BIGINT) IS NULL OR s.branch_id = :b)
                ORDER BY s.created_at DESC, s.id DESC LIMIT 500""")
                .param("b", branchId)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id"))
                        ? new HandedSale(rs.getLong("id"), rs.getString("number"), rs.getLong("order_id"), rs.getString("order_number"),
                                rs.getLong("customer_id"), rs.getString("customer"), rs.getString("region"),
                                rs.getString("trip_number") == null ? "PICKUP" : "TRIP", rs.getString("trip_number"),
                                rs.getTimestamp("created_at").toInstant(), money(rs.getBigDecimal("total")), rs.getString("by_name"))
                        : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .toList();
    }

    @Transactional(readOnly = true)
    TripOptions options(Actor actor, long branchId) {
        if (!actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        List<VehicleOption> vehicles = jdbc.sql("""
                SELECT v.id, v.plate_number, v.model, v.has_refrigerator,
                       coalesce((SELECT sum(t.places) FROM trip t WHERE t.vehicle_id = v.id AND t.status IN ('PLANNED', 'IN_TRANSIT')), 0) AS busy
                FROM vehicle v WHERE v.branch_id = :b AND v.active ORDER BY v.plate_number""")
                .param("b", branchId)
                .query((rs, n) -> new VehicleOption(rs.getLong("id"), rs.getString("plate_number"), rs.getString("model"),
                        rs.getBoolean("has_refrigerator"), rs.getInt("busy")))
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

    private record Vehicle(long id, long branchId, String plate, boolean active) {}

    @Transactional
    long create(Actor actor, TripRequest r) {
        List<DispatchOrder> orders = dispatch.lockDocumenting(actor, r.orderIds());
        long branchId = orders.getFirst().branchId();
        if (orders.stream().anyMatch(o -> o.delivery() == OrderDispatch.Delivery.PICKUP)) {
            throw MedixException.badRequest("trip.pickupInTrip");
        }
        Vehicle v = jdbc.sql("SELECT id, branch_id, plate_number, active FROM vehicle WHERE id = :id FOR UPDATE")
                .param("id", r.vehicleId())
                .query((rs, n) -> new Vehicle(rs.getLong("id"), rs.getLong("branch_id"), rs.getString("plate_number"),
                        rs.getBoolean("active")))
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

    private record Planned(long id, long branchId, long vehicleId) {}

    /** Reys «Rejalashtirilgan» va foydalanuvchi filialida bo'lishi shart (qulflanadi). */
    private Planned lockPlanned(Actor actor, long id) {
        record X(long id, long branchId, long vehicleId, TripStatus status) {}
        X t = jdbc.sql("SELECT id, branch_id, vehicle_id, status FROM trip WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new X(rs.getLong("id"), rs.getLong("branch_id"), rs.getLong("vehicle_id"), TripStatus.valueOf(rs.getString("status"))))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (t.status() != TripStatus.PLANNED) {
            throw MedixException.conflict("trip.notEditable");
        }
        return new Planned(t.id(), t.branchId(), t.vehicleId());
    }

    /**
     * Rejalashtirilgan reysga buyurtma qo'shish: «Hujjatlashtirilmoqda» buyurtmalar, reys filialidan, «O'zi olib ketadi» emas; sig'im
     * mashinaning barcha faol reyslari bilan birga tekshiriladi. Har buyurtma nakladnoy raqami bilan «Yuklanmoqda»ga.
     */
    @Transactional
    void addOrders(Actor actor, long tripId, List<Long> orderIds) {
        Planned t = lockPlanned(actor, tripId);
        List<DispatchOrder> orders = dispatch.lockDocumenting(actor, orderIds);
        if (orders.stream().anyMatch(o -> o.branchId() != t.branchId())) {
            throw MedixException.badRequest("trip.mixedBranches");
        }
        if (orders.stream().anyMatch(o -> o.delivery() == OrderDispatch.Delivery.PICKUP)) {
            throw MedixException.badRequest("trip.pickupInTrip");
        }
        Vehicle v = jdbc.sql("SELECT id, branch_id, plate_number, active FROM vehicle WHERE id = :id FOR UPDATE")
                .param("id", t.vehicleId())
                .query((rs, n) -> new Vehicle(rs.getLong("id"), rs.getLong("branch_id"), rs.getString("plate_number"),
                        rs.getBoolean("active")))
                .single();
        int places = orders.stream().mapToInt(DispatchOrder::places).sum();
        int seq = jdbc.sql("SELECT coalesce(max(seq), 0) FROM trip_stop WHERE trip_id = :t").param("t", tripId).query(Integer.class).single();
        for (DispatchOrder o : orders) {
            jdbc.sql("INSERT INTO trip_stop (trip_id, order_id, seq, places) VALUES (:t, :o, :s, :p)")
                    .param("t", tripId)
                    .param("o", o.id())
                    .param("s", ++seq)
                    .param("p", o.places())
                    .update();
            dispatch.toLoading(actor, o.id());
        }
        jdbc.sql("UPDATE trip SET places = places + :p, updated_at = now(), version = version + 1 WHERE id = :t")
                .param("p", places).param("t", tripId).update();
        audit.record(AuditEntry.of("trip.addOrders", "trip", tripId)
                .change(null, Map.of("orders", orders.stream().map(DispatchOrder::number).toList(), "places", places)));
    }

    /**
     * Rejalashtirilgan reysdan buyurtmani olib tashlash (haydovchi hali qabul qilmagan): buyurtma «Hujjatlashtirilmoqda»ga qaytadi, NK
     * raqami saqlanadi. Oxirgi buyurtma olib tashlanmaydi — reysni bekor qilish kerak.
     */
    @Transactional
    void removeOrder(Actor actor, long tripId, long orderId, String reason) {
        lockPlanned(actor, tripId);
        record S(long id, int places, boolean loaded) {}
        S s = jdbc.sql("SELECT id, places, loaded_at IS NOT NULL AS loaded FROM trip_stop WHERE trip_id = :t AND order_id = :o AND active")
                .param("t", tripId)
                .param("o", orderId)
                .query((rs, n) -> new S(rs.getLong("id"), rs.getInt("places"), rs.getBoolean("loaded")))
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (s.loaded()) {
            throw MedixException.conflict("trip.stopLoaded");
        }
        int left = jdbc.sql("SELECT count(*) FROM trip_stop WHERE trip_id = :t AND active").param("t", tripId).query(Integer.class).single();
        if (left <= 1) {
            throw MedixException.conflict("trip.lastOrder");
        }
        jdbc.sql("UPDATE trip_stop SET active = false WHERE id = :id").param("id", s.id()).update();
        jdbc.sql("UPDATE trip SET places = places - :p, updated_at = now(), version = version + 1 WHERE id = :t")
                .param("p", s.places()).param("t", tripId).update();
        dispatch.backToDocumenting(actor, orderId, reason.strip());
        audit.record(AuditEntry.of("trip.removeOrder", "trip", tripId).change(Map.of("order", orderId), null).withReason(reason.strip()));
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
        requirePhoto(stopId);
        Money collected = cash(cash, Money.of(dispatch.total(s.orderId())));
        dispatch.delivered(actor, s.orderId());
        jdbc.sql("""
                UPDATE trip_stop SET outcome = 'DELIVERED', outcome_by = :by, outcome_at = now(), cash_collected = :c WHERE id = :s""")
                .param("by", actor.employeeId())
                .param("c", collected == null ? null : collected.amount())
                .param("s", stopId)
                .update();
        audit.record(AuditEntry.of("trip.delivered", "trip", tripId).change(null, Map.of("stop", stopId, "cash", collected == null ? "0" : collected.toString())));
    }

    private void requirePhoto(long stopId) {
        boolean photo = jdbc.sql("SELECT EXISTS (SELECT 1 FROM delivery_photo WHERE stop_id = :s AND kind = 'PHOTO')")
                .param("s", stopId).query(Boolean.class).single();
        if (!photo) {
            throw MedixException.conflict("trip.photoRequired");
        }
    }

    /** Naqd olingan summa: bo'sh — null; 0 … limit oralig'ida bo'lishi shart. */
    private static Money cash(String cash, Money limit) {
        if (cash == null || cash.isBlank()) {
            return null;
        }
        Money collected;
        try {
            collected = Money.of(cash.strip());
        } catch (RuntimeException e) {
            throw MedixException.badRequest("trip.cashInvalid", limit.format());
        }
        if (collected.isNegative() || collected.compareTo(limit) > 0) {
            throw MedixException.badRequest("trip.cashInvalid", limit.format());
        }
        return collected;
    }

    /** Manzildagi sotuv qatorlari (qisman yetkazish uchun). */
    @Transactional(readOnly = true)
    List<OrderDispatch.SaleLine> stopLines(Actor actor, long tripId, long stopId) {
        long orderId = jdbc.sql("""
                SELECT s.order_id FROM trip_stop s JOIN trip t ON t.id = s.trip_id
                WHERE s.id = :s AND s.trip_id = :t AND s.active AND t.driver_id = :d""")
                .param("s", stopId)
                .param("t", tripId)
                .param("d", actor.employeeId())
                .query(Long.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        return dispatch.saleLines(orderId);
    }

    /**
     * «Qisman» (SPEC 5.4): rasm majburiy, sabab majburiy; qabul qilinmagan qism QM bo'lib qaytadi (asl sotuv narxida), naqd —
     * qolgan summagacha.
     */
    @Transactional
    String partial(Actor actor, long tripId, long stopId, String reason, Map<Long, Integer> returned, String cash) {
        lockOwn(actor, tripId, TripStatus.IN_TRANSIT);
        OpenStop s = openStop(tripId, stopId);
        requirePhoto(stopId);
        OrderDispatch.PartialResult r = dispatch.partiallyDelivered(actor, s.orderId(), tripId, reason, returned);
        Money collected = cash(cash, Money.of(r.netTotal()));
        jdbc.sql("""
                UPDATE trip_stop SET outcome = 'PARTIAL', outcome_by = :by, outcome_at = now(), outcome_reason = :r, cash_collected = :c WHERE id = :s""")
                .param("by", actor.employeeId())
                .param("r", reason.strip())
                .param("c", collected == null ? null : collected.amount())
                .param("s", stopId)
                .update();
        audit.record(AuditEntry.of("trip.partial", "trip", tripId)
                .change(null, Map.of("stop", stopId, "return", r.returnNumber(), "cash", collected == null ? "0" : collected.toString()))
                .withReason(reason.strip()));
        return r.returnNumber();
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
                SELECT count(*) FILTER (WHERE outcome IS NULL) AS open, count(*) FILTER (WHERE outcome IN ('UNDELIVERED', 'PARTIAL') AND EXISTS (
                           SELECT 1 FROM sales_return_pending r WHERE r.order_id = trip_stop.order_id AND r.received_at IS NULL)) AS undelivered,
                       coalesce(sum(cash_collected) FILTER (WHERE cash_payment_id IS NULL AND cash_accept_id IS NULL), 0) AS cash
                FROM trip_stop WHERE trip_id = :t AND active""")
                .param("t", tripId)
                .query((rs, n) -> new F(rs.getLong("open"), rs.getLong("undelivered"), rs.getBigDecimal("cash")))
                .single();
        if (f.open() > 0) {
            throw MedixException.conflict("trip.stopsOpen", f.open());
        }
        // Qabul qilinmagan qaytgan tovar (yetkazilmadi / qisman) yoki naqd pul bo'lsa — topshirilguncha «Qaytish kutilmoqda»
        TripStatus next = f.undelivered() > 0 || f.cash().signum() > 0 ? TripStatus.RETURN_WAIT : TripStatus.DONE;
        jdbc.sql("UPDATE trip SET status = :s, finished_at = now(), updated_at = now(), version = version + 1 WHERE id = :id")
                .param("s", next.name())
                .param("id", tripId)
                .update();
        audit.record(AuditEntry.of("trip.finish", "trip", tripId).change(Map.of("status", "IN_TRANSIT"), Map.of("status", next.name())));
        return next;
    }

    // ===== Haydovchidagi pul → Kassir (SPEC 5.4) =====

    @Transactional(readOnly = true)
    List<TripModels.DriverCash> driverCash(Actor actor, Long branchId) {
        return jdbc.sql("""
                SELECT s.id, s.trip_id, t.number AS trip, d.full_name AS driver, o.number AS order_number, o.customer_id, c.name AS customer,
                       s.cash_collected, s.outcome_at, t.branch_id, t.status
                FROM trip_stop s JOIN trip t ON t.id = s.trip_id JOIN employee d ON d.id = t.driver_id
                JOIN sales_order o ON o.id = s.order_id JOIN counterparty c ON c.id = o.customer_id
                WHERE s.active AND s.cash_collected > 0 AND s.cash_payment_id IS NULL AND s.cash_accept_id IS NULL AND t.status IN ('IN_TRANSIT', 'RETURN_WAIT')
                  AND (CAST(:b AS BIGINT) IS NULL OR t.branch_id = :b)
                ORDER BY d.full_name, t.id, s.seq""")
                .param("b", branchId)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id"))
                        ? new TripModels.DriverCash(rs.getLong("id"), rs.getLong("trip_id"), rs.getString("trip"), rs.getString("driver"),
                                rs.getString("order_number"), rs.getLong("customer_id"), rs.getString("customer"), money(rs.getBigDecimal("cash_collected")),
                                rs.getTimestamp("outcome_at").toInstant(), TripStatus.valueOf(rs.getString("status")))
                        : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .toList();
    }

    /** Kassir naqd pulni sanab qabul qiladi → MT o'tkaziladi (eng eski qarzdan), reys yakunlanishi tekshiriladi. */
    @Transactional
    String acceptCash(Actor actor, long stopId, long accountId) {
        record C(long tripId, String trip, long branchId, long customerId, BigDecimal cash, String order) {}
        C c = jdbc.sql("""
                SELECT s.trip_id, t.number AS trip, t.branch_id, o.customer_id, s.cash_collected, o.number AS order_number
                FROM trip_stop s JOIN trip t ON t.id = s.trip_id JOIN sales_order o ON o.id = s.order_id
                WHERE s.id = :s AND s.active AND s.cash_collected > 0 AND s.cash_payment_id IS NULL AND s.cash_accept_id IS NULL AND t.status IN ('IN_TRANSIT', 'RETURN_WAIT')
                FOR UPDATE OF s, t""")
                .param("s", stopId)
                .query((rs, n) -> new C(rs.getLong("trip_id"), rs.getString("trip"), rs.getLong("branch_id"), rs.getLong("customer_id"),
                        rs.getBigDecimal("cash_collected"), rs.getString("order_number")))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.conflict("trip.cashNotFound"));
        uz.medix.finance.CustomerPayments.Posted p = payments.acceptDriverCash(actor, c.branchId(), c.customerId(), accountId, new Money(c.cash()),
                c.trip(), "Haydovchidan: " + c.trip() + " · " + c.order());
        jdbc.sql("UPDATE trip_stop SET cash_payment_id = :p WHERE id = :s").param("p", p.id()).param("s", stopId).update();
        audit.record(AuditEntry.of("trip.cashAccepted", "trip", c.tripId()).change(null, Map.of("stop", stopId, "payment", p.number())));
        settle.closeIfSettled(c.tripId());
        return p.number();
    }

    /**
     * Reys bo'yicha qabul (prototip `Cash`): Kassir sanagan summa to'xtashlar tartibida taqsimlanadi — har biriga o'z summasigacha,
     * oxirgisiga qolgani (ortiqcha bo'lsa — mijozga avans). Har musbat ulush — MT. Farq bo'lsa izoh majburiy.
     */
    @Transactional
    TripModels.TripCashAccepted acceptTripCash(Actor actor, long tripId, long accountId, Money received, String note) {
        record S(long id, long branchId, long customerId, BigDecimal cash, String order, String trip) {}
        List<S> stops = jdbc.sql("""
                SELECT s.id, t.branch_id, o.customer_id, s.cash_collected, o.number AS order_number, t.number AS trip
                FROM trip_stop s JOIN trip t ON t.id = s.trip_id JOIN sales_order o ON o.id = s.order_id
                WHERE s.trip_id = :t AND s.active AND s.cash_collected > 0 AND s.cash_payment_id IS NULL AND s.cash_accept_id IS NULL
                  AND t.status IN ('IN_TRANSIT', 'RETURN_WAIT')
                ORDER BY s.seq, s.id
                FOR UPDATE OF s, t""")
                .param("t", tripId)
                .query((rs, n) -> new S(rs.getLong("id"), rs.getLong("branch_id"), rs.getLong("customer_id"), rs.getBigDecimal("cash_collected"),
                        rs.getString("order_number"), rs.getString("trip")))
                .list();
        if (stops.isEmpty() || !actor.canAccessBranch(stops.getFirst().branchId())) {
            throw MedixException.conflict("trip.cashNotFound");
        }
        if (received.amount().signum() < 0) {
            throw MedixException.badRequest("trip.cashReceivedInvalid");
        }
        Money expected = stops.stream().map(s -> new Money(s.cash())).reduce(Money.ZERO, Money::plus);
        Money diff = received.minus(expected);
        String n = note == null || note.isBlank() ? null : note.strip();
        if (diff.amount().signum() != 0 && n == null) {
            throw MedixException.badRequest("trip.cashNoteRequired");
        }
        Long acceptId = jdbc.sql("""
                INSERT INTO trip_cash_accept (trip_id, account_id, expected, received, diff, note, accepted_by)
                VALUES (:t, :a, :e, :r, :d, :n, :by) RETURNING id""")
                .param("t", tripId).param("a", accountId).param("e", expected.amount()).param("r", received.amount())
                .param("d", diff.amount()).param("n", n).param("by", actor.employeeId())
                .query(Long.class).single();
        String trip = stops.getFirst().trip();
        List<String> numbers = new ArrayList<>();
        Money left = received;
        for (int i = 0; i < stops.size(); i++) {
            S s = stops.get(i);
            Money own = new Money(s.cash());
            Money share = i == stops.size() - 1 ? left : (left.compareTo(own) < 0 ? left : own);
            left = left.minus(share);
            Long paymentId = null;
            if (share.amount().signum() > 0) {
                uz.medix.finance.CustomerPayments.Posted p = payments.acceptDriverCash(actor, s.branchId(), s.customerId(), accountId, share, trip,
                        "Haydovchidan: " + trip + " · " + s.order());
                paymentId = p.id();
                numbers.add(p.number());
            }
            jdbc.sql("UPDATE trip_stop SET cash_payment_id = :p, cash_accept_id = :a WHERE id = :s")
                    .param("p", paymentId).param("a", acceptId).param("s", s.id()).update();
        }
        audit.record(AuditEntry.of("trip.cashAccepted", "trip", tripId).change(null, Map.of("expected", expected.toString(),
                "received", received.toString(), "diff", diff.toString(), "payments", String.join(", ", numbers))));
        settle.closeIfSettled(tripId);
        return new TripModels.TripCashAccepted(expected.toString(), received.toString(), diff.toString(), numbers);
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
            SELECT t.id, t.number, t.branch_id, t.trip_date, t.status, v.plate_number || ' · ' || v.model AS vehicle,
                   v.plate_number, v.model AS vehicle_model, v.has_refrigerator, d.phone AS driver_phone,
                   (SELECT count(*) FROM trip_stop s WHERE s.trip_id = t.id AND s.active AND s.outcome IN ('DELIVERED', 'PARTIAL')) AS delivered,
                   (SELECT count(*) FROM trip_stop s WHERE s.trip_id = t.id AND s.active AND s.outcome IS NOT NULL) AS marked,
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
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id")) ? summary(rs) : null)
                .list()
                .stream()
                .filter(Objects::nonNull)
                .toList();
    }

    private static TripSummary summary(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new TripSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getDate("trip_date").toLocalDate(),
                TripStatus.valueOf(rs.getString("status")), rs.getString("vehicle"),
                rs.getString("driver"), rs.getInt("orders"), rs.getInt("places"), money(rs.getBigDecimal("total")),
                rs.getTimestamp("created_at").toInstant(), rs.getString("driver_phone"), rs.getString("plate_number"), rs.getString("vehicle_model"),
                rs.getBoolean("has_refrigerator"), rs.getInt("delivered"), rs.getInt("marked"));
    }

    /** Haydovchi paneli «Yakunlangan reyslar» (SPEC 5.4): o'z reyslari — yakunlangan yoki bekor qilingan, oxirgi 100 ta. */
    @Transactional(readOnly = true)
    List<TripSummary> mineHistory(Actor actor) {
        return jdbc.sql(SUMMARY + """
                 WHERE t.driver_id = :d AND t.status IN ('DONE', 'CANCELLED')
                ORDER BY t.trip_date DESC, t.id DESC LIMIT 100""")
                .param("d", actor.employeeId())
                .query((rs, n) -> summary(rs))
                .list();
    }

    @Transactional(readOnly = true)
    TripDetail find(Actor actor, long id) {
        TripDetail head = jdbc.sql(SUMMARY + " WHERE t.id = :id")
                .param("id", id)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id"))
                        ? new TripDetail(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getDate("trip_date").toLocalDate(),
                                TripStatus.valueOf(rs.getString("status")), rs.getLong("vehicle_id"), rs.getString("vehicle"),
                                rs.getLong("driver_id"), rs.getString("driver"), rs.getString("note"),
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
                       (SELECT count(*) FROM delivery_photo ph WHERE ph.stop_id = s.id AND ph.kind = 'PHOTO')::int AS photos,
                       EXISTS (SELECT 1 FROM delivery_photo ph WHERE ph.stop_id = s.id AND ph.kind = 'SIGNATURE') AS signed,
                       q.number AS return_number, q.total AS return_total
                FROM trip_stop s LEFT JOIN sales_return q ON q.order_id = s.order_id AND q.trip_id = s.trip_id JOIN sales_order o ON o.id = s.order_id JOIN counterparty c ON c.id = o.customer_id
                WHERE s.trip_id = :id AND (s.active OR :cancelled) ORDER BY s.seq""")
                .param("id", id)
                .param("cancelled", head.status() == TripStatus.CANCELLED)
                .query((rs, n) -> new TripStop(rs.getLong("id"), rs.getInt("seq"), rs.getLong("order_id"), rs.getString("number"),
                        rs.getString("waybill_number"), rs.getString("customer"), rs.getString("address"), rs.getString("phone"),
                        rs.getString("payment_type"), rs.getInt("places"), money(rs.getBigDecimal("total")),
                        rs.getTimestamp("loaded_at") == null ? null : rs.getTimestamp("loaded_at").toInstant(), rs.getString("outcome"),
                        rs.getString("outcome_reason"), rs.getBigDecimal("cash_collected") == null ? null : money(rs.getBigDecimal("cash_collected")),
                        rs.getInt("photos"), rs.getString("return_number"),
                        rs.getBigDecimal("return_total") == null ? null : money(rs.getBigDecimal("return_total")), rs.getBoolean("signed")))
                .list());
        return new TripDetail(head.id(), head.number(), head.branchId(), head.tripDate(), head.status(), head.vehicleId(), head.vehicle(),
                head.driverId(), head.driver(), head.note(), head.places(), head.total(), head.createdBy(), head.createdAt(),
                head.startedAt(), head.cancelReason(), stops);
    }

    private static String money(BigDecimal v) {
        return new Money(v).toString();
    }
}
