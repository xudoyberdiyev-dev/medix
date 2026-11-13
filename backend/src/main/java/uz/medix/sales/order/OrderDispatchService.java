package uz.medix.sales.order;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.OrderDispatch;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

@Service
@Transactional(propagation = Propagation.MANDATORY)
class OrderDispatchService implements OrderDispatch {

    private final JdbcClient jdbc;
    private final DocumentSequenceService numbers;
    private final AuditLog audit;
    private final OrderSales sales;

    OrderDispatchService(JdbcClient jdbc, DocumentSequenceService numbers, AuditLog audit, OrderSales sales) {
        this.sales = sales;
        this.jdbc = jdbc;
        this.numbers = numbers;
        this.audit = audit;
    }

    private static final String SELECT = """
            SELECT o.id, o.number, o.branch_id, c.name AS customer, o.address, o.delivery_type, o.places, o.total, o.status
            FROM sales_order o JOIN counterparty c ON c.id = o.customer_id""";

    private static DispatchOrder order(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new DispatchOrder(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getString("customer"), rs.getString("address"),
                Delivery.valueOf(rs.getString("delivery_type")), rs.getInt("places"), new Money(rs.getBigDecimal("total")).toString());
    }

    @Override
    @Transactional(readOnly = true, propagation = Propagation.REQUIRED)
    public List<DispatchOrder> ready(Actor actor, Long branchId) {
        return jdbc.sql(SELECT + " WHERE o.status = 'DOCUMENTING' AND (CAST(:b AS BIGINT) IS NULL OR o.branch_id = :b) ORDER BY o.status_changed_at, o.id")
                .param("b", branchId)
                .query((rs, n) -> order(rs))
                .list()
                .stream()
                .filter(o -> actor.canAccessBranch(o.branchId()))
                .toList();
    }

    @Override
    public List<DispatchOrder> lockDocumenting(Actor actor, Collection<Long> orderIds) {
        if (orderIds.isEmpty()) {
            throw MedixException.badRequest("trip.noOrders");
        }
        record Row(DispatchOrder o, String status) {}
        List<Row> rows = jdbc.sql(SELECT + " WHERE o.id IN (:ids) ORDER BY o.id FOR UPDATE OF o")
                .param("ids", orderIds)
                .query((rs, n) -> new Row(order(rs), rs.getString("status")))
                .list();
        if (rows.size() != orderIds.stream().distinct().count() || rows.stream().anyMatch(r -> !actor.canAccessBranch(r.o().branchId()))) {
            throw MedixException.notFound("error.notFound");
        }
        for (Row r : rows) {
            if (!OrderModels.OrderStatus.DOCUMENTING.name().equals(r.status())) {
                throw MedixException.conflict("trip.orderNotReady", r.o().number());
            }
        }
        if (rows.stream().map(r -> r.o().branchId()).distinct().count() > 1) {
            throw MedixException.badRequest("trip.mixedBranches");
        }
        return rows.stream().map(Row::o).toList();
    }

    @Override
    public String toLoading(Actor actor, long orderId) {
        record H(String waybill, String branchCode, String status) {}
        H h = jdbc.sql("""
                SELECT o.waybill_number, b.code, o.status FROM sales_order o JOIN branch b ON b.id = o.branch_id WHERE o.id = :id FOR UPDATE OF o""")
                .param("id", orderId)
                .query((rs, n) -> new H(rs.getString("waybill_number"), rs.getString("code"), rs.getString("status")))
                .single();
        if (!OrderModels.OrderStatus.DOCUMENTING.name().equals(h.status())) {
            throw MedixException.conflict("order.badStatus", h.status());
        }
        String nk = h.waybill() != null ? h.waybill() : numbers.next(DocumentPrefix.NK, h.branchCode()).toString();
        jdbc.sql("""
                UPDATE sales_order SET status = 'LOADING', waybill_number = :nk, documented_by = :by, documented_at = now(), status_changed_at = now(),
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("nk", nk)
                .param("by", actor.employeeId())
                .param("id", orderId)
                .update();
        audit.record(AuditEntry.of("order.documented", "sales_order", orderId).change(Map.of("status", "DOCUMENTING"),
                Map.of("status", "LOADING", "waybill", nk)));
        // O10d: parallel buxgalter faktura vazifasi (kodlar «Mijoz nomiga» yoki Perechisleniye)
        InvoiceTasks.openIfNeeded(jdbc, orderId);
        return nk;
    }

    @Override
    public void backToDocumenting(Actor actor, long orderId, String reason) {
        int n = jdbc.sql("""
                UPDATE sales_order SET status = 'DOCUMENTING', status_changed_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id AND status = 'LOADING'""")
                .param("id", orderId)
                .update();
        if (n == 0) {
            throw MedixException.conflict("trip.orderNotLoading");
        }
        audit.record(AuditEntry.of("order.backToDocumenting", "sales_order", orderId)
                .change(Map.of("status", "LOADING"), Map.of("status", "DOCUMENTING")).withReason(reason));
    }

    @Override
    public String ship(Actor actor, long orderId, Long tripId) {
        return sales.post(actor, orderId, tripId);
    }

    @Override
    public boolean isPickup(long orderId) {
        return jdbc.sql("SELECT delivery_type = 'PICKUP' FROM sales_order WHERE id = :id").param("id", orderId).query(Boolean.class).optional()
                .orElse(false);
    }

    @Override
    public void delivered(Actor actor, long orderId) {
        int n = jdbc.sql("""
                UPDATE sales_order SET status = 'DELIVERED', status_changed_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id AND status = 'IN_TRANSIT'""")
                .param("id", orderId)
                .update();
        if (n == 0) {
            throw MedixException.conflict("trip.orderNotInTransit");
        }
        CodesOwners.onDelivered(jdbc, orderId);
        audit.record(AuditEntry.of("order.delivered", "sales_order", orderId).change(Map.of("status", "IN_TRANSIT"), Map.of("status", "DELIVERED")));
    }

    @Override
    public void undelivered(Actor actor, long orderId, String reason) {
        sales.cancelUndelivered(actor, orderId, reason);
    }

    @Override
    public String total(long orderId) {
        return new Money(jdbc.sql("SELECT total FROM sales_order WHERE id = :id").param("id", orderId).query(java.math.BigDecimal.class).single())
                .toString();
    }

    @Override
    @Transactional(readOnly = true, propagation = Propagation.REQUIRED)
    public List<SaleLine> saleLines(long orderId) {
        return sales.saleLines(orderId);
    }

    @Override
    public PartialResult partiallyDelivered(Actor actor, long orderId, Long tripId, String reason, java.util.Map<Long, Integer> returned) {
        return sales.partialReturn(actor, orderId, tripId, reason, returned);
    }
}
