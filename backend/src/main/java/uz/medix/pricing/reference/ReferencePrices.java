package uz.medix.pricing.reference;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.pricing.PriceBook;
import uz.medix.pricing.SupplierFiles;
import uz.medix.pricing.reference.ReferenceModels.CompareDetail;
import uz.medix.pricing.reference.ReferenceModels.CompareLine;
import uz.medix.pricing.reference.ReferenceModels.CompareMode;
import uz.medix.pricing.reference.ReferenceModels.CompareRequest;
import uz.medix.pricing.reference.ReferenceModels.CompareSummary;
import uz.medix.pricing.reference.ReferenceModels.LineStatus;
import uz.medix.pricing.reference.ReferenceModels.MatchBy;
import uz.medix.pricing.reference.ReferenceModels.ReceiptRefWarning;
import uz.medix.pricing.reference.ReferenceModels.RefProfile;
import uz.medix.pricing.reference.ReferenceModels.RefProfileRequest;
import uz.medix.pricing.reference.ReferenceModels.RefRowInput;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.settings.SettingKey;
import uz.medix.shared.settings.SystemSettings;

/**
 * Referent narx bilan solishtirish (O14, egasi 17.11.2026). Fayl qatorlari mahsulotga moslanadi (shtrix-kod → MXIK → kod →
 * eslab qolingan qo'lda moslash → nom (+ishlab chiqaruvchi) o'xshashligi), bizning narx (kirim yoki sotuv) bilan solishtiriladi va
 * natija tarix sifatida saqlanadi. Ruxsat etilgan farq — sozlama {@link SettingKey#refPriceTolPct}.
 */
@Service
public class ReferencePrices {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    /** Nom o'xshashligi chegaralari: pastida — topilmadi, yuqorisida — ishonchli. */
    static final double NAME_MIN = 0.5;
    static final double NAME_SURE = 0.9;

    private final JdbcClient jdbc;
    private final PriceBook priceBook;
    private final SystemSettings settings;
    private final AuditLog audit;
    private final Clock clock;

    ReferencePrices(JdbcClient jdbc, PriceBook priceBook, SystemSettings settings, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.priceBook = priceBook;
        this.settings = settings;
        this.audit = audit;
        this.clock = clock;
    }

    // ===== Normallash =====

    private static final Map<Character, String> C2L = new HashMap<>();

    static {
        String[][] pairs = {{"а", "a"}, {"б", "b"}, {"в", "v"}, {"г", "g"}, {"д", "d"}, {"е", "e"}, {"ё", "e"}, {"ж", "j"},
            {"з", "z"}, {"и", "i"}, {"й", "y"}, {"к", "k"}, {"л", "l"}, {"м", "m"}, {"н", "n"}, {"о", "o"}, {"п", "p"}, {"р", "r"},
            {"с", "s"}, {"т", "t"}, {"у", "u"}, {"ф", "f"}, {"х", "x"}, {"ц", "c"}, {"ч", "ch"}, {"ш", "sh"}, {"щ", "sh"}, {"ъ", ""},
            {"ы", "i"}, {"ь", ""}, {"э", "e"}, {"ю", "yu"}, {"я", "ya"}, {"ў", "o"}, {"қ", "q"}, {"ғ", "g"}, {"ҳ", "h"}};
        for (String[] p : pairs) {
            C2L.put(p[0].charAt(0), p[1]);
        }
    }

    /** Kichik harf, kirill → lotin, faqat harf/raqam so'zlari bo'sh joy bilan. */
    static String norm(String s) {
        if (s == null) {
            return "";
        }
        StringBuilder b = new StringBuilder();
        for (char ch : s.toLowerCase(Locale.ROOT).toCharArray()) {
            String l = C2L.get(ch);
            if (l != null) {
                b.append(l);
            } else if (Character.isLetterOrDigit(ch) && ch < 128) {
                b.append(ch);
            } else {
                b.append(' ');
            }
        }
        return b.toString().replaceAll("\\s+", " ").strip();
    }

    static Set<String> tokens(String s) {
        Set<String> out = new LinkedHashSet<>();
        for (String t : norm(s).split(" ")) {
            if (!t.isEmpty()) {
                out.add(t);
            }
        }
        return out;
    }

    /** Nom o'xshashligi (Jaccard, so'zlar bo'yicha) 0..1. */
    static double similarity(String a, String b) {
        Set<String> x = tokens(a);
        Set<String> y = tokens(b);
        if (x.isEmpty() || y.isEmpty()) {
            return 0;
        }
        Set<String> inter = new HashSet<>(x);
        inter.retainAll(y);
        Set<String> union = new HashSet<>(x);
        union.addAll(y);
        return (double) inter.size() / union.size();
    }

    static String digits(String s) {
        return s == null ? "" : s.replaceAll("[^0-9A-Za-z]", "");
    }

    static String matchKey(String name, String maker) {
        String k = norm(name) + "|" + norm(maker);
        return k.length() > 400 ? k.substring(0, 400) : k;
    }

    /** «12 500,50», «12500.5», «12,500.50», «1.250.000» → 2 xonali summa; o'qib bo'lmasa yoki ≤ 0 — bo'sh. */
    static Optional<BigDecimal> parsePrice(String raw) {
        if (raw == null) {
            return Optional.empty();
        }
        String s = raw.replaceAll("[\\s  '’]", "").replaceAll("(?i)(so'?m|сум|sum|uzs)$", "");
        if (s.isEmpty() || !s.matches("[0-9.,]+")) {
            return Optional.empty();
        }
        int dot = s.lastIndexOf('.');
        int comma = s.lastIndexOf(',');
        if (dot >= 0 && comma >= 0) {
            char dec = dot > comma ? '.' : ',';
            char thou = dec == '.' ? ',' : '.';
            s = s.replace(String.valueOf(thou), "").replace(dec, '.');
        } else if (dot >= 0 || comma >= 0) {
            char sep = dot >= 0 ? '.' : ',';
            long count = s.chars().filter(c -> c == sep).count();
            int after = s.length() - s.lastIndexOf(sep) - 1;
            if (count > 1 || after == 3) {
                s = s.replace(String.valueOf(sep), "");
            } else {
                s = s.replace(sep, '.');
            }
        }
        try {
            BigDecimal v = new BigDecimal(s).setScale(2, RoundingMode.HALF_UP);
            return v.signum() > 0 && v.compareTo(new BigDecimal("1000000000000")) < 0 ? Optional.of(v) : Optional.empty();
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    // ===== Mahsulotlar va moslash =====

    record Product(long id, String code, String name, String maker, String ikpu, List<String> barcodes) {}

    record Match(Product product, MatchBy by, boolean confident) {}

    static final class Catalog {
        final List<Product> all;
        final Map<Long, Product> byId = new HashMap<>();
        final Map<String, Product> byBarcode = new HashMap<>();
        final Map<String, List<Product>> byIkpu = new HashMap<>();
        final Map<String, Product> byCode = new HashMap<>();
        final Map<String, Long> memory;

        Catalog(List<Product> all, Map<String, Long> memory) {
            this.all = all;
            this.memory = memory;
            for (Product p : all) {
                byId.put(p.id(), p);
                p.barcodes().forEach(b -> byBarcode.put(digits(b).toLowerCase(Locale.ROOT), p));
                if (p.ikpu() != null) {
                    byIkpu.computeIfAbsent(p.ikpu(), k -> new ArrayList<>()).add(p);
                }
                byCode.put(p.code().strip(), p);
            }
        }

        Match match(String name, String barcode, String ikpu, String code, String maker) {
            String bc = digits(barcode).toLowerCase(Locale.ROOT);
            if (!bc.isEmpty() && byBarcode.containsKey(bc)) {
                return new Match(byBarcode.get(bc), MatchBy.BARCODE, true);
            }
            String ik = digits(ikpu);
            List<Product> sameIkpu = ik.isEmpty() ? List.of() : byIkpu.getOrDefault(ik, List.of());
            if (sameIkpu.size() == 1) {
                return new Match(sameIkpu.getFirst(), MatchBy.IKPU, true);
            }
            String cd = digits(code);
            if (!cd.isEmpty() && byCode.containsKey(cd)) {
                return new Match(byCode.get(cd), MatchBy.CODE, true);
            }
            Long remembered = memory.get(matchKey(name, maker));
            if (remembered != null && byId.containsKey(remembered)) {
                return new Match(byId.get(remembered), MatchBy.MEMORY, true);
            }
            // MXIK bir nechta mahsulotda — ular ichidan nom bo'yicha, aks holda butun katalogdan
            Collection<Product> pool = sameIkpu.isEmpty() ? all : sameIkpu;
            Product best = null;
            double score = 0;
            String mk = norm(maker);
            for (Product p : pool) {
                double s = similarity(name, p.name());
                if (!mk.isEmpty() && p.maker() != null) {
                    String pm = norm(p.maker());
                    s += !pm.isEmpty() && (pm.contains(mk) || mk.contains(pm)) ? 0.1 : -0.1;
                }
                if (s > score) {
                    score = s;
                    best = p;
                }
            }
            if (best != null && (score >= NAME_MIN || !sameIkpu.isEmpty())) {
                boolean sure = score >= NAME_SURE && sameIkpu.isEmpty() && norm(name).equals(norm(best.name()));
                return new Match(best, MatchBy.NAME, sure);
            }
            return new Match(null, MatchBy.NONE, true);
        }
    }

    /** O15 ({@link uz.medix.pricing.SupplierFiles}): YB fayli qatorlari uchun mahsulot topish. */
    public List<SupplierFiles.Found> matchAll(List<SupplierFiles.Query> queries) {
        Catalog c = catalog();
        return queries.stream().map(q -> {
            Match m = c.match(q.name(), q.barcode(), q.ikpu(), q.code(), q.maker());
            Product p = m.product();
            return new SupplierFiles.Found(p == null ? null : p.id(), p == null ? null : p.code(),
                    p == null ? null : p.name(), m.by().name(), m.confident());
        }).toList();
    }

    public static String parsePriceText(String raw) {
        return parsePrice(raw).map(BigDecimal::toPlainString).orElse(null);
    }

    Catalog catalog() {
        List<Product> all = jdbc.sql("""
                SELECT p.id, p.code, p.name, m.name AS maker, p.ikpu,
                       COALESCE((SELECT string_agg(b.barcode, ' ') FROM product_barcode b WHERE b.product_id = p.id), '') AS barcodes
                FROM product p LEFT JOIN manufacturer m ON m.id = p.manufacturer_id WHERE p.active ORDER BY p.id""")
                .query((rs, n) -> new Product(rs.getLong("id"), rs.getString("code"), rs.getString("name"), rs.getString("maker"),
                        rs.getString("ikpu"), rs.getString("barcodes").isBlank() ? List.of() : List.of(rs.getString("barcodes").split(" "))))
                .list();
        Map<String, Long> memory = new HashMap<>();
        jdbc.sql("SELECT match_key, product_id FROM reference_match")
                .query((rs, n) -> memory.put(rs.getString(1), rs.getLong(2)))
                .list();
        return new Catalog(all, memory);
    }

    // ===== Bizning narx =====

    record Ours(BigDecimal price, String source) {}

    private record Head(long id, long branchId, String mode, Long priceTypeId, Long receiptId, BigDecimal tolerance, long createdBy) {}

    Map<Long, Ours> ourPrices(CompareMode mode, long branchId, Long priceTypeId, Long receiptId, Collection<Long> productIds) {
        Map<Long, Ours> out = new HashMap<>();
        if (productIds.isEmpty()) {
            return out;
        }
        if (mode == CompareMode.SALE) {
            Map<Long, String> names = new HashMap<>();
            jdbc.sql("SELECT id, name FROM price_type").query((rs, n) -> names.put(rs.getLong(1), rs.getString(2))).list();
            priceBook.quotes(branchId, priceTypeId, productIds, LocalDate.now(clock.withZone(TASHKENT)))
                    .forEach((p, q) -> out.put(p, new Ours(q.price().amount(), names.get(q.priceTypeId()))));
        } else if (receiptId != null) {
            String number = jdbc.sql("SELECT number FROM receipt WHERE id = :r").param("r", receiptId).query(String.class).single();
            jdbc.sql("""
                    SELECT product_id, round(sum(price * qty) / sum(qty), 2) AS price FROM receipt_line
                    WHERE receipt_id = :r AND price IS NOT NULL AND product_id IN (:p) GROUP BY product_id""")
                    .param("r", receiptId)
                    .param("p", productIds)
                    .query((rs, n) -> out.put(rs.getLong(1), new Ours(rs.getBigDecimal(2), number)))
                    .list();
        } else {
            jdbc.sql("""
                    SELECT DISTINCT ON (l.product_id) l.product_id, l.price, r.number
                    FROM receipt_line l JOIN receipt r ON r.id = l.receipt_id
                    WHERE r.branch_id = :b AND r.status = 'POSTED' AND l.price IS NOT NULL AND l.product_id IN (:p)
                    ORDER BY l.product_id, r.receipt_date DESC, r.id DESC, l.line_no""")
                    .param("b", branchId)
                    .param("p", productIds)
                    .query((rs, n) -> out.put(rs.getLong(1), new Ours(rs.getBigDecimal(2), rs.getString(3))))
                    .list();
        }
        return out;
    }

    static LineStatus status(BigDecimal ours, BigDecimal ref, BigDecimal tolPct) {
        BigDecimal band = ref.multiply(tolPct).divide(HUNDRED, 2, RoundingMode.HALF_UP);
        if (ours.compareTo(ref.add(band)) > 0) {
            return LineStatus.DEARER;
        }
        if (ours.compareTo(ref.subtract(band)) < 0) {
            return LineStatus.CHEAPER;
        }
        return LineStatus.MATCH;
    }

    static BigDecimal diffPct(BigDecimal ours, BigDecimal ref) {
        return ours.subtract(ref).multiply(HUNDRED).divide(ref, 2, RoundingMode.HALF_UP);
    }

    // ===== Solishtirish =====

    private long resolveBranch(Actor actor, CompareRequest r) {
        if (r.receiptId() != null) {
            if (r.mode() != CompareMode.PURCHASE) {
                throw MedixException.badRequest("referencePrice.receiptOnlyPurchase");
            }
            long b = jdbc.sql("SELECT branch_id FROM receipt WHERE id = :r AND status <> 'CANCELLED'").param("r", r.receiptId())
                    .query(Long.class).optional().orElseThrow(() -> MedixException.notFound("error.notFound"));
            if (!actor.canAccessBranch(b)) {
                throw MedixException.notFound("error.notFound");
            }
            return b;
        }
        Long b = r.branchId() != null ? r.branchId() : actor.branchId();
        if (b == null) {
            throw MedixException.badRequest("referencePrice.branchRequired");
        }
        if (!actor.canAccessBranch(b)) {
            throw MedixException.forbidden("auth.forbidden");
        }
        return b;
    }

    @Transactional
    public CompareDetail compare(Actor actor, CompareRequest r, boolean costVisible) {
        if (r.mode() == CompareMode.PURCHASE && !costVisible) {
            throw MedixException.forbidden("referencePrice.costHidden");
        }
        if (r.mode() == CompareMode.SALE && r.priceTypeId() == null) {
            throw MedixException.badRequest("referencePrice.priceTypeRequired");
        }
        if (r.mode() == CompareMode.SALE
                && jdbc.sql("SELECT count(*) FROM price_type WHERE id = :t").param("t", r.priceTypeId()).query(Long.class).single() == 0) {
            throw MedixException.notFound("error.notFound");
        }
        long branch = resolveBranch(actor, r);
        BigDecimal tol = settings.value(SettingKey.refPriceTolPct);
        Catalog cat = catalog();

        record Parsed(int row, String name, String barcode, String ikpu, String code, String maker, String unit, BigDecimal ref, Match m) {}
        List<Parsed> rows = new ArrayList<>();
        List<Integer> skipped = new ArrayList<>();
        Set<Integer> seen = new HashSet<>();
        for (RefRowInput in : r.rows()) {
            Map<String, String> v = in.values();
            String name = clip(v.get("name"), 500);
            Optional<BigDecimal> price = parsePrice(v.get("price"));
            if (in.row() <= 0 || !seen.add(in.row()) || name == null || price.isEmpty()) {
                skipped.add(in.row());
                continue;
            }
            String barcode = clip(v.get("barcode"), 64);
            String ikpu = clip(v.get("ikpu"), 32);
            String code = clip(v.get("code"), 32);
            String maker = clip(v.get("manufacturer"), 300);
            rows.add(new Parsed(in.row(), name, barcode, ikpu, code, maker, clip(v.get("unit"), 50), price.get(),
                    cat.match(name, barcode, ikpu, code, maker)));
        }
        if (rows.isEmpty()) {
            throw MedixException.badRequest("referencePrice.noRows");
        }
        Set<Long> ids = new HashSet<>();
        rows.forEach(p -> {
            if (p.m().product() != null) {
                ids.add(p.m().product().id());
            }
        });
        Map<Long, Ours> ours = ourPrices(r.mode(), branch, r.priceTypeId(), r.receiptId(), ids);

        long id = jdbc.sql("""
                INSERT INTO reference_compare (branch_id, file_name, mode, price_type_id, receipt_id, tolerance_pct, created_by)
                VALUES (:b, :f, :m, :t, :r, :tol, :e) RETURNING id""")
                .param("b", branch)
                .param("f", r.fileName().strip())
                .param("m", r.mode().name())
                .param("t", r.mode() == CompareMode.SALE ? r.priceTypeId() : null)
                .param("r", r.receiptId())
                .param("tol", tol)
                .param("e", actor.employeeId())
                .query(Long.class)
                .single();
        for (Parsed p : rows) {
            Long pid = p.m().product() == null ? null : p.m().product().id();
            Ours o = pid == null ? null : ours.get(pid);
            LineStatus st = pid == null ? LineStatus.NOT_FOUND : o == null ? LineStatus.NO_PRICE : status(o.price(), p.ref(), tol);
            jdbc.sql("""
                    INSERT INTO reference_compare_line (compare_id, row_no, name, barcode, ikpu, code, manufacturer, unit, ref_price,
                                                        product_id, match_by, confident, our_price, source, status)
                    VALUES (:c, :row, :n, :bc, :ik, :cd, :mk, :u, :ref, :p, :by, :sure, :our, :src, :st)""")
                    .param("c", id)
                    .param("row", p.row())
                    .param("n", p.name())
                    .param("bc", p.barcode())
                    .param("ik", p.ikpu())
                    .param("cd", p.code())
                    .param("mk", p.maker())
                    .param("u", p.unit())
                    .param("ref", p.ref())
                    .param("p", pid)
                    .param("by", p.m().by().name())
                    .param("sure", p.m().confident())
                    .param("our", o == null ? null : o.price())
                    .param("src", o == null ? null : clip(o.source(), 120))
                    .param("st", st.name())
                    .update();
        }
        recount(id);
        audit.record(AuditEntry.of("referencePrice.compare", "reference_compare", id)
                .change(null, Map.of("file", r.fileName(), "mode", r.mode().name(), "rows", rows.size())));
        CompareDetail d = detail(actor, id, costVisible).orElseThrow();
        return new CompareDetail(d.summary(), d.lines(), skipped);
    }

    private static String clip(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.strip();
        return t.length() > max ? t.substring(0, max) : t;
    }

    private void recount(long id) {
        jdbc.sql("""
                UPDATE reference_compare c SET
                    dearer = (SELECT count(*) FROM reference_compare_line WHERE compare_id = c.id AND status = 'DEARER'),
                    cheaper = (SELECT count(*) FROM reference_compare_line WHERE compare_id = c.id AND status = 'CHEAPER'),
                    matched = (SELECT count(*) FROM reference_compare_line WHERE compare_id = c.id AND status = 'MATCH'),
                    not_found = (SELECT count(*) FROM reference_compare_line WHERE compare_id = c.id AND status IN ('NOT_FOUND', 'NO_PRICE'))
                WHERE id = :id""").param("id", id).update();
    }

    // ===== O'qish =====

    private static final String SUMMARY_SQL = """
            SELECT c.id, c.created_at, c.file_name, e.full_name AS created_by, c.branch_id, b.name AS branch, c.mode, c.price_type_id,
                   t.name AS price_type, c.receipt_id, r.number AS receipt_number, c.tolerance_pct, c.dearer, c.cheaper, c.matched, c.not_found
            FROM reference_compare c JOIN employee e ON e.id = c.created_by JOIN branch b ON b.id = c.branch_id
            LEFT JOIN price_type t ON t.id = c.price_type_id LEFT JOIN receipt r ON r.id = c.receipt_id""";

    private static CompareSummary summary(java.sql.ResultSet rs) throws java.sql.SQLException {
        Timestamp at = rs.getTimestamp("created_at");
        return new CompareSummary(rs.getLong("id"), at.toInstant(), rs.getString("file_name"), rs.getString("created_by"),
                rs.getLong("branch_id"), rs.getString("branch"), CompareMode.valueOf(rs.getString("mode")),
                rs.getObject("price_type_id", Long.class), rs.getString("price_type"), rs.getObject("receipt_id", Long.class),
                rs.getString("receipt_number"), rs.getBigDecimal("tolerance_pct").stripTrailingZeros().toPlainString(), rs.getInt("dearer"),
                rs.getInt("cheaper"), rs.getInt("matched"), rs.getInt("not_found"));
    }

    @Transactional(readOnly = true)
    public List<CompareSummary> history(Actor actor, Long branchId, boolean costVisible) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new HashMap<>();
        if (!actor.allBranches()) {
            where.append(" AND c.branch_id = :own");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        if (branchId != null) {
            where.append(" AND c.branch_id = :b");
            params.put("b", branchId);
        }
        if (!costVisible) {
            where.append(" AND c.mode = 'SALE'");
        }
        return jdbc.sql(SUMMARY_SQL + where + " ORDER BY c.created_at DESC, c.id DESC LIMIT 200")
                .params(params)
                .query((rs, n) -> summary(rs))
                .list();
    }

    @Transactional(readOnly = true)
    public Optional<CompareDetail> detail(Actor actor, long id, boolean costVisible) {
        Optional<CompareSummary> s = jdbc.sql(SUMMARY_SQL + " WHERE c.id = :id").param("id", id).query((rs, n) -> summary(rs)).optional()
                .filter(x -> actor.canAccessBranch(x.branchId()));
        if (s.isEmpty()) {
            return Optional.empty();
        }
        if (s.get().mode() == CompareMode.PURCHASE && !costVisible) {
            throw MedixException.forbidden("referencePrice.costHidden");
        }
        List<CompareLine> lines = jdbc.sql("""
                SELECT l.*, p.code AS p_code, p.name AS p_name, m.name AS p_maker
                FROM reference_compare_line l LEFT JOIN product p ON p.id = l.product_id
                LEFT JOIN manufacturer m ON m.id = p.manufacturer_id
                WHERE l.compare_id = :id ORDER BY l.row_no""")
                .param("id", id)
                .query((rs, n) -> {
                    BigDecimal ref = rs.getBigDecimal("ref_price");
                    BigDecimal our = rs.getBigDecimal("our_price");
                    return new CompareLine(rs.getInt("row_no"), rs.getString("name"), rs.getString("barcode"), rs.getString("ikpu"),
                            rs.getString("manufacturer"), rs.getString("unit"), ref.toPlainString(), rs.getObject("product_id", Long.class),
                            rs.getString("p_code"), rs.getString("p_name"), rs.getString("p_maker"), MatchBy.valueOf(rs.getString("match_by")),
                            rs.getBoolean("confident"), our == null ? null : our.toPlainString(),
                            our == null ? null : our.subtract(ref).toPlainString(), our == null ? null : diffPct(our, ref).toPlainString(),
                            rs.getString("source"), LineStatus.valueOf(rs.getString("status")));
                })
                .list();
        return Optional.of(new CompareDetail(s.get(), lines, List.of()));
    }

    // ===== Qo'lda moslash =====

    @Transactional
    public CompareDetail match(Actor actor, long id, int rowNo, long productId, boolean costVisible) {
        Head h = jdbc.sql("""
                SELECT id, branch_id, mode, price_type_id, receipt_id, tolerance_pct, created_by FROM reference_compare WHERE id = :id FOR UPDATE""")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getObject(4, Long.class),
                        rs.getObject(5, Long.class), rs.getBigDecimal(6), rs.getLong(7)))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        CompareMode mode = CompareMode.valueOf(h.mode());
        if (mode == CompareMode.PURCHASE && !costVisible) {
            throw MedixException.forbidden("referencePrice.costHidden");
        }
        record Line(String name, String maker, BigDecimal ref) {}
        Line line = jdbc.sql("SELECT name, manufacturer, ref_price FROM reference_compare_line WHERE compare_id = :c AND row_no = :r")
                .param("c", id)
                .param("r", rowNo)
                .query((rs, n) -> new Line(rs.getString(1), rs.getString(2), rs.getBigDecimal(3)))
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (jdbc.sql("SELECT count(*) FROM product WHERE id = :p").param("p", productId).query(Long.class).single() == 0) {
            throw MedixException.notFound("error.notFound");
        }
        Ours o = ourPrices(mode, h.branchId(), h.priceTypeId(), h.receiptId(), List.of(productId)).get(productId);
        LineStatus st = o == null ? LineStatus.NO_PRICE : status(o.price(), line.ref(), h.tolerance());
        jdbc.sql("""
                UPDATE reference_compare_line SET product_id = :p, match_by = 'MANUAL', confident = true, our_price = :our, source = :src,
                    status = :st WHERE compare_id = :c AND row_no = :r""")
                .param("p", productId)
                .param("our", o == null ? null : o.price())
                .param("src", o == null ? null : clip(o.source(), 120))
                .param("st", st.name())
                .param("c", id)
                .param("r", rowNo)
                .update();
        jdbc.sql("""
                INSERT INTO reference_match (match_key, product_id, updated_by) VALUES (:k, :p, :e)
                ON CONFLICT (match_key) DO UPDATE SET product_id = EXCLUDED.product_id, updated_by = EXCLUDED.updated_by, updated_at = now()""")
                .param("k", matchKey(line.name(), line.maker()))
                .param("p", productId)
                .param("e", actor.employeeId())
                .update();
        recount(id);
        audit.record(AuditEntry.of("referencePrice.match", "reference_compare", id).change(null, Map.of("row", rowNo, "product", productId)));
        return detail(actor, id, costVisible).orElseThrow();
    }

    // ===== Moslash profili =====

    static final String PROFILE_TYPE = "reference_price";
    static final List<String> FIELDS = List.of("name", "barcode", "ikpu", "code", "manufacturer", "price", "unit");

    @Transactional(readOnly = true)
    public Optional<RefProfile> profile() {
        return jdbc.sql("SELECT name FROM import_profile WHERE type = :t").param("t", PROFILE_TYPE).query(String.class).optional().map(name -> {
            Map<String, String> m = new java.util.LinkedHashMap<>();
            jdbc.sql("SELECT field, column_title FROM import_profile_field WHERE type = :t ORDER BY field").param("t", PROFILE_TYPE)
                    .query((rs, i) -> m.put(rs.getString(1), rs.getString(2))).list();
            return new RefProfile(name, m);
        });
    }

    @Transactional
    public RefProfile saveProfile(Actor actor, RefProfileRequest r) {
        Map<String, String> mapping = new java.util.LinkedHashMap<>();
        r.mapping().forEach((f, title) -> {
            if (FIELDS.contains(f) && title != null && !title.isBlank()) {
                mapping.put(f, title.strip().length() > 200 ? title.strip().substring(0, 200) : title.strip());
            }
        });
        if (mapping.isEmpty()) {
            throw MedixException.badRequest("import.profileEmpty");
        }
        jdbc.sql("""
                INSERT INTO import_profile (type, name, updated_by, updated_at) VALUES (:t, :n, :e, now())
                ON CONFLICT (type) DO UPDATE SET name = EXCLUDED.name, updated_by = EXCLUDED.updated_by, updated_at = now()""")
                .param("t", PROFILE_TYPE).param("n", r.name().strip()).param("e", actor.employeeId()).update();
        jdbc.sql("DELETE FROM import_profile_field WHERE type = :t").param("t", PROFILE_TYPE).update();
        mapping.forEach((f, title) -> jdbc.sql("INSERT INTO import_profile_field (type, field, column_title) VALUES (:t, :f, :c)")
                .param("t", PROFILE_TYPE).param("f", f).param("c", title).update());
        audit.record(AuditEntry.of("import.profile", "import_profile", null).change(null, Map.of("type", PROFILE_TYPE, "fields", mapping.size())));
        return new RefProfile(r.name().strip(), mapping);
    }

    // ===== Kirim kartochkasi ogohlantirishi =====

    /** Kirim narxi oxirgi referent narxdan (ruxsat etilgan farqdan ortiq) qimmat bo'lgan mahsulotlar. Bloklamaydi. */
    @Transactional(readOnly = true)
    public List<ReceiptRefWarning> receiptWarnings(Actor actor, long receiptId) {
        Long branch = jdbc.sql("SELECT branch_id FROM receipt WHERE id = :r").param("r", receiptId).query(Long.class).optional()
                .filter(actor::canAccessBranch)
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        BigDecimal tol = settings.value(SettingKey.refPriceTolPct);
        record Row(long productId, String name, BigDecimal price, BigDecimal ref, long compareId) {}
        List<Row> rows = jdbc.sql("""
                WITH lines AS (
                    SELECT product_id, round(sum(price * qty) / sum(qty), 2) AS price FROM receipt_line
                    WHERE receipt_id = :r AND price IS NOT NULL GROUP BY product_id),
                refs AS (
                    SELECT DISTINCT ON (l.product_id) l.product_id, l.ref_price, l.compare_id
                    FROM reference_compare_line l JOIN reference_compare c ON c.id = l.compare_id
                    WHERE l.product_id IN (SELECT product_id FROM lines) AND c.branch_id = :b
                    ORDER BY l.product_id, c.created_at DESC, c.id DESC)
                SELECT x.product_id, p.name, x.price, f.ref_price, f.compare_id
                FROM lines x JOIN refs f ON f.product_id = x.product_id JOIN product p ON p.id = x.product_id
                ORDER BY p.name""")
                .param("r", receiptId)
                .param("b", branch)
                .query((rs, n) -> new Row(rs.getLong(1), rs.getString(2), rs.getBigDecimal(3), rs.getBigDecimal(4), rs.getLong(5)))
                .list();
        List<ReceiptRefWarning> out = new ArrayList<>();
        for (Row x : rows) {
            if (status(x.price(), x.ref(), tol) == LineStatus.DEARER) {
                out.add(new ReceiptRefWarning(x.productId(), x.name(), x.price().toPlainString(), x.ref().toPlainString(),
                        diffPct(x.price(), x.ref()).toPlainString(), x.compareId()));
            }
        }
        return out;
    }
}
