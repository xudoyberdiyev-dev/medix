package uz.medix.reporting.search;

import io.swagger.v3.oas.annotations.media.Schema;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.security.Actor;
import uz.medix.shared.text.SearchText;

/**
 * Ctrl+K universal qidiruv (SPEC 4 «Umumiy»): hujjatlar (raqam bo'yicha), mahsulotlar, kontragentlar, xodimlar.
 * Har guruh — faqat ruxsati borlarga; hujjatlar — filial doirasida (SPEC 13). Lotin/kirill farqsiz ({@link SearchText}).
 * Har guruhdan ko'pi bilan {@value #PER_GROUP} ta. Tannarx va summalar qaytarilmaydi.
 */
@Service
public class GlobalSearch {

    static final int PER_GROUP = 5;
    static final int MIN_LENGTH = 2;

    public enum Kind { ORDER, RECEIPT, PRICE_CHANGE, TRIP, PRODUCT, CUSTOMER, SUPPLIER, EMPLOYEE }

    public record Hit(Kind kind, long id, String title, @Schema(nullable = true) String subtitle, String link) {}

    public record Result(String query, List<Hit> hits) {}

    private final JdbcClient jdbc;

    GlobalSearch(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public Result search(Actor actor, Set<String> permissions, String query) {
        String q = query == null ? "" : query.strip();
        if (q.length() < MIN_LENGTH) {
            return new Result(q, List.of());
        }
        String raw = "%" + SearchText.likeEscape(q.toLowerCase(java.util.Locale.ROOT)) + "%";
        List<Hit> hits = new ArrayList<>();
        if (any(permissions, "orders.view", "approvals.view")) {
            hits.addAll(documents(actor, Kind.ORDER, """
                    SELECT o.id, o.number, c.name AS sub FROM sales_order o JOIN counterparty c ON c.id = o.customer_id
                    WHERE lower(o.number) LIKE :q ESCAPE '\\'""", "o", raw, id -> "/orders?open=" + id));
        }
        if (permissions.contains("receipt.view")) {
            hits.addAll(documents(actor, Kind.RECEIPT, """
                    SELECT r.id, r.number, c.name AS sub FROM receipt r JOIN counterparty c ON c.id = r.supplier_id
                    WHERE (lower(r.number) LIKE :q ESCAPE '\\' OR lower(r.invoice_number) LIKE :q ESCAPE '\\')""", "r", raw,
                    id -> "/receipts?open=" + id));
        }
        hits.addAll(documents(actor, Kind.PRICE_CHANGE, """
                SELECT p.id, p.number, NULL AS sub FROM price_change p WHERE lower(p.number) LIKE :q ESCAPE '\\'""", "p", raw,
                id -> "/prices?tab=documents&open=" + id));
        if (permissions.contains("shipments.view")) {
            hits.addAll(documents(actor, Kind.TRIP, """
                    SELECT t.id, t.number, d.full_name AS sub FROM trip t JOIN employee d ON d.id = t.driver_id
                    WHERE lower(t.number) LIKE :q ESCAPE '\\'""", "t", raw, id -> "/shipments"));
        }
        String[] words = SearchText.normalize(q).split(" ");
        hits.addAll(products(q, words));
        hits.addAll(counterparties(q, words));
        if (permissions.contains("staff.view")) {
            hits.addAll(employees(actor, q.toLowerCase(java.util.Locale.ROOT).split("\\s+")));
        }
        return new Result(q, hits);
    }

    private static boolean any(Set<String> permissions, String... keys) {
        for (String k : keys) {
            if (permissions.contains(k)) {
                return true;
            }
        }
        return false;
    }

    private interface Link {
        String of(long id);
    }

    private List<Hit> documents(Actor actor, Kind kind, String sql, String alias, String like, Link link) {
        StringBuilder s = new StringBuilder(sql);
        Map<String, Object> params = new HashMap<>();
        params.put("q", like);
        if (!actor.allBranches()) {
            s.append(" AND ").append(alias).append(".branch_id = :own");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        s.append(" ORDER BY ").append(alias).append(".id DESC LIMIT ").append(PER_GROUP);
        return jdbc.sql(s.toString())
                .params(params)
                .query((rs, n) -> new Hit(kind, rs.getLong("id"), rs.getString("number"), rs.getString("sub"), link.of(rs.getLong("id"))))
                .list();
    }

    /** So'zlarning har biri qidiruv matnida bo'lishi kerak (AND). */
    private static String wordsClause(String column, String[] words, Map<String, Object> params) {
        StringBuilder w = new StringBuilder("true");
        for (int i = 0; i < words.length; i++) {
            w.append(" AND ").append(column).append(" LIKE :w").append(i).append(" ESCAPE '\\'");
            params.put("w" + i, "%" + SearchText.likeEscape(words[i]) + "%");
        }
        return w.toString();
    }

    private List<Hit> products(String q, String[] words) {
        Map<String, Object> params = new HashMap<>();
        params.put("exact", q);
        String sql = "SELECT p.id, p.name, p.code FROM product p WHERE p.active AND (" + wordsClause("p.search_text", words, params)
                + " OR p.code = :exact OR EXISTS (SELECT 1 FROM product_barcode b WHERE b.product_id = p.id AND b.barcode = :exact))"
                + " ORDER BY (p.code = :exact) DESC, p.name LIMIT " + PER_GROUP;
        return jdbc.sql(sql)
                .params(params)
                .query((rs, n) -> new Hit(Kind.PRODUCT, rs.getLong("id"), rs.getString("name"), rs.getString("code"),
                        "/products?q=" + encode(rs.getString("name"))))
                .list();
    }

    private List<Hit> counterparties(String q, String[] words) {
        Map<String, Object> params = new HashMap<>();
        params.put("exact", q);
        String sql = "SELECT c.id, c.name, c.tin, c.is_customer FROM counterparty c WHERE (c.is_customer OR c.is_supplier) AND ("
                + wordsClause("c.search_text", words, params) + " OR c.tin = :exact) ORDER BY (c.tin = :exact) DESC, c.name LIMIT " + PER_GROUP;
        return jdbc.sql(sql)
                .params(params)
                .query((rs, n) -> {
                    boolean customer = rs.getBoolean("is_customer");
                    String name = rs.getString("name");
                    return new Hit(customer ? Kind.CUSTOMER : Kind.SUPPLIER, rs.getLong("id"), name, "STIR " + rs.getString("tin"),
                            (customer ? "/customers?q=" : "/suppliers?q=") + encode(rs.getString("tin")));
                })
                .list();
    }

    private List<Hit> employees(Actor actor, String[] words) {
        Map<String, Object> params = new HashMap<>();
        // Xodimlarda search_text ustuni yo'q — ism va login kichik harfda (kirill so'rov lotin ismni topmaydi; V2 da tarjima bilan).
        StringBuilder w = new StringBuilder("true");
        for (int i = 0; i < words.length; i++) {
            w.append(" AND (lower(e.full_name) LIKE :w").append(i).append(" ESCAPE '\\' OR lower(e.login) LIKE :w").append(i)
                    .append(" ESCAPE '\\')");
            params.put("w" + i, "%" + SearchText.likeEscape(words[i]) + "%");
        }
        if (!actor.allBranches()) {
            w.append(" AND e.branch_id = :own");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        return jdbc.sql("SELECT e.id, e.full_name, e.login FROM employee e WHERE " + w + " ORDER BY e.full_name LIMIT " + PER_GROUP)
                .params(params)
                .query((rs, n) -> new Hit(Kind.EMPLOYEE, rs.getLong("id"), rs.getString("full_name"), rs.getString("login"),
                        "/settings/employees"))
                .list();
    }

    private static String encode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
