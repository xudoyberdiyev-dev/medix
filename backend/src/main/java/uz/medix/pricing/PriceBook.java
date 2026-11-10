package uz.medix.pricing;

import java.sql.Date;
import java.time.LocalDate;
import java.util.Collection;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.money.Money;

/**
 * Narxlar — pricing modulining ochiq API'si (buyurtma va boshqa modullar uchun). Narx tanlash (SPEC 6, {@link PriceMath#select}):
 * partiya narxi (mijoz turida, bo'lmasa bazaviy) → mijoz narx turi → bazaviy narx. Partiya narxi «Kirim bo'yicha» NO bilan yoziladi.
 */
@Service
public class PriceBook {

    /** Tanlangan narx va qaysi turdan olingani. */
    public record Quote(Money price, long priceTypeId, boolean fromBase, boolean batchPriced) {}

    /** Qatorning partiya ulushi (FEFO rejasi). {@code batchId == null} — partiyasi aniqlanmagan qism (mahsulot narxida). */
    public record BatchShare(Long batchId, int qty) {}

    private final JdbcClient jdbc;

    PriceBook(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public long basePriceTypeId() {
        return jdbc.sql("SELECT id FROM price_type WHERE base").query(Long.class).single();
    }

    /**
     * «Vozvrat» narx turidagi narxlar (QQS bilan) shu filial va sanada — QM qatori shu narxda (SPEC 6). Bazaviyga
     * qaytilmaydi: narxi yo'q mahsulot natijada yo'q.
     */
    @Transactional(readOnly = true)
    public Map<Long, Money> returnPrices(long branchId, Collection<Long> productIds, LocalDate at) {
        Map<Long, Money> out = new HashMap<>();
        if (productIds.isEmpty()) {
            return out;
        }
        jdbc.sql("""
                SELECT DISTINCT ON (pr.product_id) pr.product_id, pr.amount
                FROM price pr JOIN price_type t ON t.id = pr.price_type_id
                WHERE t.code = 'RETURN' AND t.active AND pr.branch_id = :b AND pr.product_id IN (:p) AND pr.effective_from <= :at
                ORDER BY pr.product_id, pr.effective_from DESC, pr.id DESC""")
                .param("b", branchId)
                .param("p", productIds)
                .param("at", Date.valueOf(at))
                .query((rs, n) -> out.put(rs.getLong("product_id"), new Money(rs.getBigDecimal("amount"))))
                .list();
        return out;
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
                .param("t", customerPriceTypeId == null ? List.of(base) : List.of(base, customerPriceTypeId))
                .param("at", Date.valueOf(at))
                .query((rs, n) -> m.put(rs.getLong("product_id") + ":" + rs.getLong("price_type_id"), new Money(rs.getBigDecimal("amount"))))
                .list();
        for (Long p : productIds) {
            Money own = customerPriceTypeId == null ? null : m.get(p + ":" + customerPriceTypeId);
            Money b = m.get(p + ":" + base);
            if (own != null) {
                out.put(p, new Quote(own, customerPriceTypeId, false, false));
            } else if (b != null) {
                out.put(p, new Quote(b, base, true, false));
            }
        }
        return out;
    }

    /**
     * Partiyalar bo'yicha narx (SPEC 6): har ulush o'z partiyasining narxida (mijoz turida, bo'lmasa bazaviy turda), partiya narxi
     * bo'lmasa — mahsulot narxida ({@link #quotes}); qator narxi — o'rtacha tortilgan. Hech bir ulushda partiya narxi bo'lmasa —
     * mahsulot narxi o'zgarishsiz. Biror ulushga narx topilmasa — mahsulot natijada yo'q.
     */
    @Transactional(readOnly = true)
    public Map<Long, Quote> quotes(long branchId, Long customerPriceTypeId, Map<Long, List<BatchShare>> shares, LocalDate at) {
        Map<Long, Quote> product = quotes(branchId, customerPriceTypeId, shares.keySet(), at);
        List<Long> batchIds = shares.values().stream().flatMap(List::stream).map(BatchShare::batchId).filter(java.util.Objects::nonNull)
                .distinct().toList();
        if (batchIds.isEmpty()) {
            return product;
        }
        long base = basePriceTypeId();
        Map<String, Money> bp = new HashMap<>();
        jdbc.sql("""
                SELECT DISTINCT ON (batch_id, price_type_id) batch_id, price_type_id, amount
                FROM batch_price WHERE branch_id = :b AND batch_id IN (:ids) AND price_type_id IN (:t) AND effective_from <= :at
                ORDER BY batch_id, price_type_id, effective_from DESC, id DESC""")
                .param("b", branchId)
                .param("ids", batchIds)
                .param("t", customerPriceTypeId == null ? List.of(base) : List.of(base, customerPriceTypeId))
                .param("at", Date.valueOf(at))
                .query((rs, n) -> bp.put(rs.getLong("batch_id") + ":" + rs.getLong("price_type_id"), new Money(rs.getBigDecimal("amount"))))
                .list();
        Map<Long, Quote> out = new HashMap<>(product);
        shares.forEach((productId, list) -> {
            Quote pq = product.get(productId);
            List<PriceMath.Part> parts = new ArrayList<>();
            boolean anyBatch = false;
            boolean customerType = false;
            for (BatchShare s : list) {
                Money own = s.batchId() == null || customerPriceTypeId == null ? null : bp.get(s.batchId() + ":" + customerPriceTypeId);
                Money b = s.batchId() == null ? null : bp.get(s.batchId() + ":" + base);
                Money chosen = PriceMath.select(Optional.ofNullable(own), Optional.ofNullable(b),
                        Optional.ofNullable(pq).map(Quote::price), Optional.empty()).orElse(null);
                if (chosen == null) {
                    out.remove(productId);
                    return;
                }
                anyBatch |= own != null || b != null;
                customerType |= own != null || (b == null && pq != null && !pq.fromBase());
                parts.add(new PriceMath.Part(chosen, s.qty()));
            }
            if (!anyBatch) {
                return;
            }
            boolean useCustomer = customerType && customerPriceTypeId != null;
            Optional<Money> avg = PriceMath.weightedAverage(parts);
            if (avg.isPresent()) {
                out.put(productId, new Quote(avg.get(), useCustomer ? customerPriceTypeId : base, !useCustomer, true));
            }
        });
        return out;
    }
}
