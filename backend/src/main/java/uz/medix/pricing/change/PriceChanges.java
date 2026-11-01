package uz.medix.pricing.change;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.pricing.PriceMath;
import uz.medix.pricing.change.PriceChangeModels.BaseKind;
import uz.medix.pricing.change.PriceChangeModels.Line;
import uz.medix.pricing.change.PriceChangeModels.LineRequest;
import uz.medix.pricing.change.PriceChangeModels.MarkupLine;
import uz.medix.pricing.change.PriceChangeModels.MarkupRequest;
import uz.medix.pricing.change.PriceChangeModels.PriceChangeDetail;
import uz.medix.pricing.change.PriceChangeModels.PriceChangePage;
import uz.medix.pricing.change.PriceChangeModels.PriceChangeRequest;
import uz.medix.pricing.change.PriceChangeModels.PriceChangeSummary;
import uz.medix.pricing.change.PriceChangeModels.PricePage;
import uz.medix.pricing.change.PriceChangeModels.PriceRow;
import uz.medix.pricing.change.PriceChangeModels.Status;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.PinVerifier;
import uz.medix.shared.text.SearchText;

/**
 * NO — narx o'zgarishi hujjati (SPEC 6, 7): Qoralama → (Direktor tasdig'ida) → Tasdiqlangan / Rad etilgan / Bekor qilingan.
 * Narx faqat tasdiqlanganda yoziladi. Tannarxdan past narx Direktor tasdig'ini talab qiladi — tannarx partiyalardan
 * (4–5-bosqich) keladi; hozircha tannarx noma'lum, shuning uchun bu tekshiruv bo'sh ({@link #belowCost}).
 */
@Service
class PriceChanges {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final PinVerifier pins;
    private final Clock clock;

    PriceChanges(JdbcClient jdbc, AuditLog audit, DocumentSequenceService numbers, PinVerifier pins, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.numbers = numbers;
        this.pins = pins;
        this.clock = clock;
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(TASHKENT));
    }

    // ===== Amaldagi narxlar =====

    /** (mahsulot, tur) → amaldagi narx shu filial va sanada. */
    Map<String, Money> currentPrices(long branchId, List<Long> productIds, LocalDate at) {
        Map<String, Money> m = new HashMap<>();
        if (productIds.isEmpty()) {
            return m;
        }
        jdbc.sql("""
                SELECT DISTINCT ON (product_id, price_type_id) product_id, price_type_id, amount
                FROM price WHERE branch_id = :b AND product_id IN (:p) AND effective_from <= :at
                ORDER BY product_id, price_type_id, effective_from DESC, id DESC""")
                .param("b", branchId)
                .param("p", productIds)
                .param("at", Date.valueOf(at))
                .query((rs, n) -> m.put(rs.getLong("product_id") + ":" + rs.getLong("price_type_id"), new Money(rs.getBigDecimal("amount"))))
                .list();
        return m;
    }

    @Transactional(readOnly = true)
    PricePage prices(long branchId, String q, Long manufacturerId, LocalDate at, int page, int size) {
        StringBuilder where = new StringBuilder(" WHERE p.active");
        Map<String, Object> params = new HashMap<>();
        if (manufacturerId != null) {
            where.append(" AND p.manufacturer_id = :m");
            params.put("m", manufacturerId);
        }
        String nq = SearchText.normalize(q);
        if (!nq.isEmpty()) {
            String[] parts = nq.split(" ");
            where.append(" AND (p.code = :exact OR (true");
            for (int i = 0; i < parts.length && i < 8; i++) {
                where.append(" AND p.search_text LIKE :w").append(i).append(" ESCAPE '\\'");
                params.put("w" + i, "%" + SearchText.likeEscape(parts[i]) + "%");
            }
            where.append("))");
            params.put("exact", q.strip());
        }
        long total = jdbc.sql("SELECT count(*) FROM product p" + where).params(params).query(Long.class).single();
        record Prod(long id, String code, String name, String manufacturer) {}
        List<Prod> prods = jdbc.sql("SELECT p.id, p.code, p.name, m.name AS manufacturer FROM product p "
                        + "LEFT JOIN manufacturer m ON m.id = p.manufacturer_id" + where + " ORDER BY lower(p.name), p.id LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query(Prod.class)
                .list();
        Map<String, Money> current = currentPrices(branchId, prods.stream().map(Prod::id).toList(), at);
        List<PriceRow> rows = new ArrayList<>();
        for (Prod p : prods) {
            Map<String, String> prices = new LinkedHashMap<>();
            current.forEach((k, v) -> {
                if (k.startsWith(p.id() + ":")) {
                    prices.put(k.substring(k.indexOf(':') + 1), v.toString());
                }
            });
            rows.add(new PriceRow(p.id(), p.code(), p.name(), p.manufacturer(), prices));
        }
        return new PricePage(rows, total, page, size);
    }

    // ===== NO: o'qish =====

    @Transactional(readOnly = true)
    PriceChangePage list(Actor actor, Long branchId, Status status, int page, int size) {
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
        if (status != null) {
            where.append(" AND c.status = :s");
            params.put("s", status.name());
        }
        long total = jdbc.sql("SELECT count(*) FROM price_change c" + where).params(params).query(Long.class).single();
        List<PriceChangeSummary> items = jdbc.sql("""
                SELECT c.id, c.number, c.branch_id, c.status, c.effective_from,
                       (SELECT count(*) FROM price_change_line l WHERE l.price_change_id = c.id) AS lines,
                       e.full_name AS created_by, c.created_at, c.decided_at
                FROM price_change c JOIN employee e ON e.id = c.created_by""" + where + " ORDER BY c.created_at DESC, c.id DESC LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query((rs, n) -> new PriceChangeSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        Status.valueOf(rs.getString("status")), rs.getDate("effective_from").toLocalDate(), rs.getInt("lines"),
                        rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(),
                        Optional.ofNullable(rs.getTimestamp("decided_at")).map(Timestamp::toInstant).orElse(null)))
                .list();
        return new PriceChangePage(items, total, page, size);
    }

    @Transactional(readOnly = true)
    Optional<PriceChangeDetail> find(long id, Actor actor) {
        record HeadRow(long id, String number, long branchId, String status, Date effectiveFrom, String note, String createdBy,
                Timestamp createdAt, Timestamp submittedAt, String decidedBy, Timestamp decidedAt, String decisionReason) {}
        Optional<HeadRow> head = jdbc.sql("""
                SELECT c.id, c.number, c.branch_id, c.status, c.effective_from, c.note, cb.full_name AS created_by, c.created_at,
                       c.submitted_at, db.full_name AS decided_by, c.decided_at, c.decision_reason
                FROM price_change c JOIN employee cb ON cb.id = c.created_by LEFT JOIN employee db ON db.id = c.decided_by
                WHERE c.id = :id""")
                .param("id", id)
                .query(HeadRow.class)
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        HeadRow h = head.get();
        List<Line> lines = jdbc.sql("""
                SELECT l.id, l.product_id, p.code, p.name, l.price_type_id, t.name AS price_type, l.old_price, l.new_price
                FROM price_change_line l JOIN product p ON p.id = l.product_id JOIN price_type t ON t.id = l.price_type_id
                WHERE l.price_change_id = :id ORDER BY lower(p.name), t.sort_order""")
                .param("id", id)
                .query((rs, n) -> {
                    Money oldP = Optional.ofNullable(rs.getBigDecimal("old_price")).map(Money::new).orElse(null);
                    Money newP = new Money(rs.getBigDecimal("new_price"));
                    return new Line(rs.getLong("id"), rs.getLong("product_id"), rs.getString("code"), rs.getString("name"),
                            rs.getLong("price_type_id"), rs.getString("price_type"), oldP == null ? null : oldP.toString(), newP.toString(),
                            PriceMath.changePercent(oldP, newP).map(BigDecimal::toPlainString).orElse(null), PriceMath.bigChange(oldP, newP));
                })
                .list();
        int big = (int) lines.stream().filter(Line::bigChange).count();
        return Optional.of(new PriceChangeDetail(h.id(), h.number(), h.branchId(), Status.valueOf(h.status()), h.effectiveFrom().toLocalDate(),
                h.note(), h.createdBy(), h.createdAt().toInstant(), instant(h.submittedAt()), h.decidedBy(), instant(h.decidedAt()),
                h.decisionReason(), big, lines));
    }

    // ===== NO: yozish =====

    @Transactional
    long create(Actor actor, PriceChangeRequest r) {
        String branchCode = branchCode(actor, r.branchId());
        if (r.effectiveFrom().isBefore(today())) {
            throw MedixException.badRequest("priceChange.pastDate");
        }
        String number = numbers.next(DocumentPrefix.NO, branchCode).toString();
        long id = jdbc.sql("""
                INSERT INTO price_change (number, branch_id, effective_from, note, created_by)
                VALUES (:n, :b, :d, :note, :by) RETURNING id""")
                .param("n", number)
                .param("b", r.branchId())
                .param("d", Date.valueOf(r.effectiveFrom()))
                .param("note", blankToNull(r.note()))
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        insertLines(id, r.branchId(), r.effectiveFrom(), r.lines());
        audit.record(AuditEntry.of("priceChange.create", "price_change", id).change(null, Map.of("number", number, "lines", r.lines().size())));
        return id;
    }

    @Transactional
    void update(Actor actor, long id, PriceChangeRequest r) {
        Head h = lock(id, actor);
        requireStatus(h, Status.DRAFT);
        if (h.branchId() != r.branchId()) {
            branchCode(actor, r.branchId());
        }
        if (r.effectiveFrom().isBefore(today())) {
            throw MedixException.badRequest("priceChange.pastDate");
        }
        jdbc.sql("UPDATE price_change SET branch_id = :b, effective_from = :d, note = :note, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("b", r.branchId())
                .param("d", Date.valueOf(r.effectiveFrom()))
                .param("note", blankToNull(r.note()))
                .param("id", id)
                .update();
        jdbc.sql("DELETE FROM price_change_line WHERE price_change_id = :id").param("id", id).update();
        insertLines(id, r.branchId(), r.effectiveFrom(), r.lines());
        audit.record(AuditEntry.of("priceChange.update", "price_change", id).change(null, Map.of("lines", r.lines().size())));
    }

    /** Qoralamani o'tkazish: tannarxdan past qator bo'lsa va Direktor bo'lmasa — Direktor tasdig'iga; aks holda darhol tasdiqlanadi. */
    @Transactional
    void submit(Actor actor, long id, boolean actorIsDirector) {
        Head h = lock(id, actor);
        requireStatus(h, Status.DRAFT);
        if (lineCount(id) == 0) {
            throw MedixException.badRequest("priceChange.noLines");
        }
        jdbc.sql("UPDATE price_change SET submitted_at = now(), updated_at = now(), version = version + 1 WHERE id = :id").param("id", id).update();
        if (belowCost(id) && !actorIsDirector) {
            setStatus(id, Status.PENDING_APPROVAL, null, null);
            audit.record(AuditEntry.of("priceChange.submit", "price_change", id));
            return;
        }
        apply(h);
        setStatus(id, Status.APPROVED, actor.employeeId(), null);
        audit.record(AuditEntry.of("priceChange.approve", "price_change", id));
    }

    /** Direktor tasdig'i — PIN bilan (SPEC 13). */
    @Transactional
    void approve(Actor actor, long id, String pin) {
        Head h = lock(id, actor);
        requireStatus(h, Status.PENDING_APPROVAL);
        pins.verify(actor.employeeId(), pin);
        apply(h);
        setStatus(id, Status.APPROVED, actor.employeeId(), null);
        audit.record(AuditEntry.of("priceChange.approve", "price_change", id));
    }

    @Transactional
    void reject(Actor actor, long id, String reason) {
        Head h = lock(id, actor);
        requireStatus(h, Status.PENDING_APPROVAL);
        setStatus(id, Status.REJECTED, actor.employeeId(), reason.strip());
        audit.record(AuditEntry.of("priceChange.reject", "price_change", id).withReason(reason.strip()));
    }

    @Transactional
    void cancel(Actor actor, long id, String reason) {
        Head h = lock(id, actor);
        if (h.status() != Status.DRAFT && h.status() != Status.PENDING_APPROVAL) {
            throw MedixException.conflict("priceChange.badStatus", h.status().name());
        }
        setStatus(id, Status.CANCELLED, actor.employeeId(), reason.strip());
        audit.record(AuditEntry.of("priceChange.cancel", "price_change", id).withReason(reason.strip()));
    }

    /** Ommaviy ustama (SPEC 6): asos narxga foiz va yaxlitlash. Hech narsa yozilmaydi — natija NO qatorlariga qo'yiladi. */
    @Transactional(readOnly = true)
    List<MarkupLine> markup(Actor actor, MarkupRequest r) {
        branchCode(actor, r.branchId());
        if (r.rounding() != 0 && r.rounding() != 100 && r.rounding() != 500 && r.rounding() != 1000) {
            throw MedixException.badRequest("priceChange.rounding");
        }
        long baseType = jdbc.sql("SELECT id FROM price_type WHERE base").query(Long.class).single();
        checkPriceType(r.priceTypeId());
        Map<String, Money> current = currentPrices(r.branchId(), r.productIds(), today());
        record Prod(long id, String code, String name) {}
        List<Prod> prods = jdbc.sql("SELECT id, code, name FROM product WHERE id IN (:ids) ORDER BY lower(name)")
                .param("ids", r.productIds())
                .query(Prod.class)
                .list();
        List<MarkupLine> out = new ArrayList<>();
        for (Prod p : prods) {
            Money old = current.get(p.id() + ":" + r.priceTypeId());
            Money base = r.base() == BaseKind.BASE_PRICE ? current.get(p.id() + ":" + baseType) : old;
            Money next = base == null ? null : PriceMath.markup(base, r.percent(), r.rounding());
            out.add(new MarkupLine(p.id(), p.code(), p.name(), str(base), str(old), str(next)));
        }
        return out;
    }

    // ===== Ichki =====

    private record Head(long id, String number, long branchId, Status status, LocalDate effectiveFrom) {}

    private Head lock(long id, Actor actor) {
        return jdbc.sql("SELECT id, number, branch_id, status, effective_from FROM price_change WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        Status.valueOf(rs.getString("status")), rs.getDate("effective_from").toLocalDate()))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static void requireStatus(Head h, Status expected) {
        if (h.status() != expected) {
            throw MedixException.conflict(expected == Status.DRAFT ? "priceChange.notDraft" : "priceChange.badStatus", h.status().name());
        }
    }

    private void setStatus(long id, Status status, Long decidedBy, String reason) {
        jdbc.sql("""
                UPDATE price_change SET status = :s, decided_by = CAST(:by AS BIGINT),
                       decided_at = CASE WHEN CAST(:by AS BIGINT) IS NULL THEN NULL ELSE now() END,
                       decision_reason = :r, updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("s", status.name())
                .param("by", decidedBy)
                .param("r", reason)
                .param("id", id)
                .update();
    }

    /** Narxlarni yozish. O'tib ketgan sana bo'lsa — bugundan (tarixdagi hujjatlar narxi o'zgarmasin). */
    private void apply(Head h) {
        LocalDate from = h.effectiveFrom().isBefore(today()) ? today() : h.effectiveFrom();
        jdbc.sql("""
                INSERT INTO price (product_id, price_type_id, branch_id, effective_from, amount, price_change_id)
                SELECT product_id, price_type_id, :b, :d, new_price, :id FROM price_change_line WHERE price_change_id = :id""")
                .param("b", h.branchId())
                .param("d", Date.valueOf(from))
                .param("id", h.id())
                .update();
    }

    /** TODO(4–5-bosqich): partiyalar tannarxi paydo bo'lganda — yangi narx < tannarx qatorlari. Hozircha tannarx yo'q. */
    private boolean belowCost(long priceChangeId) {
        return false;
    }

    private int lineCount(long id) {
        return jdbc.sql("SELECT count(*) FROM price_change_line WHERE price_change_id = :id").param("id", id).query(Integer.class).single();
    }

    private void insertLines(long docId, long branchId, LocalDate at, List<LineRequest> lines) {
        Set<String> seen = new HashSet<>();
        List<Long> productIds = lines.stream().map(LineRequest::productId).distinct().toList();
        Map<Long, String> products = new HashMap<>();
        jdbc.sql("SELECT id, code FROM product WHERE id IN (:ids) AND active")
                .param("ids", productIds)
                .query((rs, n) -> products.put(rs.getLong("id"), rs.getString("code")))
                .list();
        Map<String, Money> current = currentPrices(branchId, productIds, at);
        for (LineRequest l : lines) {
            if (!products.containsKey(l.productId())) {
                throw MedixException.badRequest("priceChange.productUnknown", l.productId());
            }
            checkPriceType(l.priceTypeId());
            if (!seen.add(l.productId() + ":" + l.priceTypeId())) {
                throw MedixException.badRequest("priceChange.duplicateLine", products.get(l.productId()));
            }
            Money old = current.get(l.productId() + ":" + l.priceTypeId());
            jdbc.sql("""
                    INSERT INTO price_change_line (price_change_id, product_id, price_type_id, old_price, new_price)
                    VALUES (:doc, :p, :t, :old, :new)""")
                    .param("doc", docId)
                    .param("p", l.productId())
                    .param("t", l.priceTypeId())
                    .param("old", old == null ? null : old.amount())
                    .param("new", Money.of(l.newPrice()).amount())
                    .update();
        }
    }

    private void checkPriceType(long id) {
        boolean ok = jdbc.sql("SELECT EXISTS (SELECT 1 FROM price_type WHERE id = :id AND active)").param("id", id).query(Boolean.class).single();
        if (!ok) {
            throw MedixException.badRequest("priceChange.priceTypeUnknown");
        }
    }

    private String branchCode(Actor actor, long branchId) {
        return jdbc.sql("SELECT code FROM branch WHERE id = :b AND active")
                .param("b", branchId)
                .query(String.class)
                .optional()
                .filter(c -> actor.canAccessBranch(branchId))
                .orElseThrow(() -> MedixException.badRequest("employee.branchUnknown"));
    }

    private static String str(Money m) {
        return m == null ? null : m.toString();
    }

    private static java.time.Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
