package uz.medix.sales.order;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.order.InvoiceTaskModels.FileData;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceFile;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceFileKind;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceTask;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceTaskDetail;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceTaskFilter;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceTaskPage;
import uz.medix.sales.order.InvoiceTaskModels.InvoiceTaskStatus;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * O10d buxgalter faktura navbati. Buyurtma «Yuklanmoqda» ga o'tganda (kodlar «Mijoz nomiga» yoki to'lov Perechisleniye) parallel vazifa
 * ochiladi; buxgalter e-faktura va imzolangan TTN fayllarini yuklab, e-faktura raqami/sanasi bilan «Yuborildi» deb belgilaydi.
 * Buyurtma zanjirini to'xtatmaydi. Filial filtri serverda.
 */
@Service
class InvoiceTasks {

    static final int MAX_FILE_BYTES = 10 * 1024 * 1024;
    static final Set<String> FILE_TYPES = Set.of("application/pdf", "image/jpeg", "image/png");
    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final Clock clock;

    InvoiceTasks(JdbcClient jdbc, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    /**
     * Vazifani ochadi (bo'lmasa): kodlar egasi «Mijoz nomiga» yoki to'lov Perechisleniye bo'lsa. «Yuklanmoqda» ga o'tish va kodlar egasi
     * o'zgarishi bilan bitta tranzaksiyada chaqiriladi. Ochilgan vazifa keyin egasi o'zgarsa ham yopilmaydi.
     */
    static void openIfNeeded(JdbcClient jdbc, long orderId) {
        jdbc.sql("""
                INSERT INTO invoice_task (order_id, branch_id)
                SELECT o.id, o.branch_id FROM sales_order o
                WHERE o.id = :id AND o.status IN ('LOADING', 'IN_TRANSIT') AND (o.payment_type = 'TRANSFER' OR\s""" + CodesOwners.EFFECTIVE
                        + " = 'CUSTOMER') ON CONFLICT (order_id) DO NOTHING")
                .param("id", orderId)
                .update();
    }

    private static final String SELECT = """
            SELECT t.id, t.status, t.opened_at, t.sent_at, t.efaktura_number, t.efaktura_date, sb.full_name AS sent_by,
                   o.id AS order_id, o.number AS order_number, o.status AS order_status, o.payment_type, o.total AS order_total,
                   """ + CodesOwners.EFFECTIVE + """
             AS owner, c.id AS customer_id, c.name AS customer, c.tin, b.name AS branch,
                   s.invoice_number, s.total AS sale_total, s.vat_total,
                   (SELECT count(*) FROM sales_order_mark m WHERE m.order_id = o.id AND m.status IN ('ACTIVE', 'SOLD')) AS codes,
                   EXISTS (SELECT 1 FROM invoice_task_file f WHERE f.task_id = t.id AND f.kind = 'EFAKTURA') AS has_ef,
                   EXISTS (SELECT 1 FROM invoice_task_file f WHERE f.task_id = t.id AND f.kind = 'TTN') AS has_ttn
            """;

    private static final String FROM = """
             FROM invoice_task t JOIN sales_order o ON o.id = t.order_id JOIN counterparty c ON c.id = o.customer_id
            JOIN branch b ON b.id = t.branch_id LEFT JOIN employee sb ON sb.id = t.sent_by
            LEFT JOIN LATERAL (SELECT s.invoice_number, s.total, s.vat_total FROM sale s WHERE s.order_id = o.id AND s.status = 'POSTED'
                               ORDER BY s.id DESC LIMIT 1) s ON true
            """;

    /** Bekor qilingan buyurtmaning yuborilmagan vazifasi navbatda ko'rinmaydi. */
    private static final String VISIBLE = " WHERE NOT (t.status = 'PENDING' AND o.status IN ('CANCELLED', 'REJECTED'))";

    private static InvoiceTask task(ResultSet rs) throws SQLException {
        String sale = rs.getString("invoice_number") == null ? null : rs.getBigDecimal("sale_total").toPlainString();
        return new InvoiceTask(rs.getLong("id"), InvoiceTaskStatus.valueOf(rs.getString("status")), rs.getLong("order_id"),
                rs.getString("order_number"), OrderModels.OrderStatus.valueOf(rs.getString("order_status")),
                OrderModels.PaymentType.valueOf(rs.getString("payment_type")), OrderModels.CodesOwner.valueOf(rs.getString("owner")),
                rs.getString("invoice_number"), rs.getLong("customer_id"), rs.getString("customer"), rs.getString("tin"), rs.getString("branch"),
                new Money(sale != null ? rs.getBigDecimal("sale_total") : rs.getBigDecimal("order_total")).toString(),
                rs.getBigDecimal("vat_total") == null || sale == null ? null : new Money(rs.getBigDecimal("vat_total")).toString(),
                rs.getInt("codes"), instant(rs.getTimestamp("opened_at")), instant(rs.getTimestamp("sent_at")), rs.getString("sent_by"),
                rs.getString("efaktura_number"), rs.getDate("efaktura_date") == null ? null : rs.getDate("efaktura_date").toLocalDate(),
                rs.getBoolean("has_ef"), rs.getBoolean("has_ttn"));
    }

    @Transactional(readOnly = true)
    InvoiceTaskPage list(Actor actor, InvoiceTaskFilter f, int page, int size) {
        StringBuilder where = new StringBuilder(VISIBLE);
        Map<String, Object> params = new LinkedHashMap<>();
        if (!actor.allBranches()) {
            where.append(" AND t.branch_id = :branch");
            params.put("branch", actor.branchId());
        } else if (f.branchId() != null) {
            where.append(" AND t.branch_id = :branch");
            params.put("branch", f.branchId());
        }
        if (f.from() != null) {
            where.append(" AND t.opened_at >= :from");
            params.put("from", Timestamp.from(f.from().atStartOfDay(TASHKENT).toInstant()));
        }
        if (f.to() != null) {
            where.append(" AND t.opened_at < :to");
            params.put("to", Timestamp.from(f.to().plusDays(1).atStartOfDay(TASHKENT).toInstant()));
        }
        if (f.q() != null && !f.q().isBlank()) {
            where.append(" AND (o.number LIKE :q OR upper(c.name) LIKE :q OR c.tin LIKE :q OR s.invoice_number LIKE :q OR upper(t.efaktura_number) LIKE :q)");
            params.put("q", "%" + f.q().strip().toUpperCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        Map<String, Long> counts = new LinkedHashMap<>();
        jdbc.sql("SELECT t.status, count(*) AS n" + FROM + where + " GROUP BY t.status").params(params)
                .query((rs, n) -> Map.entry(rs.getString("status"), rs.getLong("n"))).list()
                .forEach(e -> counts.put(e.getKey(), e.getValue()));
        if (f.status() != null) {
            where.append(" AND t.status = :status");
            params.put("status", f.status().name());
        }
        long total = jdbc.sql("SELECT count(*)" + FROM + where).params(params).query(Long.class).single();
        // Navbat: eng uzoq kutayotgan birinchi; yuborilganlar — eng yangisi birinchi.
        List<InvoiceTask> items = jdbc.sql(SELECT + FROM + where
                        + " ORDER BY t.status = 'SENT', CASE WHEN t.status = 'PENDING' THEN t.opened_at END, t.sent_at DESC, t.id DESC LIMIT :lim OFFSET :off")
                .params(params)
                .param("lim", size)
                .param("off", (long) page * size)
                .query((rs, n) -> task(rs))
                .list();
        return new InvoiceTaskPage(items, total, page, size, counts.getOrDefault("PENDING", 0L), counts.getOrDefault("SENT", 0L));
    }

    private Optional<InvoiceTask> find(Actor actor, String cond, long id) {
        record Row(long branchId, InvoiceTask t) {}
        return jdbc.sql(SELECT + ", t.branch_id AS task_branch" + FROM + " WHERE " + cond + " = :id")
                .param("id", id)
                .query((rs, n) -> new Row(rs.getLong("task_branch"), task(rs)))
                .optional()
                .filter(r -> actor.canAccessBranch(r.branchId()))
                .map(Row::t);
    }

    @Transactional(readOnly = true)
    InvoiceTask get(Actor actor, long id) {
        return find(actor, "t.id", id).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    /** Buyurtma kartochkasi «Hujjatlar»: vazifa (bo'lsa) va fayllari. */
    @Transactional(readOnly = true)
    Optional<InvoiceTaskDetail> byOrder(Actor actor, long orderId) {
        return find(actor, "t.order_id", orderId).map(t -> new InvoiceTaskDetail(t, files(t.id())));
    }

    private List<InvoiceFile> files(long taskId) {
        return jdbc.sql("""
                SELECT f.id, f.kind, f.file_name, f.content_type, f.size_bytes, e.full_name AS created_by, f.created_at
                FROM invoice_task_file f JOIN employee e ON e.id = f.created_by WHERE f.task_id = :t ORDER BY f.id DESC""")
                .param("t", taskId)
                .query((rs, n) -> new InvoiceFile(rs.getLong("id"), InvoiceFileKind.valueOf(rs.getString("kind")), rs.getString("file_name"),
                        rs.getString("content_type"), rs.getInt("size_bytes"), rs.getString("created_by"), instant(rs.getTimestamp("created_at"))))
                .list();
    }

    private record Head(long branchId, String status) {}

    private Head lock(Actor actor, long id) {
        return jdbc.sql("SELECT branch_id, status FROM invoice_task WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, n) -> new Head(rs.getLong("branch_id"), rs.getString("status")))
                .optional()
                .filter(x -> actor.canAccessBranch(x.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    /** E-faktura / TTN faylini yuklash: PDF, JPG, PNG, ≤ 10 MB; faqat «Yuborilishi kerak» holatida. */
    @Transactional
    long upload(Actor actor, long id, InvoiceFileKind kind, String fileName, String contentType, byte[] data) {
        String type = normalizeType(contentType, fileName);
        if (type == null || !FILE_TYPES.contains(type) || !magicMatches(type, data)) {
            throw MedixException.badRequest("invoiceTask.fileType");
        }
        if (data.length == 0 || data.length > MAX_FILE_BYTES) {
            throw MedixException.badRequest("invoiceTask.fileSize");
        }
        Head h = lock(actor, id);
        if (!InvoiceTaskStatus.PENDING.name().equals(h.status())) {
            throw MedixException.conflict("invoiceTask.alreadySent");
        }
        String name = fileName == null || fileName.isBlank() ? kind.name().toLowerCase(Locale.ROOT) : fileName.strip();
        name = name.replaceAll("[\\r\\n\"\\\\/]", "_");
        if (name.length() > 200) {
            name = name.substring(name.length() - 200);
        }
        long fileId = jdbc.sql("""
                INSERT INTO invoice_task_file (task_id, kind, file_name, content_type, size_bytes, data, created_by)
                VALUES (:t, :k, :n, :ct, :sz, :d, :by) RETURNING id""")
                .param("t", id)
                .param("k", kind.name())
                .param("n", name)
                .param("ct", type)
                .param("sz", data.length)
                .param("d", data)
                .param("by", actor.employeeId())
                .query(Long.class)
                .single();
        audit.record(AuditEntry.of("invoiceTask.file", "invoice_task", id).change(Map.of(), Map.of("kind", kind.name(), "file", name)));
        return fileId;
    }

    /** «Yuborildi deb belgilash»: e-faktura raqami va sanasi + yuklangan e-faktura va TTN fayllari majburiy. */
    @Transactional
    void markSent(Actor actor, long id, String number, LocalDate date) {
        Head h = lock(actor, id);
        if (!InvoiceTaskStatus.PENDING.name().equals(h.status())) {
            throw MedixException.conflict("invoiceTask.alreadySent");
        }
        if (date.isAfter(LocalDate.now(clock.withZone(TASHKENT)))) {
            throw MedixException.badRequest("invoiceTask.futureDate");
        }
        record Kinds(boolean ef, boolean ttn) {}
        Kinds k = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM invoice_task_file WHERE task_id = :t AND kind = 'EFAKTURA') AS ef,
                       EXISTS (SELECT 1 FROM invoice_task_file WHERE task_id = :t AND kind = 'TTN') AS ttn""")
                .param("t", id)
                .query((rs, n) -> new Kinds(rs.getBoolean("ef"), rs.getBoolean("ttn")))
                .single();
        if (!k.ef()) {
            throw MedixException.badRequest("invoiceTask.efakturaFileRequired");
        }
        if (!k.ttn()) {
            throw MedixException.badRequest("invoiceTask.ttnFileRequired");
        }
        jdbc.sql("""
                UPDATE invoice_task SET status = 'SENT', efaktura_number = :n, efaktura_date = :d, sent_by = :by, sent_at = now() WHERE id = :id""")
                .param("n", number.strip())
                .param("d", java.sql.Date.valueOf(date))
                .param("by", actor.employeeId())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("invoiceTask.sent", "invoice_task", id)
                .change(Map.of("status", "PENDING"), Map.of("status", "SENT", "efaktura", number.strip(), "date", date.toString())));
    }

    @Transactional(readOnly = true)
    FileData file(Actor actor, long fileId) {
        record Row(long branchId, FileData f) {}
        return jdbc.sql("""
                SELECT t.branch_id, f.file_name, f.content_type, f.data FROM invoice_task_file f JOIN invoice_task t ON t.id = f.task_id
                WHERE f.id = :id""")
                .param("id", fileId)
                .query((rs, n) -> new Row(rs.getLong("branch_id"), new FileData(rs.getString("file_name"), rs.getString("content_type"),
                        rs.getBytes("data"))))
                .optional()
                .filter(r -> actor.canAccessBranch(r.branchId()))
                .map(Row::f)
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    /** 1C ga yuklash uchun kodlar: to'liq kod, GTIN, mahsulot, Q/D. */
    record CodeRow(String scanned, String gtin, String product, MarkingModels.MarkKind kind) {}

    @Transactional(readOnly = true)
    List<CodeRow> codes(Actor actor, long id) {
        InvoiceTask t = get(actor, id);
        return jdbc.sql("""
                SELECT coalesce(m.scanned_raw, m.raw) AS scanned, m.gtin, p.name AS product, m.kind
                FROM sales_order_mark m JOIN sales_order_line l ON l.id = m.line_id JOIN product p ON p.id = l.product_id
                WHERE m.order_id = :o AND m.status IN ('ACTIVE', 'SOLD') ORDER BY l.line_no, m.id""")
                .param("o", t.orderId())
                .query((rs, n) -> new CodeRow(rs.getString("scanned"), rs.getString("gtin"), rs.getString("product"),
                        "Q".equals(rs.getString("kind")) ? MarkingModels.MarkKind.BOX : MarkingModels.MarkKind.UNIT))
                .list();
    }

    /** Brauzer yuborgan turni (bo'lmasa — fayl kengaytmasidan) aniqlaydi. */
    static String normalizeType(String contentType, String fileName) {
        String ct = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT).strip();
        if (ct.equals("image/jpg")) {
            ct = "image/jpeg";
        }
        if (FILE_TYPES.contains(ct)) {
            return ct;
        }
        String n = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        if (n.endsWith(".pdf")) {
            return "application/pdf";
        }
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (n.endsWith(".png")) {
            return "image/png";
        }
        return null;
    }

    /** Fayl mazmuni turiga mos: PDF «%PDF», JPEG FF D8, PNG 89 50 4E 47. */
    static boolean magicMatches(String type, byte[] d) {
        return switch (type) {
            case "application/pdf" -> d.length >= 4 && d[0] == '%' && d[1] == 'P' && d[2] == 'D' && d[3] == 'F';
            case "image/jpeg" -> d.length >= 3 && (d[0] & 0xFF) == 0xFF && (d[1] & 0xFF) == 0xD8 && (d[2] & 0xFF) == 0xFF;
            case "image/png" -> d.length >= 4 && (d[0] & 0xFF) == 0x89 && d[1] == 'P' && d[2] == 'N' && d[3] == 'G';
            default -> false;
        };
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
