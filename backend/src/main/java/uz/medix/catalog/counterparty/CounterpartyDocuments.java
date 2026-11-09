package uz.medix.catalog.counterparty;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.sql.Date;
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
 */
@Service
class CounterpartyDocuments {

    static final int LIMIT = 100;

    enum Section { ORDERS, SALES, PAYMENTS, RETURNS, RECEIPTS }

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
                    SELECT x.id, x.number, NULL AS extra, x.return_date AS d, x.branch_id, 'POSTED' AS status, x.total AS amount,
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

    private static LocalDate date(Date d) {
        return d == null ? null : d.toLocalDate();
    }

    private static String money(BigDecimal v) {
        return new Money(v == null ? BigDecimal.ZERO : v).toString();
    }
}
