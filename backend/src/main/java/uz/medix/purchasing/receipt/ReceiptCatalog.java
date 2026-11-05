package uz.medix.purchasing.receipt;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;
import uz.medix.shared.text.SearchText;

/**
 * Kirim uchun «Mahsulot qo'shish» katalogi (SPEC 5.1): kod, mahsulot, ishlab chiqaruvchi, ombordagi qoldiq va shu yetkazib beruvchidan
 * oxirgi kirim (sana, narx — faqat narx ko'rinadiganlarga). «Faqat shu YB mahsulotlari» — oldin shu YB dan kelganlar.
 */
@Service
class ReceiptCatalog {

    record ReceiptCatalogRow(
            long productId,
            String code,
            String name,
            @Schema(nullable = true) String manufacturer,
            @Schema(description = "Ombordagi jami qoldiq (barcha zonalar)") int stock,
            @Schema(nullable = true, description = "Shu YB dan oxirgi kirim sanasi") LocalDate lastDate,
            @Schema(nullable = true, description = "Oxirgi faktura narxi (1 dona); narx ko'rinmasa — null") String lastPrice) {}

    record ReceiptCatalogPage(List<ReceiptCatalogRow> items, long total, int page, int size) {}

    private final JdbcClient jdbc;

    ReceiptCatalog(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    ReceiptCatalogPage find(Actor actor, long warehouseId, Long supplierId, String q, boolean supplierOnly, int page, int size,
            boolean pricesVisible) {
        long branchId = jdbc.sql("SELECT w.branch_id FROM warehouse w WHERE w.id = :w AND w.active")
                .param("w", warehouseId)
                .query(Long.class)
                .optional()
                .filter(actor::canAccessBranch)
                .orElseThrow(() -> MedixException.badRequest("receipt.warehouseUnknown"));
        Map<String, Object> params = new HashMap<>();
        params.put("w", warehouseId);
        params.put("b", branchId);
        params.put("s", supplierId == null ? -1L : supplierId);
        StringBuilder where = new StringBuilder(" WHERE p.active");
        String nq = SearchText.normalize(q);
        if (!nq.isEmpty()) {
            String[] parts = nq.split(" ");
            where.append(" AND (p.code = :exact OR EXISTS (SELECT 1 FROM product_barcode pb WHERE pb.product_id = p.id AND pb.barcode = :exact)"
                    + " OR (true");
            for (int i = 0; i < parts.length && i < 8; i++) {
                where.append(" AND p.search_text LIKE :q").append(i).append(" ESCAPE '\\'");
                params.put("q" + i, "%" + SearchText.likeEscape(parts[i]) + "%");
            }
            where.append("))");
            params.put("exact", q.strip());
        }
        if (supplierOnly && supplierId != null) {
            where.append(" AND last.receipt_date IS NOT NULL");
        }
        // Oxirgi kirim — shu filialda, shu YB dan, bekor qilinmagan hujjatlar (qoralama ham emas).
        String from = " " + """
                FROM product p LEFT JOIN manufacturer mf ON mf.id = p.manufacturer_id
                LEFT JOIN (SELECT product_id, sum(qty) AS qty FROM stock_balance WHERE warehouse_id = :w GROUP BY product_id) st
                       ON st.product_id = p.id
                LEFT JOIN LATERAL (SELECT r.receipt_date, l.price FROM receipt_line l JOIN receipt r ON r.id = l.receipt_id
                                   WHERE l.product_id = p.id AND r.supplier_id = :s AND r.branch_id = :b AND r.status IN ('ACCEPTED', 'POSTED')
                                   ORDER BY r.receipt_date DESC, r.id DESC, l.id DESC LIMIT 1) last ON true
                """;
        long total = jdbc.sql("SELECT count(*)" + from + where).params(params).query(Long.class).single();
        record Row(long id, String code, String name, String manufacturer, Long qty, Date receiptDate, BigDecimal price) {}
        List<ReceiptCatalogRow> items = jdbc.sql("SELECT p.id, p.code, p.name, mf.name AS manufacturer, st.qty, last.receipt_date, last.price"
                        + from + where + " ORDER BY (last.receipt_date IS NULL), lower(p.name), p.id LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query(Row.class)
                .list()
                .stream()
                .map(r -> new ReceiptCatalogRow(r.id(), r.code(), r.name(), r.manufacturer(), r.qty() == null ? 0 : Math.toIntExact(r.qty()),
                        r.receiptDate() == null ? null : r.receiptDate().toLocalDate(),
                        pricesVisible && r.price() != null ? new Money(r.price()).toString() : null))
                .toList();
        return new ReceiptCatalogPage(items, total, page, size);
    }
}
