package uz.medix.identity.audit;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Audit jurnali (prototip AuditLog) — Direktor va Bosh administrator. Filial doirasi qo'llanadi.
 * Yorliqlar: Hammasi, Bekor qilishlar, Muvaffaqiyatsiz kirishlar, Ruxsat va sozlama, Nazoratdagi.
 * Harakat turi ({@link AuditCategory}) amal kodidan hisoblanadi; obyekt — hujjat raqami yoki nomi.
 */
@RestController
@RequestMapping("/api/audit")
@PreAuthorize("hasAuthority('audit.view')")
@Tag(name = "audit", description = "Audit jurnali")
class AuditController {

    /** Harakat turi (prototip ACT): ikonka va rang frontendda. */
    enum AuditCategory { CREATE, APPROVE, CANCEL, CHANGE, LOGIN, LOGIN_FAIL, BLOCK, PERM, SETTING }

    /** Yorliq (prototip views). */
    enum AuditView { ALL, CANCEL, FAIL, PERM, CTRL }

    record AuditRow(
            long id,
            Instant occurredAt,
            @Schema(nullable = true) Long employeeId,
            @Schema(nullable = true) String employeeName,
            @Schema(nullable = true) String roleName,
            @Schema(nullable = true) Long branchId,
            @Schema(nullable = true) String branchCode,
            @Schema(nullable = true) String branchName,
            String action,
            AuditCategory category,
            boolean controlled,
            String entityType,
            @Schema(nullable = true) String entityId,
            @Schema(nullable = true, description = "Hujjat raqami yoki obyekt nomi") String objectLabel,
            @Schema(nullable = true, description = "JSON") String oldValue,
            @Schema(nullable = true, description = "JSON") String newValue,
            @Schema(nullable = true) String reason,
            @Schema(nullable = true) String ip) {}

    record AuditViewCount(AuditView view, long count) {}

    record AuditFacet(String value, String label, long count) {}

    record AuditFacets(List<AuditFacet> employees, List<AuditFacet> branches, List<AuditFacet> categories,
            List<AuditFacet> entityTypes) {}

    record AuditPage(List<AuditRow> items, long total, List<AuditViewCount> views) {}

    private static final int MAX_SIZE = 100;
    private static final int EXPORT_MAX = 5000;

    /** Raqamli hujjatlar: jadval nomi = audit {@code entity_type}. */
    private static final Set<String> NUMBERED = Set.of("sales_order", "receipt", "trip", "warehouse_transfer", "zone_transfer",
            "write_off", "supplier_return", "branch_sale", "inventory_count", "opening_balance", "customer_payment",
            "supplier_payment", "cash_op", "money_transfer", "reconciliation_act", "price_change", "advance_offset",
            "branch_payment", "opening_finance", "sale");

    /** Nomli obyektlar: jadval → ustun. */
    private static final Map<String, String> NAMED = Map.of("employee", "full_name", "counterparty", "name", "product", "name",
            "warehouse", "name", "zone", "name", "role", "name", "branch", "name", "money_account", "name", "price_type", "name",
            "expense_item", "name");

    private static final String CATEGORY = """
            CASE
              WHEN a.action IN ('auth.loginFailed', 'auth.loginBlocked') THEN 'LOGIN_FAIL'
              WHEN a.action = 'auth.login' THEN 'LOGIN'
              WHEN a.action ~ '\\.(cancel|reject)$' THEN 'CANCEL'
              WHEN a.entity_type = 'role' OR a.action ~ '\\.(permissions|role|allBranches)$' THEN 'PERM'
              WHEN a.action ~ '\\.block$' THEN 'BLOCK'
              WHEN a.action ~ '\\.(approve|post)$' THEN 'APPROVE'
              WHEN a.action ~ '\\.(create|import)$' THEN 'CREATE'
              WHEN a.entity_type IN ('company', 'branch', 'warehouse', 'zone', 'money_account', 'expense_item', 'price_type',
                                     'vehicle', 'import_profile') THEN 'SETTING'
              ELSE 'CHANGE'
            END""";

    private static final String CONTROLLED = """
            ((a.entity_type = 'product' AND EXISTS (SELECT 1 FROM product p WHERE CAST(p.id AS text) = a.entity_id AND p.controlled))
             OR (a.entity_type = 'zone' AND EXISTS (SELECT 1 FROM zone z WHERE CAST(z.id AS text) = a.entity_id AND z.controlled))
             OR (a.entity_type = 'sales_order' AND EXISTS (SELECT 1 FROM sales_order_line l JOIN product p ON p.id = l.product_id
                    WHERE CAST(l.order_id AS text) = a.entity_id AND p.controlled))
             OR (a.entity_type = 'receipt' AND EXISTS (SELECT 1 FROM receipt_line l JOIN product p ON p.id = l.product_id
                    WHERE CAST(l.receipt_id AS text) = a.entity_id AND p.controlled)))""";

    /** Filial doirasidagi audit, harakat turi va nazoratdagi belgisi bilan. */
    private static final String BASE = "(SELECT a.*, " + CATEGORY + " AS category, " + CONTROLLED
            + " AS ctrl FROM audit_log a WHERE (:all OR a.branch_id = :scope)) a";

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;

    AuditController(JdbcClient jdbc, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
    }

    /** Roʻyxat filtrlari. {@code branchId = 0} — filialsiz yozuvlar («Barcha filiallar»). */
    record Filter(AuditView view, List<Long> employeeId, List<Long> branchId, List<AuditCategory> category, List<String> entityType,
            LocalDate from, LocalDate to, String q) {}

    private record Sql(String where, Map<String, Object> params) {}

    private Sql where(Actor actor, Filter f, boolean withView) {
        Map<String, Object> p = new HashMap<>();
        p.put("all", actor.allBranches());
        p.put("scope", actor.branchId() == null ? -1L : actor.branchId());
        List<String> w = new ArrayList<>();
        w.add("TRUE");
        if (f.employeeId() != null && !f.employeeId().isEmpty()) {
            w.add("a.employee_id IN (:emp)");
            p.put("emp", f.employeeId());
        }
        if (f.branchId() != null && !f.branchId().isEmpty()) {
            w.add("(a.branch_id IN (:br)" + (f.branchId().contains(0L) ? " OR a.branch_id IS NULL" : "") + ")");
            p.put("br", f.branchId());
        }
        if (f.category() != null && !f.category().isEmpty()) {
            w.add("a.category IN (:cat)");
            p.put("cat", f.category().stream().map(Enum::name).toList());
        }
        if (f.entityType() != null && !f.entityType().isEmpty()) {
            w.add("a.entity_type IN (:type)");
            p.put("type", f.entityType());
        }
        if (f.from() != null) {
            w.add("a.occurred_at >= CAST(:from AS timestamp) AT TIME ZONE 'Asia/Tashkent'");
            p.put("from", f.from().atStartOfDay());
        }
        if (f.to() != null) {
            w.add("a.occurred_at < CAST(:to AS timestamp) AT TIME ZONE 'Asia/Tashkent'");
            p.put("to", f.to().plusDays(1).atStartOfDay());
        }
        if (f.q() != null && !f.q().isBlank()) {
            w.add("""
                    (e.full_name ILIKE :q OR a.action ILIKE :q OR a.entity_id = :qe OR a.reason ILIKE :q
                     OR CAST(a.new_value AS text) ILIKE :q OR CAST(a.old_value AS text) ILIKE :q)""");
            p.put("q", "%" + f.q().strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
            p.put("qe", f.q().strip());
        }
        if (withView) {
            w.add(viewCondition(f.view()));
        }
        return new Sql(" WHERE " + String.join(" AND ", w), p);
    }

    private static String viewCondition(AuditView v) {
        return switch (v == null ? AuditView.ALL : v) {
            case ALL -> "TRUE";
            case CANCEL -> "a.category = 'CANCEL'";
            case FAIL -> "a.category = 'LOGIN_FAIL'";
            case PERM -> "a.category IN ('PERM', 'SETTING')";
            case CTRL -> "a.ctrl";
        };
    }

    private static final String FROM = " FROM " + BASE + " LEFT JOIN employee e ON e.id = a.employee_id"
            + " LEFT JOIN role r ON r.id = e.role_id LEFT JOIN branch b ON b.id = a.branch_id";

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "Audit yozuvlari (yangilari birinchi), yorliqlar soni bilan")
    AuditPage list(
            @RequestParam(required = false) AuditView view,
            @RequestParam(required = false) List<Long> employeeId,
            @RequestParam(required = false) List<Long> branchId,
            @RequestParam(required = false) List<AuditCategory> category,
            @RequestParam(required = false) List<String> entityType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size) {
        Actor actor = actor();
        Filter f = new Filter(view, employeeId, branchId, category, entityType, from, to, q);
        int limit = Math.clamp(size, 1, MAX_SIZE);
        int offset = (Math.max(page, 1) - 1) * limit;
        Sql all = where(actor, f, false);
        Map<String, Object> counts = jdbc.sql("""
                SELECT count(*) AS all_n, count(*) FILTER (WHERE a.category = 'CANCEL') AS cancel_n,
                       count(*) FILTER (WHERE a.category = 'LOGIN_FAIL') AS fail_n,
                       count(*) FILTER (WHERE a.category IN ('PERM', 'SETTING')) AS perm_n,
                       count(*) FILTER (WHERE a.ctrl) AS ctrl_n""" + FROM + all.where())
                .params(all.params())
                .query()
                .singleRow();
        List<AuditViewCount> views = List.of(
                new AuditViewCount(AuditView.ALL, ((Number) counts.get("all_n")).longValue()),
                new AuditViewCount(AuditView.CANCEL, ((Number) counts.get("cancel_n")).longValue()),
                new AuditViewCount(AuditView.FAIL, ((Number) counts.get("fail_n")).longValue()),
                new AuditViewCount(AuditView.PERM, ((Number) counts.get("perm_n")).longValue()),
                new AuditViewCount(AuditView.CTRL, ((Number) counts.get("ctrl_n")).longValue()));
        long total = views.stream().filter(v -> v.view() == (view == null ? AuditView.ALL : view)).findFirst().orElseThrow().count();
        return new AuditPage(rows(actor, f, limit, offset), total, views);
    }

    @GetMapping("/export")
    @Transactional(readOnly = true)
    @Operation(summary = "Excel eksport uchun yozuvlar (filtr boʻyicha, koʻpi bilan 5000 ta)")
    List<AuditRow> export(
            @RequestParam(required = false) AuditView view,
            @RequestParam(required = false) List<Long> employeeId,
            @RequestParam(required = false) List<Long> branchId,
            @RequestParam(required = false) List<AuditCategory> category,
            @RequestParam(required = false) List<String> entityType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String q) {
        return rows(actor(), new Filter(view, employeeId, branchId, category, entityType, from, to, q), EXPORT_MAX, 0);
    }

    @GetMapping("/facets")
    @Transactional(readOnly = true)
    @Operation(summary = "Filtr chiplari: xodimlar, filiallar, harakat va obyekt turlari (soni bilan, filial doirasida)")
    AuditFacets facets() {
        Actor actor = actor();
        Map<String, Object> p = Map.of("all", actor.allBranches(), "scope", actor.branchId() == null ? -1L : actor.branchId());
        List<AuditFacet> employees = jdbc.sql("SELECT CAST(a.employee_id AS text) AS value, coalesce(e.full_name, '—') AS label, count(*) AS count"
                        + FROM + " WHERE a.employee_id IS NOT NULL GROUP BY a.employee_id, e.full_name ORDER BY label")
                .params(p).query(AuditFacet.class).list();
        List<AuditFacet> branches = jdbc.sql("SELECT CAST(coalesce(a.branch_id, 0) AS text) AS value, coalesce(b.name, '') AS label, count(*) AS count"
                        + FROM + " GROUP BY a.branch_id, b.name ORDER BY a.branch_id NULLS FIRST")
                .params(p).query(AuditFacet.class).list();
        List<AuditFacet> categories = jdbc.sql("SELECT a.category AS value, a.category AS label, count(*) AS count" + FROM
                        + " GROUP BY a.category ORDER BY a.category")
                .params(p).query(AuditFacet.class).list();
        List<AuditFacet> types = jdbc.sql("SELECT a.entity_type AS value, a.entity_type AS label, count(*) AS count" + FROM
                        + " GROUP BY a.entity_type ORDER BY a.entity_type")
                .params(p).query(AuditFacet.class).list();
        return new AuditFacets(employees, branches, categories, types);
    }

    private List<AuditRow> rows(Actor actor, Filter f, int limit, int offset) {
        Sql s = where(actor, f, true);
        Map<String, Object> params = new HashMap<>(s.params());
        params.put("limit", limit);
        params.put("offset", offset);
        List<AuditRow> items = jdbc.sql("""
                SELECT a.id, a.occurred_at, a.employee_id, e.full_name AS employee_name, r.name AS role_name, a.branch_id,
                       b.code AS branch_code, b.name AS branch_name, a.action, a.category, a.ctrl, a.entity_type, a.entity_id,
                       CAST(a.old_value AS text) AS old_value, CAST(a.new_value AS text) AS new_value, a.reason,
                       host(a.ip_address) AS ip""" + FROM + s.where() + " ORDER BY a.occurred_at DESC, a.id DESC LIMIT :limit OFFSET :offset")
                .params(params)
                .query((rs, n) -> new AuditRow(
                        rs.getLong("id"),
                        rs.getTimestamp("occurred_at").toInstant(),
                        (Long) rs.getObject("employee_id"),
                        rs.getString("employee_name"),
                        rs.getString("role_name"),
                        (Long) rs.getObject("branch_id"),
                        rs.getString("branch_code"),
                        rs.getString("branch_name"),
                        rs.getString("action"),
                        AuditCategory.valueOf(rs.getString("category")),
                        rs.getBoolean("ctrl"),
                        rs.getString("entity_type"),
                        rs.getString("entity_id"),
                        null,
                        rs.getString("old_value"),
                        rs.getString("new_value"),
                        rs.getString("reason"),
                        rs.getString("ip")))
                .list();
        Map<String, Map<String, String>> labels = labels(items);
        return items.stream()
                .map(r -> new AuditRow(r.id(), r.occurredAt(), r.employeeId(), r.employeeName(), r.roleName(), r.branchId(),
                        r.branchCode(), r.branchName(), r.action(), r.category(), r.controlled(), r.entityType(), r.entityId(),
                        labels.getOrDefault(r.entityType(), Map.of()).get(r.entityId()), r.oldValue(), r.newValue(), r.reason(), r.ip()))
                .toList();
    }

    /** Obyekt yorligʻi: hujjat raqami ({@link #NUMBERED}) yoki nomi ({@link #NAMED}); jadval nomi — faqat oq roʻyxatdan. */
    private Map<String, Map<String, String>> labels(List<AuditRow> items) {
        Map<String, List<Long>> ids = items.stream()
                .filter(r -> r.entityId() != null && r.entityId().matches("\\d{1,18}")
                        && (NUMBERED.contains(r.entityType()) || NAMED.containsKey(r.entityType())))
                .collect(Collectors.groupingBy(AuditRow::entityType, LinkedHashMap::new,
                        Collectors.mapping(r -> Long.parseLong(r.entityId()), Collectors.toList())));
        Map<String, Map<String, String>> out = new HashMap<>();
        ids.forEach((type, list) -> {
            String column = NUMBERED.contains(type) ? "number" : NAMED.get(type);
            Map<String, String> m = new HashMap<>();
            jdbc.sql("SELECT CAST(id AS text) AS id, " + column + " AS label FROM " + type + " WHERE id IN (:ids)")
                    .param("ids", list.stream().distinct().toList())
                    .query((rs, n) -> {
                        m.put(rs.getString("id"), rs.getString("label"));
                        return 0;
                    })
                    .list();
            out.put(type, m);
        });
        return out;
    }
}
