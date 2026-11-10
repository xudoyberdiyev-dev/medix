package uz.medix.catalog.counterparty;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * Kontragent kartochkasi hujjat yorliqlari (prototip CounterpartyCard): mijoz — Buyurtmalar, Sotuvlar, To'lovlar, Qaytarishlar;
 * yetkazib beruvchi — Kirimlar, To'lovlar, Qaytarishlar. Har yorliq — oxirgi {@value #LIMIT} ta hujjat, eng yangisi birinchi, xodim
 * ko'radigan filiallar bo'yicha. Sotuv va kirimda ochiq qoldiq (qarz yozuvlari + ularni yopgan to'lovlar) va to'lov muddati.
 * Yetkazib beruvchi «Bonus» — bonus balans jurnali (BNS tasdig'i, bonus hisobidan kirim, bekor qilish) va kutilayotgan bonuslar
 * (o'tkazilgan chegirmali kirim, BNS hali yo'q; id manfiy). «Mahsulotlar» — davr ichida o'tkazilgan kirimlardagi mahsulotlar.
 */
@Service
class CounterpartyDocuments {

    static final int LIMIT = 100;

    enum Section { ORDERS, SALES, PAYMENTS, RETURNS, RECEIPTS, BONUS }

    record DocRow(
            long id,
            String number,
            @Schema(nullable = true, description = "Sotuv — hisob-faktura raqami, kirim — yuk xati") String extraNumber,
            LocalDate date,
            String branchCode,
            String branchName,
            @Schema(description = "Hujjat holati (bazadagi kod: DRAFT, POSTED, CANCELLED, …)") String status,
            @Schema(description = "Summa, so'm") String amount,
            @Schema(nullable = true, description = "Sotuv/kirim: to'lanmagan qoldiq (0 — to'langan)") String open,
            @Schema(nullable = true) LocalDate dueDate,
            @Schema(nullable = true, description = "Ochiladigan hujjat: buyurtma (sotuv, mijoz qaytarishi), aks holda shu hujjat") Long linkId) {}

    record CounterpartyDocumentsPage(Section section, List<DocRow> items, @Schema(description = "Shartga mos jami soni") long total) {}

    record SupplierProductRow(
            long productId,
            String code,
            String name,
            @Schema(nullable = true) String manufacturer,
            @Schema(nullable = true, description = "Oxirgi kirim narxi (QQSsiz); tannarx ruxsati bo'lmasa — null") String lastPrice,
            LocalDate lastDate,
            @Schema(description = "Kelgan soni (fakt + bonus), dona") long qty,
            @Schema(description = "Kirimlar soni") long receipts) {}

    record SupplierProductsPage(List<SupplierProductRow> items, @Schema(description = "Shartga mos jami soni") long total) {}

    record CounterpartyHistoryEvent(Instant at, @Schema(nullable = true) String employee, String action, @Schema(nullable = true) String reason) {}

    private final JdbcClient jdbc;

    CounterpartyDocuments(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    CounterpartyDocumentsPage list(Actor actor, long counterpartyId, boolean customers, Section section) {
        String sql = switch (section) {
            case ORDERS -> """
                    SELECT x.id, x.number, NULL AS extra, x.order_date AS d, x.branch_id, x.status, x.total AS amount,
                           NULL::numeric AS open, NULL::date AS due, x.id AS link
                    FROM sales_order x WHERE x.customer_id = :c""";
            case SALES -> """
                    SELECT x.id, x.number, x.invoice_number AS extra, x.sale_date AS d, x.branch_id, x.status, x.total AS amount,
                           CASE WHEN x.status = 'CANCELLED' THEN NULL ELSE greatest(0, coalesce((SELECT sum(p.amount) FROM party_ledger p
                               WHERE p.side = 'CUSTOMER' AND p.counterparty_id = :c AND ((p.doc_type = 'SV' AND p.doc_id = x.id
                               AND p.applies_doc_type IS NULL) OR (p.applies_doc_type = 'SV' AND p.applies_doc_id = x.id))), 0)) END AS open,
                           x.due_date AS due, x.order_id AS link
                    FROM sale x WHERE x.customer_id = :c""";
            case PAYMENTS -> customers
                    ? """
                    SELECT x.id, x.number, NULL AS extra, x.payment_date AS d, x.branch_id, x.status, x.amount,
                           NULL::numeric AS open, NULL::date AS due, x.id AS link
                    FROM customer_payment x WHERE x.customer_id = :c"""
                    : """
                    SELECT x.id, x.number, NULL AS extra, x.payment_date AS d, x.branch_id, x.status, x.amount,
                           NULL::numeric AS open, NULL::date AS due, x.id AS link
                    FROM supplier_payment x WHERE x.supplier_id = :c""";
            case RETURNS -> customers
                    ? """
                    SELECT x.id, x.number, NULL AS extra, x.return_date AS d, x.branch_id, CASE WHEN x.cancelled_at IS NULL THEN 'POSTED' ELSE 'CANCELLED' END AS status, x.total AS amount,
                           NULL::numeric AS open, NULL::date AS due, x.order_id AS link
                    FROM sales_return x WHERE x.customer_id = :c"""
                    : """
                    SELECT x.id, x.number, NULL AS extra, (x.created_at AT TIME ZONE 'Asia/Tashkent')::date AS d, x.branch_id, x.status,
                           x.total_amount AS amount, NULL::numeric AS open, NULL::date AS due, x.id AS link
                    FROM supplier_return x WHERE x.supplier_id = :c""";
            case RECEIPTS -> """
                    SELECT x.id, x.number, x.invoice_number AS extra, x.receipt_date AS d, x.branch_id, x.status,
                           coalesce((SELECT sum(l.qty * l.price) FROM receipt_line l WHERE l.receipt_id = x.id), 0) AS amount,
                           CASE WHEN x.status <> 'POSTED' THEN NULL ELSE greatest(0, coalesce((SELECT sum(p.amount) FROM party_ledger p
                               WHERE p.side = 'SUPPLIER' AND p.counterparty_id = :c AND ((p.doc_type = 'KR' AND p.doc_id = x.id
                               AND p.applies_doc_type IS NULL) OR (p.applies_doc_type = 'KR' AND p.applies_doc_id = x.id))), 0)) END AS open,
                           x.due_date AS due, x.id AS link
                    FROM receipt x WHERE x.supplier_id = :c""";
            case BONUS -> """
                    SELECT l.id, l.doc_number AS number, l.note AS extra, (l.occurred_at AT TIME ZONE 'Asia/Tashkent')::date AS d,
                           l.branch_id, CASE WHEN l.doc_type = 'BNS' THEN 'BONUS_CONFIRMED' WHEN l.amount < 0 THEN 'BONUS_USED'
                           ELSE 'BONUS_RETURNED' END AS status, abs(l.amount) AS amount, NULL::numeric AS open, NULL::date AS due,
                           CASE WHEN l.doc_type = 'BNS' THEN (SELECT sb.receipt_id FROM supplier_bonus sb WHERE sb.id = l.doc_id)
                           ELSE l.doc_id END AS link
                    FROM supplier_bonus_ledger l WHERE l.supplier_id = :c
                    UNION ALL
                    SELECT -x.id, x.number, x.invoice_number, x.receipt_date, x.branch_id, 'BONUS_EXPECTED',
                           CASE x.discount_kind WHEN 'SUM' THEN x.discount_value WHEN 'PERCENT' THEN round(coalesce(x.debt_amount,
                               (SELECT sum(rl.qty * rl.price) FROM receipt_line rl WHERE rl.receipt_id = x.id), 0) * x.discount_value / 100, 2)
                           END, NULL::numeric, NULL::date, x.id
                    FROM receipt x WHERE x.supplier_id = :c AND x.status = 'POSTED' AND x.discount_kind IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM supplier_bonus sb WHERE sb.receipt_id = x.id)""";
        };
        Long scope = actor.allBranches() ? null : actor.branchId();
        String scoped = "SELECT q.*, b.code AS branch_code, b.name AS branch_name FROM (" + sql + ") q JOIN branch b ON b.id = q.branch_id"
                + " WHERE (CAST(:b AS BIGINT) IS NULL OR q.branch_id = :b)";
        long total = jdbc.sql("SELECT count(*) FROM (" + scoped + ") t")
                .param("c", counterpartyId)
                .param("b", scope)
                .query(Long.class)
                .single();
        List<DocRow> items = jdbc.sql(scoped + " ORDER BY q.d DESC, q.id DESC LIMIT " + LIMIT)
                .param("c", counterpartyId)
                .param("b", scope)
                .query((rs, n) -> new DocRow(rs.getLong("id"), rs.getString("number"), rs.getString("extra"), date(rs.getDate("d")),
                        rs.getString("branch_code"), rs.getString("branch_name"), rs.getString("status"), money(rs.getBigDecimal("amount")),
                        rs.getBigDecimal("open") == null ? null : money(rs.getBigDecimal("open")), date(rs.getDate("due")),
                        rs.getObject("link") == null ? null : rs.getLong("link")))
                .list();
        return new CounterpartyDocumentsPage(section, items, total);
    }

    /**
     * YB kartochkasi «Mahsulotlar»: davr ichida (days — oxirgi N kun, null — hammasi) o'tkazilgan kirimlardagi mahsulotlar — oxirgi
     * narx va sana, kelgan soni, kirimlar soni; eng oxirgi kelgani birinchi. Narx — faqat {@code prices} bo'lsa.
     */
    @Transactional(readOnly = true)
    SupplierProductsPage products(Actor actor, long supplierId, Integer days, boolean prices, LocalDate today) {
        Long scope = actor.allBranches() ? null : actor.branchId();
        LocalDate from = days == null ? null : today.minusDays(days - 1L);
        String base = """
                SELECT l.product_id, r.receipt_date, r.id AS receipt_id, l.price, coalesce(l.received_qty, l.qty) + l.bonus_qty AS q, l.id AS line_id
                FROM receipt_line l JOIN receipt r ON r.id = l.receipt_id
                WHERE r.supplier_id = :s AND r.status = 'POSTED'
                  AND (CAST(:b AS BIGINT) IS NULL OR r.branch_id = :b)
                  AND (CAST(:f AS DATE) IS NULL OR r.receipt_date >= :f)""";
        String agg = "SELECT x.product_id, max(x.receipt_date) AS last_date, sum(x.q) AS qty, count(DISTINCT x.receipt_id) AS receipts,"
                + " (SELECT y.price FROM (" + base + ") y WHERE y.product_id = x.product_id"
                + " ORDER BY y.receipt_date DESC, y.receipt_id DESC, y.line_id DESC LIMIT 1) AS last_price"
                + " FROM (" + base + ") x GROUP BY x.product_id";
        long total = jdbc.sql("SELECT count(DISTINCT x.product_id) FROM (" + base + ") x")
                .param("s", supplierId)
                .param("b", scope)
                .param("f", from)
                .query(Long.class)
                .single();
        List<SupplierProductRow> items = jdbc.sql("SELECT a.*, p.code, p.name, m.name AS maker FROM (" + agg + ") a"
                        + " JOIN product p ON p.id = a.product_id LEFT JOIN manufacturer m ON m.id = p.manufacturer_id"
                        + " ORDER BY a.last_date DESC, p.name LIMIT " + LIMIT)
                .param("s", supplierId)
                .param("b", scope)
                .param("f", from)
                .query((rs, n) -> new SupplierProductRow(rs.getLong("product_id"), rs.getString("code"), rs.getString("name"),
                        rs.getString("maker"), prices && rs.getBigDecimal("last_price") != null ? money(rs.getBigDecimal("last_price")) : null,
                        date(rs.getDate("last_date")), rs.getLong("qty"), rs.getLong("receipts")))
                .list();
        return new SupplierProductsPage(items, total);
    }

    /** Kartochka «Tarix» — audit jurnalidan (yaratish, tahrir, shartlar, holat, litsenziya, shartnoma), yangisi birinchi. */
    @Transactional(readOnly = true)
    List<CounterpartyHistoryEvent> history(long counterpartyId) {
        return jdbc.sql("""
                SELECT a.occurred_at, e.full_name AS employee, a.action, a.reason
                FROM audit_log a LEFT JOIN employee e ON e.id = a.employee_id
                WHERE a.entity_type = 'counterparty' AND a.entity_id = :id
                ORDER BY a.occurred_at DESC, a.id DESC LIMIT 500""")
                .param("id", String.valueOf(counterpartyId))
                .query((rs, n) -> new CounterpartyHistoryEvent(rs.getTimestamp("occurred_at").toInstant(), rs.getString("employee"),
                        rs.getString("action"), rs.getString("reason")))
                .list();
    }

    private static LocalDate date(Date d) {
        return d == null ? null : d.toLocalDate();
    }

    private static String money(BigDecimal v) {
        return new Money(v == null ? BigDecimal.ZERO : v).toString();
    }
}
