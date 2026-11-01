package uz.medix.inventory.opening;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.inventory.ZoneType;
import uz.medix.inventory.opening.OpeningModels.Line;
import uz.medix.inventory.opening.OpeningModels.LineRequest;
import uz.medix.inventory.opening.OpeningModels.OpeningDetail;
import uz.medix.inventory.opening.OpeningModels.OpeningPage;
import uz.medix.inventory.opening.OpeningModels.OpeningRequest;
import uz.medix.inventory.opening.OpeningModels.OpeningSummary;
import uz.medix.inventory.opening.OpeningModels.Source;
import uz.medix.inventory.opening.OpeningModels.Status;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * BQ — boshlang'ich qoldiq (tovar). Qoralama → O'tkazildi (qoldiqqa kiradi) → [Bekor qilingan]. O'tkazish — bitta tranzaksiya:
 * partiyalar + jurnal + qoldiq + hujjat holati + audit. O'tkazilgan BQ ni faqat Direktor bekor qiladi — sababi bilan va
 * partiyalaridan hech narsa sotilmagan / ko'chirilmagan bo'lsa (SPEC 5.1-4 dagi kirim qoidasiga o'xshash).
 */
@Service
class OpeningBalances {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    static final String DOC_TYPE = "BQ";

    private final JdbcClient jdbc;
    private final StockLedger ledger;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final Clock clock;

    OpeningBalances(JdbcClient jdbc, StockLedger ledger, AuditLog audit, DocumentSequenceService numbers, Clock clock) {
        this.jdbc = jdbc;
        this.ledger = ledger;
        this.audit = audit;
        this.numbers = numbers;
        this.clock = clock;
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(TASHKENT));
    }

    // ===== O'qish =====

    @Transactional(readOnly = true)
    OpeningPage list(Actor actor, Long branchId, Status status, int page, int size, boolean showCost) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new HashMap<>();
        if (!actor.allBranches()) {
            where.append(" AND o.branch_id = :own");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        if (branchId != null) {
            where.append(" AND o.branch_id = :b");
            params.put("b", branchId);
        }
        if (status != null) {
            where.append(" AND o.status = :s");
            params.put("s", status.name());
        }
        long total = jdbc.sql("SELECT count(*) FROM opening_balance o" + where).params(params).query(Long.class).single();
        List<OpeningSummary> items = jdbc.sql("""
                SELECT o.id, o.number, o.branch_id, o.warehouse_id, w.name AS warehouse, o.cutoff_date, o.status, o.source,
                       coalesce(t.lines, 0) AS lines, coalesce(t.qty, 0) AS qty, coalesce(t.cost, 0) AS cost,
                       e.full_name AS created_by, o.created_at, o.posted_at
                FROM opening_balance o
                JOIN warehouse w ON w.id = o.warehouse_id
                JOIN employee e ON e.id = o.created_by
                LEFT JOIN (SELECT opening_id, count(*) AS lines, sum(qty) AS qty, sum(cost * qty) AS cost
                           FROM opening_balance_line GROUP BY opening_id) t ON t.opening_id = o.id""" + where
                        + " ORDER BY o.created_at DESC, o.id DESC LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query((rs, n) -> new OpeningSummary(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        rs.getLong("warehouse_id"), rs.getString("warehouse"), rs.getDate("cutoff_date").toLocalDate(),
                        Status.valueOf(rs.getString("status")), Source.valueOf(rs.getString("source")), rs.getInt("lines"),
                        rs.getLong("qty"), showCost ? new Money(rs.getBigDecimal("cost")).toString() : null,
                        rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(), instant(rs.getTimestamp("posted_at"))))
                .list();
        return new OpeningPage(items, total, page, size);
    }

    @Transactional(readOnly = true)
    Optional<OpeningDetail> find(long id, Actor actor, boolean showCost) {
        record HeadRow(long id, String number, long branchId, long warehouseId, String warehouse, Date cutoffDate, String status,
                String source, String fileName, String note, String createdBy, Timestamp createdAt, String postedBy, Timestamp postedAt,
                String cancelledBy, Timestamp cancelledAt, String cancelReason) {}
        Optional<HeadRow> head = jdbc.sql("""
                SELECT o.id, o.number, o.branch_id, o.warehouse_id, w.name AS warehouse, o.cutoff_date, o.status, o.source, o.file_name,
                       o.note, cb.full_name AS created_by, o.created_at, pb.full_name AS posted_by, o.posted_at,
                       xb.full_name AS cancelled_by, o.cancelled_at, o.cancel_reason
                FROM opening_balance o
                JOIN warehouse w ON w.id = o.warehouse_id
                JOIN employee cb ON cb.id = o.created_by
                LEFT JOIN employee pb ON pb.id = o.posted_by
                LEFT JOIN employee xb ON xb.id = o.cancelled_by
                WHERE o.id = :id""")
                .param("id", id)
                .query(HeadRow.class)
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        HeadRow h = head.get();
        LocalDate cutoff = h.cutoffDate().toLocalDate();
        Money[] totalCost = {Money.ZERO};
        long[] totalQty = {0};
        List<Line> lines = jdbc.sql("""
                SELECT l.id, l.line_no, l.product_id, p.code, p.name, l.zone_id, z.name AS zone, z.type, l.batch_number, l.produced_on,
                       l.expiry_date, l.cost, l.bonus, l.qty, l.batch_id
                FROM opening_balance_line l JOIN product p ON p.id = l.product_id JOIN zone z ON z.id = l.zone_id
                WHERE l.opening_id = :id ORDER BY l.line_no""")
                .param("id", id)
                .query((rs, n) -> {
                    Money cost = new Money(rs.getBigDecimal("cost"));
                    int qty = rs.getInt("qty");
                    totalCost[0] = totalCost[0].plus(cost.times(qty));
                    totalQty[0] += qty;
                    LocalDate expiry = rs.getDate("expiry_date").toLocalDate();
                    Date produced = rs.getDate("produced_on");
                    long batchId = rs.getLong("batch_id");
                    Long batch = rs.wasNull() ? null : batchId;
                    return new Line(rs.getLong("id"), rs.getInt("line_no"), rs.getLong("product_id"), rs.getString("code"),
                            rs.getString("name"), rs.getLong("zone_id"), rs.getString("zone"), ZoneType.valueOf(rs.getString("type")),
                            rs.getString("batch_number"), produced == null ? null : produced.toLocalDate(), expiry,
                            showCost ? cost.toString() : null, rs.getBoolean("bonus"), qty, batch, expiry.isBefore(cutoff));
                })
                .list();
        int expired = (int) lines.stream().filter(Line::expired).count();
        return Optional.of(new OpeningDetail(h.id(), h.number(), h.branchId(), h.warehouseId(), h.warehouse(), cutoff,
                Status.valueOf(h.status()), Source.valueOf(h.source()), h.fileName(), h.note(), h.createdBy(), h.createdAt().toInstant(),
                h.postedBy(), instant(h.postedAt()), h.cancelledBy(), instant(h.cancelledAt()), h.cancelReason(), totalQty[0],
                showCost ? totalCost[0].toString() : null, expired, lines));
    }

    // ===== Yozish =====

    @Transactional
    long create(Actor actor, OpeningRequest r) {
        String branchCode = branchCode(actor, r.branchId());
        checkWarehouse(r.branchId(), r.warehouseId());
        checkCutoff(r.cutoffDate());
        String number = numbers.next(DocumentPrefix.BQ, branchCode).toString();
        long id = jdbc.sql("""
                INSERT INTO opening_balance (number, branch_id, warehouse_id, cutoff_date, note, created_by)
                VALUES (:n, :b, :w, :d, :note, :by) RETURNING id""")
                .param("n", number)
                .param("b", r.branchId())
                .param("w", r.warehouseId())
                .param("d", Date.valueOf(r.cutoffDate()))
                .param("note", blankToNull(r.note()))
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        insertLines(id, r.warehouseId(), r.lines());
        audit.record(AuditEntry.of("opening.create", "opening_balance", id).change(null, Map.of("number", number, "lines", r.lines().size())));
        return id;
    }

    @Transactional
    void update(Actor actor, long id, OpeningRequest r) {
        Head h = lock(id, actor);
        requireStatus(h, Status.DRAFT);
        if (h.branchId() != r.branchId()) {
            branchCode(actor, r.branchId());
        }
        checkWarehouse(r.branchId(), r.warehouseId());
        checkCutoff(r.cutoffDate());
        jdbc.sql("""
                UPDATE opening_balance SET branch_id = :b, warehouse_id = :w, cutoff_date = :d, note = :note, updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("b", r.branchId())
                .param("w", r.warehouseId())
                .param("d", Date.valueOf(r.cutoffDate()))
                .param("note", blankToNull(r.note()))
                .param("id", id)
                .update();
        replaceLines(id, r.warehouseId(), r.lines(), null);
        audit.record(AuditEntry.of("opening.update", "opening_balance", id).change(null, Map.of("lines", r.lines().size())));
    }

    /** Import natijasida qoralama qatorlari to'liq almashtiriladi (hammasi yoki hech narsa — chaqiruvchi tekshiradi). */
    @Transactional
    void replaceFromImport(Actor actor, long id, List<LineRequest> lines, String fileName) {
        Head h = lock(id, actor);
        requireStatus(h, Status.DRAFT);
        replaceLines(id, h.warehouseId(), lines, fileName == null ? "" : fileName);
        audit.record(AuditEntry.of("opening.import", "opening_balance", id).change(null, Map.of("lines", lines.size())));
    }

    /** O'tkazish: partiyalar yaratiladi va qoldiqqa kirim yoziladi — hammasi bitta tranzaksiyada. */
    @Transactional
    void post(Actor actor, long id) {
        Head h = lock(id, actor);
        requireStatus(h, Status.DRAFT);
        checkCutoff(h.cutoffDate());
        boolean warehouseActive = jdbc.sql("SELECT active FROM warehouse WHERE id = :w").param("w", h.warehouseId()).query(Boolean.class).single();
        if (!warehouseActive) {
            throw MedixException.conflict("opening.warehouseInactive");
        }
        record LineRow(long id, int lineNo, long productId, long zoneId, String batchNumber, Date producedOn, Date expiryDate,
                java.math.BigDecimal cost, boolean bonus, int qty, boolean zoneActive, boolean productActive) {}
        List<LineRow> lines = jdbc.sql("""
                SELECT l.id, l.line_no, l.product_id, l.zone_id, l.batch_number, l.produced_on, l.expiry_date, l.cost, l.bonus, l.qty,
                       z.active AS zone_active, p.active AS product_active
                FROM opening_balance_line l JOIN zone z ON z.id = l.zone_id JOIN product p ON p.id = l.product_id
                WHERE l.opening_id = :id ORDER BY l.line_no""")
                .param("id", id)
                .query(LineRow.class)
                .list();
        if (lines.isEmpty()) {
            throw MedixException.badRequest("opening.noLines");
        }
        for (LineRow l : lines) {
            if (!l.zoneActive()) {
                throw MedixException.conflict("opening.zoneInactive", l.lineNo());
            }
            if (!l.productActive()) {
                throw MedixException.conflict("opening.productInactive", l.lineNo());
            }
        }
        // Bir partiya (mahsulot + raqam) bir necha zonada bo'lsa — bitta partiya yozuvi.
        Map<String, Long> batches = new LinkedHashMap<>();
        List<Move> moves = new ArrayList<>();
        for (LineRow l : lines) {
            String key = l.productId() + "|" + normalizeBatch(l.batchNumber()) + "|" + l.bonus();
            Long batchId = batches.get(key);
            if (batchId == null) {
                batchId = ledger.createBatch(l.productId(), l.batchNumber(), l.producedOn() == null ? null : l.producedOn().toLocalDate(),
                        l.expiryDate().toLocalDate(), new Money(l.cost()), l.bonus(), DOC_TYPE, id);
                batches.put(key, batchId);
            }
            jdbc.sql("UPDATE opening_balance_line SET batch_id = :b WHERE id = :id").param("b", batchId).param("id", l.id()).update();
            moves.add(Move.in(l.zoneId(), batchId, l.qty()));
        }
        ledger.post(new DocRef(DOC_TYPE, id, h.number()), moves);
        jdbc.sql("""
                UPDATE opening_balance SET status = 'POSTED', posted_by = :by, posted_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("opening.post", "opening_balance", id)
                .change(Map.of("status", Status.DRAFT.name()), Map.of("status", Status.POSTED.name(), "batches", batches.size(), "lines", lines.size())));
    }

    /**
     * Bekor qilish. Qoralama — yaratuvchi ruxsati bilan. O'tkazilgan — faqat Direktor (opening.cancel), sababi bilan va
     * partiyalarda boshqa harakat bo'lmasa (sotilmagan, ko'chirilmagan): qoldiqdan chiqim harakatlari yoziladi.
     */
    @Transactional
    void cancel(Actor actor, long id, String reason, boolean canCancelPosted) {
        Head h = lock(id, actor);
        String why = reason.strip();
        if (h.status() == Status.CANCELLED) {
            throw MedixException.conflict("opening.badStatus", h.status().name());
        }
        if (h.status() == Status.POSTED) {
            if (!canCancelPosted) {
                throw MedixException.forbidden("opening.cancelPostedForbidden");
            }
            boolean used = jdbc.sql("""
                    SELECT EXISTS (SELECT 1 FROM stock_move m
                                   WHERE m.batch_id IN (SELECT batch_id FROM opening_balance_line WHERE opening_id = :id)
                                     AND NOT (m.doc_type = :t AND m.doc_id = :id))""")
                    .param("id", id)
                    .param("t", DOC_TYPE)
                    .query(Boolean.class)
                    .single();
            if (used) {
                throw MedixException.conflict("opening.batchUsed");
            }
            List<Move> out = jdbc.sql("SELECT zone_id, batch_id, qty FROM opening_balance_line WHERE opening_id = :id ORDER BY line_no")
                    .param("id", id)
                    .query((rs, n) -> new Move(rs.getLong("zone_id"), rs.getLong("batch_id"), -rs.getInt("qty"), "Bekor qilindi"))
                    .list();
            ledger.post(new DocRef(DOC_TYPE, id, h.number()), out);
        }
        jdbc.sql("""
                UPDATE opening_balance SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), cancel_reason = :r,
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("r", why)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("opening.cancel", "opening_balance", id)
                .change(Map.of("status", h.status().name()), Map.of("status", Status.CANCELLED.name()))
                .withReason(why));
    }

    // ===== Ichki =====

    record Head(long id, String number, long branchId, long warehouseId, Status status, LocalDate cutoffDate) {}

    Head lock(long id, Actor actor) {
        return jdbc.sql("SELECT id, number, branch_id, warehouse_id, status, cutoff_date FROM opening_balance WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"), rs.getLong("warehouse_id"),
                        Status.valueOf(rs.getString("status")), rs.getDate("cutoff_date").toLocalDate()))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static void requireStatus(Head h, Status expected) {
        if (h.status() != expected) {
            throw MedixException.conflict(expected == Status.DRAFT ? "opening.notDraft" : "opening.badStatus", h.status().name());
        }
    }

    private void checkCutoff(LocalDate cutoff) {
        if (cutoff.isAfter(today())) {
            throw MedixException.badRequest("opening.futureDate");
        }
    }

    private void checkWarehouse(long branchId, long warehouseId) {
        boolean ok = jdbc.sql("SELECT EXISTS (SELECT 1 FROM warehouse WHERE id = :w AND branch_id = :b AND active)")
                .param("w", warehouseId)
                .param("b", branchId)
                .query(Boolean.class)
                .single();
        if (!ok) {
            throw MedixException.badRequest("opening.warehouseUnknown");
        }
    }

    private void replaceLines(long docId, long warehouseId, List<LineRequest> lines, String fileName) {
        jdbc.sql("DELETE FROM opening_balance_line WHERE opening_id = :id").param("id", docId).update();
        insertLines(docId, warehouseId, lines);
        if (fileName != null) {
            jdbc.sql("UPDATE opening_balance SET source = 'IMPORT', file_name = :f, updated_at = now(), version = version + 1 WHERE id = :id")
                    .param("f", fileName.isBlank() ? null : fileName.strip())
                    .param("id", docId)
                    .update();
        }
    }

    record ProductRef(long id, String code, String name, boolean controlled) {}

    record ZoneRef(long id, String name, ZoneType type, boolean sellable, boolean controlled) {}

    /** Ombordagi faol zonalar. */
    List<ZoneRef> zones(long warehouseId) {
        return jdbc.sql("SELECT id, name, type, sellable, controlled FROM zone WHERE warehouse_id = :w AND active ORDER BY id")
                .param("w", warehouseId)
                .query((rs, n) -> new ZoneRef(rs.getLong("id"), rs.getString("name"), ZoneType.valueOf(rs.getString("type")),
                        rs.getBoolean("sellable"), rs.getBoolean("controlled")))
                .list();
    }

    /**
     * Qatorlarni tekshirish va yozish. Xato bo'lsa — {@link MedixException} (qator raqami bilan); chaqiruvchi tranzaksiyasi
     * qaytariladi. Import ham shu tekshiruvdan o'tadi.
     */
    private void insertLines(long docId, long warehouseId, List<LineRequest> lines) {
        List<String> errors = validate(warehouseId, lines);
        if (!errors.isEmpty()) {
            throw MedixException.badRequest("opening.lineInvalid", errors.getFirst());
        }
        int no = 0;
        for (LineRequest l : lines) {
            no++;
            jdbc.sql("""
                    INSERT INTO opening_balance_line (opening_id, line_no, product_id, zone_id, batch_number, produced_on, expiry_date, cost,
                                                      bonus, qty)
                    VALUES (:doc, :no, :p, :z, :bn, :prod, :exp, :cost, :bonus, :q)""")
                    .param("doc", docId)
                    .param("no", no)
                    .param("p", l.productId())
                    .param("z", l.zoneId())
                    .param("bn", l.batchNumber().strip())
                    .param("prod", l.producedOn() == null ? null : Date.valueOf(l.producedOn()))
                    .param("exp", Date.valueOf(l.expiryDate()))
                    .param("cost", l.bonus() ? Money.ZERO.amount() : Money.of(l.cost()).amount())
                    .param("bonus", l.bonus())
                    .param("q", l.qty())
                    .update();
        }
    }

    /**
     * Qatorlar qoidalari. Qaytaradi: «N-qator: sabab» ko'rinishidagi xatolar (bo'sh — hammasi to'g'ri).
     * <ul>
     *   <li>mahsulot faol, zona shu omborning faol zonasi;</li>
     *   <li>nazoratdagi mahsulot sotuvga ochiq zonada bo'lsa — faqat Seyf (SPEC 6-8);</li>
     *   <li>ishlab chiqarilgan sana ≤ yaroqlilik;</li>
     *   <li>bir hujjatda (mahsulot, partiya, zona) takrorlanmaydi; bir partiya — bitta yaroqlilik, tannarx va bonus belgisi.</li>
     * </ul>
     */
    List<String> validate(long warehouseId, List<LineRequest> lines) {
        List<String> errors = new ArrayList<>();
        if (lines.size() > OpeningModels.MAX_LINES) {
            errors.add("qatorlar soni " + OpeningModels.MAX_LINES + " dan oshmasin");
            return errors;
        }
        Map<Long, ProductRef> products = products(lines.stream().map(LineRequest::productId).filter(Objects::nonNull).distinct().toList());
        Map<Long, ZoneRef> zones = new HashMap<>();
        zones(warehouseId).forEach(z -> zones.put(z.id(), z));
        Set<String> seen = new HashSet<>();
        Map<String, String> batchSignature = new HashMap<>();
        int no = 0;
        for (LineRequest l : lines) {
            no++;
            ProductRef p = products.get(l.productId());
            if (p == null) {
                errors.add(no + "-qator: mahsulot topilmadi yoki nofaol");
                continue;
            }
            ZoneRef z = zones.get(l.zoneId());
            if (z == null) {
                errors.add(no + "-qator: zona bu omborda yo'q yoki nofaol");
                continue;
            }
            if (p.controlled() && z.sellable() && !z.controlled()) {
                errors.add(no + "-qator: " + p.name() + " nazoratdagi — faqat Seyf zonasiga");
            }
            if (l.expiryDate() == null) {
                errors.add(no + "-qator: yaroqlilik sanasi kiritilmagan");
                continue;
            }
            if (l.producedOn() != null && l.producedOn().isAfter(l.expiryDate())) {
                errors.add(no + "-qator: ishlab chiqarilgan sana yaroqlilikdan keyin");
            }
            if (l.qty() == null || l.qty() < 1 || l.qty() > OpeningModels.MAX_QTY) {
                errors.add(no + "-qator: soni 1 dan " + OpeningModels.MAX_QTY + " gacha");
            }
            Money cost;
            try {
                cost = l.bonus() ? Money.ZERO : Money.of(l.cost());
            } catch (RuntimeException e) {
                errors.add(no + "-qator: tannarx noto'g'ri");
                continue;
            }
            if (cost.isNegative()) {
                errors.add(no + "-qator: tannarx manfiy bo'lmaydi");
            }
            String batch = normalizeBatch(l.batchNumber());
            if (batch.isEmpty()) {
                errors.add(no + "-qator: partiya raqami kiritilmagan");
                continue;
            }
            if (!seen.add(p.id() + "|" + batch + "|" + l.bonus() + "|" + z.id())) {
                errors.add(no + "-qator: " + p.code() + " / " + l.batchNumber().strip() + " / " + z.name() + " ikki marta kiritilgan");
            }
            String signature = l.expiryDate() + "|" + l.producedOn() + "|" + cost;
            String prev = batchSignature.putIfAbsent(p.id() + "|" + batch + "|" + l.bonus(), signature);
            if (prev != null && !prev.equals(signature)) {
                errors.add(no + "-qator: partiya " + l.batchNumber().strip() + " boshqa qatorda boshqa yaroqlilik / tannarx bilan");
            }
        }
        return errors;
    }

    Map<Long, ProductRef> products(List<Long> ids) {
        Map<Long, ProductRef> m = new HashMap<>();
        if (ids.isEmpty()) {
            return m;
        }
        jdbc.sql("SELECT id, code, name, controlled FROM product WHERE id IN (:ids) AND active")
                .param("ids", ids)
                .query((rs, n) -> m.put(rs.getLong("id"), new ProductRef(rs.getLong("id"), rs.getString("code"), rs.getString("name"),
                        rs.getBoolean("controlled"))))
                .list();
        return m;
    }

    static String normalizeBatch(String s) {
        return s == null ? "" : s.strip().toUpperCase(Locale.ROOT);
    }

    private String branchCode(Actor actor, long branchId) {
        return jdbc.sql("SELECT code FROM branch WHERE id = :b AND active")
                .param("b", branchId)
                .query(String.class)
                .optional()
                .filter(c -> actor.canAccessBranch(branchId))
                .orElseThrow(() -> MedixException.badRequest("employee.branchUnknown"));
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
