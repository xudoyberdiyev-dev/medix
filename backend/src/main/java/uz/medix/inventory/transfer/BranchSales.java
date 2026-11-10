package uz.medix.inventory.transfer;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.inventory.StockLedger;
import uz.medix.inventory.StockLedger.DocRef;
import uz.medix.inventory.StockLedger.Move;
import uz.medix.inventory.ZoneType;
import uz.medix.inventory.transfer.BranchSaleModels.BranchBalance;
import uz.medix.inventory.transfer.BranchSaleModels.BranchRef;
import uz.medix.inventory.transfer.BranchSaleModels.BranchSaleDetail;
import uz.medix.inventory.transfer.BranchSaleModels.BranchSaleLine;
import uz.medix.inventory.transfer.BranchSaleModels.BranchSaleLineRequest;
import uz.medix.inventory.transfer.BranchSaleModels.BranchSalePage;
import uz.medix.inventory.transfer.BranchSaleModels.BranchSaleRequest;
import uz.medix.inventory.transfer.BranchSaleModels.BranchSaleSummary;
import uz.medix.inventory.transfer.BranchSaleModels.TargetWarehouse;
import uz.medix.inventory.transfer.WarehouseTransferModels.ReceiveLineRequest;
import uz.medix.inventory.transfer.WarehouseTransferModels.ReceiveRequest;
import uz.medix.inventory.transfer.WarehouseTransferModels.Status;
import uz.medix.inventory.transfer.WarehouseTransferModels.WarehouseRef;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneRef;
import uz.medix.notification.Notifications;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.numbering.DocumentSequenceService;
import uz.medix.shared.security.Actor;

/**
 * FS — filiallararo savdo (SPEC 2: guruh ichida tannarxda, HF va QQS bilan; guruh ichidagi qarz umumiy jamiga kirmaydi).
 * Qoralama (sotuvchi filial) → «Jo'natish»: tovar sotuvchi zonadan chiqadi, qator narxi = partiya tannarxi (QQSsiz baza, QQS ustiga qo'shiladi — E2),
 * HF raqami, xaridor filial sotuvchiga qarzdor ({@code branch_ledger}) — «Yo'lda» → «Qabul» (xaridor filial): tovar o'sha partiya
 * bilan xaridor ombori zonasiga kiradi, farq — kamomad. Har o'tish bitta tranzaksiya: hujjat {@code FOR UPDATE}, qoldiq satrlari
 * partiya tartibida qulflanadi, jurnal + qoldiq (StockLedger) + qarz + holat + audit.
 */
@Service
class BranchSales {

    static final String DOC_TYPE = "FS";

    private final JdbcClient jdbc;
    private final StockLedger ledger;
    private final AuditLog audit;
    private final DocumentSequenceService numbers;
    private final Notifications notifications;

    BranchSales(JdbcClient jdbc, StockLedger ledger, AuditLog audit, DocumentSequenceService numbers, Notifications notifications) {
        this.jdbc = jdbc;
        this.ledger = ledger;
        this.audit = audit;
        this.numbers = numbers;
        this.notifications = notifications;
    }

    private record ZoneInfo(long id, String name, boolean active, long warehouseId, boolean warehouseActive, long branchId,
            String branchCode) {}

    private record Head(long id, String number, long sellerBranchId, String sellerCode, long buyerBranchId, long fromZoneId,
            long toWarehouseId, Status status) {}

    private record LineRow(long id, long batchId, int qty) {}

    private static final String SELECT_HEAD = """
            SELECT t.id, t.number, t.status, t.note, t.shortage_qty, t.receive_note, t.invoice_number, t.total, t.vat_total,
                   t.created_at, t.sent_at, t.received_at, t.cancelled_at,
                   sb.id AS s_id, sb.code AS s_code, sb.name AS s_name, bb.id AS b_id, bb.code AS b_code, bb.name AS b_name,
                   fw.id AS fw_id, fw.name AS fw_name, fz.id AS fz_id, fz.name AS fz_name, fz.type AS fz_type,
                   tw.id AS tw_id, tw.name AS tw_name, tz.id AS tz_id, tz.name AS tz_name, tz.type AS tz_type,
                   ce.full_name AS created_by, se.full_name AS sent_by, re.full_name AS received_by, xe.full_name AS cancelled_by,
                   coalesce(l.lines, 0) AS lines, coalesce(l.qty, 0) AS qty
            FROM branch_sale t
            JOIN branch sb ON sb.id = t.seller_branch_id
            JOIN branch bb ON bb.id = t.buyer_branch_id
            JOIN warehouse fw ON fw.id = t.from_warehouse_id
            JOIN zone fz ON fz.id = t.from_zone_id
            JOIN warehouse tw ON tw.id = t.to_warehouse_id
            LEFT JOIN zone tz ON tz.id = t.to_zone_id
            JOIN employee ce ON ce.id = t.created_by
            LEFT JOIN employee se ON se.id = t.sent_by
            LEFT JOIN employee re ON re.id = t.received_by
            LEFT JOIN employee xe ON xe.id = t.cancelled_by
            LEFT JOIN (SELECT sale_id, count(*) AS lines, sum(qty) AS qty FROM branch_sale_line GROUP BY sale_id) l ON l.sale_id = t.id""";

    // ===== O'qish =====

    /** Ro'yxat: xodim o'z filiali sotuvchi YOKI xaridor bo'lgan FS larni ko'radi. {@code branchId} — ikki tomondan biri. */
    @Transactional(readOnly = true)
    BranchSalePage list(Actor actor, Long branchId, Status status, int page, int size, boolean canSeeCost) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new HashMap<>();
        if (!actor.allBranches()) {
            where.append(" AND (t.seller_branch_id = :own OR t.buyer_branch_id = :own)");
            params.put("own", actor.branchId() == null ? -1L : actor.branchId());
        }
        if (branchId != null) {
            where.append(" AND (t.seller_branch_id = :b OR t.buyer_branch_id = :b)");
            params.put("b", branchId);
        }
        if (status != null) {
            where.append(" AND t.status = :s");
            params.put("s", status.name());
        }
        long total = jdbc.sql("SELECT count(*) FROM branch_sale t" + where).params(params).query(Long.class).single();
        List<BranchSaleSummary> items = jdbc.sql(SELECT_HEAD + where + " ORDER BY t.created_at DESC, t.id DESC LIMIT :l OFFSET :o")
                .params(params)
                .param("l", size)
                .param("o", (long) page * size)
                .query((rs, n) -> new BranchSaleSummary(rs.getLong("id"), rs.getString("number"), seller(rs), buyer(rs),
                        new WarehouseRef(rs.getLong("fw_id"), rs.getString("fw_name")), fromZone(rs),
                        new WarehouseRef(rs.getLong("tw_id"), rs.getString("tw_name")), toZone(rs), Status.valueOf(rs.getString("status")),
                        rs.getInt("lines"), rs.getLong("qty"), rs.getInt("shortage_qty"), rs.getString("invoice_number"),
                        canSeeCost ? money(rs.getBigDecimal("total")) : null, rs.getString("created_by"),
                        rs.getTimestamp("created_at").toInstant(), instant(rs.getTimestamp("sent_at")), instant(rs.getTimestamp("received_at"))))
                .list();
        return new BranchSalePage(items, total, page, size);
    }

    @Transactional(readOnly = true)
    Optional<BranchSaleDetail> find(long id, Actor actor, boolean canSeeCost) {
        Optional<BranchSaleDetail> head = jdbc.sql(SELECT_HEAD + " WHERE t.id = :id")
                .param("id", id)
                .query((rs, n) -> new BranchSaleDetail(rs.getLong("id"), rs.getString("number"), seller(rs), buyer(rs),
                        new WarehouseRef(rs.getLong("fw_id"), rs.getString("fw_name")), fromZone(rs),
                        new WarehouseRef(rs.getLong("tw_id"), rs.getString("tw_name")), toZone(rs), Status.valueOf(rs.getString("status")),
                        rs.getString("note"), rs.getInt("shortage_qty"), rs.getString("receive_note"), rs.getString("invoice_number"),
                        canSeeCost ? money(rs.getBigDecimal("total")) : null, canSeeCost ? money(rs.getBigDecimal("vat_total")) : null,
                        rs.getString("created_by"), rs.getTimestamp("created_at").toInstant(), rs.getString("sent_by"),
                        instant(rs.getTimestamp("sent_at")), rs.getString("received_by"), instant(rs.getTimestamp("received_at")),
                        rs.getString("cancelled_by"), instant(rs.getTimestamp("cancelled_at")), rs.getLong("qty"), List.of()))
                .optional()
                .filter(h -> actor.canAccessBranch(h.seller().id()) || actor.canAccessBranch(h.buyer().id()));
        if (head.isEmpty()) {
            return Optional.empty();
        }
        BranchSaleDetail h = head.get();
        List<BranchSaleLine> lines = jdbc.sql("""
                SELECT l.id, l.line_no, l.batch_id, b.number AS batch_number, b.expiry_date, l.product_id, p.code, p.name, l.qty,
                       l.received_qty, l.unit_cost, l.amount, l.vat_rate, l.vat_amount
                FROM branch_sale_line l JOIN batch b ON b.id = l.batch_id JOIN product p ON p.id = l.product_id
                WHERE l.sale_id = :id ORDER BY l.line_no""")
                .param("id", id)
                .query((rs, n) -> new BranchSaleLine(rs.getLong("id"), rs.getInt("line_no"), rs.getLong("batch_id"),
                        rs.getString("batch_number"), rs.getDate("expiry_date").toLocalDate(), rs.getLong("product_id"), rs.getString("code"),
                        rs.getString("name"), rs.getInt("qty"), (Integer) rs.getObject("received_qty"),
                        canSeeCost ? money(rs.getBigDecimal("unit_cost")) : null, canSeeCost ? money(rs.getBigDecimal("amount")) : null,
                        rate(rs.getBigDecimal("vat_rate")), canSeeCost ? money(rs.getBigDecimal("vat_amount")) : null))
                .list();
        return Optional.of(new BranchSaleDetail(h.id(), h.number(), h.seller(), h.buyer(), h.fromWarehouse(), h.fromZone(),
                h.toWarehouse(), h.toZone(), h.status(), h.note(), h.shortageQty(), h.receiveNote(), h.invoiceNumber(), h.total(),
                h.vatTotal(), h.createdBy(), h.createdAt(), h.sentBy(), h.sentAt(), h.receivedBy(), h.receivedAt(), h.cancelledBy(),
                h.cancelledAt(), h.totalQty(), lines));
    }

    /**
     * Filiallararo qarz qoldiqlari (branch_ledger yig'indisi). Xodim faqat o'z filiali qatnashgan juftlarni ko'radi. Qarama-qarshi
     * yo'nalishdagi qarzlar alohida qatorda (hisob-kitob — keyingi qadam).
     */
    @Transactional(readOnly = true)
    List<BranchBalance> balances(Actor actor) {
        String scope = actor.allBranches() ? "" : " WHERE l.debtor_branch_id = :own OR l.creditor_branch_id = :own";
        return jdbc.sql("""
                SELECT d.id AS d_id, d.code AS d_code, d.name AS d_name, c.id AS c_id, c.code AS c_code, c.name AS c_name, s.amount
                FROM (SELECT l.debtor_branch_id, l.creditor_branch_id, sum(l.amount) AS amount FROM branch_ledger l""" + scope + """
                       GROUP BY l.debtor_branch_id, l.creditor_branch_id HAVING sum(l.amount) <> 0) s
                JOIN branch d ON d.id = s.debtor_branch_id JOIN branch c ON c.id = s.creditor_branch_id
                ORDER BY d.name, c.name""")
                .param("own", actor.branchId() == null ? -1L : actor.branchId())
                .query((rs, n) -> new BranchBalance(new BranchRef(rs.getLong("d_id"), rs.getString("d_code"), rs.getString("d_name")),
                        new BranchRef(rs.getLong("c_id"), rs.getString("c_code"), rs.getString("c_name")), money(rs.getBigDecimal("amount"))))
                .list();
    }

    /** Xaridor ombori tanlovi: boshqa filiallarning faol omborlari (faqat nom — ichidagi qoldiq ko'rsatilmaydi). */
    @Transactional(readOnly = true)
    List<TargetWarehouse> targets(Actor actor, long sellerBranchId) {
        if (!actor.canAccessBranch(sellerBranchId)) {
            throw MedixException.notFound("error.notFound");
        }
        return jdbc.sql("""
                SELECT w.id, w.name, b.id AS b_id, b.code AS b_code, b.name AS b_name
                FROM warehouse w JOIN branch b ON b.id = w.branch_id
                WHERE w.active AND b.id <> :s ORDER BY b.name, w.name""")
                .param("s", sellerBranchId)
                .query((rs, n) -> new TargetWarehouse(rs.getLong("id"), rs.getString("name"),
                        new BranchRef(rs.getLong("b_id"), rs.getString("b_code"), rs.getString("b_name"))))
                .list();
    }

    // ===== Yozish =====

    /** Qoralama: sotuvchi zona (xodim filiali doirasida), xaridor — BOSHQA filialning faol ombori. */
    @Transactional
    long create(Actor actor, BranchSaleRequest r) {
        Route route = route(actor, r);
        String number = numbers.next(DocumentPrefix.FS, route.from().branchCode()).toString();
        long id = jdbc.sql("""
                INSERT INTO branch_sale (number, seller_branch_id, buyer_branch_id, from_warehouse_id, from_zone_id, to_warehouse_id, note,
                                         status, created_by)
                VALUES (:n, :s, :b, :fw, :fz, :tw, :note, 'DRAFT', :by) RETURNING id""")
                .param("n", number)
                .param("s", route.from().branchId())
                .param("b", route.buyerBranchId())
                .param("fw", route.from().warehouseId())
                .param("fz", route.from().id())
                .param("tw", route.toWarehouseId())
                .param("note", blankToNull(r.note()))
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        insertLines(id, r.lines());
        checkFree(route.from().id(), lines(id), false);
        audit.record(AuditEntry.of("transfer.fs.create", "branch_sale", id)
                .change(null, Map.of("number", number, "lines", r.lines().size(), "buyer", route.buyerBranchId())), actor);
        return id;
    }

    /**
     * Qoralamani tahrirlash (prototip TransferDoc — avtomatik saqlash): sotuvchi zona, xaridor ombori, izoh va qatorlar to'liq
     * almashtiriladi. Sotuvchi filial o'zgarmaydi; faqat qoralama, faqat sotuvchi filial xodimi.
     */
    @Transactional
    void update(Actor actor, long id, BranchSaleRequest r) {
        Head h = lock(id);
        if (!actor.canAccessBranch(h.sellerBranchId())) {
            throw MedixException.notFound("error.notFound");
        }
        require(h, Status.DRAFT);
        Route route = route(actor, r);
        if (route.from().branchId() != h.sellerBranchId()) {
            throw MedixException.badRequest("transfer.fs.sellerFixed");
        }
        jdbc.sql("""
                UPDATE branch_sale SET buyer_branch_id = :b, from_warehouse_id = :fw, from_zone_id = :fz, to_warehouse_id = :tw, note = :note,
                       updated_at = now(), version = version + 1 WHERE id = :id""")
                .param("b", route.buyerBranchId())
                .param("fw", route.from().warehouseId())
                .param("fz", route.from().id())
                .param("tw", route.toWarehouseId())
                .param("note", blankToNull(r.note()))
                .param("id", id)
                .update();
        jdbc.sql("DELETE FROM branch_sale_line WHERE sale_id = :id").param("id", id).update();
        insertLines(id, r.lines());
        checkFree(route.from().id(), lines(id), false);
        audit.record(AuditEntry.of("transfer.fs.update", "branch_sale", id)
                .change(null, Map.of("number", h.number(), "lines", r.lines().size(), "buyer", route.buyerBranchId())), actor);
    }

    private record Route(ZoneInfo from, long toWarehouseId, long buyerBranchId) {}

    private Route route(Actor actor, BranchSaleRequest r) {
        ZoneInfo from = zone(r.fromZoneId());
        if (!actor.canAccessBranch(from.branchId())) {
            throw MedixException.badRequest("stock.zoneUnknown");
        }
        record Target(long id, boolean active, long branchId) {}
        Target to = jdbc.sql("SELECT id, active, branch_id FROM warehouse WHERE id = :w")
                .param("w", r.toWarehouseId())
                .query((rs, n) -> new Target(rs.getLong("id"), rs.getBoolean("active"), rs.getLong("branch_id")))
                .optional()
                .orElseThrow(() -> MedixException.badRequest("transfer.fs.warehouseUnknown"));
        if (to.branchId() == from.branchId()) {
            throw MedixException.badRequest("transfer.fs.sameBranch");
        }
        if (!from.warehouseActive() || !to.active()) {
            throw MedixException.badRequest("transfer.ok.warehouseInactive");
        }
        Set<Long> seen = new HashSet<>();
        for (BranchSaleLineRequest l : r.lines()) {
            if (!seen.add(l.batchId())) {
                throw MedixException.badRequest("transfer.zk.duplicateBatch");
            }
        }
        return new Route(from, to.id(), to.branchId());
    }

    private void insertLines(long id, List<BranchSaleLineRequest> lines) {
        int lineNo = 0;
        for (BranchSaleLineRequest l : lines) {
            Long product = jdbc.sql("SELECT product_id FROM batch WHERE id = :b").param("b", l.batchId()).query(Long.class).optional()
                    .orElseThrow(() -> MedixException.badRequest("stock.batchUnknown"));
            jdbc.sql("INSERT INTO branch_sale_line (sale_id, line_no, batch_id, product_id, qty) VALUES (:t, :no, :b, :p, :q)")
                    .param("t", id)
                    .param("no", ++lineNo)
                    .param("b", l.batchId())
                    .param("p", product)
                    .param("q", l.qty())
                    .update();
        }
    }

    /**
     * Jo'natish: tovar sotuvchi zonadan chiqadi; har qator narxi = partiya tannarxi (QQSsiz baza), QQS ustiga qo'shiladi
     * ({@link FsPricing}, E2); qator summasi — QQS bilan; HF raqami; xaridor filial sotuvchiga qarzdor. Xaridor filialning qabul qiluvchilariga bildirishnoma.
     */
    @Transactional
    void send(Actor actor, long id) {
        Head h = lock(id);
        if (!actor.canAccessBranch(h.sellerBranchId())) {
            throw MedixException.notFound("error.notFound");
        }
        require(h, Status.DRAFT);
        List<LineRow> lines = lines(id);
        checkFree(h.fromZoneId(), lines, true);
        List<Move> moves = new ArrayList<>();
        Money total = Money.ZERO;
        Money vatTotal = Money.ZERO;
        for (LineRow l : lines) {
            record Price(BigDecimal cost, BigDecimal vatRate) {}
            Price p = jdbc.sql("SELECT b.cost, p.vat_rate FROM batch b JOIN product p ON p.id = b.product_id WHERE b.id = :b")
                    .param("b", l.batchId())
                    .query((rs, n) -> new Price(rs.getBigDecimal("cost"), rs.getBigDecimal("vat_rate")))
                    .single();
            FsPricing.Line priced = FsPricing.line(p.cost(), l.qty(), p.vatRate());
            Money amount = priced.gross();
            Money vat = priced.vat();
            jdbc.sql("""
                    UPDATE branch_sale_line SET unit_cost = :c, amount = :a, vat_rate = :r, vat_amount = :v WHERE id = :id""")
                    .param("c", p.cost())
                    .param("a", amount.amount())
                    .param("r", p.vatRate())
                    .param("v", vat.amount())
                    .param("id", l.id())
                    .update();
            total = total.plus(amount);
            vatTotal = vatTotal.plus(vat);
            moves.add(Move.out(h.fromZoneId(), l.batchId(), l.qty()));
        }
        ledger.post(new DocRef(DOC_TYPE, id, h.number()), moves);
        String invoice = numbers.next(DocumentPrefix.HF, h.sellerCode()).toString();
        jdbc.sql("""
                UPDATE branch_sale SET status = 'IN_TRANSIT', total = :t, vat_total = :v, invoice_number = :inv, sent_by = :by, sent_at = now(),
                       updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("t", total.amount())
                .param("v", vatTotal.amount())
                .param("inv", invoice)
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        if (total.isPositive()) {
            jdbc.sql("""
                    INSERT INTO branch_ledger (debtor_branch_id, creditor_branch_id, amount, doc_type, doc_id, doc_number, created_by)
                    VALUES (:d, :c, :a, :t, :id, :n, :by)""")
                    .param("d", h.buyerBranchId())
                    .param("c", h.sellerBranchId())
                    .param("a", total.amount())
                    .param("t", DOC_TYPE)
                    .param("id", id)
                    .param("n", h.number())
                    .param("by", actor.employeeId())
                    .update();
        }
        audit.record(AuditEntry.of("transfer.fs.send", "branch_sale", id)
                .change(null, Map.of("number", h.number(), "invoice", invoice, "total", total.toString())), actor);
        String seller = jdbc.sql("SELECT name FROM branch WHERE id = :b").param("b", h.sellerBranchId()).query(String.class).single();
        notifications.notify("transfer.receive", h.buyerBranchId(), List.of(),
                notifications.message("transfer.fs.sent", "transfer.fs.sent", "/branch-sales?status=IN_TRANSIT&open=" + id,
                        "transfer.fs.sent:" + id, h.number(), seller));
    }

    /**
     * Qabul (xaridor filial): kelgan miqdor xaridor ombori zonasiga o'sha partiya bilan kiradi (tannarx o'zgarmaydi). Ko'rsatilmagan
     * qator — to'liq keldi. Kamomad bo'lsa izoh majburiy va hal qiluvchilarga bildirishnoma.
     */
    @Transactional
    void receive(Actor actor, long id, ReceiveRequest r) {
        Head h = lock(id);
        if (!actor.canAccessBranch(h.buyerBranchId())) {
            throw MedixException.notFound("error.notFound");
        }
        require(h, Status.IN_TRANSIT);
        ZoneInfo toZone = zone(r.toZoneId());
        if (toZone.warehouseId() != h.toWarehouseId()) {
            throw MedixException.badRequest("transfer.ok.zoneNotInTarget");
        }
        if (!toZone.active()) {
            throw MedixException.badRequest("transfer.zk.zoneInactive", toZone.name());
        }
        List<LineRow> lines = lines(id);
        Map<Long, Integer> received = new HashMap<>();
        if (r.lines() != null) {
            Set<Long> known = new HashSet<>();
            lines.forEach(l -> known.add(l.id()));
            for (ReceiveLineRequest l : r.lines()) {
                if (!known.contains(l.lineId()) || received.put(l.lineId(), l.receivedQty()) != null) {
                    throw MedixException.badRequest("transfer.ok.badLine");
                }
            }
        }
        int shortage = 0;
        for (LineRow l : lines) {
            int got = received.getOrDefault(l.id(), l.qty());
            if (got > l.qty()) {
                throw MedixException.badRequest("transfer.ok.surplus", String.valueOf(l.qty()), String.valueOf(got));
            }
            shortage += l.qty() - got;
        }
        String note = blankToNull(r.note());
        if (shortage > 0 && note == null) {
            throw MedixException.badRequest("transfer.ok.shortageNote");
        }
        List<Move> moves = new ArrayList<>();
        for (LineRow l : lines) {
            int got = received.getOrDefault(l.id(), l.qty());
            if (got > 0) {
                moves.add(Move.in(toZone.id(), l.batchId(), got));
            }
            jdbc.sql("UPDATE branch_sale_line SET received_qty = :q WHERE id = :id").param("q", got).param("id", l.id()).update();
        }
        ledger.post(new DocRef(DOC_TYPE, id, h.number()), moves);
        jdbc.sql("""
                UPDATE branch_sale SET status = 'RECEIVED', to_zone_id = :z, shortage_qty = :s, receive_note = :note, received_by = :by,
                       received_at = now(), updated_at = now(), version = version + 1
                WHERE id = :id""")
                .param("z", toZone.id())
                .param("s", shortage)
                .param("note", note)
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("transfer.fs.receive", "branch_sale", id)
                .change(null, Map.of("number", h.number(), "zone", toZone.name(), "shortage", shortage)), actor);
        if (shortage > 0) {
            String link = "/branch-sales?open=" + id;
            for (long branch : List.of(h.sellerBranchId(), h.buyerBranchId())) {
                notifications.notify("transfer.resolve", branch, List.of(),
                        notifications.message("transfer.fs.shortage", "transfer.fs.shortage", link, "transfer.fs.shortage:" + id + ":" + branch,
                                h.number(), String.valueOf(shortage)));
            }
        }
    }

    /** Bekor qilish — faqat qoralama (sotuvchi filial). */
    @Transactional
    void cancel(Actor actor, long id) {
        Head h = lock(id);
        if (!actor.canAccessBranch(h.sellerBranchId())) {
            throw MedixException.notFound("error.notFound");
        }
        require(h, Status.DRAFT);
        jdbc.sql("""
                UPDATE branch_sale SET status = 'CANCELLED', cancelled_by = :by, cancelled_at = now(), updated_at = now(),
                       version = version + 1 WHERE id = :id""")
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("transfer.fs.cancel", "branch_sale", id).change(null, Map.of("number", h.number())), actor);
    }

    // ===== Ichki =====

    /** Sotuvchi zonadagi bo'sh qoldiq (qoldiq − faol zahira) ≥ miqdor. {@code lock} — partiya tartibida {@code FOR UPDATE}. */
    private void checkFree(long zoneId, List<LineRow> lines, boolean lock) {
        List<LineRow> ordered = new ArrayList<>(lines);
        ordered.sort((a, b) -> Long.compare(a.batchId(), b.batchId()));
        for (LineRow l : ordered) {
            int qty = jdbc.sql("SELECT qty FROM stock_balance WHERE zone_id = :z AND batch_id = :b" + (lock ? " FOR UPDATE" : ""))
                    .param("z", zoneId)
                    .param("b", l.batchId())
                    .query(Integer.class)
                    .optional()
                    .orElse(0);
            int reserved = jdbc.sql("""
                    SELECT coalesce(sum(qty), 0) FROM stock_reservation WHERE zone_id = :z AND batch_id = :b AND status = 'ACTIVE'""")
                    .param("z", zoneId)
                    .param("b", l.batchId())
                    .query(Integer.class)
                    .single();
            if (qty - reserved < l.qty()) {
                String label = jdbc.sql("SELECT p.name || ' · ' || b.number FROM batch b JOIN product p ON p.id = b.product_id WHERE b.id = :b")
                        .param("b", l.batchId())
                        .query(String.class)
                        .optional()
                        .orElse("?");
                throw MedixException.conflict("transfer.zk.notEnough", label, String.valueOf(Math.max(qty - reserved, 0)),
                        String.valueOf(reserved), String.valueOf(l.qty()));
            }
        }
    }

    private List<LineRow> lines(long id) {
        return jdbc.sql("SELECT id, batch_id, qty FROM branch_sale_line WHERE sale_id = :id ORDER BY line_no")
                .param("id", id)
                .query((rs, n) -> new LineRow(rs.getLong("id"), rs.getLong("batch_id"), rs.getInt("qty")))
                .list();
    }

    private Head lock(long id) {
        return jdbc.sql("""
                SELECT t.id, t.number, t.seller_branch_id, b.code, t.buyer_branch_id, t.from_zone_id, t.to_warehouse_id, t.status
                FROM branch_sale t JOIN branch b ON b.id = t.seller_branch_id WHERE t.id = :id FOR UPDATE OF t""")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("id"), rs.getString("number"), rs.getLong("seller_branch_id"), rs.getString("code"),
                        rs.getLong("buyer_branch_id"), rs.getLong("from_zone_id"), rs.getLong("to_warehouse_id"),
                        Status.valueOf(rs.getString("status"))))
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static void require(Head h, Status expected) {
        if (h.status() != expected) {
            throw MedixException.conflict("transfer.ok.badStatus", h.status().name());
        }
    }

    private ZoneInfo zone(long zoneId) {
        return jdbc.sql("""
                SELECT z.id, z.name, z.active, w.id AS warehouse_id, w.active AS warehouse_active, b.id AS branch_id, b.code AS branch_code
                FROM zone z JOIN warehouse w ON w.id = z.warehouse_id JOIN branch b ON b.id = w.branch_id WHERE z.id = :z""")
                .param("z", zoneId)
                .query((rs, n) -> new ZoneInfo(rs.getLong("id"), rs.getString("name"), rs.getBoolean("active"), rs.getLong("warehouse_id"),
                        rs.getBoolean("warehouse_active"), rs.getLong("branch_id"), rs.getString("branch_code")))
                .optional()
                .orElseThrow(() -> MedixException.badRequest("stock.zoneUnknown"));
    }

    private static BranchRef seller(ResultSet rs) throws SQLException {
        return new BranchRef(rs.getLong("s_id"), rs.getString("s_code"), rs.getString("s_name"));
    }

    private static BranchRef buyer(ResultSet rs) throws SQLException {
        return new BranchRef(rs.getLong("b_id"), rs.getString("b_code"), rs.getString("b_name"));
    }

    private static ZoneRef fromZone(ResultSet rs) throws SQLException {
        return new ZoneRef(rs.getLong("fz_id"), rs.getString("fz_name"), ZoneType.valueOf(rs.getString("fz_type")));
    }

    private static ZoneRef toZone(ResultSet rs) throws SQLException {
        long id = rs.getLong("tz_id");
        return rs.wasNull() ? null : new ZoneRef(id, rs.getString("tz_name"), ZoneType.valueOf(rs.getString("tz_type")));
    }

    private static String money(BigDecimal v) {
        return v == null ? null : v.setScale(Money.SCALE, Money.ROUNDING).toPlainString();
    }

    private static String rate(BigDecimal v) {
        return v == null ? null : v.stripTrailingZeros().toPlainString();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
