package uz.medix.pricing;

import java.sql.Date;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.money.Money;

/**
 * Narxlar — pricing modulining ochiq API'si (buyurtma va boshqa modullar uchun). Narx tanlash (SPEC 6, {@link PriceMath#select}):
 * mijoz narx turi → bazaviy narx. Partiya narxi «Kirim bo'yicha» rejimi bilan qo'shiladi.
 */
@Service
public class PriceBook {

    /** Tanlangan narx va qaysi turdan olingani. */
    public record Quote(Money price, long priceTypeId, boolean fromBase) {}

    private final JdbcClient jdbc;

    PriceBook(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public long basePriceTypeId() {
        return jdbc.sql("SELECT id FROM price_type WHERE base").query(Long.class).single();
    }

    /** Mahsulot → narx (QQS bilan) shu filial va sanada; mijoz turi bo'lmasa — bazaviy. Narxi yo'q mahsulot natijada yo'q. */
    @Transactional(readOnly = true)
    public Map<Long, Quote> quotes(long branchId, Long customerPriceTypeId, Collection<Long> productIds, LocalDate at) {
        Map<Long, Quote> out = new HashMap<>();
        if (productIds.isEmpty()) {
            return out;
        }
        long base = basePriceTypeId();
        Map<String, Money> m = new HashMap<>();
        jdbc.sql("""
                SELECT DISTINCT ON (product_id, price_type_id) product_id, price_type_id, amount
                FROM price WHERE branch_id = :b AND product_id IN (:p) AND price_type_id IN (:t) AND effective_from <= :at
                ORDER BY product_id, price_type_id, effective_from DESC, id DESC""")
                .param("b", branchId)
                .param("p", productIds)
                .param("t", customerPriceTypeId == null ? java.util.List.of(base) : java.util.List.of(base, customerPriceTypeId))
                .param("at", Date.valueOf(at))
                .query((rs, n) -> m.put(rs.getLong("product_id") + ":" + rs.getLong("price_type_id"), new Money(rs.getBigDecimal("amount"))))
                .list();
        for (Long p : productIds) {
            Money own = customerPriceTypeId == null ? null : m.get(p + ":" + customerPriceTypeId);
            Money b = m.get(p + ":" + base);
            if (own != null) {
                out.put(p, new Quote(own, customerPriceTypeId, false));
            } else if (b != null) {
                out.put(p, new Quote(b, base, true));
            }
        }
        return out;
    }
}
