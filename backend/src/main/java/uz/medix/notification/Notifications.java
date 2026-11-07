package uz.medix.notification;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.text.Texts;

/**
 * Bildirishnomalar — notification modulining ochiq API'si. Qabul qiluvchilar ruxsat kaliti bo'yicha (rol matritsasidan):
 * faol xodimlar — shu filialdagi yoki barcha filiallarni ko'radigan rol (Direktor, Admin, Buxgalter — SPEC 13). Bir xil
 * {@code dedupKey} bir xodimga ikki marta yozilmaydi (kunlik eslatmalar takrorlanmaydi).
 */
@Service
public class Notifications {

    /** Barcha filiallar doirasidagi rollar (identity.MedixPrincipal bilan bir xil — SPEC 13). */
    static final Set<String> ALL_BRANCH_ROLES = Set.of("DIRECTOR", "ADMIN");

    /**
     * {@code text} — {@code notification.<text>} kaliti, {@code args} — o'rinbosarlar: ro'yxat o'qilganda matn o'quvchi tilida
     * qayta yasaladi ({@link #render}); {@code title}/{@code body} — o'zbekcha zaxira.
     */
    public record Message(String kind, String title, String body, String link, String dedupKey, String text, List<String> args) {
        public Message {
            Objects.requireNonNull(kind);
            Objects.requireNonNull(title);
            Objects.requireNonNull(dedupKey);
            args = args == null ? List.of() : List.copyOf(args);
        }

        /** Kalitsiz (tayyor matn) xabar — hamma tilda shu matn. */
        public Message(String kind, String title, String body, String link, String dedupKey) {
            this(kind, title, body, link, dedupKey, null, List.of());
        }
    }

    /** O'rinbosarlar bitta ustunda: birlik ajratgichi (U+001F) bilan — matnda uchramaydi. */
    private static final String SEP = "\u001F";

    static String joinArgs(List<String> args) {
        return String.join(SEP, args);
    }

    static Object[] splitArgs(String stored) {
        return stored == null || stored.isEmpty() ? new Object[0] : stored.split(SEP, -1);
    }

    /** Saqlangan kalitdan sarlavha va tana — berilgan tilda. Kalit yo'q (eski yozuv) — saqlangan matn. */
    record Rendered(String title, String body) {}

    Rendered render(String text, String args, String storedTitle, String storedBody, Locale locale) {
        if (text == null) {
            return new Rendered(storedTitle, storedBody);
        }
        Object[] a = splitArgs(args);
        String title = texts.getIn(locale, "notification." + text + ".title", a);
        String body = texts.findIn(locale, "notification." + text + ".body", a).filter(b -> !b.isBlank()).map(Notifications::clip).orElse(null);
        return new Rendered(title, body);
    }

    private final JdbcClient jdbc;
    private final NotificationStream stream;
    private final Texts texts;

    Notifications(JdbcClient jdbc, NotificationStream stream, Texts texts) {
        this.jdbc = jdbc;
        this.stream = stream;
        this.texts = texts;
    }

    /**
     * Matni kalitdan (T12-audit №20): sarlavha — {@code notification.<text>.title}, tana (ixtiyoriy) —
     * {@code notification.<text>.body}; ikkalasi ham bir xil o'rinbosarlar ({@code {0}}, {@code {1}} …) bilan. Tana 500
     * belgidan uzun bo'lsa qisqartiriladi (masalan, foydalanuvchi yozgan rad etish sababi).
     */
    public Message message(String kind, String text, String link, String dedupKey, Object... args) {
        String title = texts.get("notification." + text + ".title", args);
        String body = texts.find("notification." + text + ".body", args).filter(b -> !b.isBlank()).map(Notifications::clip).orElse(null);
        List<String> strings = Arrays.stream(Texts.strings(args)).map(String::valueOf).toList();
        return new Message(kind, title, body, link, dedupKey, text, strings);
    }

    static String clip(String text) {
        return text.length() <= 500 ? text : text.substring(0, 499) + "…";
    }

    /** Ruxsat kaliti egalari (filial doirasida) va qo'shimcha xodimlarga. Qaytaradi: yangi yozilganlar soni. */
    @Transactional
    public int notify(String permission, long branchId, Collection<Long> extraEmployees, Message m) {
        Set<Long> to = new LinkedHashSet<>(jdbc.sql("""
                SELECT e.id FROM employee e JOIN role r ON r.id = e.role_id
                JOIN role_permission rp ON rp.role_id = r.id AND rp.permission_key = :key
                WHERE e.status = 'ACTIVE' AND (e.branch_id = :b OR r.code IN (:all) OR (r.code = 'ACCOUNTANT' AND e.all_branches))
                ORDER BY e.id""")
                .param("key", permission)
                .param("b", branchId)
                .param("all", ALL_BRANCH_ROLES)
                .query(Long.class)
                .list());
        if (!extraEmployees.isEmpty()) {
            to.addAll(jdbc.sql("SELECT id FROM employee WHERE id IN (:ids) AND status = 'ACTIVE'")
                    .param("ids", extraEmployees)
                    .query(Long.class)
                    .list());
        }
        List<Long> notified = new ArrayList<>();
        for (long e : to) {
            int n = jdbc.sql("""
                    INSERT INTO notification (employee_id, kind, title, body, link, dedup_key, text_key, text_args)
                    VALUES (:e, :k, :t, :body, :link, :d, :tk, :ta)
                    ON CONFLICT (employee_id, dedup_key) DO NOTHING""")
                    .param("e", e)
                    .param("k", m.kind())
                    .param("t", m.title())
                    .param("body", m.body())
                    .param("link", m.link())
                    .param("d", m.dedupKey())
                    .param("tk", m.text())
                    .param("ta", joinArgs(m.args()))
                    .update();
            if (n > 0) {
                notified.add(e);
            }
        }
        if (!notified.isEmpty()) {
            stream.changedAfterCommit(notified);
        }
        return notified.size();
    }
}
