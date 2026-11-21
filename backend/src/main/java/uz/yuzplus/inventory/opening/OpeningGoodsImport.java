package uz.yuzplus.inventory.opening;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.yuzplus.inventory.ZoneType;
import uz.yuzplus.inventory.opening.OpeningBalances.ZoneRef;
import uz.yuzplus.inventory.opening.OpeningModels.OpeningLineRequest;
import uz.yuzplus.inventory.opening.OpeningModels.OpeningRequest;
import uz.yuzplus.shared.security.Actor;

/**
 * BQ (tovar) — bir fayldan ko'chirish uchun ochiq API (integration moduli, BQ1). Yangi biznes qoidasi yo'q: qatorlar tekshiruvi,
 * qoralama va o'tkazish — {@link OpeningBalances} orqali. Har ombor uchun bitta qoralama: mavjud bo'lsa — qatorlari almashtiriladi.
 */
@Service
public class OpeningGoodsImport {

    /** Qoralama qatori (pul — satr, {@code 12500.00}). */
    public record Line(long productId, long zoneId, String batchNumber, LocalDate producedOn, LocalDate expiryDate, String cost, boolean bonus,
            int qty) {}

    /** Omborning hozirgi BQ holati. */
    public enum Existing { NONE, DRAFT, POSTED }

    private final OpeningBalances openings;
    private final JdbcClient jdbc;

    OpeningGoodsImport(OpeningBalances openings, JdbcClient jdbc) {
        this.openings = openings;
        this.jdbc = jdbc;
    }

    /** Zona nomi, turi (MAIN, SAFE …) yoki standart nomi bo'yicha; bo'sh — Asosiy saqlash. Topilmasa — bo'sh. */
    @Transactional(readOnly = true)
    public Optional<Long> zone(long warehouseId, String name) {
        List<ZoneRef> zones = openings.zones(warehouseId);
        String k = key(name);
        for (ZoneRef z : zones) {
            boolean match = k.isEmpty()
                    ? z.type() == ZoneType.MAIN
                    : key(z.name()).equals(k) || key(z.type().name()).equals(k) || key(z.type().defaultName()).equals(k);
            if (match) {
                return Optional.of(z.id());
            }
        }
        return Optional.empty();
    }

    /** Qatorlar qoidalari (qoralama bilan bir xil). Natija: «N-qator: sabab» (N — ro'yxatdagi tartib, 1 dan). */
    @Transactional(readOnly = true)
    public List<String> validate(long warehouseId, List<Line> lines) {
        return openings.validate(warehouseId, requests(lines));
    }

    @Transactional(readOnly = true)
    public Existing existing(long warehouseId) {
        String s = jdbc.sql("""
                SELECT CASE WHEN bool_or(status = 'POSTED') THEN 'POSTED' WHEN bool_or(status = 'DRAFT') THEN 'DRAFT' ELSE 'NONE' END
                FROM opening_balance WHERE warehouse_id = :w""")
                .param("w", warehouseId)
                .query(String.class)
                .single();
        return Existing.valueOf(s);
    }

    /** Qoralama yaratadi yoki omborning mavjud qoralamasini almashtiradi. Qaytaradi: hujjat id. */
    @Transactional
    public long replaceDraft(Actor actor, long branchId, long warehouseId, LocalDate cutoff, List<Line> lines, String fileName, String note) {
        Long draft = jdbc.sql("SELECT id FROM opening_balance WHERE warehouse_id = :w AND status = 'DRAFT' ORDER BY id DESC LIMIT 1")
                .param("w", warehouseId)
                .query(Long.class)
                .optional()
                .orElse(null);
        OpeningRequest head = new OpeningRequest(branchId, warehouseId, cutoff, note, List.of());
        long id;
        if (draft == null) {
            id = openings.create(actor, head);
        } else {
            id = draft;
            openings.update(actor, id, head);
        }
        openings.replaceFromImport(actor, id, requests(lines), fileName);
        return id;
    }

    @Transactional
    public void post(Actor actor, long id) {
        openings.post(actor, id);
    }

    @Transactional(readOnly = true)
    public String number(long id) {
        return jdbc.sql("SELECT number FROM opening_balance WHERE id = :id").param("id", id).query(String.class).single();
    }

    private static List<OpeningLineRequest> requests(List<Line> lines) {
        return lines.stream()
                .map(l -> new OpeningLineRequest(l.productId(), l.zoneId(), l.batchNumber(), l.producedOn(), l.expiryDate(), l.cost(), l.bonus(),
                        l.qty()))
                .toList();
    }

    private static String key(String s) {
        return s == null ? "" : s.strip().toLowerCase(Locale.ROOT).replaceAll("[ʻʼ'`‘’]", "");
    }
}
