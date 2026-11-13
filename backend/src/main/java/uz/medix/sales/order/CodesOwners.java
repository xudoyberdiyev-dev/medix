package uz.medix.sales.order;

import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.order.OrderModels.CodesOwner;
import uz.medix.sales.order.OrderModels.OrderStatus;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/**
 * O10b (egasi 13.11.2026): buyurtma markirovka kodlarining egasi — «Mijoz nomiga» yoki «Zaxira kodlarga».
 * Standart to'lov turidan: Perechisleniye (TRANSFER) → mijoz nomiga; Naqd / Terminal / Online → zaxira kodlarga.
 * Ombor mudiri, Filial rahbari, Direktor ({@code marking.owner}) buyurtma yopilguncha o'zgartira oladi.
 * Yetkazilganda «Zaxira kodlarga» bo'lsa — kodlar «Zaxira kodlar» ga tushadi ({@link #onDelivered}).
 */
@Service
class CodesOwners {

    /** Samarali egasi (SQL ifoda, {@code o} — sales_order). */
    static final String EFFECTIVE = "coalesce(o.codes_owner, CASE WHEN o.payment_type = 'TRANSFER' THEN 'CUSTOMER' ELSE 'RESERVE' END)";

    /** Yopilgan buyurtmada egasi o'zgarmaydi. */
    private static final Set<OrderStatus> CLOSED = Set.of(OrderStatus.DELIVERED, OrderStatus.UNDELIVERED, OrderStatus.REJECTED,
            OrderStatus.CANCELLED);

    private final JdbcClient jdbc;
    private final AuditLog audit;

    CodesOwners(JdbcClient jdbc, AuditLog audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    record Info(CodesOwner owner, boolean manual) {}

    static Info info(JdbcClient jdbc, long orderId) {
        return jdbc.sql("SELECT " + EFFECTIVE + " AS owner, o.codes_owner IS NOT NULL AS manual FROM sales_order o WHERE o.id = :id")
                .param("id", orderId)
                .query((rs, n) -> new Info(CodesOwner.valueOf(rs.getString("owner")), rs.getBoolean("manual")))
                .single();
    }

    @Transactional
    void set(Actor actor, long orderId, CodesOwner owner) {
        record Head(long branchId, OrderStatus status, CodesOwner current) {}
        Head h = jdbc.sql("SELECT o.branch_id, o.status, " + EFFECTIVE + " AS owner FROM sales_order o WHERE o.id = :id FOR UPDATE")
                .param("id", orderId)
                .query((rs, n) -> new Head(rs.getLong("branch_id"), OrderStatus.valueOf(rs.getString("status")),
                        CodesOwner.valueOf(rs.getString("owner"))))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (CLOSED.contains(h.status())) {
            throw MedixException.conflict("order.codesOwnerClosed");
        }
        jdbc.sql("UPDATE sales_order SET codes_owner = :w, updated_at = now() WHERE id = :id")
                .param("w", owner.name())
                .param("id", orderId)
                .update();
        if (h.current() != owner) {
            audit.record(AuditEntry.of("order.codesOwner", "sales_order", orderId)
                    .change(Map.of("codesOwner", h.current().name()), Map.of("codesOwner", owner.name())));
        }
    }

    /**
     * Buyurtma yetkazildi (to'liq yoki qisman): «Zaxira kodlarga» bo'lsa — sotilgan kodlar «Zaxira kodlar» ga «Zaxirada» holatida tushadi.
     * Yetkazish bilan bitta tranzaksiyada chaqiriladi.
     */
    static void onDelivered(JdbcClient jdbc, long orderId) {
        jdbc.sql("""
                INSERT INTO reserve_code (mark_id, branch_id)
                SELECT m.id, o.branch_id FROM sales_order_mark m JOIN sales_order o ON o.id = m.order_id
                WHERE m.order_id = :o AND m.status = 'SOLD' AND\s""" + EFFECTIVE + " = 'RESERVE' ON CONFLICT (mark_id) DO NOTHING")
                .param("o", orderId)
                .update();
    }

    /**
     * Qisman yetkazish: to'liq qaytgan (qator, partiya) kodlari «Qaytarilgan» ga o'tadi (qaysi dona qaytgani noma'lum bo'lsa — qisman
     * qaytgan partiya kodlari sotilgan holatda qoladi). {@link #onDelivered} dan oldin chaqiriladi.
     */
    static void onPartialReturn(JdbcClient jdbc, long orderId, long returnId, long by, String reason) {
        jdbc.sql("""
                UPDATE sales_order_mark m SET status = 'RETURNED', closed_by = :by, closed_at = now(), close_reason = :r
                FROM (SELECT sl.order_line_id, sl.batch_id FROM sale_line sl JOIN sales_return_line rl ON rl.sale_line_id = sl.id
                      WHERE rl.return_id = :ret GROUP BY sl.id, sl.order_line_id, sl.batch_id, sl.qty HAVING sum(rl.qty) >= sl.qty) full_ret
                WHERE m.order_id = :o AND m.status = 'SOLD' AND m.line_id = full_ret.order_line_id AND m.batch_id = full_ret.batch_id""")
                .param("by", by)
                .param("r", reason)
                .param("ret", returnId)
                .param("o", orderId)
                .update();
    }
}
