package uz.medix.catalog.refprice;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.catalog.refprice.RefPriceModels.CompareMode;
import uz.medix.catalog.refprice.RefPriceModels.RefCompareResult;
import uz.medix.catalog.refprice.RefPriceModels.RefCompareRow;
import uz.medix.catalog.refprice.RefPriceModels.RefCounts;
import uz.medix.catalog.refprice.RefPriceModels.MatchKind;
import uz.medix.catalog.refprice.RefPriceModels.RefProduct;
import uz.medix.catalog.refprice.RefPriceModels.RefList;
import uz.medix.catalog.refprice.RefPriceModels.RefRowInput;
import uz.medix.catalog.refprice.RefPriceModels.RefReceiptWarning;
import uz.medix.catalog.refprice.RefPriceModels.RowStatus;
import uz.medix.catalog.refprice.RefPriceModels.RefUploadRequest;
import uz.medix.catalog.refprice.RefPriceModels.RefUploadResult;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;
import uz.medix.shared.settings.SettingKey;
import uz.medix.shared.settings.SystemSettings;
import uz.medix.shared.text.SearchText;

/**
 * O14 (egasi 17.11.2026): referent narxlar fayli — saqlash, mahsulotga moslash va bizning narx (kirim yoki narx turi) bilan
 * solishtirish. Moslash tartibi: shtrix-kod/GTIN → avval qo'lda moslangan (xotira) → MXIK → mahsulot kodi → nom o'xshashligi
 * (pg_trgm). Ishonchsiz moslik {@code needsCheck}.
 */
@Service
class RefPrices {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    /** Nom bo'yicha moslik: shundan past — topilmadi; {@link #SURE} dan past yoki raqobatchi yaqin — «Tekshiring». */
    static final double MIN_NAME = 0.5;
    static final double SURE = 0.9;

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final SystemSettings settings;
    private final java.time.Clock clock;

    RefPrices(JdbcClient jdbc, AuditLog audit, SystemSettings settings, java.time.Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.settings = settings;
        this.clock = clock;
    }

    // ===== Yuklash va moslash =====

    record Match(Long productId, MatchKind kind, boolean needsCheck) {
        static final Match NONE = new Match(null, MatchKind.NONE, false);
    }

    @Transactional
    RefUploadResult upload(RefUploadRequest r, Actor actor) {
        List<Integer> skipped = new ArrayList<>();
        List<RefRowInput> ok = new ArrayList<>();
        java.util.Set<Integer> seen = new java.util.HashSet<>();
        for (RefRowInput in : r.rows()) {
            if (in == null || blank(in.name()) == null || parsePrice(in.price()) == null || !seen.add(in.row())) {
                if (in != null) {
                    skipped.add(in.row());
                }
                continue;
            }
            ok.add(in);
        }
        if (ok.isEmpty()) {
            throw MedixException.badRequest("refPrice.noRows");
        }
        long id = jdbc.sql("""
                INSERT INTO ref_price_list (file_name, row_count, uploaded_by, branch_id) VALUES (:f, :n, :e, :b) RETURNING id""")
                .param("f", r.fileName().strip())
                .param("n", ok.size())
                .param("e", actor.employeeId())
                .param("b", actor.branchId())
                .query(Long.class)
                .single();
        Matcher m = new Matcher();
        for (RefRowInput in : ok) {
            Match match = m.match(in);
            jdbc.sql("""
                    INSERT INTO ref_price_row (list_id, row_no, name, barcode, ikpu, code, manufacturer, unit, price, product_id, match_kind,
                                               needs_check)
                    VALUES (:l, :r, :name, :bc, :ikpu, :code, :maker, :unit, :price, :p, :k, :chk)""")
                    .param("l", id)
                    .param("r", in.row())
                    .param("name", in.name().strip())
                    .param("bc", blank(in.barcode()))
                    .param("ikpu", blank(in.ikpu()))
                    .param("code", blank(in.code()))
                    .param("maker", blank(in.manufacturer()))
                    .param("unit", blank(in.unit()))
                    .param("price", parsePrice(in.price()))
                    .param("p", match.productId())
                    .param("k", match.kind().name())
                    .param("chk", match.needsCheck())
                    .update();
        }
        audit.record(AuditEntry.of("refPrice.upload", "ref_price_list", id)
                .change(null, Map.of("fileName", r.fileName().strip(), "rows", ok.size(), "skipped", skipped.size())));
        return new RefUploadResult(id, ok.size(), skipped);
    }

    /** Bir yuklash davomida ma'lumotnomalar bir marta o'qiladi (20 000 qatorgacha). */
    private final class Matcher {
        private final Map<String, Long> barcodes = new HashMap<>();
        private final Map<String, List<Long>> ikpus = new HashMap<>();
        private final Map<String, Long> codes = new HashMap<>();
        private final Map<String, Long> aliases = new HashMap<>();

        Matcher() {
            jdbc.sql("SELECT b.barcode, b.product_id FROM product_barcode b JOIN product p ON p.id = b.product_id WHERE p.active")
                    .query((rs, n) -> barcodes.put(rs.getString(1), rs.getLong(2)))
                    .list();
            jdbc.sql("SELECT ikpu, id FROM product WHERE active AND ikpu IS NOT NULL ORDER BY id")
                    .query((rs, n) -> ikpus.computeIfAbsent(rs.getString(1), k -> new ArrayList<>()).add(rs.getLong(2)))
                    .list();
            jdbc.sql("SELECT code, id FROM product").query((rs, n) -> codes.put(rs.getString(1), rs.getLong(2))).list();
            jdbc.sql("SELECT a.key, a.product_id FROM ref_price_alias a JOIN product p ON p.id = a.product_id WHERE p.active")
                    .query((rs, n) -> aliases.put(rs.getString(1), rs.getLong(2)))
                    .list();
        }

        Match match(RefRowInput in) {
            String bc = digitsOrRaw(in.barcode());
            if (bc != null) {
                Long p = barcodes.get(bc);
                if (p == null && bc.length() == 14 && bc.startsWith("0")) {
                    p = barcodes.get(bc.substring(1));
                }
                if (p != null) {
                    return new Match(p, MatchKind.BARCODE, false);
                }
            }
            Long alias = aliases.get(aliasKey(in.name(), in.manufacturer()));
            if (alias != null) {
                return new Match(alias, MatchKind.ALIAS, false);
            }
            String ikpu = digitsOrRaw(in.ikpu());
            if (ikpu != null && ikpus.containsKey(ikpu)) {
                List<Long> list = ikpus.get(ikpu);
                if (list.size() == 1) {
                    return new Match(list.getFirst(), MatchKind.IKPU, false);
                }
                // Bir MXIK — bir necha mahsulot: nom bo'yicha eng yaqini, tekshirish bilan
                Optional<Long> best = bestByName(in.name(), list);
                return new Match(best.orElse(list.getFirst()), MatchKind.IKPU, true);
            }
            String code = blank(in.code());
            if (code != null && codes.containsKey(code)) {
                return new Match(codes.get(code), MatchKind.CODE, false);
            }
            return byName(in.name(), in.manufacturer());
        }
    }

    private Optional<Long> bestByName(String name, List<Long> ids) {
        String n = SearchText.normalize(name);
        if (n.isEmpty()) {
            return Optional.empty();
        }
        return jdbc.sql("SELECT id FROM product WHERE id IN (:ids) ORDER BY word_similarity(:n, search_text) DESC, id LIMIT 1")
                .param("ids", ids)
                .param("n", n)
                .query(Long.class)
                .optional();
    }

    private Match byName(String name, String manufacturer) {
        String n = SearchText.normalize(name);
        if (n.length() < 3) {
            return Match.NONE;
        }
        record Cand(long id, double score, String maker) {}
        List<Cand> c = jdbc.sql("""
                SELECT p.id, word_similarity(:n, p.search_text) AS score, m.name AS maker
                FROM product p LEFT JOIN manufacturer m ON m.id = p.manufacturer_id
                WHERE p.active AND :n <% p.search_text
                ORDER BY score DESC, p.id LIMIT 2""")
                .param("n", n)
                .query((rs, i) -> new Cand(rs.getLong("id"), rs.getDouble("score"), rs.getString("maker")))
                .list();
        if (c.isEmpty() || c.getFirst().score() < MIN_NAME) {
            return Match.NONE;
        }
        Cand top = c.getFirst();
        boolean close = c.size() > 1 && c.get(1).score() > top.score() - 0.1;
        String mk = SearchText.normalize(manufacturer);
        boolean makerDiffers = !mk.isEmpty() && (top.maker() == null || !sameMaker(mk, SearchText.normalize(top.maker())));
        return new Match(top.id(), MatchKind.NAME, top.score() < SURE || close || makerDiffers);
    }

    private static boolean sameMaker(String a, String b) {
        String x = a.split(" ")[0];
        String y = b.split(" ")[0];
        return !x.isEmpty() && !y.isEmpty() && (x.startsWith(y) || y.startsWith(x));
    }

    static String aliasKey(String name, String manufacturer) {
        String key = "n:" + SearchText.normalize(name) + "|" + SearchText.normalize(manufacturer);
        return key.length() > 600 ? key.substring(0, 600) : key;
    }

    /** Qo'lda moslash (yoki olib tashlash); keyingi fayllar uchun eslab qolinadi. */
    @Transactional
    void match(long listId, long rowId, Long productId, Actor actor) {
        record Row(String name, String manufacturer, Long productId) {}
        Row row = jdbc.sql("SELECT name, manufacturer, product_id FROM ref_price_row WHERE id = :r AND list_id = :l FOR UPDATE")
                .param("r", rowId)
                .param("l", listId)
                .query(Row.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (productId != null && !jdbc.sql("SELECT EXISTS (SELECT 1 FROM product WHERE id = :p)").param("p", productId).query(Boolean.class)
                .single()) {
            throw MedixException.badRequest("refPrice.product");
        }
        jdbc.sql("UPDATE ref_price_row SET product_id = :p, match_kind = :k, needs_check = false WHERE id = :r")
                .param("p", productId)
                .param("k", productId == null ? MatchKind.NONE.name() : MatchKind.MANUAL.name())
                .param("r", rowId)
                .update();
        String key = aliasKey(row.name(), row.manufacturer());
        if (productId == null) {
            jdbc.sql("DELETE FROM ref_price_alias WHERE key = :k").param("k", key).update();
        } else {
            jdbc.sql("""
                    INSERT INTO ref_price_alias (key, product_id, updated_by) VALUES (:k, :p, :e)
                    ON CONFLICT (key) DO UPDATE SET product_id = excluded.product_id, updated_by = excluded.updated_by, updated_at = now()""")
                    .param("k", key)
                    .param("p", productId)
                    .param("e", actor.employeeId())
                    .update();
        }
        audit.record(AuditEntry.of("refPrice.match", "ref_price_list", listId)
                .change(row.productId() == null ? null : Map.of("productId", row.productId()),
                        productId == null ? null : Map.of("productId", productId)));
    }

    // ===== O'qish =====

    @Transactional(readOnly = true)
    List<RefList> lists() {
        return jdbc.sql("""
                SELECT l.id, l.file_name, l.row_count, e.full_name AS uploaded_by, l.uploaded_at,
                       (SELECT count(*) FROM ref_price_row r WHERE r.list_id = l.id AND r.product_id IS NOT NULL) AS matched,
                       (SELECT count(*) FROM ref_price_row r WHERE r.list_id = l.id AND r.needs_check) AS needs_check
                FROM ref_price_list l JOIN employee e ON e.id = l.uploaded_by
                ORDER BY l.uploaded_at DESC, l.id DESC LIMIT 200""")
                .query((rs, n) -> new RefList(rs.getLong("id"), rs.getString("file_name"), rs.getInt("row_count"), rs.getString("uploaded_by"),
                        rs.getTimestamp("uploaded_at").toInstant(), rs.getLong("matched"), rs.getLong("needs_check")))
                .list();
    }

    BigDecimal tolerance() {
        return settings.value(SettingKey.refPriceTolPct);
    }

    /**
     * Solishtirish: {@code SALE} — filialdagi narx turi narxi (berilmasa — bazaviy), {@code RECEIPT} — tanlangan kirim yoki filialdagi
     * oxirgi o'tkazilgan kirim narxi (faqat tannarx huquqi bilan — controller tekshiradi).
     */
    @Transactional(readOnly = true)
    RefCompareResult compare(long listId, CompareMode mode, Long priceTypeId, Long receiptId, Long branchId, Actor actor) {
        String fileName = jdbc.sql("SELECT file_name FROM ref_price_list WHERE id = :l").param("l", listId).query(String.class).optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        long branch = branch(branchId, actor);
        LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
        Long pt = null;
        String ptName = null;
        String receiptNumber = null;
        String ours;
        Map<String, Object> params = new HashMap<>();
        params.put("l", listId);
        params.put("branch", branch);
        if (mode == CompareMode.SALE) {
            pt = priceTypeId != null ? priceTypeId
                    : jdbc.sql("SELECT id FROM price_type WHERE base").query(Long.class).optional().orElseThrow(() -> MedixException.notFound("error.notFound"));
            ptName = jdbc.sql("SELECT name FROM price_type WHERE id = :t").param("t", pt).query(String.class).optional()
                    .orElseThrow(() -> MedixException.badRequest("refPrice.priceType"));
            params.put("pt", pt);
            params.put("today", java.sql.Date.valueOf(today));
            ours = """
                    LEFT JOIN LATERAL (SELECT x.amount AS our, NULL::text AS source FROM price x
                                       WHERE x.product_id = r.product_id AND x.branch_id = :branch AND x.price_type_id = :pt
                                         AND x.effective_from <= :today
                                       ORDER BY x.effective_from DESC, x.id DESC LIMIT 1) o ON true""";
        } else if (receiptId != null) {
            record Rc(long branchId, String number) {}
            Rc rc = jdbc.sql("SELECT branch_id, number FROM receipt WHERE id = :r").param("r", receiptId).query(Rc.class).optional()
                    .filter(x -> actor.canAccessBranch(x.branchId()))
                    .orElseThrow(() -> MedixException.notFound("error.notFound"));
            receiptNumber = rc.number();
            params.put("rid", receiptId);
            ours = """
                    LEFT JOIN LATERAL (SELECT rl.price AS our, rc.number AS source FROM receipt_line rl JOIN receipt rc ON rc.id = rl.receipt_id
                                       WHERE rl.receipt_id = :rid AND rl.product_id = r.product_id AND rl.price IS NOT NULL
                                       ORDER BY rl.line_no LIMIT 1) o ON true""";
        } else {
            ours = """
                    LEFT JOIN LATERAL (SELECT rl.price AS our, rc.number AS source FROM receipt_line rl JOIN receipt rc ON rc.id = rl.receipt_id
                                       WHERE rl.product_id = r.product_id AND rc.status = 'POSTED' AND rc.branch_id = :branch
                                         AND rl.price IS NOT NULL
                                       ORDER BY rc.receipt_date DESC, rc.id DESC, rl.line_no LIMIT 1) o ON true""";
        }
        BigDecimal tol = tolerance();
        String ptLabel = ptName;
        List<RefCompareRow> rows = jdbc.sql("""
                SELECT r.id, r.row_no, r.name, r.manufacturer, r.barcode, r.unit, r.price, r.match_kind, r.needs_check,
                       p.id AS product_id, p.code, p.name AS product_name, m.name AS product_maker, o.our, o.source
                FROM ref_price_row r
                LEFT JOIN product p ON p.id = r.product_id
                LEFT JOIN manufacturer m ON m.id = p.manufacturer_id
                """ + ours + """
                 WHERE r.list_id = :l ORDER BY r.row_no""")
                .params(params)
                .query((rs, n) -> row(rs, tol, ptLabel))
                .list();
        long exp = 0;
        long cheap = 0;
        long eq = 0;
        long none = 0;
        long check = 0;
        for (RefCompareRow r : rows) {
            switch (r.status()) {
                case EXPENSIVE -> exp++;
                case CHEAP -> cheap++;
                case MATCH -> eq++;
                case NOT_FOUND -> none++;
            }
            if (r.needsCheck()) {
                check++;
            }
        }
        return new RefCompareResult(listId, fileName, mode, pt, ptName, receiptId, receiptNumber, branch,
                tol.stripTrailingZeros().toPlainString(), new RefCounts(exp, cheap, eq, none, check), rows);
    }

    private static RefCompareRow row(ResultSet rs, BigDecimal tol, String priceType) throws SQLException {
        BigDecimal ref = rs.getBigDecimal("price");
        BigDecimal our = rs.getBigDecimal("our");
        Long productId = rs.getObject("product_id", Long.class);
        RefProduct product = productId == null ? null
                : new RefProduct(productId, rs.getString("code"), rs.getString("product_name"), rs.getString("product_maker"));
        BigDecimal diff = null;
        BigDecimal pct = null;
        RowStatus status = RowStatus.NOT_FOUND;
        if (product != null && our != null) {
            diff = our.subtract(ref);
            pct = diff.multiply(BigDecimal.valueOf(100)).divide(ref, 2, RoundingMode.HALF_UP);
            status = status(pct, tol);
        }
        String source = rs.getString("source");
        return new RefCompareRow(rs.getLong("id"), rs.getInt("row_no"), rs.getString("name"), rs.getString("manufacturer"),
                rs.getString("barcode"), rs.getString("unit"), product, MatchKind.valueOf(rs.getString("match_kind")),
                rs.getBoolean("needs_check"), new Money(ref).toString(), our == null ? null : new Money(our).toString(),
                diff == null ? null : new Money(diff).toString(), pct == null ? null : pct.toPlainString(),
                status, product == null || our == null ? null : source != null ? source : priceType);
    }

    /** |farq %| ≤ chegara — «Mos»; aks holda ishorasiga qarab. */
    static RowStatus status(BigDecimal pct, BigDecimal tol) {
        if (pct.abs().compareTo(tol) <= 0) {
            return RowStatus.MATCH;
        }
        return pct.signum() > 0 ? RowStatus.EXPENSIVE : RowStatus.CHEAP;
    }

    private long branch(Long branchId, Actor actor) {
        if (branchId != null) {
            if (!actor.canAccessBranch(branchId)) {
                throw MedixException.forbidden("auth.forbidden");
            }
            return branchId;
        }
        if (actor.branchId() != null) {
            return actor.branchId();
        }
        return jdbc.sql("SELECT min(id) FROM branch WHERE active").query(Long.class).optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    /** Kirim kartochkasi: kirim narxi eng oxirgi referent narxdan (ruxsat etilgan farqdan ortiq) qimmat qatorlar. */
    @Transactional(readOnly = true)
    List<RefReceiptWarning> receiptWarnings(long receiptId, Actor actor) {
        if (jdbc.sql("SELECT branch_id FROM receipt WHERE id = :r").param("r", receiptId).query(Long.class).optional()
                .filter(actor::canAccessBranch)
                .isEmpty()) {
            throw MedixException.notFound("error.notFound");
        }
        BigDecimal tol = tolerance();
        List<RefReceiptWarning> out = new ArrayList<>();
        jdbc.sql("""
                SELECT rl.product_id, p.name, rl.price, ref.price AS ref_price, ref.list_id, ref.file_name
                FROM receipt_line rl JOIN product p ON p.id = rl.product_id
                JOIN LATERAL (SELECT x.price, x.list_id, l.file_name FROM ref_price_row x JOIN ref_price_list l ON l.id = x.list_id
                              WHERE x.product_id = rl.product_id ORDER BY l.uploaded_at DESC, l.id DESC, x.row_no LIMIT 1) ref ON true
                WHERE rl.receipt_id = :r AND rl.price IS NOT NULL ORDER BY rl.line_no""")
                .param("r", receiptId)
                .query((rs, n) -> {
                    BigDecimal our = rs.getBigDecimal("price");
                    BigDecimal ref = rs.getBigDecimal("ref_price");
                    BigDecimal pct = our.subtract(ref).multiply(BigDecimal.valueOf(100)).divide(ref, 2, RoundingMode.HALF_UP);
                    if (status(pct, tol) == RowStatus.EXPENSIVE) {
                        out.add(new RefReceiptWarning(rs.getLong("product_id"), rs.getString("name"), new Money(our).toString(),
                                new Money(ref).toString(), pct.toPlainString(), rs.getLong("list_id"), rs.getString("file_name")));
                    }
                    return 0;
                })
                .list();
        return out;
    }

    // ===== Yordamchilar =====

    /** «1 250 000,50», «1250000.50», «1,250,000.50» → 1250000.50; noto'g'ri yoki ≤ 0 — null. */
    static BigDecimal parsePrice(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.replaceAll("[\\s\\u00a0\\u202f']", "").replaceAll("(?i)(so'?m|сум|uzs)$", "");
        if (s.isEmpty()) {
            return null;
        }
        int comma = s.lastIndexOf(',');
        int dot = s.lastIndexOf('.');
        if (comma >= 0 && dot >= 0) {
            s = comma > dot ? s.replace(".", "").replace(',', '.') : s.replace(",", "");
        } else if (comma >= 0) {
            s = s.indexOf(',') == comma && s.length() - comma - 1 <= 2 ? s.replace(',', '.') : s.replace(",", "");
        } else if (dot >= 0 && s.indexOf('.') != dot) {
            s = s.replace(".", "");
        }
        try {
            BigDecimal v = new BigDecimal(s).setScale(2, RoundingMode.HALF_UP);
            return v.signum() > 0 && v.compareTo(new BigDecimal("1000000000000")) < 0 ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String digitsOrRaw(String s) {
        String b = blank(s);
        return b == null ? null : b.replace(" ", "");
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
