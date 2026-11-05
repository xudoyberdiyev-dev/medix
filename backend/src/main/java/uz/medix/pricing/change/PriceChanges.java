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
import uz.medix.inventory.BatchCosts;
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
import uz.medix.pricing.change.PriceChangeModels.ReceiptBatch;
import uz.medix.pricing.change.PriceChangeModels.ReceiptBatches;
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
 * (inventory {@link BatchCosts}) keladi — {@link #belowCost}.
 */
@Service
class PriceChanges {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final PinVerifier pins;
    private final Clock clock;
    private final BatchCosts costs;

    PriceChanges(JdbcClient jdbc, AuditLog audit, DocumentSequenceService numbers, PinVerifier pins, Clock clock, BatchCosts costs) {
        this.costs = costs;
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
                       e.full_name AS created_by, c.created_at, c.decided_at, r.number AS receipt_number
                FROM price_change c JOIN employee e ON e.id = c.created_by LEFT JOIN receipt r ON r.id = c.receipt_id""" + where + " ORDER BY c.created_at DESC, c.id DESC LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query((rs, n) -> new PriceChangeSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        Status.valueOf(rs.getString("status")), rs.getDate("effective_from").toLocalDate(), rs.getInt("lines"),
                        rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(),
                        Optional.ofNullable(rs.getTimestamp("decided_at")).map(Timestamp::toInstant).orElse(null), rs.getString("receipt_number")))
                .list();
        return new PriceChangePage(items, total, page, size);
    }

    @Transactional(readOnly = true)
    Optional<PriceChangeDetail> find(long id, Actor actor) {
        record HeadRow(long id, String number, long branchId, String status, Date effectiveFrom, String note, String createdBy,
                Timestamp createdAt, Timestamp submittedAt, String decidedBy, Timestamp decidedAt, String decisionReason, Long receiptId,
                String receiptNumber) {}
        Optional<HeadRow> head = jdbc.sql("""
                SELECT c.id, c.number, c.branch_id, c.status, c.effective_from, c.note, cb.full_name AS created_by, c.created_at,
                       c.submitted_at, db.full_name AS decided_by, c.decided_at, c.decision_reason, c.receipt_id, r.number AS receipt_number
                FROM price_change c JOIN employee cb ON cb.id = c.created_by LEFT JOIN employee db ON db.id = c.decided_by
                     LEFT JOIN receipt r ON r.id = c.receipt_id
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
                SELECT l.id, l.product_id, p.code, p.name, l.price_type_id, t.name AS price_type, l.old_price, l.new_price,
                       l.batch_id, b.number AS batch_number, b.expiry_date
                FROM price_change_line l JOIN product p ON p.id = l.product_id JOIN price_type t ON t.id = l.price_type_id
                     LEFT JOIN batch b ON b.id = l.batch_id
                WHERE l.price_change_id = :id ORDER BY lower(p.name), b.expiry_date NULLS FIRST, l.batch_id NULLS FIRST, t.sort_order""")
                .param("id", id)
                .query((rs, n) -> {
                    Money oldP = Optional.ofNullable(rs.getBigDecimal("old_price")).map(Money::new).orElse(null);
                    Money newP = new Money(rs.getBigDecimal("new_price"));
                    return new Line(rs.getLong("id"), rs.getLong("product_id"), rs.getString("code"), rs.getString("name"),
                            rs.getLong("price_type_id"), rs.getString("price_type"), oldP == null ? null : oldP.toString(), newP.toString(),
                            PriceMath.changePercent(oldP, newP).map(BigDecimal::toPlainString).orElse(null), PriceMath.bigChange(oldP, newP),
                            rs.getObject("batch_id", Long.class), rs.getString("batch_number"),
                            Optional.ofNullable(rs.getDate("expiry_date")).map(Date::toLocalDate).orElse(null));
                })
                .list();
        int big = (int) lines.stream().filter(Line::bigChange).count();
        return Optional.of(new PriceChangeDetail(h.id(), h.number(), h.branchId(), Status.valueOf(h.status()), h.effectiveFrom().toLocalDate(),
                h.note(), h.createdBy(), h.createdAt().toInstant(), instant(h.submittedAt()), h.decidedBy(), instant(h.decidedAt()),
                h.decisionReason(), big, lines, h.receiptId(), h.receiptNumber()));
    }

    // ===== NO: yozish =====

    @Transactional
    long create(Actor actor, PriceChangeRequest r) {
        String branchCode = branchCode(actor, r.branchId());
        if (r.effectiveFrom().isBefore(today())) {
            throw MedixException.badRequest("priceChange.pastDate");
        }
        checkReceipt(r.branchId(), r.receiptId());
        String number = numbers.next(DocumentPrefix.NO, branchCode).toString();
        long id = jdbc.sql("""
                INSERT INTO price_change (number, branch_id, effective_from, note, created_by, receipt_id)
                VALUES (:n, :b, :d, :note, :by, :rc) RETURNING id""")
                .param("n", number)
                .param("b", r.branchId())
                .param("d", Date.valueOf(r.effectiveFrom()))
                .param("note", blankToNull(r.note()))
                .param("by", actor.employeeId())
                .param("rc", r.receiptId())
                .query(Long.class)
                .single();
        insertLines(id, r.branchId(), r.effectiveFrom(), r.lines(), r.receiptId());
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
        checkReceipt(r.branchId(), r.receiptId());
        jdbc.sql("""
                UPDATE price_change SET branch_id = :b, effective_from = :d, note = :note, receipt_id = :rc, updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("rc", r.receiptId())
                .param("b", r.branchId())
                .param("d", Date.valueOf(r.effectiveFrom()))
                .param("note", blankToNull(r.note()))
                .param("id", id)
                .update();
        jdbc.sql("DELETE FROM price_change_line WHERE price_change_id = :id").param("id", id).update();
        insertLines(id, r.branchId(), r.effectiveFrom(), r.lines(), r.receiptId());
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
    List<MarkupLine> markup(Actor actor, MarkupRequest r, boolean showCost) {
        branchCode(actor, r.branchId());
        if (r.rounding() != 0 && r.rounding() != 100 && r.rounding() != 500 && r.rounding() != 1000) {
            throw MedixException.badRequest("priceChange.rounding");
        }
        long baseType = jdbc.sql("SELECT id FROM price_type WHERE base").query(Long.class).single();
        checkPriceType(r.priceTypeId());
        Map<String, Money> current = currentPrices(r.branchId(), r.productIds(), today());
        Map<Long, Money> receiptCosts = switch (r.base()) {
            case AVG_RECEIPT -> costs.averageCost(r.branchId(), r.productIds());
            case LAST_RECEIPT -> costs.lastReceiptCost(r.branchId(), r.productIds());
            default -> Map.of();
        };
        record Prod(long id, String code, String name) {}
        List<Prod> prods = jdbc.sql("SELECT id, code, name FROM product WHERE id IN (:ids) ORDER BY lower(name)")
                .param("ids", r.productIds())
                .query(Prod.class)
                .list();
        List<MarkupLine> out = new ArrayList<>();
        for (Prod p : prods) {
            Money old = current.get(p.id() + ":" + r.priceTypeId());
            Money base = switch (r.base()) {
                case BASE_PRICE -> current.get(p.id() + ":" + baseType);
                case CURRENT_SAME_TYPE -> old;
                case AVG_RECEIPT, LAST_RECEIPT -> receiptCosts.get(p.id());
            };
            Money next = base == null ? null : PriceMath.markup(base, r.percent(), r.rounding());
            boolean costBased = r.base() == BaseKind.AVG_RECEIPT || r.base() == BaseKind.LAST_RECEIPT;
            out.add(new MarkupLine(p.id(), p.code(), p.name(), costBased && !showCost ? null : str(base), str(old), str(next)));
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
                SELECT product_id, price_type_id, :b, :d, new_price, :id FROM price_change_line WHERE price_change_id = :id AND batch_id IS NULL""")
                .param("b", h.branchId())
                .param("d", Date.valueOf(from))
                .param("id", h.id())
                .update();
        // «Kirim bo'yicha» — partiya narxlari (SPEC 6)
        jdbc.sql("""
                INSERT INTO batch_price (batch_id, price_type_id, branch_id, effective_from, amount, price_change_id)
                SELECT batch_id, price_type_id, :b, :d, new_price, :id FROM price_change_line WHERE price_change_id = :id AND batch_id IS NOT NULL""")
                .param("b", h.branchId())
                .param("d", Date.valueOf(from))
                .param("id", h.id())
                .update();
    }

    /** Tannarxdan past: yangi narx filialdagi qoldig'i bor partiyalarning eng yuqori tannarxidan kichik (SPEC 6). */
    private boolean belowCost(long priceChangeId) {
        record L(long productId, BigDecimal newPrice, BigDecimal batchCost) {}
        long branch = jdbc.sql("SELECT branch_id FROM price_change WHERE id = :id").param("id", priceChangeId).query(Long.class).single();
        List<L> lines = jdbc.sql("""
                SELECT l.product_id, l.new_price, b.cost AS batch_cost FROM price_change_line l LEFT JOIN batch b ON b.id = l.batch_id
                WHERE l.price_change_id = :id""")
                .param("id", priceChangeId)
                .query(L.class)
                .list();
        // Partiya qatori — o'sha partiya tannarxi bilan; mahsulot qatori — qoldig'i bor partiyalarning eng yuqori tannarxi bilan.
        if (lines.stream().anyMatch(l -> l.batchCost() != null && l.newPrice().compareTo(l.batchCost()) < 0)) {
            return true;
        }
        List<L> plain = lines.stream().filter(l -> l.batchCost() == null).toList();
        Map<Long, Money> max = costs.maxCost(branch, plain.stream().map(L::productId).distinct().toList());
        return plain.stream().anyMatch(l -> max.containsKey(l.productId()) && new Money(l.newPrice()).compareTo(max.get(l.productId())) < 0);
    }

    private int lineCount(long id) {
        return jdbc.sql("SELECT count(*) FROM price_change_line WHERE price_change_id = :id").param("id", id).query(Integer.class).single();
    }

    private void insertLines(long docId, long branchId, LocalDate at, List<LineRequest> lines, Long receiptId) {
        Set<String> seen = new HashSet<>();
        // «Kirim bo'yicha»: partiya → mahsulot (faqat shu kirim partiyalari); amaldagi partiya narxlari — eski narx uchun.
        Map<Long, Long> receiptBatches = receiptId == null ? Map.of() : batchProducts(receiptId);
        Map<String, Money> currentBatch = receiptId == null ? Map.of() : currentBatchPrices(branchId, receiptBatches.keySet(), at);
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
            if (receiptId == null && l.batchId() != null) {
                throw MedixException.badRequest("priceChange.batchWithoutReceipt");
            }
            if (receiptId != null && (l.batchId() == null || !l.productId().equals(receiptBatches.get(l.batchId())))) {
                throw MedixException.badRequest("priceChange.batchNotInReceipt", products.get(l.productId()));
            }
            if (!seen.add(l.productId() + ":" + l.priceTypeId() + ":" + l.batchId())) {
                throw MedixException.badRequest("priceChange.duplicateLine", products.get(l.productId()));
            }
            Money old = Optional.ofNullable(l.batchId() == null ? null : currentBatch.get(l.batchId() + ":" + l.priceTypeId()))
                    .orElse(current.get(l.productId() + ":" + l.priceTypeId()));
            jdbc.sql("""
                    INSERT INTO price_change_line (price_change_id, product_id, price_type_id, old_price, new_price, batch_id)
                    VALUES (:doc, :p, :t, :old, :new, :batch)""")
                    .param("batch", l.batchId())
                    .param("doc", docId)
                    .param("p", l.productId())
                    .param("t", l.priceTypeId())
                    .param("old", old == null ? null : old.amount())
                    .param("new", Money.of(l.newPrice()).amount())
                    .update();
        }
    }

    // ===== «Kirim bo'yicha» rejimi =====

    /** Kirim faqat o'tkazilgan (POSTED) va shu filialniki bo'lishi kerak (SPEC 6). */
    private void checkReceipt(long branchId, Long receiptId) {
        if (receiptId == null) {
            return;
        }
        String st = jdbc.sql("SELECT status FROM receipt WHERE id = :r AND branch_id = :b").param("r", receiptId).param("b", branchId)
                .query(String.class).optional().orElseThrow(() -> MedixException.badRequest("priceChange.receiptUnknown"));
        if (!"POSTED".equals(st)) {
            throw MedixException.badRequest("priceChange.receiptNotPosted");
        }
    }

    /** Kirim partiyalari: partiya → mahsulot. */
    private Map<Long, Long> batchProducts(long receiptId) {
        Map<Long, Long> m = new HashMap<>();
        jdbc.sql("SELECT id, product_id FROM batch WHERE source_type = 'KR' AND source_id = :r")
                .param("r", receiptId)
                .query((rs, n) -> m.put(rs.getLong("id"), rs.getLong("product_id")))
                .list();
        return m;
    }

    /** (partiya, tur) → amaldagi partiya narxi. */
    private Map<String, Money> currentBatchPrices(long branchId, java.util.Collection<Long> batchIds, LocalDate at) {
        Map<String, Money> m = new HashMap<>();
        if (batchIds.isEmpty()) {
            return m;
        }
        jdbc.sql("""
                SELECT DISTINCT ON (batch_id, price_type_id) batch_id, price_type_id, amount
                FROM batch_price WHERE branch_id = :b AND batch_id IN (:ids) AND effective_from <= :at
                ORDER BY batch_id, price_type_id, effective_from DESC, id DESC""")
                .param("b", branchId)
                .param("ids", batchIds)
                .param("at", Date.valueOf(at))
                .query((rs, n) -> m.put(rs.getLong("batch_id") + ":" + rs.getLong("price_type_id"), new Money(rs.getBigDecimal("amount"))))
                .list();
        return m;
    }

    /** O'tkazilgan kirim partiyalari va amaldagi narxlari — «Kirim bo'yicha» NO uchun. Tannarx — faqat {@code showCost} bilan. */
    @Transactional(readOnly = true)
    ReceiptBatches receiptBatches(Actor actor, long receiptId, boolean showCost) {
        record RHead(long id, String number, long branchId, String status, String supplier, Date receiptDate) {}
        RHead h = jdbc.sql("""
                SELECT r.id, r.number, r.branch_id, r.status, c.name AS supplier, r.receipt_date
                FROM receipt r JOIN counterparty c ON c.id = r.supplier_id WHERE r.id = :r""")
                .param("r", receiptId)
                .query(RHead.class)
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (!"POSTED".equals(h.status())) {
            throw MedixException.badRequest("priceChange.receiptNotPosted");
        }
        record Row(long batchId, long productId, String code, String name, String batchNumber, Date expiryDate, boolean bonus, int qty,
                BigDecimal cost) {}
        List<Row> rows = jdbc.sql("""
                SELECT b.id AS batch_id, b.product_id, p.code, p.name, b.number AS batch_number, b.expiry_date, b.bonus,
                       coalesce((SELECT sum(m.qty) FROM stock_move m WHERE m.batch_id = b.id AND m.doc_type = 'KR' AND m.qty > 0), 0) AS qty,
                       b.cost
                FROM batch b JOIN product p ON p.id = b.product_id
                WHERE b.source_type = 'KR' AND b.source_id = :r ORDER BY lower(p.name), b.expiry_date, b.id""")
                .param("r", receiptId)
                .query(Row.class)
                .list();
        LocalDate today = today();
        Map<String, Money> bp = currentBatchPrices(h.branchId(), rows.stream().map(Row::batchId).toList(), today);
        Map<String, Money> pp = currentPrices(h.branchId(), rows.stream().map(Row::productId).distinct().toList(), today);
        List<ReceiptBatch> items = rows.stream().map(r -> {
            Map<String, String> batchPrices = new java.util.TreeMap<>();
            bp.forEach((k, v) -> {
                if (k.startsWith(r.batchId() + ":")) {
                    batchPrices.put(k.substring(k.indexOf(':') + 1), v.toString());
                }
            });
            Map<String, String> productPrices = new java.util.TreeMap<>();
            pp.forEach((k, v) -> {
                if (k.startsWith(r.productId() + ":")) {
                    productPrices.put(k.substring(k.indexOf(':') + 1), v.toString());
                }
            });
            return new ReceiptBatch(r.batchId(), r.productId(), r.code(), r.name(), r.batchNumber(), r.expiryDate().toLocalDate(), r.bonus(),
                    r.qty(), showCost ? new Money(r.cost()).toString() : null, batchPrices, productPrices);
        }).toList();
        return new ReceiptBatches(h.id(), h.number(), h.branchId(), h.supplier(), h.receiptDate().toLocalDate(), items);
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
