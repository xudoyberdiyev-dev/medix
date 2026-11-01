package uz.medix.inventory;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.money.Money;

/** Partiyalar tannarxi — inventory modulining ochiq API'si (narx nazorati uchun, SPEC 6: «tannarxdan past narx — Direktor tasdig'i»). */
@Service
public class BatchCosts {

    private final JdbcClient jdbc;

    BatchCosts(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Filialdagi qoldig'i bor (bonus bo'lmagan) partiyalarning eng yuqori tannarxi — mahsulot bo'yicha. Qoldiq yo'q mahsulot
     * natijada bo'lmaydi.
     */
    @Transactional(readOnly = true)
    public Map<Long, Money> maxCost(long branchId, Collection<Long> productIds) {
        Map<Long, Money> m = new HashMap<>();
        if (productIds.isEmpty()) {
            return m;
        }
        jdbc.sql("""
                SELECT s.product_id, max(b.cost) AS cost FROM stock_balance s JOIN batch b ON b.id = s.batch_id
                WHERE s.branch_id = :br AND s.qty > 0 AND NOT b.bonus AND s.product_id IN (:ids) GROUP BY s.product_id""")
                .param("br", branchId)
                .param("ids", productIds)
                .query((rs, n) -> m.put(rs.getLong("product_id"), new Money(rs.getBigDecimal("cost"))))
                .list();
        return m;
    }
}
