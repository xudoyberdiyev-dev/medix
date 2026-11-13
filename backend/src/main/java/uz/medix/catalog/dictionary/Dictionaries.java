package uz.medix.catalog.dictionary;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.catalog.product.Products;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;

/** Oddiy ma'lumotnomalar: ro'yxat, qo'shish, tahrirlash, nofaol qilish (o'chirilmaydi). */
@Service
class Dictionaries {

    record Entry(long id, String name, @Schema(nullable = true) String shortName,
            @Schema(nullable = true, description = "Faqat birlik — soliq klassifikatori kodi (hisob-faktura)") String code, boolean active) {}

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final Products products;

    Dictionaries(JdbcClient jdbc, AuditLog audit, Products products) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.products = products;
    }

    @Transactional(readOnly = true)
    List<Entry> list(DictionaryKind kind) {
        return jdbc.sql("SELECT id, name, short_name, " + codeCol(kind) + " AS code, active FROM " + kind.table()
                        + " ORDER BY active DESC, lower(name)")
                .query(Entry.class)
                .list();
    }

    @Transactional
    Entry create(DictionaryKind kind, String name, String shortName, String code) {
        String sn = normalizeShort(kind, shortName);
        String c = normalizeCode(kind, code);
        ensureUnique(kind, name, 0L);
        long id = jdbc.sql("INSERT INTO " + kind.table() + " (name, short_name) VALUES (:n, :s) RETURNING id")
                .param("n", name.strip())
                .param("s", sn)
                .query(Long.class)
                .single();
        writeCode(kind, id, c);
        audit.record(AuditEntry.of(kind.table() + ".create", kind.table(), id).change(null, snapshot(name.strip(), sn, c)));
        return find(kind, id);
    }

    @Transactional
    Entry update(DictionaryKind kind, long id, String name, String shortName, String code) {
        Entry before = lock(kind, id);
        String sn = normalizeShort(kind, shortName);
        String c = normalizeCode(kind, code);
        ensureUnique(kind, name, id);
        jdbc.sql("UPDATE " + kind.table() + " SET name = :n, short_name = :s, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("n", name.strip())
                .param("s", sn)
                .param("id", id)
                .update();
        writeCode(kind, id, c);
        audit.record(AuditEntry.of(kind.table() + ".update", kind.table(), id)
                .change(snapshot(before.name(), before.shortName(), before.code()), snapshot(name.strip(), sn, c)));
        if (kind == DictionaryKind.MANUFACTURER) {
            products.refreshByManufacturer(id);
        }
        return find(kind, id);
    }

    @Transactional
    Entry setActive(DictionaryKind kind, long id, boolean active) {
        Entry before = lock(kind, id);
        if (before.active() == active) {
            return before;
        }
        jdbc.sql("UPDATE " + kind.table() + " SET active = :a, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("a", active)
                .param("id", id)
                .update();
        audit.record(AuditEntry.of(kind.table() + (active ? ".activate" : ".deactivate"), kind.table(), id)
                .change(Map.of("active", before.active()), Map.of("active", active)));
        return find(kind, id);
    }

    private Entry find(DictionaryKind kind, long id) {
        return jdbc.sql("SELECT id, name, short_name, " + codeCol(kind) + " AS code, active FROM " + kind.table() + " WHERE id = :id")
                .param("id", id)
                .query(Entry.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private Entry lock(DictionaryKind kind, long id) {
        jdbc.sql("SELECT id FROM " + kind.table() + " WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query(Long.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        return find(kind, id);
    }

    private void ensureUnique(DictionaryKind kind, String name, long exceptId) {
        boolean taken = jdbc.sql("SELECT EXISTS (SELECT 1 FROM " + kind.table() + " WHERE lower(name) = lower(:n) AND id <> :id)")
                .param("n", name.strip())
                .param("id", exceptId)
                .query(Boolean.class)
                .single();
        if (taken) {
            throw MedixException.conflict("dictionary.duplicate", name.strip());
        }
    }

    private static String normalizeShort(DictionaryKind kind, String shortName) {
        if (!kind.shortNameUsed() || shortName == null || shortName.isBlank()) {
            return null;
        }
        String s = shortName.strip();
        if (kind == DictionaryKind.COUNTRY) {
            s = s.toUpperCase(Locale.ROOT);
            if (!s.matches("^[A-Z]{2}$")) {
                throw MedixException.badRequest("dictionary.countryCode");
            }
        }
        return s;
    }

    private static Map<String, Object> snapshot(String name, String shortName, String code) {
        Map<String, Object> m = new HashMap<>();
        m.put("name", name);
        m.put("shortName", shortName);
        if (code != null) {
            m.put("code", code);
        }
        return m;
    }

    /** Kod ustuni faqat birlikda (V91); boshqa jadvallarda — NULL. */
    private static String codeCol(DictionaryKind kind) {
        return kind == DictionaryKind.UNIT ? "code" : "CAST(NULL AS VARCHAR)";
    }

    private static String normalizeCode(DictionaryKind kind, String code) {
        if (kind != DictionaryKind.UNIT || code == null || code.isBlank()) {
            return null;
        }
        String c = code.strip();
        if (!c.matches("^[0-9]{1,10}$")) {
            throw MedixException.badRequest("dictionary.unitCode");
        }
        return c;
    }

    private void writeCode(DictionaryKind kind, long id, String code) {
        if (kind == DictionaryKind.UNIT) {
            jdbc.sql("UPDATE unit SET code = :c WHERE id = :id").param("c", code).param("id", id).update();
        }
    }
}
