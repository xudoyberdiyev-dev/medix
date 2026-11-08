package uz.medix.catalog.product;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
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
import uz.medix.catalog.product.ProductModels.DosageForm;
import uz.medix.catalog.product.ProductModels.Facet;
import uz.medix.catalog.product.ProductModels.Facets;
import uz.medix.catalog.product.ProductModels.Filter;
import uz.medix.catalog.product.ProductModels.ProductPage;
import uz.medix.catalog.product.ProductModels.ProductDetail;
import uz.medix.catalog.product.ProductModels.ProductRequest;
import uz.medix.catalog.product.ProductModels.ProductRow;
import uz.medix.catalog.product.ProductModels.Ref;
import uz.medix.catalog.product.ProductModels.ViewCounts;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;
import uz.medix.shared.text.SearchMatch;
import uz.medix.shared.text.SearchText;

/** Mahsulotlar katalogi (SPEC 6-1): 8 raqamli kod, qidiruv (lotin/kirill), nofaol qilish, kod tarixi. */
@Service
public class Products {

    private static final SecureRandom RANDOM = new SecureRandom();

    private static final String ROW_SELECT = """
            SELECT p.id, p.code, p.name, p.contract_name, p.classifier_name, m.name AS manufacturer, c.name AS category,
                   co.name AS country, p.dosage_form, p.dose, coalesce(u.short_name, u.name) AS unit, p.pack_qty,
                   (SELECT b.barcode FROM product_barcode b WHERE b.product_id = p.id ORDER BY b.id LIMIT 1) AS barcode,
                   p.ikpu, p.farm_id, e.full_name AS supply_employee, p.controlled, p.marked, p.prescription, p.vat_rate,
                   p.min_qty, p.max_qty, coalesce(st.qty, 0) AS stock, pr.amount AS price, p.note, p.active
            """;

    /** Filtrlar uchun asosiy FROM (count va variantlar). */
    private static final String FROM = """
             FROM product p
            LEFT JOIN manufacturer m ON m.id = p.manufacturer_id
            """;

    /** Jadval uchun qo'shimcha birlashmalar: ma'lumotnomalar, filial doirasidagi qoldiq, bazaviy narx (o'qish modeli). */
    private static final String ROW_JOINS = """
            JOIN unit u ON u.id = p.unit_id
            LEFT JOIN category c ON c.id = p.category_id
            LEFT JOIN country co ON co.id = p.country_id
            LEFT JOIN employee e ON e.id = p.supply_employee_id
            LEFT JOIN LATERAL (SELECT sum(s.qty) AS qty FROM stock_balance s
                               WHERE s.product_id = p.id AND s.qty > 0 AND (:allStock OR s.branch_id = :stockBranch)) st ON true
            LEFT JOIN LATERAL (SELECT x.amount FROM price x
                               WHERE x.product_id = p.id AND x.branch_id = :priceBranch AND x.effective_from <= :today
                                 AND x.price_type_id = (SELECT t.id FROM price_type t WHERE t.base)
                               ORDER BY x.effective_from DESC, x.id DESC LIMIT 1) pr ON true
            """;

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final CurrentActor currentActor;

    private final java.time.Clock clock;

    Products(JdbcClient jdbc, AuditLog audit, CurrentActor currentActor, java.time.Clock clock) {
        this.clock = clock;
        this.jdbc = jdbc;
        this.audit = audit;
        this.currentActor = currentActor;
    }

    // ===== O'qish =====

    @Transactional(readOnly = true)
    ProductPage search(Filter f) {
        return search(f, false);
    }

    /** {@code withFacets} — yorliqlar soni va filtr variantlari ham hisoblanadi (ro'yxat sahifasi uchun). */
    @Transactional(readOnly = true)
    ProductPage search(Filter f, boolean withFacets) {
        Map<String, Object> params = new HashMap<>();
        // 1) Qidiruv — yorliqlar soni shu bo'yicha
        StringBuilder where = new StringBuilder(" WHERE true");
        String q = SearchText.normalize(f.q());
        if (!q.isEmpty()) {
            // Kod, shtrix-kod, IKPU yoki Farm ID aniq mos kelsa ham topiladi; aks holda har bir so'z search_text ichida.
            StringBuilder words = new StringBuilder();
            String[] parts = q.split(" ");
            for (int i = 0; i < parts.length && i < 8; i++) {
                words.append(" AND p.search_text LIKE :w").append(i).append(" ESCAPE '\\'");
                params.put("w" + i, "%" + SearchText.likeEscape(parts[i]) + "%");
            }
            where.append(" AND ((true").append(words).append(")")
                    .append(" OR p.code = :exact OR p.ikpu = :exact OR lower(p.farm_id) = lower(:exact)")
                    .append(" OR EXISTS (SELECT 1 FROM product_barcode b WHERE b.product_id = p.id AND b.barcode = :exact))");
            params.put("exact", f.q().strip());
        }
        if (!f.ids().isEmpty()) {
            where.append(" AND p.id IN (:ids)");
            params.put("ids", f.ids());
        }
        ViewCounts views = withFacets ? jdbc.sql("""
                SELECT count(*) AS all_count, count(*) FILTER (WHERE p.active) AS active,
                       count(*) FILTER (WHERE p.controlled) AS controlled, count(*) FILTER (WHERE p.marked) AS marked,
                       count(*) FILTER (WHERE p.prescription) AS prescription, count(*) FILTER (WHERE NOT p.active) AS inactive""" + FROM + where)
                .params(params)
                .query((rs, n) -> new ViewCounts(rs.getLong("all_count"), rs.getLong("active"), rs.getLong("controlled"),
                        rs.getLong("marked"), rs.getLong("prescription"), rs.getLong("inactive")))
                .single() : null;
        // 2) Yorliq — filtr variantlari shu bo'yicha (filtrlarning o'zisiz)
        where.append(switch (f.view()) {
            case ALL -> "";
            case ACTIVE -> " AND p.active";
            case CONTROLLED -> " AND p.controlled";
            case MARKED -> " AND p.marked";
            case PRESCRIPTION -> " AND p.prescription";
            case INACTIVE -> " AND NOT p.active";
        });
        if (f.controlled() != null) {
            where.append(" AND p.controlled = :controlled");
            params.put("controlled", f.controlled());
        }
        if (f.marked() != null) {
            where.append(" AND p.marked = :marked");
            params.put("marked", f.marked());
        }
        Map<String, String> filters = new java.util.LinkedHashMap<>();
        if (!f.manufacturerIds().isEmpty()) {
            filters.put("m", " AND p.manufacturer_id IN (:fm)");
            params.put("fm", f.manufacturerIds());
        }
        if (!f.categoryIds().isEmpty()) {
            filters.put("c", " AND p.category_id IN (:fc)");
            params.put("fc", f.categoryIds());
        }
        if (!f.countryIds().isEmpty()) {
            filters.put("k", " AND p.country_id IN (:fk)");
            params.put("fk", f.countryIds());
        }
        if (!f.supplyEmployeeIds().isEmpty()) {
            filters.put("s", " AND p.supply_employee_id IN (:fs)");
            params.put("fs", f.supplyEmployeeIds());
        }
        if (f.status() == ProductModels.Status.ACTIVE) {
            filters.put("a", " AND p.active");
        } else if (f.status() == ProductModels.Status.INACTIVE) {
            filters.put("a", " AND NOT p.active");
        }
        Facets facets = null;
        if (withFacets) {
            // Har filtr variantlari — boshqa filtrlar qo'llangan holda (o'zisiz), soni bilan
            facets = new Facets(
                    facet("manufacturer", "p.manufacturer_id", "d.name", where + except(filters, "m"), params),
                    facet("category", "p.category_id", "d.name", where + except(filters, "c"), params),
                    facet("country", "p.country_id", "d.name", where + except(filters, "k"), params),
                    facet("employee", "p.supply_employee_id", "d.full_name", where + except(filters, "s"), params),
                    0, 0);
            long[] st = jdbc.sql("SELECT count(*) FILTER (WHERE p.active) AS a, count(*) FILTER (WHERE NOT p.active) AS i" + FROM + where
                            + except(filters, "a"))
                    .params(params)
                    .query((rs, n) -> new long[] {rs.getLong("a"), rs.getLong("i")})
                    .single();
            facets = new Facets(facets.manufacturers(), facets.categories(), facets.countries(), facets.supplyEmployees(), st[0], st[1]);
        }
        filters.values().forEach(where::append);

        String dir = f.desc() ? " DESC" : " ASC";
        String order = switch (f.sort()) {
            case CODE -> "p.code" + dir;
            case NAME -> "lower(p.name)" + dir;
            case CONTRACT_NAME -> "lower(p.contract_name)" + dir + " NULLS LAST, lower(p.name)";
            case MANUFACTURER -> "lower(m.name)" + dir + " NULLS LAST, lower(p.name)";
            case CATEGORY -> "lower(c.name)" + dir + " NULLS LAST, lower(p.name)";
            case COUNTRY -> "lower(co.name)" + dir + " NULLS LAST, lower(p.name)";
            case VAT -> "p.vat_rate" + dir + ", lower(p.name)";
            case MIN_QTY -> "p.min_qty" + dir + " NULLS LAST, lower(p.name)";
            case MAX_QTY -> "p.max_qty" + dir + " NULLS LAST, lower(p.name)";
            case STOCK -> "coalesce(st.qty, 0)" + dir + ", lower(p.name)";
            case PRICE -> "pr.amount" + dir + " NULLS LAST, lower(p.name)";
        };
        long total = jdbc.sql("SELECT count(*)" + FROM + where).params(params).query(Long.class).single();
        Actor actor = currentActor.current().orElse(null);
        boolean allStock = f.branchId() == null && (actor == null || actor.allBranches());
        long stockBranch = f.branchId() != null ? f.branchId() : actor == null || actor.branchId() == null ? -1L : actor.branchId();
        if (f.branchId() != null && actor != null && !actor.canAccessBranch(f.branchId())) {
            throw MedixException.forbidden("auth.forbidden");
        }
        Long priceBranch = f.branchId() != null ? f.branchId() : actor != null && actor.branchId() != null ? actor.branchId()
                : jdbc.sql("SELECT min(id) FROM branch WHERE active").query(Long.class).optional().orElse(null);
        List<ProductRow> items = jdbc.sql(ROW_SELECT + FROM + ROW_JOINS + where + " ORDER BY " + order + ", p.id LIMIT :limit OFFSET :offset")
                .params(params)
                .param("allStock", allStock)
                .param("stockBranch", stockBranch)
                .param("priceBranch", priceBranch == null ? -1L : priceBranch)
                .param("today", java.sql.Date.valueOf(LocalDate.now(clock.withZone(java.time.ZoneId.of("Asia/Tashkent")))))
                .param("limit", f.size())
                .param("offset", (long) f.page() * f.size())
                .query(Products::row)
                .list();
        if (!q.isEmpty() && !items.isEmpty()) {
            items = withMatches(items, f.q());
        }
        return new ProductPage(items, total, f.page(), f.size(), views, facets);
    }

    private static String except(Map<String, String> filters, String key) {
        StringBuilder sb = new StringBuilder();
        filters.forEach((k, v) -> {
            if (!k.equals(key)) {
                sb.append(v);
            }
        });
        return sb.toString();
    }

    /** Jadval nomi va ustun — faqat ichki konstantalardan. */
    private List<Facet> facet(String table, String column, String nameExpr, String where, Map<String, Object> params) {
        return jdbc.sql("SELECT d.id, " + nameExpr + " AS name, count(*) AS count" + FROM + " JOIN " + table + " d ON d.id = " + column + where
                        + " GROUP BY d.id, " + nameExpr + " ORDER BY lower(" + nameExpr + "), d.id")
                .params(params)
                .query(Facet.class)
                .list();
    }

    @Transactional(readOnly = true)
    Optional<ProductDetail> find(long id) {
        record Base(long id, String code, String name, String contractName, String classifierName, Long manufacturerId,
                String manufacturer, Long categoryId, String category, Long countryId, String country, long unitId, String unit,
                Long supplyEmployeeId, String supplyEmployee, String ikpu, String farmId, boolean controlled, boolean marked,
                boolean prescription, BigDecimal vatRate, Integer minQty, Integer maxQty, String dosageForm, String dose, Integer packQty,
                Integer perPack, String note, boolean active) {}
        Optional<Base> base = jdbc.sql("""
                SELECT p.id, p.code, p.name, p.contract_name, p.classifier_name, p.manufacturer_id, m.name AS manufacturer,
                       p.category_id, c.name AS category, p.country_id, co.name AS country, p.unit_id, u.name AS unit,
                       p.supply_employee_id, e.full_name AS supply_employee, p.ikpu, p.farm_id, p.controlled, p.marked,
                       p.prescription, p.vat_rate, p.min_qty, p.max_qty, p.dosage_form, p.dose, p.pack_qty, p.per_pack, p.note,
                       p.active
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
                b.controlled(), b.marked(), b.prescription(), vat(b.vatRate()), b.minQty(), b.maxQty(),
                b.dosageForm() == null ? null : DosageForm.valueOf(b.dosageForm()), b.dose(), b.packQty(), b.perPack(), b.note(), b.active(),
                history));
    }

    // ===== Yozish =====

    @Transactional
    ProductDetail create(ProductRequest r) {
        return create(r, null);
    }

    /** {@code presetCode} — import uchun (masalan, SmartUp kodi saqlansin); band bo'lsa xato. */
    @Transactional
    ProductDetail create(ProductRequest r, String presetCode) {
        Normalized n = validate(r, null);
        if (presetCode != null && codeTaken(presetCode)) {
            throw MedixException.conflict("product.codeTaken", presetCode);
        }
        String code = presetCode != null ? presetCode : newCode();
        long id = jdbc.sql("""
                INSERT INTO product (code, name, contract_name, classifier_name, manufacturer_id, category_id, country_id, unit_id,
                                     supply_employee_id, ikpu, farm_id, controlled, marked, prescription, vat_rate, min_qty, max_qty,
                                     dosage_form, dose, pack_qty, per_pack, note)
                VALUES (:code, :name, :contract, :classifier, :manufacturer, :category, :country, :unit, :supply, :ikpu, :farm,
                        :controlled, :marked, :prescription, :vat, :min, :max, :form, :dose, :pack, :perPack, :note)
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
                       dosage_form = :form, dose = :dose, pack_qty = :pack, per_pack = :perPack, note = :note,
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
        p.put("form", r.dosageForm() == null ? null : r.dosageForm().name());
        p.put("dose", blankToNull(r.dose()));
        p.put("pack", r.packQty());
        p.put("perPack", r.perPack());
        p.put("note", blankToNull(r.note()));
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

    /** «Topilgan joy qator ostida»: so'z jadvalda ko'rinmaydigan maydonda (shtrix-kod, shartnoma/klassifikator nomi) topilgan bo'lsa. */
    private List<ProductRow> withMatches(List<ProductRow> items, String query) {
        record Hidden(long id, String contractName, String classifierName, String barcodes) {}
        Map<Long, Hidden> hidden = new HashMap<>();
        jdbc.sql("""
                SELECT p.id, p.contract_name, p.classifier_name,
                       (SELECT string_agg(b.barcode, ' ' ORDER BY b.id) FROM product_barcode b WHERE b.product_id = p.id) AS barcodes
                FROM product p WHERE p.id IN (:ids)""")
                .param("ids", items.stream().map(ProductRow::id).toList())
                .query(Hidden.class)
                .list()
                .forEach(h -> hidden.put(h.id(), h));
        List<ProductRow> out = new ArrayList<>(items.size());
        for (ProductRow r : items) {
            Hidden h = hidden.get(r.id());
            List<SearchMatch> candidates = new ArrayList<>();
            if (h != null) {
                if (h.barcodes() != null) {
                    for (String b : h.barcodes().split(" ")) {
                        candidates.add(new SearchMatch("BARCODE", b));
                    }
                }
                candidates.add(new SearchMatch("CONTRACT_NAME", h.contractName()));
                candidates.add(new SearchMatch("CLASSIFIER_NAME", h.classifierName()));
            }
            SearchMatch m = SearchMatch.hidden(query, Arrays.asList(r.code(), r.name(), r.manufacturer()), candidates).orElse(null);
            out.add(m == null ? r : r.withMatch(m));
        }
        return out;
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

    boolean codeTaken(String code) {
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
        String form = rs.getString("dosage_form");
        BigDecimal price = rs.getBigDecimal("price");
        return new ProductRow(rs.getLong("id"), rs.getString("code"), rs.getString("name"), rs.getString("contract_name"),
                rs.getString("classifier_name"), rs.getString("manufacturer"), rs.getString("category"), rs.getString("country"),
                form == null ? null : DosageForm.valueOf(form), rs.getString("dose"), rs.getString("unit"), (Integer) rs.getObject("pack_qty"),
                rs.getString("barcode"), rs.getString("ikpu"), rs.getString("farm_id"), rs.getString("supply_employee"),
                rs.getBoolean("controlled"), rs.getBoolean("marked"), rs.getBoolean("prescription"), vat(rs.getBigDecimal("vat_rate")),
                (Integer) rs.getObject("min_qty"), (Integer) rs.getObject("max_qty"), rs.getLong("stock"),
                price == null ? null : new uz.medix.shared.money.Money(price).toString(), rs.getString("note"), rs.getBoolean("active"), null);
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
        m.put("dosageForm", d.dosageForm() == null ? null : d.dosageForm().name());
        m.put("dose", d.dose());
        m.put("packQty", d.packQty());
        m.put("perPack", d.perPack());
        m.put("note", d.note());
        return m;
    }
}
