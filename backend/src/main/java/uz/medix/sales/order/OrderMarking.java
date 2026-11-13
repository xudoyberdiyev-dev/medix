package uz.medix.sales.order;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import uz.medix.sales.order.MarkingModels.MarkBatch;
import uz.medix.sales.order.MarkingModels.MarkCode;
import uz.medix.sales.order.MarkingModels.MarkCodePage;
import uz.medix.sales.order.MarkingModels.MarkKind;
import uz.medix.sales.order.MarkingModels.MarkLine;
import uz.medix.sales.order.MarkingModels.MarkQueueItem;
import uz.medix.sales.order.MarkingModels.MarkStatus;
import uz.medix.sales.order.MarkingModels.MarkWork;
import uz.medix.sales.order.MarkingModels.ScanResult;
import uz.medix.sales.order.OrderModels.OrderStatus;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.gs1.Gs1Code;
import uz.medix.shared.security.Actor;

/**
 * Markirovka (SPEC 5.2 №5, 5.4, 6). HAR bir buyurtma shu bosqichdan o'tadi (egasi qarori 07.11.2026, E1).
 * «Markirovkada» buyurtmani markirovkachi boshlaydi (bitta faol ish), markirovkali qatorlarning har birligini skanerlaydi,
 * markirovkasiz qatorlarni «Tasdiqlash» bilan o'tkazadi, so'ng yakunlaydi → «Hisobdan o'tkazilmoqda». Har skanerlashda tekshiruv tartibi:
 * format → takror (global) → mahsulot (GTIN) → partiya (yig'ilgan) → tur (quti/dona) → qator to'lganmi.
 *
 * <p>V1: milliy markirovka reestri bilan integratsiya yo'q (V3) — «reestrda bor va sotilmagan» o'rniga MEDIX ichidagi
 * global takror tekshiruvi (faol yoki sotilgan kod qayta qabul qilinmaydi). Tur: mahsulot birligi «dona» — D, boshqasi — Q.
 */
@Service
class OrderMarking {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final AuditLog audit;

    OrderMarking(JdbcClient jdbc, AuditLog audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    private record Head(long id, String number, long branchId, OrderStatus status, Long markerId) {}

    private Head lock(long id, Actor actor) {
        return jdbc.sql("SELECT id, number, branch_id, status, marker_id FROM sales_order WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("branch_id"),
                        OrderStatus.valueOf(rs.getString("status")), (Long) rs.getObject("marker_id")))
                .optional()
                .filter(h -> actor.canAccessBranch(h.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    /** Bekor qilish yoki «Yig'ishga qaytarish»da: buyurtmaning faol kodlari bo'shaydi (tarixda qoladi). */
    static void releaseCodes(JdbcClient jdbc, long orderId, long by, String reason) {
        releaseCodes(jdbc, orderId, null, by, reason);
    }

    /** Faqat tanlangan qatorlar kodlari (null — butun buyurtma) bekor qilinadi. */
    static void releaseCodes(JdbcClient jdbc, long orderId, java.util.Collection<Long> lines, long by, String reason) {
        if (lines != null && lines.isEmpty()) {
            return;
        }
        jdbc.sql("""
                UPDATE sales_order_mark SET status = 'RELEASED', closed_by = :by, closed_at = now(), close_reason = :r
                WHERE order_id = :o AND status = 'ACTIVE'""" + (lines == null ? "" : " AND line_id IN (:lines)"))
                .param("by", by)
                .param("r", reason)
                .param("o", orderId)
                .params(lines == null ? Map.of() : Map.of("lines", lines))
                .update();
        // Markirovkasiz qatorlar tasdig'i ham yopiladi (E1) — qayta yig'ishdan keyin yana tasdiqlanadi
        jdbc.sql("UPDATE sales_order_mark_confirm SET active = false, closed_at = now() WHERE order_id = :o AND active"
                        + (lines == null ? "" : " AND line_id IN (:lines)"))
                .param("o", orderId)
                .params(lines == null ? Map.of() : Map.of("lines", lines))
                .update();
    }

    /** Markirovkachi navbati: «Markirovkada» buyurtmalar (o'z filiali), boshlanganlari oldin. */
    @Transactional(readOnly = true)
    List<MarkQueueItem> queue(Actor actor) {
        return jdbc.sql("""
                SELECT o.id, o.number, c.name AS customer, o.branch_id, o.mark_minutes, mk.full_name AS marker, o.marker_id, o.mark_started_at,
                       o.status_changed_at, o.delivery_type, o.delivery_date, o.note, pk.full_name AS picker,
                       (SELECT s.invoice_number FROM sale s WHERE s.order_id = o.id ORDER BY s.id DESC LIMIT 1) AS invoice,
                       (SELECT coalesce(sum(l.qty) FILTER (WHERE lower(u.short_name) <> 'dona'), 0) FROM sales_order_line l
                        JOIN product p ON p.id = l.product_id JOIN unit u ON u.id = p.unit_id
                        WHERE l.order_id = o.id AND p.marked AND (o.repick_line_ids IS NULL OR l.id = ANY (o.repick_line_ids))) AS boxes,
                       (SELECT coalesce(sum(l.qty) FILTER (WHERE lower(u.short_name) = 'dona'), 0) FROM sales_order_line l
                        JOIN product p ON p.id = l.product_id JOIN unit u ON u.id = p.unit_id
                        WHERE l.order_id = o.id AND p.marked AND (o.repick_line_ids IS NULL OR l.id = ANY (o.repick_line_ids))) AS units,
                       (SELECT count(*) FROM sales_order_line l JOIN product p ON p.id = l.product_id
                        WHERE l.order_id = o.id AND p.marked AND (o.repick_line_ids IS NULL OR l.id = ANY (o.repick_line_ids))) AS lines,
                       (SELECT count(*) FROM sales_order_line l JOIN product p ON p.id = l.product_id
                        WHERE l.order_id = o.id AND NOT p.marked AND (o.repick_line_ids IS NULL OR l.id = ANY (o.repick_line_ids))) AS unmarked,
                       (SELECT coalesce(sum(l.qty), 0) FROM sales_order_line l JOIN product p ON p.id = l.product_id
                        WHERE l.order_id = o.id AND p.marked AND (o.repick_line_ids IS NULL OR l.id = ANY (o.repick_line_ids))) AS total_qty
                FROM sales_order o JOIN counterparty c ON c.id = o.customer_id LEFT JOIN employee mk ON mk.id = o.marker_id
                LEFT JOIN employee pk ON pk.id = o.picker_id
                WHERE o.status = 'MARKING'
                ORDER BY o.mark_started_at NULLS LAST, o.status_changed_at, o.id""")
                .query((rs, n) -> {
                    if (!actor.canAccessBranch(rs.getLong("branch_id"))) {
                        return null;
                    }
                    Instant started = instant(rs.getTimestamp("mark_started_at"));
                    Integer minutes = (Integer) rs.getObject("mark_minutes");
                    return new MarkQueueItem(rs.getLong("id"), rs.getString("number"), rs.getString("customer"), rs.getInt("lines"),
                            rs.getLong("total_qty"), rs.getInt("unmarked"), minutes, rs.getString("marker"), (Long) rs.getObject("marker_id"), started,
                            deadline(started, minutes), rs.getTimestamp("status_changed_at").toInstant(), rs.getLong("boxes"), rs.getLong("units"),
                            rs.getString("picker"), rs.getString("invoice"), OrderModels.DeliveryType.valueOf(rs.getString("delivery_type")),
                            rs.getObject("delivery_date", LocalDate.class), rs.getString("note"));
                })
                .list()
                .stream()
                .filter(Objects::nonNull)
                .toList();
    }

    /** Markirovkachining faol ishi (bo'lsa). */
    @Transactional(readOnly = true)
    Optional<MarkWork> mine(Actor actor) {
        return jdbc.sql("SELECT id FROM sales_order WHERE marker_id = :m AND status = 'MARKING'")
                .param("m", actor.employeeId())
                .query(Long.class)
                .optional()
                .map(id -> work(id, actor));
    }

    @Transactional(readOnly = true)
    MarkWork get(Actor actor, long id) {
        return work(id, actor);
    }

    /** «Markirovkani boshlash»: bitta faol ish (SPEC 5.2). */
    @Transactional
    MarkWork start(Actor actor, long id) {
        Head h = lock(id, actor);
        if (h.status() != OrderStatus.MARKING) {
            throw MedixException.conflict("order.badStatus", h.status().name());
        }
        if (h.markerId() != null) {
            if (h.markerId() == actor.employeeId()) {
                return work(id, actor);
            }
            throw MedixException.conflict("marking.taken");
        }
        String busy = jdbc.sql("SELECT number FROM sales_order WHERE marker_id = :m AND status = 'MARKING' LIMIT 1")
                .param("m", actor.employeeId())
                .query(String.class)
                .optional()
                .orElse(null);
        if (busy != null) {
            throw MedixException.conflict("marking.markerBusy", busy);
        }
        jdbc.sql("UPDATE sales_order SET marker_id = :m, mark_started_at = now(), updated_at = now(), version = version + 1 WHERE id = :id")
                .param("m", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("order.markStart", "sales_order", id));
        return work(id, actor);
    }

    private Head mineLocked(Actor actor, long id) {
        Head h = lock(id, actor);
        if (h.status() != OrderStatus.MARKING) {
            throw MedixException.conflict("order.badStatus", h.status().name());
        }
        if (h.markerId() == null) {
            throw MedixException.conflict("marking.notStarted");
        }
        if (h.markerId() != actor.employeeId()) {
            throw MedixException.forbidden("marking.notMarker");
        }
        return h;
    }

    private record Target(long lineId, long productId, int lineQty, MarkKind kind) {}

    private record PickedBatch(long batchId, String number, LocalDate expiry, int qty) {}

    /** Bitta kodni skanerlash: tekshiruv tartibi SPEC 6 bo'yicha; birinchi xato qaytariladi (katta qizil ekran). */
    @Transactional
    ScanResult scan(Actor actor, long id, String raw) {
        long markId = accept(actor, mineLocked(actor, id), id, raw);
        MarkWork w = work(id, actor);
        MarkCode accepted = w.codes().stream().filter(c -> c.id() == markId).findFirst().orElseThrow();
        return new ScanResult(accepted, w);
    }

    /** Bitta qatorning natijasi (Excel'dan yuklash). */
    record ImportOutcome(String code, boolean ok, String productName, String errorCode, Object[] errorArgs) {}

    /**
     * Tayyor fayldagi kodlar (egasi 13.11, O5): har biri qo'lda skanerlash bilan bir xil tekshiruvdan o'tadi, ketma-ket
     * (fayl ichidagi takror va qator to'lishi ham hisobga olinadi). {@code apply=false} — oldindan ko'rish, hech narsa
     * saqlanmaydi; {@code apply=true} — mos kelganlari qabul qilinadi, qolgani qo'lda skanerlanadi.
     */
    @Transactional
    List<ImportOutcome> importCodes(Actor actor, long id, List<String> raws, boolean apply) {
        Head h = mineLocked(actor, id);
        List<ImportOutcome> out = new ArrayList<>();
        for (String raw : raws) {
            jdbc.sql("SAVEPOINT mark_import").update();
            try {
                long markId = accept(actor, h, id, raw);
                String product = jdbc.sql("""
                        SELECT p.name FROM sales_order_mark m JOIN sales_order_line l ON l.id = m.line_id
                        JOIN product p ON p.id = l.product_id WHERE m.id = :m""")
                        .param("m", markId).query(String.class).single();
                jdbc.sql("RELEASE SAVEPOINT mark_import").update();
                out.add(new ImportOutcome(raw, true, product, null, null));
            } catch (MedixException e) {
                jdbc.sql("ROLLBACK TO SAVEPOINT mark_import").update();
                out.add(new ImportOutcome(raw, false, null, e.code(), e.args()));
            }
        }
        long ok = out.stream().filter(ImportOutcome::ok).count();
        if (apply) {
            audit.record(AuditEntry.of("order.markImport", "sales_order", id)
                    .change(null, Map.of("accepted", ok, "rejected", out.size() - ok)));
        } else {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
        }
        return out;
    }

    /** Tekshiruv va yozish (skaner va fayl uchun umumiy). Qaytaradi: qabul qilingan kod id. */
    private long accept(Actor actor, Head h, long id, String raw) {
        Gs1Code code = switch (Gs1Code.parse(raw)) {
            case Gs1Code.Ok ok -> ok.code();
            case Gs1Code.Error e -> throw MedixException.badRequest(e.key());
        };
        // Takror — barcha buyurtmalar bo'yicha
        Optional<String> usedIn = jdbc.sql("""
                SELECT o.number FROM sales_order_mark m JOIN sales_order o ON o.id = m.order_id
                WHERE m.gtin = :g AND m.serial = :s AND m.status IN ('ACTIVE', 'SOLD') LIMIT 1""")
                .param("g", code.gtin())
                .param("s", code.serial())
                .query(String.class)
                .optional();
        if (usedIn.isPresent()) {
            throw usedIn.get().equals(h.number())
                    ? MedixException.conflict("marking.duplicateHere")
                    : MedixException.conflict("marking.duplicate", usedIn.get());
        }
        // Mahsulot (GTIN): buyurtmaning markirovkali qatorlaridan shtrix-kodi mos keladigani
        Target t = null;
        for (Target candidate : jdbc.sql("""
                SELECT l.id, l.product_id, l.qty, u.short_name, b.barcode FROM sales_order_line l
                JOIN product p ON p.id = l.product_id JOIN unit u ON u.id = p.unit_id
                JOIN product_barcode b ON b.product_id = p.id
                WHERE l.order_id = :o AND p.marked""")
                .param("o", id)
                .query((rs, n) -> {
                    Target row = new Target(rs.getLong("id"), rs.getLong("product_id"), rs.getInt("qty"), kindOf(rs.getString("short_name")));
                    return Gs1Code.gtin14(rs.getString("barcode")).filter(code.gtin()::equals).map(g -> row).orElse(null);
                })
                .list()) {
            if (candidate != null) {
                t = candidate;
                break;
            }
        }
        if (t == null) {
            throw MedixException.conflict("marking.productMismatch");
        }
        // Partiya: yig'uvchi tasdiqlagan (sof yig'ilgan) partiyalardan biri. Bonus partiya «-B» qo'shimchasisiz ham mos.
        List<PickedBatch> picked = pickedBatches(id, t.lineId());
        PickedBatch batch = picked.stream().filter(b -> sameBatch(b.number(), code.batch())).findFirst().orElse(null);
        if (batch == null) {
            throw MedixException.conflict("marking.batchMismatch", String.join(", ", picked.stream().map(PickedBatch::number).toList()));
        }
        MarkKind kind = code.kind() == Gs1Code.Kind.BOX ? MarkKind.BOX : MarkKind.UNIT;
        if (kind != t.kind()) {
            throw MedixException.conflict(t.kind() == MarkKind.BOX ? "marking.kindNeedBox" : "marking.kindNeedUnit");
        }
        int scannedBatch = jdbc.sql("SELECT count(*) FROM sales_order_mark WHERE order_id = :o AND line_id = :l AND batch_id = :b AND status = 'ACTIVE'")
                .param("o", id).param("l", t.lineId()).param("b", batch.batchId()).query(Integer.class).single();
        if (scannedBatch >= batch.qty()) {
            throw MedixException.conflict("marking.lineFull");
        }
        long markId;
        try {
            markId = jdbc.sql("""
                    INSERT INTO sales_order_mark (order_id, line_id, batch_id, gtin, serial, batch_no, expiry_date, kind, raw, scanned_by)
                    VALUES (:o, :l, :b, :g, :s, :bn, :e, :k, :raw, :by) RETURNING id""")
                    .param("o", id)
                    .param("l", t.lineId())
                    .param("b", batch.batchId())
                    .param("g", code.gtin())
                    .param("s", code.serial())
                    .param("bn", code.batch())
                    .param("e", code.expiry() == null ? null : Date.valueOf(code.expiry()))
                    .param("k", kind == MarkKind.BOX ? "Q" : "D")
                    .param("raw", code.humanReadable())
                    .param("by", actor.employeeId())
                    .query(Long.class)
                    .single();
        } catch (DuplicateKeyException e) {
            // Parallel skanerlash: boshqa buyurtmada shu daqiqada qabul qilindi
            throw MedixException.conflict("marking.duplicate", "—");
        }
        return markId;
    }

    /** Qabul qilingan kodni yakunlashdan oldin sabab bilan olib tashlash (SPEC 6). */
    @Transactional
    MarkWork remove(Actor actor, long id, long markId, String reason) {
        mineLocked(actor, id);
        int n = jdbc.sql("""
                UPDATE sales_order_mark SET status = 'REMOVED', closed_by = :by, closed_at = now(), close_reason = :r
                WHERE id = :m AND order_id = :o AND status = 'ACTIVE'""")
                .param("by", actor.employeeId())
                .param("r", reason.strip())
                .param("m", markId)
                .param("o", id)
                .update();
        if (n == 0) {
            throw MedixException.notFound("marking.codeUnknown");
        }
        audit.record(AuditEntry.of("order.markRemove", "sales_order", id).change(null, Map.of("mark", markId)).withReason(reason.strip()));
        return work(id, actor);
    }

    /**
     * «Tasdiqlash» (E1): markirovkasiz qatorlarni Markirovkachi tasdiqlaydi (bittalab yoki hammasi). Faqat shu buyurtmaning
     * markirovkasiz qatorlari (qayta yig'ishda — faqat qaytarilgan qatorlar); takror tasdiq — o'zgarishsiz.
     */
    @Transactional
    MarkWork confirm(Actor actor, long id, List<Long> lineIds) {
        mineLocked(actor, id);
        MarkWork w = work(id, actor);
        java.util.Set<Long> allowed = new java.util.HashSet<>();
        for (MarkingModels.UnmarkedLine l : w.unmarkedLines()) {
            allowed.add(l.lineId());
        }
        java.util.Set<Long> wanted = new java.util.LinkedHashSet<>(lineIds);
        if (!allowed.containsAll(wanted)) {
            throw MedixException.badRequest("marking.confirmMarkedLine");
        }
        int added = 0;
        for (long lineId : wanted) {
            added += jdbc.sql("""
                    INSERT INTO sales_order_mark_confirm (order_id, line_id, confirmed_by) VALUES (:o, :l, :by)
                    ON CONFLICT (line_id) WHERE active DO NOTHING""")
                    .param("o", id)
                    .param("l", lineId)
                    .param("by", actor.employeeId())
                    .update();
        }
        if (added > 0) {
            audit.record(AuditEntry.of("order.markConfirm", "sales_order", id).change(null, Map.of("lines", List.copyOf(wanted))));
        }
        return work(id, actor);
    }

    /**
     * «Yakunlash»: barcha markirovkali birliklar skanerlangan va markirovkasiz qatorlar tasdiqlangan bo'lishi shart
     * → «Hisobdan o'tkazilmoqda».
     */
    @Transactional
    void finish(Actor actor, long id) {
        mineLocked(actor, id);
        MarkWork w = work(id, actor);
        int left = w.lines().stream().mapToInt(l -> l.qty() - l.scanned()).sum();
        if (left > 0) {
            throw MedixException.conflict("marking.incomplete", left);
        }
        long unconfirmed = w.unmarkedLines().stream().filter(l -> !l.confirmed()).count();
        if (unconfirmed > 0) {
            throw MedixException.conflict("marking.unconfirmed", unconfirmed);
        }
        jdbc.sql("""
                UPDATE sales_order SET status = 'CHECKING', mark_finished_at = now(), status_changed_at = now(), updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("order.markFinish", "sales_order", id).change(Map.of("status", OrderStatus.MARKING.name()),
                Map.of("status", OrderStatus.CHECKING.name(), "codes", w.codes().size())));
    }

    /** Kodlar jurnali: o'z filiali; mine — faqat o'zim skanerlaganlar; q — GTIN, seriya, partiya yoki buyurtma raqami. */
    @Transactional(readOnly = true)
    MarkCodePage codes(Actor actor, Long orderId, boolean mine, boolean today, String q, int page, int size) {
        StringBuilder where = new StringBuilder("WHERE true");
        Map<String, Object> params = new LinkedHashMap<>();
        if (!actor.allBranches()) {
            where.append(" AND o.branch_id = :branch");
            params.put("branch", actor.branchId());
        }
        if (orderId != null) {
            where.append(" AND m.order_id = :order");
            params.put("order", orderId);
        }
        if (mine) {
            where.append(" AND m.scanned_by = :me");
            params.put("me", actor.employeeId());
        }
        if (today) {
            where.append(" AND m.scanned_at >= :from");
            params.put("from", Timestamp.from(LocalDate.now(TASHKENT).atStartOfDay(TASHKENT).toInstant()));
        }
        if (q != null && !q.isBlank()) {
            where.append(" AND (m.gtin LIKE :q OR upper(m.serial) LIKE :q OR upper(m.batch_no) LIKE :q OR o.number LIKE :q)");
            params.put("q", "%" + q.strip().toUpperCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        String from = " FROM sales_order_mark m JOIN sales_order o ON o.id = m.order_id JOIN sales_order_line l ON l.id = m.line_id "
                + "JOIN product p ON p.id = l.product_id JOIN employee e ON e.id = m.scanned_by ";
        long total = jdbc.sql("SELECT count(*)" + from + where).params(params).query(Long.class).single();
        List<MarkCode> items = jdbc.sql(SELECT_CODE + from + where + " ORDER BY m.scanned_at DESC, m.id DESC LIMIT :lim OFFSET :off")
                .params(params)
                .param("lim", size)
                .param("off", (long) page * size)
                .query((rs, n) -> code(rs))
                .list();
        return new MarkCodePage(items, total, page, size);
    }

    // ===== Ichki =====

    private static final String SELECT_CODE = """
            SELECT m.id, m.order_id, o.number AS order_number, m.line_id, p.name AS product, m.raw, m.gtin, m.serial, m.batch_no, m.kind,
                   m.status, e.full_name AS scanned_by, m.scanned_at, m.close_reason""";

    private static MarkCode code(ResultSet rs) throws SQLException {
        return new MarkCode(rs.getLong("id"), rs.getLong("order_id"), rs.getString("order_number"), rs.getLong("line_id"), rs.getString("product"),
                rs.getString("raw"), rs.getString("gtin"), rs.getString("serial"), rs.getString("batch_no"),
                "Q".equals(rs.getString("kind")) ? MarkKind.BOX : MarkKind.UNIT, MarkStatus.valueOf(rs.getString("status")),
                rs.getString("scanned_by"), rs.getTimestamp("scanned_at").toInstant(), rs.getString("close_reason"));
    }

    private List<PickedBatch> pickedBatches(long orderId, long lineId) {
        return jdbc.sql("""
                SELECT b.id, b.number, b.expiry_date, sum(t.qty)::int AS qty FROM (
                    SELECT batch_id, qty FROM sales_order_pick WHERE order_id = :o AND line_id = :l
                    UNION ALL
                    SELECT r.batch_id, -r.qty FROM sales_order_pick_return r WHERE r.order_id = :o
                      AND r.batch_id IN (SELECT batch_id FROM sales_order_pick WHERE order_id = :o AND line_id = :l)) t
                JOIN batch b ON b.id = t.batch_id
                GROUP BY b.id, b.number, b.expiry_date HAVING sum(t.qty) > 0 ORDER BY b.expiry_date, b.id""")
                .param("o", orderId)
                .param("l", lineId)
                .query((rs, n) -> new PickedBatch(rs.getLong("id"), rs.getString("number"), rs.getDate("expiry_date").toLocalDate(), rs.getInt("qty")))
                .list();
    }

    private MarkWork work(long id, Actor actor) {
        record HeadRow(long id, String number, String customer, String status, long branchId, Integer markMinutes, String marker, Long markerId,
                Instant startedAt) {}
        HeadRow h = jdbc.sql("""
                SELECT o.id, o.number, c.name AS customer, o.status, o.branch_id, o.mark_minutes, mk.full_name AS marker, o.marker_id, o.mark_started_at
                FROM sales_order o JOIN counterparty c ON c.id = o.customer_id LEFT JOIN employee mk ON mk.id = o.marker_id WHERE o.id = :id""")
                .param("id", id)
                .query((rs, n) -> new HeadRow(rs.getLong("id"), rs.getString("number"), rs.getString("customer"), rs.getString("status"),
                        rs.getLong("branch_id"), (Integer) rs.getObject("mark_minutes"), rs.getString("marker"), (Long) rs.getObject("marker_id"),
                        instant(rs.getTimestamp("mark_started_at"))))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        List<MarkCode> codes = jdbc.sql(SELECT_CODE + """
                 FROM sales_order_mark m JOIN sales_order o ON o.id = m.order_id JOIN sales_order_line l ON l.id = m.line_id
                JOIN product p ON p.id = l.product_id JOIN employee e ON e.id = m.scanned_by
                WHERE m.order_id = :id AND m.status = 'ACTIVE' ORDER BY m.scanned_at DESC, m.id DESC""")
                .param("id", id)
                .query((rs, n) -> code(rs))
                .list();
        record ScanCount(long lineId, long batchId, int n) {}
        List<ScanCount> counts = jdbc.sql("""
                SELECT line_id, batch_id, count(*)::int AS n FROM sales_order_mark WHERE order_id = :id AND status = 'ACTIVE' GROUP BY line_id, batch_id""")
                .param("id", id)
                .query((rs, n) -> new ScanCount(rs.getLong("line_id"), rs.getLong("batch_id"), rs.getInt("n")))
                .list();
        record LineRow(long id, int lineNo, String code, String name, String unit, int qty) {}
        List<LineRow> rows = jdbc.sql("""
                SELECT l.id, l.line_no, p.code, p.name, u.short_name AS unit, l.qty FROM sales_order_line l
                JOIN product p ON p.id = l.product_id JOIN unit u ON u.id = p.unit_id
                JOIN sales_order so ON so.id = l.order_id
                WHERE l.order_id = :id AND p.marked AND (so.repick_line_ids IS NULL OR l.id = ANY (so.repick_line_ids)) ORDER BY l.line_no""")
                .param("id", id)
                .query((rs, n) -> new LineRow(rs.getLong("id"), rs.getInt("line_no"), rs.getString("code"), rs.getString("name"), rs.getString("unit"),
                        rs.getInt("qty")))
                .list();
        List<MarkingModels.UnmarkedLine> unmarked = jdbc.sql("""
                SELECT l.id, l.line_no, p.code, p.name, u.short_name AS unit, l.qty,
                       EXISTS (SELECT 1 FROM sales_order_mark_confirm c WHERE c.line_id = l.id AND c.active) AS confirmed
                FROM sales_order_line l
                JOIN product p ON p.id = l.product_id JOIN unit u ON u.id = p.unit_id
                JOIN sales_order so ON so.id = l.order_id
                WHERE l.order_id = :id AND NOT p.marked AND (so.repick_line_ids IS NULL OR l.id = ANY (so.repick_line_ids)) ORDER BY l.line_no""")
                .param("id", id)
                .query((rs, n) -> new MarkingModels.UnmarkedLine(rs.getLong("id"), rs.getInt("line_no"), rs.getString("code"), rs.getString("name"),
                        rs.getString("unit"), rs.getInt("qty"), rs.getBoolean("confirmed")))
                .list();
        List<MarkLine> lines = new ArrayList<>();
        int boxes = 0;
        int boxesNeeded = 0;
        int units = 0;
        int unitsNeeded = 0;
        boolean complete = true;
        for (LineRow r : rows) {
            List<MarkBatch> batches = new ArrayList<>();
            for (PickedBatch b : pickedBatches(id, r.id())) {
                int n = counts.stream().filter(c -> c.lineId() == r.id() && c.batchId() == b.batchId()).mapToInt(ScanCount::n).sum();
                batches.add(new MarkBatch(b.batchId(), b.number(), b.expiry(), b.qty(), n));
            }
            int scanned = counts.stream().filter(c -> c.lineId() == r.id()).mapToInt(ScanCount::n).sum();
            MarkKind kind = kindOf(r.unit());
            if (kind == MarkKind.BOX) {
                boxes += scanned;
                boxesNeeded += r.qty();
            } else {
                units += scanned;
                unitsNeeded += r.qty();
            }
            complete &= scanned == r.qty();
            lines.add(new MarkLine(r.id(), r.lineNo(), r.code(), r.name(), kind, r.qty(), scanned, batches));
        }
        return new MarkWork(h.id(), h.number(), h.customer(), h.status(), h.markMinutes(), h.marker(), h.markerId(), h.startedAt(),
                deadline(h.startedAt(), h.markMinutes()), lines, unmarked, codes, boxes, boxesNeeded, units, unitsNeeded,
                complete && unmarked.stream().allMatch(MarkingModels.UnmarkedLine::confirmed) && !(rows.isEmpty() && unmarked.isEmpty()),
                rows.isEmpty() && !unmarked.isEmpty());
    }

    static MarkKind kindOf(String unitShortName) {
        return "dona".equalsIgnoreCase(unitShortName) ? MarkKind.UNIT : MarkKind.BOX;
    }

    static boolean sameBatch(String batchNumber, String scanned) {
        String a = batchNumber.strip().toUpperCase(Locale.ROOT);
        String b = scanned.strip().toUpperCase(Locale.ROOT);
        return a.equals(b) || (a.endsWith("-B") && a.substring(0, a.length() - 2).equals(b));
    }

    private static Instant deadline(Instant started, Integer minutes) {
        return started == null || minutes == null ? null : started.plusSeconds(minutes * 60L);
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
