package uz.medix.sales.order;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.finance.PartyLedger;
import uz.medix.finance.PartyLedger.CreditState;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.inventory.StockAvailability;
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.StockAvailability.Available;
import uz.medix.inventory.StockReservations;
import uz.medix.inventory.StockReservations.Allocation;
import uz.medix.pricing.PriceBook;
import uz.medix.pricing.PriceBook.Quote;
import uz.medix.sales.order.OrderModels.ApprovalLevel;
import uz.medix.sales.order.OrderModels.CustomerCredit;
import uz.medix.sales.order.OrderModels.DeliveryType;
import uz.medix.sales.order.OrderModels.IssueLevel;
import uz.medix.sales.order.OrderModels.OrderDetail;
import uz.medix.sales.order.OrderModels.OrderIssue;
import uz.medix.sales.order.OrderModels.OrderLine;
import uz.medix.sales.order.OrderModels.OrderLineRequest;
import uz.medix.sales.order.OrderModels.OrderPage;
import uz.medix.sales.order.OrderModels.OrderRequest;
import uz.medix.sales.order.OrderModels.OrderStatus;
import uz.medix.sales.order.OrderModels.OrderSummary;
import uz.medix.sales.order.OrderModels.PaymentType;
import uz.medix.sales.order.OrderModels.PreviousOrder;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * BY — buyurtma (SPEC 5.2, 5.3, 6). Qoralama → (Tasdiqlashda) → Navbatda. Yuborishda barcha qoidalar bir joyda tekshiriladi
 * ({@link #evaluate}): xato — yuborilmaydi; tasdiq sababi — Filial rahbari yoki Direktor tasdig'iga. Narx yuborishda
 * hisoblanadi va muzlatiladi (mijoz narx turi → bazaviy). Kredit nazorati bloklamaydi — tasdiqqa yuboradi.
 */
@Service
class Orders {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    static final String DOC_TYPE = "BY";
    static final BigDecimal LIMIT_BRANCH_PCT = BigDecimal.valueOf(20);
    static final int OVERDUE_DIRECTOR_DAYS = 30;
    static final Set<OrderStatus> CANCEL_BY_WAREHOUSE = Set.of(OrderStatus.QUEUED, OrderStatus.PICKING, OrderStatus.MARKING,
            OrderStatus.CHECKING, OrderStatus.DOCUMENTING, OrderStatus.LOADING);

    private final JdbcClient jdbc;
    private final PriceBook prices;
    private final StockAvailability availability;
    private final PartyLedger parties;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final Clock clock;
    private final StockReservations reservations;
    private final StockLedger stock;
    private final org.springframework.context.ApplicationEventPublisher events;

    Orders(JdbcClient jdbc, PriceBook prices, StockAvailability availability, PartyLedger parties, AuditLog audit,
            DocumentSequenceService numbers, Clock clock, StockReservations reservations, StockLedger stock,
            org.springframework.context.ApplicationEventPublisher events) {
        this.events = events;
        this.reservations = reservations;
        this.stock = stock;
        this.jdbc = jdbc;
        this.prices = prices;
        this.availability = availability;
        this.parties = parties;
        this.audit = audit;
        this.numbers = numbers;
        this.clock = clock;
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(TASHKENT));
    }

    // ===== Tekshiruv =====

    record Customer(long id, String name, String tin, boolean customer, boolean active, boolean blocked, String address) {}

    record Terms(BigDecimal creditLimit, Integer paymentDays, Long priceTypeId, String priceType, Integer minShelfLifeDays) {}

    record Product(long id, String code, String name, String manufacturer, boolean active, boolean controlled, boolean marked,
            Integer minQty, Integer maxQty) {}

    /** Baholash natijasi: qator narxlari, jami, muammolar va tasdiq darajasi. */
    record Evaluation(Map<Long, Quote> quotes, Map<Long, Available> available, Map<Long, Product> products, Money total,
            List<OrderIssue> issues, ApprovalLevel level, CustomerCredit credit) {

        boolean hasErrors() {
            return issues.stream().anyMatch(i -> i.level() == IssueLevel.ERROR);
        }

        List<String> approvalReasons() {
            return issues.stream().filter(i -> i.level() == IssueLevel.APPROVAL).map(OrderIssue::message).toList();
        }
    }

    private Customer customer(long id) {
        return jdbc.sql("SELECT id, name, tin, is_customer AS customer, active, blocked, address FROM counterparty WHERE id = :id")
                .param("id", id)
                .query(Customer.class)
                .optional()
                .orElseThrow(() -> MedixException.badRequest("order.customerUnknown"));
    }

    private Terms terms(long customerId, long branchId) {
        return jdbc.sql("""
                SELECT t.credit_limit, t.payment_days, t.price_type_id, pt.name AS price_type, t.min_shelf_life_days
                FROM counterparty_branch_terms t LEFT JOIN price_type pt ON pt.id = t.price_type_id
                WHERE t.counterparty_id = :c AND t.branch_id = :b""")
                .param("c", customerId)
                .param("b", branchId)
                .query(Terms.class)
                .optional()
                .orElse(new Terms(null, null, null, null, null));
    }

    private Map<Long, Product> products(List<Long> ids) {
        Map<Long, Product> m = new HashMap<>();
        if (ids.isEmpty()) {
            return m;
        }
        jdbc.sql("""
                SELECT p.id, p.code, p.name, mf.name AS manufacturer, p.active, p.controlled, p.marked, p.min_qty, p.max_qty
                FROM product p LEFT JOIN manufacturer mf ON mf.id = p.manufacturer_id WHERE p.id IN (:ids)""")
                .param("ids", ids)
                .query(Product.class)
                .list()
                .forEach(p -> m.put(p.id(), p));
        return m;
    }

    /** Nazoratdagi preparatlar litsenziyasi: null — litsenziya yozuvi yo'q; true/false — amal qiladimi. */
    private Boolean controlledLicense(long customerId, LocalDate today) {
        record Lic(boolean controlledAllowed, Date validUntil) {}
        List<Lic> l = jdbc.sql("SELECT controlled_allowed, valid_until FROM counterparty_license WHERE counterparty_id = :c")
                .param("c", customerId)
                .query(Lic.class)
                .list();
        if (l.isEmpty()) {
            return null;
        }
        return l.stream().anyMatch(x -> x.controlledAllowed() && (x.validUntil() == null || !x.validUntil().toLocalDate().isBefore(today)));
    }

    private boolean anyLicenseValid(long customerId, LocalDate today) {
        return jdbc.sql("""
                SELECT NOT EXISTS (SELECT 1 FROM counterparty_license WHERE counterparty_id = :c)
                    OR EXISTS (SELECT 1 FROM counterparty_license WHERE counterparty_id = :c AND (valid_until IS NULL OR valid_until >= :t))""")
                .param("c", customerId)
                .param("t", Date.valueOf(today))
                .query(Boolean.class)
                .single();
    }

    /**
     * Barcha qoidalar (SPEC 5.3, 6): mijoz holati va litsenziyasi, narx, qoldiq (sotuvga ochiq, muddati va minimal yaroqlilik),
     * min/max, kredit limiti va muddati o'tgan qarz.
     */
    Evaluation evaluate(long branchId, long warehouseId, long customerId, List<OrderLineRequest> lines) {
        LocalDate today = today();
        List<OrderIssue> issues = new ArrayList<>();
        Customer c = customer(customerId);
        Terms t = terms(customerId, branchId);
        if (!c.customer() || !c.active()) {
            issues.add(new OrderIssue(IssueLevel.ERROR, "order.customerInactive", "Mijoz nofaol — buyurtma kiritilmaydi.", null));
        }
        if (c.blocked()) {
            issues.add(new OrderIssue(IssueLevel.ERROR, "order.customerBlocked", "Mijoz bloklangan — buyurtma kiritilmaydi.", null));
        }
        if (!anyLicenseValid(customerId, today)) {
            issues.add(new OrderIssue(IssueLevel.ERROR, "order.licenseExpired",
                    "Mijozning litsenziyasi muddati oʻtgan — buyurtma kiritilmaydi. Kartada yangi litsenziyani kiriting.", null));
        }
        if (lines.isEmpty()) {
            issues.add(new OrderIssue(IssueLevel.ERROR, "order.noLines", "Buyurtmada mahsulot yoʻq. Kamida bitta mahsulot qoʻshing.", null));
        }
        List<Long> ids = lines.stream().map(OrderLineRequest::productId).distinct().toList();
        Map<Long, Product> products = products(ids);
        Map<Long, Quote> quotes = prices.quotes(branchId, t.priceTypeId(), ids, today);
        LocalDate minExpiry = today.plusDays(t.minShelfLifeDays() == null ? 0 : t.minShelfLifeDays());
        Map<Long, Available> available = availability.available(warehouseId, ids, minExpiry);
        Boolean license = controlledLicense(customerId, today);
        Money total = Money.ZERO;
        ApprovalLevel level = null;
        Set<Long> seen = new HashSet<>();
        int no = 0;
        for (OrderLineRequest l : lines) {
            no++;
            Product p = products.get(l.productId());
            if (p == null || !p.active()) {
                issues.add(new OrderIssue(IssueLevel.ERROR, "order.productInactive", no + "-qator: mahsulot topilmadi yoki nofaol.", no));
                continue;
            }
            if (!seen.add(p.id())) {
                issues.add(new OrderIssue(IssueLevel.ERROR, "order.duplicateLine", no + "-qator: " + p.name() + " ikki marta kiritilgan.", no));
            }
            Quote q = quotes.get(p.id());
            if (q == null) {
                issues.add(new OrderIssue(IssueLevel.ERROR, "order.noPrice", no + "-qator: " + p.name() + " uchun narx oʻrnatilmagan.", no));
            } else {
                total = total.plus(q.price().times(l.qty()));
            }
            int have = Optional.ofNullable(available.get(p.id())).map(Available::qty).orElse(0);
            if (l.qty() > have) {
                issues.add(new OrderIssue(IssueLevel.ERROR, "order.insufficient",
                        no + "-qator: " + p.name() + " — qoldiq yetmaydi: mavjud " + have + ", kerak " + l.qty() + ".", no));
            }
            if (p.minQty() != null && l.qty() < p.minQty()) {
                issues.add(new OrderIssue(IssueLevel.ERROR, "order.belowMin",
                        no + "-qator: " + p.name() + " — minimal miqdor " + p.minQty() + ".", no));
            }
            if (p.maxQty() != null && l.qty() > p.maxQty()) {
                issues.add(new OrderIssue(IssueLevel.APPROVAL, "order.aboveMax",
                        p.name() + " — maksimal miqdordan koʻp (" + l.qty() + " > " + p.maxQty() + ") — Filial rahbari tasdigʻi kerak.", no));
                level = max(level, ApprovalLevel.BRANCH);
            }
            if (p.controlled() && !Boolean.TRUE.equals(license)) {
                issues.add(new OrderIssue(IssueLevel.ERROR, "order.controlledLicense",
                        no + "-qator: " + p.name() + " nazoratdagi — mijozda amal qiluvchi ruxsat (litsenziya) yoʻq.", no));
            }
        }
        // Kredit nazorati (SPEC 6): bloklamaydi, tasdiqqa yuboradi.
        CreditState cs = parties.creditState(branchId, customerId, Side.CUSTOMER, today);
        Money limitLeft = null;
        if (t.creditLimit() != null) {
            Money limit = new Money(t.creditLimit());
            limitLeft = limit.minus(cs.debt());
            Money exposure = cs.debt().plus(total);
            if (exposure.compareTo(limit) > 0 && !total.isZero()) {
                Money over = exposure.minus(limit);
                boolean small = !limit.isZero()
                        && over.amount().multiply(BigDecimal.valueOf(100)).divide(limit.amount(), 2, RoundingMode.HALF_UP).compareTo(LIMIT_BRANCH_PCT) <= 0;
                ApprovalLevel need = small ? ApprovalLevel.BRANCH : ApprovalLevel.DIRECTOR;
                issues.add(new OrderIssue(IssueLevel.APPROVAL, "order.overLimit",
                        "Limitdan " + over.format() + " soʻm oshadi — " + (small ? "Filial rahbari" : "Direktor") + " tasdigʻi kerak.", null));
                level = max(level, need);
            }
        }
        if (cs.overdueDays() > 0) {
            ApprovalLevel need = cs.overdueDays() > OVERDUE_DIRECTOR_DAYS ? ApprovalLevel.DIRECTOR : ApprovalLevel.BRANCH;
            issues.add(new OrderIssue(IssueLevel.APPROVAL, "order.overdue", "Muddati oʻtgan qarz " + cs.overdue().format() + " soʻm, "
                    + cs.overdueDays() + " kun — " + (need == ApprovalLevel.DIRECTOR ? "Direktor" : "Filial rahbari") + " tasdigʻi kerak.", null));
            level = max(level, need);
        }
        CustomerCredit credit = new CustomerCredit(t.priceType(), cs.debt().toString(), cs.overdue().toString(), cs.overdueDays(),
                t.creditLimit() == null ? null : new Money(t.creditLimit()).toString(), limitLeft == null ? null : limitLeft.toString(),
                t.paymentDays(), t.minShelfLifeDays(), c.blocked(), license);
        return new Evaluation(quotes, available, products, total, issues, level, credit);
    }

    private static ApprovalLevel max(ApprovalLevel a, ApprovalLevel b) {
        if (a == null) {
            return b;
        }
        return a == ApprovalLevel.DIRECTOR || b == ApprovalLevel.DIRECTOR ? ApprovalLevel.DIRECTOR : ApprovalLevel.BRANCH;
    }

    // ===== O'qish =====

    @Transactional(readOnly = true)
    OrderPage list(Actor actor, Long branchId, OrderStatus status, Long customerId, String q, boolean mine, int page, int size) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new HashMap<>();
        if (!actor.allBranches()) {
            where.append(" AND o.branch_id = :own");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        if (branchId != null) {
            where.append(" AND o.branch_id = :b");
            params.put("b", branchId);
        }
        if (status != null) {
            where.append(" AND o.status = :s");
            params.put("s", status.name());
        }
        if (customerId != null) {
            where.append(" AND o.customer_id = :c");
            params.put("c", customerId);
        }
        if (mine) {
            where.append(" AND o.created_by = :me");
            params.put("me", actor.employeeId());
        }
        if (q != null && !q.isBlank()) {
            where.append(" AND (o.number ILIKE :q OR c.name ILIKE :q OR c.tin = :exact)");
            params.put("q", "%" + q.strip().replace("%", "") + "%");
            params.put("exact", q.strip());
        }
        String from = " FROM sales_order o JOIN counterparty c ON c.id = o.customer_id JOIN warehouse w ON w.id = o.warehouse_id"
                + " JOIN employee e ON e.id = o.created_by";
        long total = jdbc.sql("SELECT count(*)" + from + where).params(params).query(Long.class).single();
        List<OrderSummary> items = jdbc.sql("""
                SELECT o.id, o.number, o.branch_id, w.name AS warehouse, o.customer_id, c.name AS customer, o.order_date, o.delivery_type,
                       o.delivery_date, o.status, o.approval_level, (SELECT count(*) FROM sales_order_line l WHERE l.order_id = o.id) AS lines,
                       o.total, e.full_name AS created_by, o.created_at, o.status_changed_at""" + from + where
                        + " ORDER BY o.created_at DESC, o.id DESC LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query((rs, n) -> new OrderSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getString("warehouse"),
                        rs.getLong("customer_id"), rs.getString("customer"), rs.getDate("order_date").toLocalDate(),
                        DeliveryType.valueOf(rs.getString("delivery_type")), localDate(rs.getDate("delivery_date")),
                        OrderStatus.valueOf(rs.getString("status")),
                        rs.getString("approval_level") == null ? null : ApprovalLevel.valueOf(rs.getString("approval_level")), rs.getInt("lines"),
                        new Money(rs.getBigDecimal("total")).toString(), rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(),
                        rs.getTimestamp("status_changed_at").toInstant()))
                .list();
        return new OrderPage(items, total, page, size);
    }

    record LineRow(long id, int lineNo, long productId, int qty, BigDecimal price, Long priceTypeId, String priceType) {}

    @Transactional(readOnly = true)
    Optional<OrderDetail> find(long id, Actor actor) {
        record HeadRow(long id, String number, long branchId, long warehouseId, String warehouse, long customerId, String customer,
                String customerTin, Date orderDate, String deliveryType, Date deliveryDate, String address, String paymentType, String note,
                String status, String approvalLevel, String approvalReasons, BigDecimal total, String createdBy, long createdById,
                Timestamp createdAt, Timestamp submittedAt, String decidedBy, Timestamp decidedAt, String decisionReason, String cancelledBy,
                Timestamp cancelledAt, String cancelReason, Integer pickMinutes, Integer markMinutes, String picker, Timestamp pickStartedAt,
                Timestamp pickFinishedAt, boolean fefoDeviation, Integer places) {}
        Optional<HeadRow> head = jdbc.sql("""
                SELECT o.id, o.number, o.branch_id, o.warehouse_id, w.name AS warehouse, o.customer_id, c.name AS customer, c.tin AS customer_tin,
                       o.order_date, o.delivery_type, o.delivery_date, o.address, o.payment_type, o.note, o.status, o.approval_level,
                       o.approval_reasons, o.total, cb.full_name AS created_by, o.created_by AS created_by_id, o.created_at, o.submitted_at,
                       db.full_name AS decided_by, o.decided_at, o.decision_reason, xb.full_name AS cancelled_by, o.cancelled_at, o.cancel_reason,
                       o.pick_minutes, o.mark_minutes, pk.full_name AS picker, o.pick_started_at, o.pick_finished_at, o.fefo_deviation, o.places
                FROM sales_order o
                JOIN warehouse w ON w.id = o.warehouse_id
                JOIN counterparty c ON c.id = o.customer_id
                JOIN employee cb ON cb.id = o.created_by
                LEFT JOIN employee db ON db.id = o.decided_by
                LEFT JOIN employee xb ON xb.id = o.cancelled_by
                LEFT JOIN employee pk ON pk.id = o.picker_id
                WHERE o.id = :id""")
                .param("id", id)
                .query(HeadRow.class)
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        HeadRow h = head.get();
        OrderStatus status = OrderStatus.valueOf(h.status());
        List<LineRow> rows = lineRows(id);
        Evaluation ev = evaluate(h.branchId(), h.warehouseId(), h.customerId(),
                rows.stream().map(r -> new OrderLineRequest(r.productId(), r.qty())).toList());
        boolean draft = status == OrderStatus.DRAFT;
        boolean priceChanged = false;
        List<OrderLine> lines = new ArrayList<>();
        for (LineRow r : rows) {
            Product p = ev.products().get(r.productId());
            Quote q = ev.quotes().get(r.productId());
            Money stored = r.price() == null ? null : new Money(r.price());
            Money current = q == null ? null : q.price();
            if (draft && stored != null && current != null && stored.compareTo(current) != 0) {
                priceChanged = true;
            }
            Money shown = draft ? current : stored;
            Available a = ev.available().get(r.productId());
            lines.add(new OrderLine(r.id(), r.lineNo(), r.productId(), p.code(), p.name(), p.manufacturer(), r.qty(),
                    stored == null ? null : stored.toString(), current == null ? null : current.toString(),
                    shown == null ? null : shown.times(r.qty()).toString(), r.priceType(), a == null ? 0 : a.qty(),
                    a == null ? null : a.nearestExpiry(), p.minQty(), p.maxQty(), p.controlled(), p.marked(), List.of()));
        }
        Map<Long, List<OrderModels.ReservedBatch>> reserved = new HashMap<>();
        for (Allocation a : reservations.active(DOC_TYPE, id)) {
            reserved.computeIfAbsent(a.lineId(), k -> new ArrayList<>())
                    .add(new OrderModels.ReservedBatch(a.batchNumber(), a.expiry(), a.zone(), a.qty()));
        }
        lines = lines.stream().map(l -> l.withReserved(reserved.getOrDefault(l.id(), List.of()))).toList();
        List<OrderIssue> issues = draft ? new ArrayList<>(ev.issues()) : List.of();
        if (draft && priceChanged) {
            issues.add(new OrderIssue(IssueLevel.WARNING, "order.priceChanged",
                    "Narx oʻzgardi — yuborishda yangi narx qoʻllanadi. Summani tekshiring.", null));
        }
        List<String> reasons = h.approvalReasons() == null || h.approvalReasons().isBlank() ? List.of()
                : Arrays.asList(h.approvalReasons().split("\n"));
        String total = draft ? ev.total().toString() : new Money(h.total()).toString();
        return Optional.of(new OrderDetail(h.id(), h.number(), h.branchId(), h.warehouseId(), h.warehouse(), h.customerId(), h.customer(),
                h.customerTin(), h.orderDate().toLocalDate(), DeliveryType.valueOf(h.deliveryType()), localDate(h.deliveryDate()), h.address(),
                PaymentType.valueOf(h.paymentType()), h.note(), status,
                h.approvalLevel() == null ? null : ApprovalLevel.valueOf(h.approvalLevel()), reasons, total, priceChanged, ev.credit(), issues,
                h.createdBy(), h.createdById(), h.createdAt().toInstant(), instant(h.submittedAt()), h.decidedBy(), instant(h.decidedAt()),
                h.decisionReason(), h.cancelledBy(), instant(h.cancelledAt()), h.cancelReason(), h.pickMinutes(), h.markMinutes(), h.picker(),
                instant(h.pickStartedAt()), instant(h.pickFinishedAt()), h.fefoDeviation(), h.places(), documents(id),
                holder(id, status, DeliveryType.valueOf(h.deliveryType())), lines));
    }

    private OrderModels.OrderDocuments documents(long orderId) {
        return jdbc.sql("""
                SELECT o.waybill_number, s.number AS sale, s.invoice_number, s.status AS sale_status, s.total AS sale_total,
                       q.number AS qm, q.total AS qm_total, t.number AS trip, d.full_name AS driver, v.plate_number AS vehicle
                FROM sales_order o
                LEFT JOIN sale s ON s.order_id = o.id
                LEFT JOIN LATERAL (SELECT number, total FROM sales_return WHERE order_id = o.id ORDER BY id DESC LIMIT 1) q ON true
                LEFT JOIN LATERAL (SELECT ts.trip_id FROM trip_stop ts JOIN trip tt ON tt.id = ts.trip_id
                                   WHERE ts.order_id = o.id AND ts.active AND tt.status <> 'CANCELLED'
                                   ORDER BY ts.id DESC LIMIT 1) st ON true
                LEFT JOIN trip t ON t.id = st.trip_id
                LEFT JOIN employee d ON d.id = t.driver_id
                LEFT JOIN vehicle v ON v.id = t.vehicle_id
                WHERE o.id = :id""")
                .param("id", orderId)
                .query((rs, n) -> new OrderModels.OrderDocuments(rs.getString("waybill_number"), rs.getString("sale"), rs.getString("invoice_number"),
                        rs.getString("sale_status"), rs.getBigDecimal("sale_total") == null ? null : new Money(rs.getBigDecimal("sale_total")).toString(),
                        rs.getString("qm"), rs.getBigDecimal("qm_total") == null ? null : new Money(rs.getBigDecimal("qm_total")).toString(),
                        rs.getString("trip"), rs.getString("driver"), rs.getString("vehicle")))
                .single();
    }

    /** «Hozir kimda» (SPEC 5.2): bosqich egasi — xodim nomi bilan, bo'lmasa rol. */
    private String holder(long orderId, OrderStatus status, DeliveryType delivery) {
        record W(String creator, String picker, String marker, String driver) {}
        W w = jdbc.sql("""
                SELECT cb.full_name AS creator, pk.full_name AS picker, mk.full_name AS marker,
                       (SELECT d.full_name FROM trip_stop ts JOIN trip t ON t.id = ts.trip_id JOIN employee d ON d.id = t.driver_id
                        WHERE ts.order_id = o.id AND ts.active AND t.status <> 'CANCELLED' ORDER BY ts.id DESC LIMIT 1) AS driver
                FROM sales_order o JOIN employee cb ON cb.id = o.created_by
                LEFT JOIN employee pk ON pk.id = o.picker_id LEFT JOIN employee mk ON mk.id = o.marker_id
                WHERE o.id = :id""")
                .param("id", orderId)
                .query((rs, n) -> new W(rs.getString("creator"), rs.getString("picker"), rs.getString("marker"), rs.getString("driver")))
                .single();
        boolean pickup = delivery == DeliveryType.PICKUP;
        return switch (status) {
            case DRAFT -> "Operator · " + w.creator();
            case PENDING_APPROVAL -> "Tasdiqlovchi (Filial rahbari / Direktor)";
            case QUEUED -> "Ombor mudiri — vaqt berish va yigʻuvchi navbati";
            case PICKING -> w.picker() == null ? "Yigʻuvchilar navbatida" : "Yigʻuvchi · " + w.picker();
            case MARKING -> w.marker() == null ? "Markirovkachilar navbatida" : "Markirovkachi · " + w.marker();
            case CHECKING -> "Ombor mudiri — hisobdan oʻtkazish";
            case DOCUMENTING -> "Ombor mudiri — hujjatlashtirish";
            case LOADING -> pickup ? "Joʻnatish zonasi — mijoz olib ketadi" : w.driver() == null ? "Joʻnatish zonasi" : "Haydovchi · " + w.driver();
            case IN_TRANSIT -> pickup ? "Mijoz olib ketdi" : w.driver() == null ? "Yoʻlda" : "Haydovchi · " + w.driver();
            case DELIVERED, UNDELIVERED, REJECTED, CANCELLED -> "Yakunlangan";
        };
    }

    private List<LineRow> lineRows(long orderId) {
        return jdbc.sql("""
                SELECT l.id, l.line_no, l.product_id, l.qty, l.price, l.price_type_id, pt.name AS price_type
                FROM sales_order_line l LEFT JOIN price_type pt ON pt.id = l.price_type_id WHERE l.order_id = :id ORDER BY l.line_no""")
                .param("id", orderId)
                .query(LineRow.class)
                .list();
    }

    /**
     * «Mahsulot qo'shish» katalogi: faol mahsulotlar, sotuvga mavjud qoldiq (mijozning minimal yaroqlilik talabi bilan) va mijoz
     * narxi. Qidiruv — kod, shtrix-kod yoki nom (lotin/kirill). «Faqat bor mahsulotlar» standart yoqilgan.
     */
    @Transactional(readOnly = true)
    OrderModels.CatalogPage catalog(Actor actor, long warehouseId, Long customerId, String q, boolean inStockOnly, int page, int size) {
        Place place = place(actor, warehouseId);
        Terms t = customerId == null ? new Terms(null, null, null, null, null) : terms(customerId, place.branchId());
        LocalDate minExpiry = today().plusDays(t.minShelfLifeDays() == null ? 0 : t.minShelfLifeDays());
        StringBuilder where = new StringBuilder(" WHERE p.active");
        Map<String, Object> params = new HashMap<>();
        params.put("w", warehouseId);
        params.put("min", Date.valueOf(minExpiry));
        String nq = uz.medix.shared.text.SearchText.normalize(q);
        if (!nq.isEmpty()) {
            String[] parts = nq.split(" ");
            where.append(" AND (p.code = :exact OR EXISTS (SELECT 1 FROM product_barcode pb WHERE pb.product_id = p.id AND pb.barcode = :exact)"
                    + " OR (true");
            for (int i = 0; i < parts.length && i < 8; i++) {
                where.append(" AND p.search_text LIKE :q").append(i).append(" ESCAPE '\\'");
                params.put("q" + i, "%" + uz.medix.shared.text.SearchText.likeEscape(parts[i]) + "%");
            }
            where.append("))");
            params.put("exact", q.strip());
        }
        if (inStockOnly) {
            where.append(" AND coalesce(a.qty, 0) > 0");
        }
        // Sotuvga mavjud qoldiq (StockAvailability bilan bir xil qoida) — o'qish modeli.
        String from = " " + """
                FROM product p LEFT JOIN manufacturer mf ON mf.id = p.manufacturer_id
                LEFT JOIN (SELECT s.product_id, sum(s.qty - coalesce(r.qty, 0)) AS qty, min(b.expiry_date) AS nearest
                           FROM stock_balance s JOIN batch b ON b.id = s.batch_id JOIN zone z ON z.id = s.zone_id
                           LEFT JOIN (SELECT zone_id, batch_id, sum(qty) AS qty FROM stock_reservation WHERE status = 'ACTIVE'
                                      GROUP BY zone_id, batch_id) r ON r.zone_id = s.zone_id AND r.batch_id = s.batch_id
                           WHERE s.warehouse_id = :w AND s.qty > coalesce(r.qty, 0) AND z.sellable AND z.active AND b.expiry_date >= :min
                           GROUP BY s.product_id) a ON a.product_id = p.id
                """;
        long total = jdbc.sql("SELECT count(*)" + from + where).params(params).query(Long.class).single();
        record Row(long id, String code, String name, String manufacturer, Integer qty, Date nearest, Integer minQty, Integer maxQty,
                boolean controlled, boolean marked) {}
        List<Row> rows = jdbc.sql("SELECT p.id, p.code, p.name, mf.name AS manufacturer, a.qty, a.nearest, p.min_qty, p.max_qty, p.controlled, p.marked"
                        + from + where + " ORDER BY lower(p.name), p.id LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query(Row.class)
                .list();
        Map<Long, Quote> quotes = prices.quotes(place.branchId(), t.priceTypeId(), rows.stream().map(Row::id).toList(), today());
        List<OrderModels.CatalogRow> items = rows.stream().map(r -> new OrderModels.CatalogRow(r.id(), r.code(), r.name(), r.manufacturer(),
                r.qty() == null ? 0 : r.qty(), Optional.ofNullable(quotes.get(r.id())).map(x -> x.price().toString()).orElse(null),
                localDate(r.nearest()), r.minQty(), r.maxQty(), r.controlled(), r.marked())).toList();
        return new OrderModels.CatalogPage(items, total, page, size);
    }

    /** Mijozning oxirgi 5 ta buyurtmasi («Oldingi buyurtmani takrorlash»). */
    @Transactional(readOnly = true)
    List<PreviousOrder> previous(Actor actor, long customerId) {
        return jdbc.sql("""
                SELECT o.id, o.number, o.order_date, (SELECT count(*) FROM sales_order_line l WHERE l.order_id = o.id) AS lines, o.total, o.branch_id
                FROM sales_order o WHERE o.customer_id = :c AND o.status NOT IN ('CANCELLED', 'REJECTED')
                ORDER BY o.created_at DESC, o.id DESC LIMIT 20""")
                .param("c", customerId)
                .query((rs, n) -> actor.canAccessBranch(rs.getLong("branch_id")) ? new PreviousOrder(rs.getLong("id"), rs.getString("number"),
                        rs.getDate("order_date").toLocalDate(), rs.getInt("lines"), new Money(rs.getBigDecimal("total")).toString()) : null)
                .list()
                .stream()
                .filter(java.util.Objects::nonNull)
                .limit(5)
                .toList();
    }

    /** To'lov turi standarti: mijozning oxirgi buyurtmasidan, bo'lmasa Perechisleniye (SPEC 5.3). */
    @Transactional(readOnly = true)
    PaymentType defaultPaymentType(long customerId) {
        return jdbc.sql("SELECT payment_type FROM sales_order WHERE customer_id = :c ORDER BY created_at DESC, id DESC LIMIT 1")
                .param("c", customerId)
                .query(String.class)
                .optional()
                .map(PaymentType::valueOf)
                .orElse(PaymentType.TRANSFER);
    }

    // ===== Qoralama =====

    @Transactional
    long create(Actor actor, OrderRequest r) {
        Place place = place(actor, r.warehouseId());
        Customer c = customer(r.customerId());
        if (!c.customer() || !c.active() || c.blocked()) {
            throw MedixException.badRequest(c.blocked() ? "order.customerBlocked" : "order.customerInactive");
        }
        String number = numbers.next(DocumentPrefix.BY, place.branchCode()).toString();
        long id = jdbc.sql("""
                INSERT INTO sales_order (number, branch_id, warehouse_id, customer_id, order_date, delivery_type, delivery_date, address,
                                         payment_type, note, created_by)
                VALUES (:n, :b, :w, :c, :d, :dt, :dd, :a, :pt, :note, :by) RETURNING id""")
                .param("n", number)
                .param("b", place.branchId())
                .param("w", r.warehouseId())
                .param("c", r.customerId())
                .param("d", Date.valueOf(today()))
                .param("dt", r.deliveryType().name())
                .param("dd", r.deliveryDate() == null ? null : Date.valueOf(r.deliveryDate()))
                .param("a", blankToNull(r.address() == null ? c.address() : r.address()))
                .param("pt", r.paymentType().name())
                .param("note", blankToNull(r.note()))
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        writeLines(id, place.branchId(), r);
        audit.record(AuditEntry.of("order.create", "sales_order", id).change(null, Map.of("number", number, "lines", r.lines().size())));
        return id;
    }

    @Transactional
    void update(Actor actor, long id, OrderRequest r) {
        Head h = lock(id, actor);
        requireStatus(h, OrderStatus.DRAFT);
        Place place = place(actor, r.warehouseId());
        jdbc.sql("""
                UPDATE sales_order SET branch_id = :b, warehouse_id = :w, customer_id = :c, delivery_type = :dt, delivery_date = :dd, address = :a,
                       payment_type = :pt, note = :note, updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("b", place.branchId())
                .param("w", r.warehouseId())
                .param("c", r.customerId())
                .param("dt", r.deliveryType().name())
                .param("dd", r.deliveryDate() == null ? null : Date.valueOf(r.deliveryDate()))
                .param("a", blankToNull(r.address()))
                .param("pt", r.paymentType().name())
                .param("note", blankToNull(r.note()))
                .param("id", id)
                .update();
        jdbc.sql("DELETE FROM sales_order_line WHERE order_id = :id").param("id", id).update();
        writeLines(id, place.branchId(), r);
        audit.record(AuditEntry.of("order.update", "sales_order", id).change(null, Map.of("lines", r.lines().size())));
    }

    /** Qatorlar va joriy narx (qoralamada — ogohlantirish uchun saqlanadi). Takror mahsulot — bitta qatorga qo'shiladi. */
    private void writeLines(long id, long branchId, OrderRequest r) {
        Map<Long, Integer> merged = new java.util.LinkedHashMap<>();
        for (OrderLineRequest l : r.lines()) {
            merged.merge(l.productId(), l.qty(), Integer::sum);
        }
        Terms t = terms(r.customerId(), branchId);
        Map<Long, Quote> quotes = prices.quotes(branchId, t.priceTypeId(), merged.keySet(), today());
        Map<Long, Product> products = products(List.copyOf(merged.keySet()));
        int no = 0;
        Money total = Money.ZERO;
        for (Map.Entry<Long, Integer> e : merged.entrySet()) {
            no++;
            Product p = products.get(e.getKey());
            if (p == null || !p.active()) {
                throw MedixException.badRequest("order.productUnknown", no);
            }
            if (e.getValue() > OrderModels.MAX_QTY) {
                throw MedixException.badRequest("order.qtyTooLarge", no);
            }
            Quote q = quotes.get(e.getKey());
            if (q != null) {
                total = total.plus(q.price().times(e.getValue()));
            }
            jdbc.sql("INSERT INTO sales_order_line (order_id, line_no, product_id, qty, price, price_type_id) VALUES (:o, :n, :p, :q, :pr, :pt)")
                    .param("o", id)
                    .param("n", no)
                    .param("p", e.getKey())
                    .param("q", e.getValue())
                    .param("pr", q == null ? null : q.price().amount())
                    .param("pt", q == null ? null : q.priceTypeId())
                    .update();
        }
        jdbc.sql("UPDATE sales_order SET total = :t, price_type_id = :pt WHERE id = :id")
                .param("t", total.amount())
                .param("pt", t.priceTypeId())
                .param("id", id)
                .update();
    }

    // ===== Yuborish va tasdiq =====

    /** Yuborish: xato bo'lsa — yuborilmaydi; tasdiq sababi bo'lsa — «Tasdiqlashda», aks holda — «Navbatda». Narx muzlatiladi. */
    @Transactional
    OrderStatus submit(Actor actor, long id) {
        Head h = lock(id, actor);
        requireStatus(h, OrderStatus.DRAFT);
        List<LineRow> rows = lineRows(id);
        Evaluation ev = evaluate(h.branchId(), h.warehouseId(), h.customerId(),
                rows.stream().map(r -> new OrderLineRequest(r.productId(), r.qty())).toList());
        if (ev.hasErrors()) {
            OrderIssue first = ev.issues().stream().filter(i -> i.level() == IssueLevel.ERROR).findFirst().orElseThrow();
            throw MedixException.badRequest("order.hasErrors", first.message());
        }
        // Narxni muzlatish: qatorlar hali qoralamada — yangilanadi, keyin holat o'zgaradi.
        for (LineRow r : rows) {
            Quote q = ev.quotes().get(r.productId());
            jdbc.sql("UPDATE sales_order_line SET price = :p, price_type_id = :t WHERE id = :id")
                    .param("p", q.price().amount())
                    .param("t", q.priceTypeId())
                    .param("id", r.id())
                    .update();
        }
        OrderStatus next = ev.level() == null ? OrderStatus.QUEUED : OrderStatus.PENDING_APPROVAL;
        if (next == OrderStatus.QUEUED) {
            reserve(h, rows, ev);
        }
        jdbc.sql("""
                UPDATE sales_order SET status = :s, total = :t, approval_level = :lvl, approval_reasons = :rs, submitted_at = now(),
                       queued_at = CASE WHEN :s = 'QUEUED' THEN now() ELSE NULL END, decided_by = NULL, decided_at = NULL, decision_reason = NULL,
                       status_changed_at = now(), updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("s", next.name())
                .param("t", ev.total().amount())
                .param("lvl", ev.level() == null ? null : ev.level().name())
                .param("rs", ev.level() == null ? null : String.join("\n", ev.approvalReasons()))
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("order.submit", "sales_order", id).change(Map.of("status", OrderStatus.DRAFT.name()),
                Map.of("status", next.name(), "total", ev.total().toString())));
        return next;
    }

    /** Tasdiq: Filial rahbari darajasi — approvals.branch (yoki Direktor), Direktor darajasi — faqat approvals.director. */
    @Transactional
    void approve(Actor actor, long id, boolean branchRight, boolean directorRight) {
        Head h = lock(id, actor);
        requireStatus(h, OrderStatus.PENDING_APPROVAL);
        ApprovalLevel level = ApprovalLevel.valueOf(jdbc.sql("SELECT approval_level FROM sales_order WHERE id = :id").param("id", id)
                .query(String.class).single());
        if (level == ApprovalLevel.DIRECTOR ? !directorRight : !(branchRight || directorRight)) {
            throw MedixException.forbidden(level == ApprovalLevel.DIRECTOR ? "order.directorOnly" : "order.approveForbidden");
        }
        List<LineRow> rows = lineRows(id);
        reserve(h, rows, evaluate(h.branchId(), h.warehouseId(), h.customerId(),
                rows.stream().map(r -> new OrderLineRequest(r.productId(), r.qty())).toList()));
        jdbc.sql("""
                UPDATE sales_order SET status = 'QUEUED', decided_by = :by, decided_at = now(), queued_at = now(), status_changed_at = now(),
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("order.approve", "sales_order", id).change(Map.of("status", OrderStatus.PENDING_APPROVAL.name()),
                Map.of("status", OrderStatus.QUEUED.name(), "level", level.name())));
    }

    @Transactional
    void reject(Actor actor, long id, String reason, boolean branchRight, boolean directorRight) {
        Head h = lock(id, actor);
        requireStatus(h, OrderStatus.PENDING_APPROVAL);
        ApprovalLevel level = ApprovalLevel.valueOf(jdbc.sql("SELECT approval_level FROM sales_order WHERE id = :id").param("id", id)
                .query(String.class).single());
        if (level == ApprovalLevel.DIRECTOR ? !directorRight : !(branchRight || directorRight)) {
            throw MedixException.forbidden(level == ApprovalLevel.DIRECTOR ? "order.directorOnly" : "order.approveForbidden");
        }
        jdbc.sql("""
                UPDATE sales_order SET status = 'REJECTED', decided_by = :by, decided_at = now(), decision_reason = :r, status_changed_at = now(),
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", reason.strip())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("order.reject", "sales_order", id).withReason(reason.strip()));
    }

    /** Qoralamaga qaytarish — faqat «Tasdiqlashda» holatidan (SPEC 5.2): muallif yoki tasdiqlovchi. */
    @Transactional
    void returnToDraft(Actor actor, long id, boolean approver) {
        Head h = lock(id, actor);
        requireStatus(h, OrderStatus.PENDING_APPROVAL);
        if (!approver && h.createdBy() != actor.employeeId()) {
            throw MedixException.forbidden("order.notOwner");
        }
        jdbc.sql("""
                UPDATE sales_order SET status = 'DRAFT', approval_level = NULL, approval_reasons = NULL, submitted_at = NULL,
                       status_changed_at = now(), updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("order.returnToDraft", "sales_order", id));
    }

    /**
     * Bekor qilish (SPEC 5.2): Qoralama / Tasdiqlashda — muallif (orders.cancel) yoki boshqaruvchi (orders.manage);
     * Navbatda … Yuklanmoqda — orders.cancelPick (Filial rahbari, Direktor, Ombor mudiri). «Yo'lda» va keyin — yo'q.
     */
    @Transactional
    void cancel(Actor actor, long id, String reason, boolean canCancelOwn, boolean manage, boolean cancelPick) {
        Head h = lock(id, actor);
        boolean early = h.status() == OrderStatus.DRAFT || h.status() == OrderStatus.PENDING_APPROVAL;
        if (early) {
            if (!manage && !(canCancelOwn && h.createdBy() == actor.employeeId())) {
                throw MedixException.forbidden("order.notOwner");
            }
        } else if (CANCEL_BY_WAREHOUSE.contains(h.status())) {
            if (!cancelPick) {
                throw MedixException.forbidden("order.cancelForbidden");
            }
        } else {
            throw MedixException.conflict("order.cannotCancel", h.status().name());
        }
        reservations.release(DOC_TYPE, id);
        OrderMarking.releaseCodes(jdbc, id, actor.employeeId(), reason.strip());
        // Yig'ilgan tovar saqlash zonasiga qaytadi (SPEC 5.2): Jo'natish → olingan zona (sof yig'ilgan miqdor).
        List<StockLedger.Move> back = netPicked(id).stream()
                .flatMap(n -> java.util.stream.Stream.of(StockLedger.Move.out(n.shippingZone(), n.batchId(), n.qty()),
                        StockLedger.Move.in(n.storageZone(), n.batchId(), n.qty())))
                .toList();
        stock.post(new StockLedger.DocRef(DOC_TYPE, id, h.number()), back);
        jdbc.sql("""
                UPDATE sales_order SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r, status_changed_at = now(),
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", reason.strip())
                .param("id", id)
                .update();
        events.publishEvent(new uz.medix.sales.OrderCancelled(id, h.number(), reason.strip()));
        audit.record(AuditEntry.of("order.cancel", "sales_order", id)
                .change(Map.of("status", h.status().name()), Map.of("status", OrderStatus.CANCELLED.name())).withReason(reason.strip()));
    }

    /** Sof yig'ilgan (yig'ilgan − qaytarilgan): saqlash zonasi, jo'natish zonasi, partiya, miqdor. */
    record NetPick(long storageZone, long shippingZone, long batchId, int qty) {}

    List<NetPick> netPicked(long orderId) {
        return jdbc.sql("""
                SELECT storage_zone, shipping_zone, batch_id, sum(qty) AS qty FROM (
                    SELECT from_zone_id AS storage_zone, to_zone_id AS shipping_zone, batch_id, qty FROM sales_order_pick WHERE order_id = :id
                    UNION ALL
                    SELECT to_zone_id, from_zone_id, batch_id, -qty FROM sales_order_pick_return WHERE order_id = :id) t
                GROUP BY storage_zone, shipping_zone, batch_id HAVING sum(qty) > 0 ORDER BY storage_zone, batch_id""")
                .param("id", orderId)
                .query(NetPick.class)
                .list();
    }

    /** FEFO zahira (SPEC 6-7): «Navbatda»ga o'tishda — sotuvga ochiq zona va mijozning minimal yaroqlilik talabi bilan. */
    void reserveAgain(long orderId) {
        Head h = jdbc.sql("SELECT id, number, branch_id, warehouse_id, customer_id, status, created_by FROM sales_order WHERE id = :id")
                .param("id", orderId)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("warehouse_id"),
                        rs.getLong("customer_id"), OrderStatus.valueOf(rs.getString("status")), rs.getLong("created_by")))
                .single();
        List<LineRow> rows = lineRows(orderId);
        reserve(h, rows, evaluate(h.branchId(), h.warehouseId(), h.customerId(),
                rows.stream().map(r -> new OrderLineRequest(r.productId(), r.qty())).toList()));
    }

    private void reserve(Head h, List<LineRow> rows, Evaluation ev) {
        Terms t = terms(h.customerId(), h.branchId());
        LocalDate minExpiry = today().plusDays(t.minShelfLifeDays() == null ? 0 : t.minShelfLifeDays());
        reservations.reserve(DOC_TYPE, h.id(), h.number(), h.warehouseId(), minExpiry, rows.stream()
                .map(r -> new StockReservations.Request(r.id(), r.productId(), r.qty(), ev.products().get(r.productId()).name()))
                .toList());
    }

    // ===== Ichki =====

    private record Head(long id, String number, long branchId, long warehouseId, long customerId, OrderStatus status, long createdBy) {}

    private Head lock(long id, Actor actor) {
        return jdbc.sql("SELECT id, number, branch_id, warehouse_id, customer_id, status, created_by FROM sales_order WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("warehouse_id"),
                        rs.getLong("customer_id"), OrderStatus.valueOf(rs.getString("status")), rs.getLong("created_by")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static void requireStatus(Head h, OrderStatus expected) {
        if (h.status() != expected) {
            throw MedixException.conflict(expected == OrderStatus.DRAFT ? "order.notDraft" : "order.badStatus", h.status().name());
        }
    }

    private record Place(long branchId, String branchCode) {}

    private Place place(Actor actor, long warehouseId) {
        return jdbc.sql("""
                SELECT w.branch_id, b.code FROM warehouse w JOIN branch b ON b.id = w.branch_id WHERE w.id = :w AND w.active AND b.active""")
                .param("w", warehouseId)
                .query((rs, n) -> new Place(rs.getLong("branch_id"), rs.getString("code")))
                .optional()
                .filter(p -> actor.canAccessBranch(p.branchId()))
                .orElseThrow(() -> MedixException.badRequest("order.warehouseUnknown"));
    }

    private static LocalDate localDate(Date d) {
        return d == null ? null : d.toLocalDate();
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
