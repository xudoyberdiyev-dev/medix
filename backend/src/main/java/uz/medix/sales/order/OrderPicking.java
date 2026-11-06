package uz.medix.sales.order;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.inventory.StockReservations;
import uz.medix.inventory.StockReservations.Allocation;
import uz.medix.inventory.StockReservations.Free;
import uz.medix.sales.order.OrderModels.OrderStatus;
import uz.medix.sales.order.OrderModels.PickLineConfirm;
import uz.medix.sales.order.OrderModels.PickQueueItem;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/**
 * Vaqt berish (Ombor mudiri) va yig'ish (Yig'uvchi), SPEC 5.2 №3–4, 5.4. Yakunlashda tovar zahiradagi (yoki tanlangan boshqa)
 * partiyadan Jo'natish zonasiga o'tadi — ombor jurnali bilan bitta tranzaksiyada; zahira iste'mol qilinadi. Keyingi holat —
 * markirovkali qator bo'lsa «Markirovkada», bo'lmasa «Hisobdan o'tkazilmoqda».
 */
@Service
class OrderPicking {

    private final JdbcClient jdbc;
    private final StockLedger stock;
    private final StockReservations reservations;
    private final AuditLog audit;
    private final Orders orders;

    OrderPicking(JdbcClient jdbc, StockLedger stock, StockReservations reservations, AuditLog audit, Orders orders) {
        this.orders = orders;
        this.jdbc = jdbc;
        this.stock = stock;
        this.reservations = reservations;
        this.audit = audit;
    }

    private record Head(long id, String number, long branchId, long warehouseId, OrderStatus status, Integer pickMinutes, Long pickerId) {}

    private Head lock(long id, Actor actor) {
        return jdbc.sql("SELECT id, number, branch_id, warehouse_id, status, pick_minutes, picker_id FROM sales_order WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("warehouse_id"),
                        OrderStatus.valueOf(rs.getString("status")), (Integer) rs.getObject("pick_minutes"), (Long) rs.getObject("picker_id")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    /** Vaqt berish (daqiqa, har buyurtmaga alohida) — faqat «Navbatda». Qayta berish mumkin (yig'ish boshlanmaguncha). */
    @Transactional
    void giveTime(Actor actor, long id, int pickMinutes, Integer markMinutes) {
        Head h = lock(id, actor);
        if (h.status() != OrderStatus.QUEUED) {
            throw MedixException.conflict("order.badStatus", h.status().name());
        }
        boolean marked = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM sales_order_line l JOIN product p ON p.id = l.product_id WHERE l.order_id = :id AND p.marked)""")
                .param("id", id)
                .query(Boolean.class)
                .single();
        if (marked && markMinutes == null) {
            throw MedixException.badRequest("order.markTimeRequired");
        }
        jdbc.sql("""
                UPDATE sales_order SET pick_minutes = :p, mark_minutes = :m, time_given_by = :by, time_given_at = now(), updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("p", pickMinutes)
                .param("m", marked ? markMinutes : null)
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("order.time", "sales_order", id).change(null, Map.of("pick", pickMinutes, "mark", marked ? markMinutes : 0)));
    }

    /** Yig'uvchi navbati: vaqt berilgan «Navbatda» va «Yig'ilmoqda» buyurtmalar (o'z filiali). */
    @Transactional(readOnly = true)
    List<PickQueueItem> queue(Actor actor) {
        return jdbc.sql("""
                SELECT o.id, o.number, c.name AS customer, o.status, o.branch_id, o.pick_minutes, pk.full_name AS picker, o.picker_id,
                       o.pick_started_at, o.queued_at,
                       (SELECT count(*) FROM sales_order_line l WHERE l.order_id = o.id) AS lines,
                       (SELECT coalesce(sum(l.qty), 0) FROM sales_order_line l WHERE l.order_id = o.id) AS total_qty,
                       EXISTS (SELECT 1 FROM sales_order_line l JOIN product p ON p.id = l.product_id WHERE l.order_id = o.id AND p.marked) AS marked
                FROM sales_order o JOIN counterparty c ON c.id = o.customer_id LEFT JOIN employee pk ON pk.id = o.picker_id
                WHERE (o.status = 'QUEUED' AND o.pick_minutes IS NOT NULL) OR o.status = 'PICKING'
                ORDER BY o.status DESC, o.queued_at, o.id""")
                .query((rs, n) -> {
                    if (!actor.canAccessBranch(rs.getLong("branch_id"))) {
                        return null;
                    }
                    Instant started = instant(rs.getTimestamp("pick_started_at"));
                    Integer minutes = (Integer) rs.getObject("pick_minutes");
                    return new PickQueueItem(rs.getLong("id"), rs.getString("number"), rs.getString("customer"),
                            OrderStatus.valueOf(rs.getString("status")), rs.getInt("lines"), rs.getLong("total_qty"), rs.getBoolean("marked"),
                            minutes, rs.getString("picker"), (Long) rs.getObject("picker_id"), started,
                            started == null || minutes == null ? null : started.plusSeconds(minutes * 60L), rs.getTimestamp("queued_at").toInstant());
                })
                .list()
                .stream()
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    /** «Yig'ishni boshlash»: vaqt berilgan bo'lishi shart; bir yig'uvchida bitta faol buyurtma (SPEC 5.2). */
    @Transactional
    void start(Actor actor, long id) {
        Head h = lock(id, actor);
        if (h.status() != OrderStatus.QUEUED) {
            throw MedixException.conflict("order.badStatus", h.status().name());
        }
        if (h.pickMinutes() == null) {
            throw MedixException.conflict("order.noTime");
        }
        String busy = jdbc.sql("SELECT number FROM sales_order WHERE picker_id = :p AND status = 'PICKING' LIMIT 1")
                .param("p", actor.employeeId())
                .query(String.class)
                .optional()
                .orElse(null);
        if (busy != null) {
            throw MedixException.conflict("order.pickerBusy", busy);
        }
        jdbc.sql("""
                UPDATE sales_order SET status = 'PICKING', picker_id = :p, pick_started_at = now(), status_changed_at = now(), updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("p", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("order.pickStart", "sales_order", id));
    }

    /**
     * Yig'uvchi uchun qator mahsulotining boshqa partiyalari (stock.view ruxsatisiz): faqat o'zi yig'ayotgan «Yig'ilmoqda» buyurtma;
     * tannarx yuborilmaydi.
     */
    @Transactional(readOnly = true)
    List<OrderModels.PickBatch> batches(Actor actor, long id, long lineId) {
        record H(long branchId, long warehouseId, OrderStatus status, Long pickerId) {}
        H h = jdbc.sql("SELECT branch_id, warehouse_id, status, picker_id FROM sales_order WHERE id = :id")
                .param("id", id)
                .query((rs, n) -> new H(rs.getLong("branch_id"), rs.getLong("warehouse_id"), OrderStatus.valueOf(rs.getString("status")),
                        (Long) rs.getObject("picker_id")))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (h.status() != OrderStatus.PICKING) {
            throw MedixException.conflict("order.badStatus", h.status().name());
        }
        if (h.pickerId() == null || h.pickerId() != actor.employeeId()) {
            throw MedixException.forbidden("order.notPicker");
        }
        long productId = jdbc.sql("SELECT product_id FROM sales_order_line WHERE id = :l AND order_id = :o")
                .param("l", lineId)
                .param("o", id)
                .query(Long.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        return reservations.freeByProduct(h.warehouseId(), productId, Orders.DOC_TYPE, id, lineId).stream()
                .map(b -> new OrderModels.PickBatch(b.batchId(), b.number(), b.expiry(), b.bonus(), b.free(), b.reservedForLine()))
                .toList();
    }

    private record LineRow(long id, long productId, int qty, boolean marked) {}

    /**
     * «Yakunlash» + partiya tasdig'i. Har qator: zahiradagi partiyalar («Ha, shundan oldim») yoki tanlangan boshqa partiya
     * («Boshqa partiyadan oldim» — ogohlantirish belgisi, bloklamaydi; shu partiyaning bo'sh qoldig'i yetishi shart).
     */
    @Transactional
    OrderStatus finish(Actor actor, long id, List<PickLineConfirm> confirms) {
        Head h = lock(id, actor);
        if (h.status() != OrderStatus.PICKING) {
            throw MedixException.conflict("order.badStatus", h.status().name());
        }
        if (h.pickerId() == null || h.pickerId() != actor.employeeId()) {
            throw MedixException.forbidden("order.notPicker");
        }
        long shipping = jdbc.sql("SELECT id FROM zone WHERE warehouse_id = :w AND type = 'SHIPPING' AND active")
                .param("w", h.warehouseId())
                .query(Long.class)
                .optional()
                .orElseThrow(() -> MedixException.conflict("receipt.zoneMissing", "Joʻnatish"));
        List<LineRow> lines = jdbc.sql("""
                SELECT l.id, l.product_id, l.qty, p.marked FROM sales_order_line l JOIN product p ON p.id = l.product_id
                WHERE l.order_id = :id ORDER BY l.line_no""")
                .param("id", id)
                .query(LineRow.class)
                .list();
        Map<Long, Long> override = new HashMap<>();
        if (confirms != null) {
            Set<Long> known = new HashSet<>(lines.stream().map(LineRow::id).toList());
            for (PickLineConfirm c : confirms) {
                if (!known.contains(c.lineId())) {
                    throw MedixException.badRequest("order.lineUnknown");
                }
                if (c.batchId() != null) {
                    override.put(c.lineId(), c.batchId());
                }
            }
        }
        Map<Long, List<Allocation>> reserved = new HashMap<>();
        for (Allocation a : reservations.active(Orders.DOC_TYPE, id)) {
            reserved.computeIfAbsent(a.lineId(), k -> new ArrayList<>()).add(a);
        }
        List<Move> moves = new ArrayList<>();
        boolean deviation = false;
        record Pick(long lineId, long batchId, long fromZone, int qty, boolean fefo) {}
        List<Pick> picks = new ArrayList<>();
        for (LineRow l : lines) {
            Long other = override.get(l.id());
            List<Allocation> res = reserved.getOrDefault(l.id(), List.of());
            boolean sameAsReserved = other != null && res.size() == 1 && res.getFirst().batchId() == other;
            if (other == null || sameAsReserved) {
                int sum = res.stream().mapToInt(Allocation::qty).sum();
                if (sum != l.qty()) {
                    throw MedixException.conflict("order.reservationMissing");
                }
                for (Allocation a : res) {
                    picks.add(new Pick(l.id(), a.batchId(), a.zoneId(), a.qty(), true));
                }
            } else {
                // Boshqa partiya: avval zahira bo'shaydi (o'zi uchun), keyin tanlangan partiyaning bo'sh qoldig'i tekshiriladi.
                reservations.consumeLine(Orders.DOC_TYPE, id, l.id());
                boolean sameProduct = jdbc.sql("SELECT EXISTS (SELECT 1 FROM batch WHERE id = :b AND product_id = :p)")
                        .param("b", other).param("p", l.productId()).query(Boolean.class).single();
                if (!sameProduct) {
                    throw MedixException.badRequest("order.batchWrongProduct");
                }
                int left = l.qty();
                for (Free f : reservations.freeOf(h.warehouseId(), other)) {
                    int take = Math.min(left, f.qty());
                    if (take > 0) {
                        picks.add(new Pick(l.id(), other, f.zoneId(), take, false));
                        left -= take;
                    }
                    if (left == 0) {
                        break;
                    }
                }
                if (left > 0) {
                    throw MedixException.conflict("order.batchInsufficient");
                }
                deviation = true;
            }
            reservations.consumeLine(Orders.DOC_TYPE, id, l.id());
        }
        for (Pick p : picks) {
            moves.add(Move.out(p.fromZone(), p.batchId(), p.qty()));
            moves.add(Move.in(shipping, p.batchId(), p.qty()));
            jdbc.sql("""
                    INSERT INTO sales_order_pick (order_id, line_id, batch_id, from_zone_id, to_zone_id, qty, fefo, picked_by)
                    VALUES (:o, :l, :b, :f, :t, :q, :fefo, :by)""")
                    .param("o", id)
                    .param("l", p.lineId())
                    .param("b", p.batchId())
                    .param("f", p.fromZone())
                    .param("t", shipping)
                    .param("q", p.qty())
                    .param("fefo", p.fefo())
                    .param("by", actor.employeeId())
                    .update();
        }
        stock.post(new DocRef(Orders.DOC_TYPE, id, h.number()), moves);
        boolean marked = lines.stream().anyMatch(LineRow::marked);
        OrderStatus next = marked ? OrderStatus.MARKING : OrderStatus.CHECKING;
        jdbc.sql("""
                UPDATE sales_order SET status = :s, pick_finished_at = now(), fefo_deviation = :dev, status_changed_at = now(), updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("s", next.name())
                .param("dev", deviation)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("order.pickFinish", "sales_order", id)
                .change(Map.of("status", OrderStatus.PICKING.name()), Map.of("status", next.name(), "fefoDeviation", deviation)));
        return next;
    }

    /** Hisobdan o'tkazish (SPEC 5.2 №6): barcha qatorlar «Tekshirildi» va joylar soni → «Hujjatlashtirilmoqda». */
    @Transactional
    void check(Actor actor, long id, List<Long> checkedLines, int places) {
        Head h = lock(id, actor);
        if (h.status() != OrderStatus.CHECKING) {
            throw MedixException.conflict("order.badStatus", h.status().name());
        }
        Set<Long> all = new HashSet<>(jdbc.sql("SELECT id FROM sales_order_line WHERE order_id = :id").param("id", id).query(Long.class).list());
        if (!new HashSet<>(checkedLines).equals(all)) {
            throw MedixException.badRequest("order.checkAllLines");
        }
        jdbc.sql("""
                UPDATE sales_order SET status = 'DOCUMENTING', places = :p, checked_by = :by, checked_at = now(), status_changed_at = now(),
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("p", places)
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("order.check", "sales_order", id).change(Map.of("status", OrderStatus.CHECKING.name()),
                Map.of("status", OrderStatus.DOCUMENTING.name(), "places", places)));
    }

    /**
     * «Yig'ishga qaytarish» (sabab bilan): tovar Jo'natish zonasidan olingan joyiga qaytadi, FEFO zahira qayta qo'yiladi,
     * buyurtma «Navbatda»ga (berilgan vaqt saqlanadi). V1: butun buyurtma; qator bo'yicha qaytarish — keyin.
     */
    @Transactional
    void returnToPick(Actor actor, long id, String reason) {
        Head h = lock(id, actor);
        if (h.status() != OrderStatus.CHECKING && h.status() != OrderStatus.MARKING) {
            throw MedixException.conflict("order.badStatus", h.status().name());
        }
        List<Move> moves = new ArrayList<>();
        for (Orders.NetPick n : orders.netPicked(id)) {
            moves.add(Move.out(n.shippingZone(), n.batchId(), n.qty()));
            moves.add(Move.in(n.storageZone(), n.batchId(), n.qty()));
            jdbc.sql("""
                    INSERT INTO sales_order_pick_return (order_id, batch_id, from_zone_id, to_zone_id, qty, reason, created_by)
                    VALUES (:o, :b, :f, :t, :q, :r, :by)""")
                    .param("o", id)
                    .param("b", n.batchId())
                    .param("f", n.shippingZone())
                    .param("t", n.storageZone())
                    .param("q", n.qty())
                    .param("r", reason.strip())
                    .param("by", actor.employeeId())
                    .update();
        }
        stock.post(new DocRef(Orders.DOC_TYPE, id, h.number()), moves);
        // Kodlar bekor qilinadi (tarixda qoladi), qayta markirovkada yana urish mumkin (SPEC 5.2)
        OrderMarking.releaseCodes(jdbc, id, actor.employeeId(), reason.strip());
        jdbc.sql("""
                UPDATE sales_order SET status = 'QUEUED', picker_id = NULL, pick_started_at = NULL, pick_finished_at = NULL, fefo_deviation = false,
                       marker_id = NULL, mark_started_at = NULL, mark_finished_at = NULL, status_changed_at = now(), updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("id", id)
                .update();
        orders.reserveAgain(id);
        audit.record(AuditEntry.of("order.returnToPick", "sales_order", id)
                .change(Map.of("status", h.status().name()), Map.of("status", OrderStatus.QUEUED.name())).withReason(reason.strip()));
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
