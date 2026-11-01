package uz.medix.catalog.product;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.catalog.product.ProductModels.CodeChange;
import uz.medix.catalog.product.ProductModels.Filter;
import uz.medix.catalog.product.ProductModels.PageResult;
import uz.medix.catalog.product.ProductModels.ProductDetail;
import uz.medix.catalog.product.ProductModels.ProductRequest;
import uz.medix.catalog.product.ProductModels.ProductRow;
import uz.medix.catalog.product.ProductModels.Ref;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;
import uz.medix.shared.text.SearchText;

/** Mahsulotlar katalogi (SPEC 6-1): 8 raqamli kod, qidiruv (lotin/kirill), nofaol qilish, kod tarixi. */
@Service
public class Products {

    private static final SecureRandom RANDOM = new SecureRandom();

    private static final String ROW_SELECT = """
            SELECT p.id, p.code, p.name, m.name AS manufacturer, c.name AS category, co.name AS country,
                   coalesce(u.short_name, u.name) AS unit, p.controlled, p.marked, p.prescription, p.vat_rate,
                   p.min_qty, p.max_qty, p.active
            FROM product p
            JOIN unit u ON u.id = p.unit_id
            LEFT JOIN manufacturer m ON m.id = p.manufacturer_id
            LEFT JOIN category c ON c.id = p.category_id
            LEFT JOIN country co ON co.id = p.country_id
            """;

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final CurrentActor currentActor;

    Products(JdbcClient jdbc, AuditLog audit, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.currentActor = currentActor;
    }

    // ===== O'qish =====

    @Transactional(readOnly = true)
    PageResult search(Filter f) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new HashMap<>();
        if (f.status() == ProductModels.Status.ACTIVE) {
            where.append(" AND p.active");
        } else if (f.status() == ProductModels.Status.INACTIVE) {
            where.append(" AND NOT p.active");
        }
        if (f.manufacturerId() != null) {
            where.append(" AND p.manufacturer_id = :manufacturer");
            params.put("manufacturer", f.manufacturerId());
        }
        if (f.categoryId() != null) {
            where.append(" AND p.category_id = :category");
            params.put("category", f.categoryId());
        }
        if (f.controlled() != null) {
            where.append(" AND p.controlled = :controlled");
            params.put("controlled", f.controlled());
        }
        if (f.marked() != null) {
            where.append(" AND p.marked = :marked");
            params.put("marked", f.marked());
        }
        String q = SearchText.normalize(f.q());
        if (!q.isEmpty()) {
            // Kod yoki shtrix-kod aniq mos kelsa ham topiladi; aks holda har bir so'z search_text ichida.
            StringBuilder words = new StringBuilder();
            String[] parts = q.split(" ");
            for (int i = 0; i < parts.length && i < 8; i++) {
                words.append(" AND p.search_text LIKE :w").append(i).append(" ESCAPE '\\'");
                params.put("w" + i, "%" + SearchText.likeEscape(parts[i]) + "%");
            }
            where.append(" AND ((true").append(words).append(")")
                    .append(" OR p.code = :exact OR EXISTS (SELECT 1 FROM product_barcode b WHERE b.product_id = p.id AND b.barcode = :exact))");
            params.put("exact", f.q().strip());
        }
        String dir = f.desc() ? " DESC" : " ASC";
        String order = switch (f.sort()) {
            case CODE -> "p.code" + dir;
            case NAME -> "lower(p.name)" + dir;
            case MANUFACTURER -> "lower(m.name)" + dir + " NULLS LAST, lower(p.name)";
        };
        long total = jdbc.sql("SELECT count(*) FROM product p LEFT JOIN manufacturer m ON m.id = p.manufacturer_id" + where)
                .params(params)
                .query(Long.class)
                .single();
        List<ProductRow> items = jdbc.sql(ROW_SELECT + where + " ORDER BY " + order + ", p.id LIMIT :limit OFFSET :offset")
                .params(params)
                .param("limit", f.size())
                .param("offset", (long) f.page() * f.size())
                .query(Products::row)
                .list();
        return new PageResult(items, total, f.page(), f.size());
    }

    @Transactional(readOnly = true)
    Optional<ProductDetail> find(long id) {
        record Base(long id, String code, String name, String contractName, String classifierName, Long manufacturerId,
                String manufacturer, Long categoryId, String category, Long countryId, String country, long unitId, String unit,
                Long supplyEmployeeId, String supplyEmployee, String ikpu, String farmId, boolean controlled, boolean marked,
                boolean prescription, BigDecimal vatRate, Integer minQty, Integer maxQty, boolean active) {}
        Optional<Base> base = jdbc.sql("""
                SELECT p.id, p.code, p.name, p.contract_name, p.classifier_name, p.manufacturer_id, m.name AS manufacturer,
                       p.category_id, c.name AS category, p.country_id, co.name AS country, p.unit_id, u.name AS unit,
                       p.supply_employee_id, e.full_name AS supply_employee, p.ikpu, p.farm_id, p.controlled, p.marked,
                       p.prescription, p.vat_rate, p.min_qty, p.max_qty, p.active
                FROM product p
                JOIN unit u ON u.id = p.unit_id
                LEFT JOIN manufacturer m ON m.id = p.manufacturer_id
                LEFT JOIN category c ON c.id = p.category_id
                LEFT JOIN country co ON co.id = p.country_id
                LEFT JOIN employee e ON e.id = p.supply_employee_id
                WHERE p.id = :id""")
                .param("id", id)
                .query(Base.class)
                .optional();
        if (base.isEmpty()) {
            return Optional.empty();
        }
        Base b = base.get();
        List<CodeChange> history = jdbc.sql("""
                SELECT h.old_code, h.new_code, h.reason, e.full_name AS changed_by, h.changed_at
                FROM product_code_history h LEFT JOIN employee e ON e.id = h.employee_id
                WHERE h.product_id = :id ORDER BY h.changed_at DESC, h.id DESC""")
                .param("id", id)
                .query((rs, n) -> new CodeChange(rs.getString("old_code"), rs.getString("new_code"), rs.getString("reason"),
                        rs.getString("changed_by"), rs.getTimestamp("changed_at").toInstant()))
                .list();
        return Optional.of(new ProductDetail(b.id(), b.code(), b.name(), b.contractName(), b.classifierName(),
                ref(b.manufacturerId(), b.manufacturer()), ref(b.categoryId(), b.category()), ref(b.countryId(), b.country()),
                new Ref(b.unitId(), b.unit()), ref(b.supplyEmployeeId(), b.supplyEmployee()), b.ikpu(), b.farmId(), barcodes(id),
                b.controlled(), b.marked(), b.prescription(), vat(b.vatRate()), b.minQty(), b.maxQty(), b.active(), history));
    }

    // ===== Yozish =====

    @Transactional
    ProductDetail create(ProductRequest r) {
        Normalized n = validate(r, null);
        String code = newCode();
        long id = jdbc.sql("""
                INSERT INTO product (code, name, contract_name, classifier_name, manufacturer_id, category_id, country_id, unit_id,
                                     supply_employee_id, ikpu, farm_id, controlled, marked, prescription, vat_rate, min_qty, max_qty)
                VALUES (:code, :name, :contract, :classifier, :manufacturer, :category, :country, :unit, :supply, :ikpu, :farm,
                        :controlled, :marked, :prescription, :vat, :min, :max)
                RETURNING id""")
                .param("code", code)
                .params(n.params())
                .query(Long.class)
                .single();
        saveBarcodes(id, n.barcodes());
        refreshSearchText(id);
        ProductDetail created = find(id).orElseThrow();
        audit.record(AuditEntry.of("product.create", "product", id).change(null, snapshot(created)));
        return created;
    }

    @Transactional
    ProductDetail update(long id, ProductRequest r) {
        ProductDetail before = lock(id);
        Normalized n = validate(r, before);
        jdbc.sql("""
                UPDATE product SET name = :name, contract_name = :contract, classifier_name = :classifier,
                       manufacturer_id = :manufacturer, category_id = :category, country_id = :country, unit_id = :unit,
                       supply_employee_id = :supply, ikpu = :ikpu, farm_id = :farm, controlled = :controlled, marked = :marked,
                       prescription = :prescription, vat_rate = :vat, min_qty = :min, max_qty = :max,
                       updated_at = now(), version = version + 1
                WHERE id = :id""")
                .params(n.params())
                .param("id", id)
                .update();
        jdbc.sql("DELETE FROM product_barcode WHERE product_id = :id").param("id", id).update();
        saveBarcodes(id, n.barcodes());
        refreshSearchText(id);
        ProductDetail after = find(id).orElseThrow();
        audit.record(AuditEntry.of("product.update", "product", id).change(snapshot(before), snapshot(after)));
        return after;
    }

    /** Kodni o'zgartirish (SPEC 6-1): tarixga yoziladi, eski kod qayta ishlatilmaydi. */
    @Transactional
    ProductDetail changeCode(long id, String newCode, String reason) {
        ProductDetail before = lock(id);
        if (before.code().equals(newCode)) {
            return before;
        }
        if (codeTaken(newCode)) {
            throw MedixException.conflict("product.codeTaken", newCode);
        }
        jdbc.sql("UPDATE product SET code = :c, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("c", newCode)
                .param("id", id)
                .update();
        jdbc.sql("""
                INSERT INTO product_code_history (product_id, old_code, new_code, reason, employee_id)
                VALUES (:id, :old, :new, :reason, :emp)""")
                .param("id", id)
                .param("old", before.code())
                .param("new", newCode)
                .param("reason", reason.strip())
                .param("emp", currentActor.current().map(a -> a.employeeId()).orElse(null))
                .update();
        refreshSearchText(id);
        audit.record(AuditEntry.of("product.codeChange", "product", id)
                .change(Map.of("code", before.code()), Map.of("code", newCode))
                .withReason(reason.strip()));
        return find(id).orElseThrow();
    }

    @Transactional
    ProductDetail setActive(long id, boolean active, String reason) {
        ProductDetail before = lock(id);
        if (before.active() == active) {
            return before;
        }
        jdbc.sql("UPDATE product SET active = :a, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("a", active)
                .param("id", id)
                .update();
        var entry = AuditEntry.of(active ? "product.activate" : "product.deactivate", "product", id)
                .change(Map.of("active", before.active()), Map.of("active", active));
        audit.record(reason == null || reason.isBlank() ? entry : entry.withReason(reason.strip()));
        return find(id).orElseThrow();
    }

    /** Ishlab chiqaruvchi nomi o'zgarganda — uning mahsulotlari qidiruv matni yangilanadi. */
    @Transactional
    public void refreshByManufacturer(long manufacturerId) {
        jdbc.sql("SELECT id FROM product WHERE manufacturer_id = :m")
                .param("m", manufacturerId)
                .query(Long.class)
                .list()
                .forEach(this::refreshSearchText);
    }

    // ===== Ichki =====

    private record Normalized(Map<String, Object> params, Set<String> barcodes) {}

    private Normalized validate(ProductRequest r, ProductDetail current) {
        checkRef("manufacturer", r.manufacturerId(), current == null || current.manufacturer() == null ? null : current.manufacturer().id());
        checkRef("category", r.categoryId(), current == null || current.category() == null ? null : current.category().id());
        checkRef("country", r.countryId(), current == null || current.country() == null ? null : current.country().id());
        checkRef("unit", r.unitId(), current == null ? null : current.unit().id());
        if (r.supplyEmployeeId() != null) {
            boolean ok = jdbc.sql("SELECT EXISTS (SELECT 1 FROM employee WHERE id = :id AND status = 'ACTIVE')")
                    .param("id", r.supplyEmployeeId())
                    .query(Boolean.class)
                    .single();
            Long was = current == null || current.supplyEmployee() == null ? null : current.supplyEmployee().id();
            if (!ok && !Objects.equals(was, r.supplyEmployeeId())) {
                throw MedixException.badRequest("product.supplyEmployeeUnknown");
            }
        }
        if (r.minQty() != null && r.maxQty() != null && r.minQty() > r.maxQty()) {
            throw MedixException.badRequest("product.minMax");
        }
        BigDecimal vat = new BigDecimal(r.vatRate()).setScale(2, RoundingMode.HALF_UP);
        if (vat.compareTo(BigDecimal.ZERO) < 0 || vat.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw MedixException.badRequest("validation.vatRate");
        }
        Set<String> barcodes = new LinkedHashSet<>();
        if (r.barcodes() != null) {
            for (String b : r.barcodes()) {
                if (b != null && !b.isBlank()) {
                    barcodes.add(b.strip());
                }
            }
        }
        for (String b : barcodes) {
            Optional<String> owner = jdbc.sql("""
                    SELECT p.code || ' ' || p.name FROM product_barcode b JOIN product p ON p.id = b.product_id
                    WHERE b.barcode = :b AND b.product_id <> :id""")
                    .param("b", b)
                    .param("id", current == null ? 0L : current.id())
                    .query(String.class)
                    .optional();
            if (owner.isPresent()) {
                throw MedixException.conflict("product.barcodeTaken", b, owner.get());
            }
        }
        Map<String, Object> p = new HashMap<>();
        p.put("name", r.name().strip());
        p.put("contract", blankToNull(r.contractName()));
        p.put("classifier", blankToNull(r.classifierName()));
        p.put("manufacturer", r.manufacturerId());
        p.put("category", r.categoryId());
        p.put("country", r.countryId());
        p.put("unit", r.unitId());
        p.put("supply", r.supplyEmployeeId());
        p.put("ikpu", blankToNull(r.ikpu()));
        p.put("farm", blankToNull(r.farmId()));
        p.put("controlled", r.controlled());
        p.put("marked", r.marked());
        p.put("prescription", r.prescription());
        p.put("vat", vat);
        p.put("min", r.minQty());
        p.put("max", r.maxQty());
        return new Normalized(p, barcodes);
    }

    /** Ma'lumotnoma yozuvi mavjud va faol bo'lishi kerak (agar o'zgartirilayotgan bo'lsa). Jadval nomi — faqat ichki ro'yxatdan. */
    private void checkRef(String table, Long id, Long currentId) {
        if (id == null || Objects.equals(id, currentId)) {
            return;
        }
        boolean ok = jdbc.sql("SELECT EXISTS (SELECT 1 FROM " + table + " WHERE id = :id AND active)")
                .param("id", id)
                .query(Boolean.class)
                .single();
        if (!ok) {
            throw MedixException.badRequest("product.refUnknown");
        }
    }

    private void saveBarcodes(long productId, Set<String> barcodes) {
        for (String b : barcodes) {
            jdbc.sql("INSERT INTO product_barcode (product_id, barcode) VALUES (:p, :b)")
                    .param("p", productId)
                    .param("b", b)
                    .update();
        }
    }

    private List<String> barcodes(long productId) {
        return jdbc.sql("SELECT barcode FROM product_barcode WHERE product_id = :p ORDER BY id")
                .param("p", productId)
                .query(String.class)
                .list();
    }

    private void refreshSearchText(long id) {
        record Texts(String code, String name, String contractName, String classifierName, String manufacturer) {}
        Texts t = jdbc.sql("""
                SELECT p.code, p.name, p.contract_name, p.classifier_name, m.name AS manufacturer
                FROM product p LEFT JOIN manufacturer m ON m.id = p.manufacturer_id WHERE p.id = :id""")
                .param("id", id)
                .query(Texts.class)
                .single();
        List<String> fields = new ArrayList<>(List.of(t.code(), t.name()));
        if (t.contractName() != null) {
            fields.add(t.contractName());
        }
        if (t.classifierName() != null) {
            fields.add(t.classifierName());
        }
        if (t.manufacturer() != null) {
            fields.add(t.manufacturer());
        }
        fields.addAll(barcodes(id));
        jdbc.sql("UPDATE product SET search_text = :s WHERE id = :id")
                .param("s", SearchText.of(fields.toArray(String[]::new)))
                .param("id", id)
                .update();
    }

    private String newCode() {
        for (int i = 0; i < 50; i++) {
            String code = String.valueOf(10_000_000 + RANDOM.nextInt(90_000_000));
            if (!codeTaken(code)) {
                return code;
            }
        }
        throw new IllegalStateException("Bo'sh mahsulot kodi topilmadi");
    }

    private boolean codeTaken(String code) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM product WHERE code = :c)
                    OR EXISTS (SELECT 1 FROM product_code_history WHERE old_code = :c)""")
                .param("c", code)
                .query(Boolean.class)
                .single();
    }

    private ProductDetail lock(long id) {
        jdbc.sql("SELECT id FROM product WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query(Long.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        return find(id).orElseThrow();
    }

    private static ProductRow row(ResultSet rs, int n) throws SQLException {
        return new ProductRow(rs.getLong("id"), rs.getString("code"), rs.getString("name"), rs.getString("manufacturer"),
                rs.getString("category"), rs.getString("country"), rs.getString("unit"), rs.getBoolean("controlled"),
                rs.getBoolean("marked"), rs.getBoolean("prescription"), vat(rs.getBigDecimal("vat_rate")),
                (Integer) rs.getObject("min_qty"), (Integer) rs.getObject("max_qty"), rs.getBoolean("active"));
    }

    private static String vat(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static Ref ref(Long id, String name) {
        return id == null ? null : new Ref(id, name);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static Map<String, Object> snapshot(ProductDetail d) {
        Map<String, Object> m = new HashMap<>();
        m.put("code", d.code());
        m.put("name", d.name());
        m.put("contractName", d.contractName());
        m.put("classifierName", d.classifierName());
        m.put("manufacturerId", d.manufacturer() == null ? null : d.manufacturer().id());
        m.put("categoryId", d.category() == null ? null : d.category().id());
        m.put("countryId", d.country() == null ? null : d.country().id());
        m.put("unitId", d.unit().id());
        m.put("supplyEmployeeId", d.supplyEmployee() == null ? null : d.supplyEmployee().id());
        m.put("ikpu", d.ikpu());
        m.put("farmId", d.farmId());
        m.put("barcodes", d.barcodes());
        m.put("controlled", d.controlled());
        m.put("marked", d.marked());
        m.put("prescription", d.prescription());
        m.put("vatRate", d.vatRate());
        m.put("minQty", d.minQty());
        m.put("maxQty", d.maxQty());
        return m;
    }
}
