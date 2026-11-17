package uz.medix.notification;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.notification.MessageModels.Assignee;
import uz.medix.notification.MessageModels.Audience;
import uz.medix.notification.MessageModels.BranchOption;
import uz.medix.notification.MessageModels.Created;
import uz.medix.notification.MessageModels.FileData;
import uz.medix.notification.MessageModels.FileInfo;
import uz.medix.notification.MessageModels.MessageItem;
import uz.medix.notification.MessageModels.MessageKind;
import uz.medix.notification.MessageModels.NewThreadRequest;
import uz.medix.notification.MessageModels.Person;
import uz.medix.notification.MessageModels.ReadReceipt;
import uz.medix.notification.MessageModels.Recipients;
import uz.medix.notification.MessageModels.RoleOption;
import uz.medix.notification.MessageModels.SendRequest;
import uz.medix.notification.MessageModels.TaskItem;
import uz.medix.notification.MessageModels.TaskScope;
import uz.medix.notification.MessageModels.TaskStatus;
import uz.medix.notification.MessageModels.ThreadDetail;
import uz.medix.notification.MessageModels.ThreadKind;
import uz.medix.notification.MessageModels.ThreadList;
import uz.medix.notification.MessageModels.ThreadSummary;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/**
 * O12: ichki xabarlar va topshiriqlar. Har xodim o'z filialidagi har kimga (va barcha filiallar doirasidagi rahbarlarga)
 * yozadi; barcha filiallar doirasi — hammaga. Rol yoki butun filialga — faqat {@code messages.broadcast}. Har amalda
 * qatnashchilik serverda tekshiriladi: suhbat, xabar va fayl faqat qatnashchilarga ko'rinadi (aks holda — 404).
 */
@Service
class Messages {

    static final String SSE_EVENT = "messages";
    static final Duration EDIT_WINDOW = Duration.ofMinutes(15);
    static final int MAX_FILE_BYTES = 20 * 1024 * 1024;
    static final int MAX_FILES = 10;
    private static final int PAGE = 50;

    /** Xodim joriy xodimga ko'rinadimi (filial doirasi) — {@code e} va {@code r} taxalluslari bilan. */
    private static final String VISIBLE = """
            e.status = 'ACTIVE' AND (:all OR e.branch_id = :b OR r.code IN ('DIRECTOR', 'ADMIN') OR (r.code = 'ACCOUNTANT' AND e.all_branches))""";

    private final JdbcClient jdbc;
    private final NotificationStream stream;
    private final Notifications notifications;
    private final AuditLog audit;

    Messages(JdbcClient jdbc, NotificationStream stream, Notifications notifications, AuditLog audit) {
        this.jdbc = jdbc;
        this.stream = stream;
        this.notifications = notifications;
        this.audit = audit;
    }

    private static Long branchOf(Actor a) {
        return a.branchId() == null ? -1L : a.branchId();
    }

    // ---------------------------------------------------------------- qabul qiluvchilar

    @Transactional(readOnly = true)
    Recipients recipients(Actor a, boolean canBroadcast) {
        List<Person> people = jdbc.sql("""
                SELECT e.id, e.full_name, r.code AS role_code, r.name AS role_name, e.branch_id, b.name AS branch_name
                FROM employee e JOIN role r ON r.id = e.role_id LEFT JOIN branch b ON b.id = e.branch_id
                WHERE e.id <> :me""" + " AND " + VISIBLE + " ORDER BY e.full_name, e.id LIMIT 1000")
                .param("me", a.employeeId())
                .param("all", a.allBranches())
                .param("b", branchOf(a))
                .query(Messages::person)
                .list();
        List<RoleOption> roles = canBroadcast
                ? jdbc.sql("SELECT code, name FROM role ORDER BY name").query((rs, n) -> new RoleOption(rs.getString(1), rs.getString(2))).list()
                : List.of();
        List<BranchOption> branches = canBroadcast
                ? jdbc.sql("SELECT id, name FROM branch WHERE :all OR id = :b ORDER BY name")
                        .param("all", a.allBranches())
                        .param("b", branchOf(a))
                        .query((rs, n) -> new BranchOption(rs.getLong(1), rs.getString(2)))
                        .list()
                : List.of();
        return new Recipients(people, roles, branches, canBroadcast);
    }

    // ---------------------------------------------------------------- suhbatlar

    @Transactional(readOnly = true)
    ThreadList threads(Actor a, String q) {
        String like = q == null || q.isBlank() ? null : "%" + q.strip().toLowerCase(Locale.ROOT) + "%";
        List<Long> ids = jdbc.sql("""
                SELECT t.id FROM msg_thread t JOIN msg_participant p ON p.thread_id = t.id AND p.employee_id = :me
                WHERE CAST(:q AS text) IS NULL
                   OR EXISTS (SELECT 1 FROM msg_participant o JOIN employee e ON e.id = o.employee_id
                              WHERE o.thread_id = t.id AND o.employee_id <> :me AND lower(e.full_name) LIKE :q)
                   OR EXISTS (SELECT 1 FROM msg_message m WHERE m.thread_id = t.id AND m.deleted_at IS NULL
                              AND (lower(m.body) LIKE :q OR lower(m.task_title) LIKE :q))
                   OR EXISTS (SELECT 1 FROM role r WHERE r.code = t.audience_role AND lower(r.name) LIKE :q)
                   OR EXISTS (SELECT 1 FROM branch b WHERE b.id = t.audience_branch_id AND lower(b.name) LIKE :q)
                ORDER BY t.last_message_at DESC, t.id DESC LIMIT 200""")
                .param("me", a.employeeId())
                .param("q", like)
                .query(Long.class)
                .list();
        List<ThreadSummary> items = summaries(a.employeeId(), ids);
        long unread = unreadTotal(a.employeeId());
        return new ThreadList(items, unread);
    }

    long unreadTotal(long me) {
        return jdbc.sql("""
                SELECT count(*) FROM msg_participant p JOIN msg_message m ON m.thread_id = p.thread_id
                WHERE p.employee_id = :me AND m.id > p.last_read_id AND m.sender_id <> :me AND m.deleted_at IS NULL""")
                .param("me", me)
                .query(Long.class)
                .single();
    }

    long openTasks(long me) {
        return jdbc.sql("SELECT count(*) FROM msg_task_assignee WHERE employee_id = :me AND status IN ('NEW', 'IN_PROGRESS')")
                .param("me", me)
                .query(Long.class)
                .single();
    }

    private List<ThreadSummary> summaries(long me, List<Long> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<Long, List<Person>> others = new HashMap<>();
        Map<Long, Integer> counts = new HashMap<>();
        jdbc.sql("""
                SELECT p.thread_id, e.id, e.full_name, r.code AS role_code, r.name AS role_name, e.branch_id, b.name AS branch_name
                FROM msg_participant p JOIN employee e ON e.id = p.employee_id JOIN role r ON r.id = e.role_id
                LEFT JOIN branch b ON b.id = e.branch_id
                WHERE p.thread_id IN (:ids) ORDER BY p.thread_id, e.full_name, e.id""")
                .param("ids", ids)
                .query(rs -> {
                    long t = rs.getLong("thread_id");
                    counts.merge(t, 1, Integer::sum);
                    if (rs.getLong("id") != me) {
                        List<Person> list = others.computeIfAbsent(t, k -> new ArrayList<>());
                        if (list.size() < 5) {
                            list.add(person(rs, 0));
                        }
                    }
                });
        return jdbc.sql("""
                SELECT t.id, t.kind, t.audience, t.audience_role, ar.name AS role_name, ab.name AS branch_name, t.last_message_at,
                       lm.kind AS last_kind, lm.body AS last_body, lm.task_title AS last_title, lm.deleted_at AS last_deleted,
                       ls.full_name AS last_sender,
                       (SELECT count(*) FROM msg_message m WHERE m.thread_id = t.id AND m.id > p.last_read_id
                          AND m.sender_id <> :me AND m.deleted_at IS NULL) AS unread
                FROM msg_thread t JOIN msg_participant p ON p.thread_id = t.id AND p.employee_id = :me
                LEFT JOIN role ar ON ar.code = t.audience_role
                LEFT JOIN branch ab ON ab.id = t.audience_branch_id
                LEFT JOIN LATERAL (SELECT * FROM msg_message m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) lm ON true
                LEFT JOIN employee ls ON ls.id = lm.sender_id
                WHERE t.id IN (:ids) ORDER BY t.last_message_at DESC, t.id DESC""")
                .param("me", me)
                .param("ids", ids)
                .query((rs, n) -> {
                    long t = rs.getLong("id");
                    String kind = rs.getString("last_kind");
                    String text = rs.getTimestamp("last_deleted") != null ? null
                            : "TASK".equals(kind) ? rs.getString("last_title") : rs.getString("last_body");
                    return new ThreadSummary(t, ThreadKind.valueOf(rs.getString("kind")), Audience.valueOf(rs.getString("audience")),
                            rs.getString("audience_role"), rs.getString("role_name"), rs.getString("branch_name"),
                            others.getOrDefault(t, List.of()), counts.getOrDefault(t, 0),
                            text == null ? null : clip(text, 140), kind == null ? null : MessageKind.valueOf(kind),
                            rs.getString("last_sender"), rs.getTimestamp("last_message_at").toInstant(), rs.getLong("unread"));
                })
                .list();
    }

    private void requireParticipant(long me, long threadId) {
        boolean ok = jdbc.sql("SELECT EXISTS (SELECT 1 FROM msg_participant WHERE thread_id = :t AND employee_id = :me)")
                .param("t", threadId)
                .param("me", me)
                .query(Boolean.class)
                .single();
        if (!ok) {
            throw MedixException.notFound("error.notFound");
        }
    }

    private List<Long> participants(long threadId) {
        return jdbc.sql("SELECT employee_id FROM msg_participant WHERE thread_id = :t ORDER BY employee_id")
                .param("t", threadId)
                .query(Long.class)
                .list();
    }

    @Transactional(readOnly = true)
    ThreadDetail thread(Actor a, long threadId, Long beforeId) {
        long me = a.employeeId();
        requireParticipant(me, threadId);
        ThreadSummary summary = summaries(me, List.of(threadId)).getFirst();
        List<Person> people = jdbc.sql("""
                SELECT e.id, e.full_name, r.code AS role_code, r.name AS role_name, e.branch_id, b.name AS branch_name
                FROM msg_participant p JOIN employee e ON e.id = p.employee_id JOIN role r ON r.id = e.role_id
                LEFT JOIN branch b ON b.id = e.branch_id WHERE p.thread_id = :t ORDER BY e.full_name, e.id""")
                .param("t", threadId)
                .query(Messages::person)
                .list();
        List<Long> ids = jdbc.sql("""
                SELECT id FROM msg_message WHERE thread_id = :t AND (CAST(:before AS bigint) IS NULL OR id < :before)
                ORDER BY id DESC LIMIT :n""")
                .param("t", threadId)
                .param("before", beforeId)
                .param("n", PAGE + 1)
                .query(Long.class)
                .list();
        boolean more = ids.size() > PAGE;
        List<Long> page = new ArrayList<>(more ? ids.subList(0, PAGE) : ids);
        java.util.Collections.reverse(page);
        return new ThreadDetail(summary, people, items(me, page), more);
    }

    private List<MessageItem> items(long me, List<Long> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<Long, List<FileInfo>> files = new HashMap<>();
        jdbc.sql("SELECT id, message_id, file_name, content_type, size_bytes FROM msg_file WHERE message_id IN (:ids) ORDER BY id")
                .param("ids", ids)
                .query(rs -> {
                    files.computeIfAbsent(rs.getLong("message_id"), k -> new ArrayList<>())
                            .add(new FileInfo(rs.getLong("id"), rs.getString("file_name"), rs.getString("content_type"),
                                    rs.getInt("size_bytes"), isImage(rs.getString("content_type"))));
                });
        Map<Long, List<Assignee>> assignees = assigneesOf(ids);
        Instant editFrom = Instant.now().minus(EDIT_WINDOW);
        return jdbc.sql("""
                SELECT m.*, s.full_name AS sender_name,
                       (SELECT count(*) FROM msg_participant p WHERE p.thread_id = m.thread_id AND p.employee_id <> m.sender_id) AS recipients,
                       (SELECT count(*) FROM msg_participant p WHERE p.thread_id = m.thread_id AND p.employee_id <> m.sender_id
                          AND p.last_read_id >= m.id) AS reads
                FROM msg_message m JOIN employee s ON s.id = m.sender_id WHERE m.id IN (:ids) ORDER BY m.id""")
                .param("ids", ids)
                .query((rs, n) -> {
                    long id = rs.getLong("id");
                    Instant created = rs.getTimestamp("created_at").toInstant();
                    Instant deleted = instant(rs.getTimestamp("deleted_at"));
                    boolean own = rs.getLong("sender_id") == me;
                    return new MessageItem(id, rs.getLong("thread_id"), rs.getLong("sender_id"), rs.getString("sender_name"),
                            MessageKind.valueOf(rs.getString("kind")), deleted == null ? rs.getString("body") : null,
                            rs.getString("task_title"), instant(rs.getTimestamp("due_at")), created, instant(rs.getTimestamp("edited_at")),
                            deleted, deleted == null ? files.getOrDefault(id, List.of()) : List.of(), assignees.getOrDefault(id, List.of()),
                            rs.getInt("reads"), rs.getInt("recipients"), own && deleted == null && created.isAfter(editFrom));
                })
                .list();
    }

    private Map<Long, List<Assignee>> assigneesOf(Collection<Long> messageIds) {
        Map<Long, List<Assignee>> out = new HashMap<>();
        if (messageIds.isEmpty()) {
            return out;
        }
        jdbc.sql("""
                SELECT a.message_id, a.employee_id, e.full_name, a.status, a.updated_at, a.done_at
                FROM msg_task_assignee a JOIN employee e ON e.id = a.employee_id
                WHERE a.message_id IN (:ids) ORDER BY a.message_id, e.full_name, e.id""")
                .param("ids", messageIds)
                .query(rs -> {
                    out.computeIfAbsent(rs.getLong("message_id"), k -> new ArrayList<>())
                            .add(new Assignee(rs.getLong("employee_id"), rs.getString("full_name"), TaskStatus.valueOf(rs.getString("status")),
                                    rs.getTimestamp("updated_at").toInstant(), instant(rs.getTimestamp("done_at"))));
                });
        return out;
    }

    @Transactional(readOnly = true)
    List<ReadReceipt> reads(Actor a, long messageId) {
        long me = a.employeeId();
        long threadId = threadOf(messageId);
        requireParticipant(me, threadId);
        return jdbc.sql("""
                SELECT e.id, e.full_name, p.last_read_id >= m.id AS read
                FROM msg_message m JOIN msg_participant p ON p.thread_id = m.thread_id AND p.employee_id <> m.sender_id
                JOIN employee e ON e.id = p.employee_id WHERE m.id = :m ORDER BY read, e.full_name""")
                .param("m", messageId)
                .query((rs, n) -> new ReadReceipt(rs.getLong(1), rs.getString(2), rs.getBoolean(3)))
                .list();
    }

    private long threadOf(long messageId) {
        return jdbc.sql("SELECT thread_id FROM msg_message WHERE id = :m")
                .param("m", messageId)
                .query(Long.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    // ---------------------------------------------------------------- yuborish

    @Transactional
    Created start(Actor a, NewThreadRequest r, boolean canBroadcast) {
        long me = a.employeeId();
        Audience audience = r.audience();
        List<Long> ids = r.employeeIds() == null ? List.of() : r.employeeIds().stream().distinct().filter(id -> id != me).toList();
        if ((audience == Audience.PERSON || audience == Audience.PEOPLE) && ids.size() == 1) {
            long other = ids.getFirst();
            requireVisible(a, List.of(other));
            long thread = directThread(me, other);
            return new Created(thread, send(a, thread, r.message()));
        }
        Set<Long> members;
        String role = null;
        Long branch = null;
        switch (audience) {
            case PERSON, PEOPLE -> {
                if (ids.isEmpty()) {
                    throw MedixException.badRequest("messages.noRecipients");
                }
                requireVisible(a, ids);
                members = new LinkedHashSet<>(ids);
                audience = Audience.PEOPLE;
            }
            case ROLE -> {
                if (!canBroadcast) {
                    throw MedixException.forbidden("messages.broadcastDenied");
                }
                role = Optional.ofNullable(r.roleCode()).filter(c -> !c.isBlank()).orElseThrow(() -> MedixException.badRequest("messages.noRecipients"));
                branch = r.branchId();
                if (branch == null ? !a.allBranches() : !a.canAccessBranch(branch)) {
                    throw MedixException.forbidden("messages.branchDenied");
                }
                members = new LinkedHashSet<>(jdbc.sql("""
                        SELECT e.id FROM employee e JOIN role r ON r.id = e.role_id
                        WHERE e.status = 'ACTIVE' AND r.code = :role AND (CAST(:b AS bigint) IS NULL OR e.branch_id = :b) AND e.id <> :me
                        ORDER BY e.id""")
                        .param("role", role)
                        .param("b", branch)
                        .param("me", me)
                        .query(Long.class)
                        .list());
            }
            case BRANCH -> {
                if (!canBroadcast) {
                    throw MedixException.forbidden("messages.broadcastDenied");
                }
                branch = Optional.ofNullable(r.branchId()).orElseThrow(() -> MedixException.badRequest("messages.noRecipients"));
                if (!a.canAccessBranch(branch)) {
                    throw MedixException.forbidden("messages.branchDenied");
                }
                members = new LinkedHashSet<>(jdbc.sql("SELECT id FROM employee WHERE status = 'ACTIVE' AND branch_id = :b AND id <> :me ORDER BY id")
                        .param("b", branch)
                        .param("me", me)
                        .query(Long.class)
                        .list());
            }
            default -> throw new IllegalStateException();
        }
        if (members.isEmpty()) {
            throw MedixException.badRequest("messages.noRecipients");
        }
        long thread = jdbc.sql("""
                INSERT INTO msg_thread (kind, audience, audience_role, audience_branch_id, created_by)
                VALUES ('GROUP', :aud, :role, :b, :me) RETURNING id""")
                .param("aud", audience.name())
                .param("role", role)
                .param("b", branch)
                .param("me", me)
                .query(Long.class)
                .single();
        members.add(me);
        for (long e : members) {
            jdbc.sql("INSERT INTO msg_participant (thread_id, employee_id) VALUES (:t, :e)").param("t", thread).param("e", e).update();
        }
        return new Created(thread, send(a, thread, r.message()));
    }

    /** Ikki xodim orasidagi yagona suhbat; parallel yaratishda ham bitta (direct_key UNIQUE). */
    private long directThread(long me, long other) {
        String key = Math.min(me, other) + ":" + Math.max(me, other);
        Optional<Long> created = jdbc.sql("""
                INSERT INTO msg_thread (kind, audience, direct_key, created_by) VALUES ('DIRECT', 'PERSON', :k, :me)
                ON CONFLICT (direct_key) DO NOTHING RETURNING id""")
                .param("k", key)
                .param("me", me)
                .query(Long.class)
                .optional();
        if (created.isPresent()) {
            for (long e : List.of(me, other)) {
                jdbc.sql("INSERT INTO msg_participant (thread_id, employee_id) VALUES (:t, :e)").param("t", created.get()).param("e", e).update();
            }
            return created.get();
        }
        return jdbc.sql("SELECT id FROM msg_thread WHERE direct_key = :k").param("k", key).query(Long.class).single();
    }

    private void requireVisible(Actor a, List<Long> ids) {
        long visible = jdbc.sql("SELECT count(*) FROM employee e JOIN role r ON r.id = e.role_id WHERE e.id IN (:ids) AND " + VISIBLE)
                .param("ids", ids)
                .param("all", a.allBranches())
                .param("b", branchOf(a))
                .query(Long.class)
                .single();
        if (visible != ids.size()) {
            throw MedixException.forbidden("messages.recipientDenied");
        }
    }

    @Transactional
    long send(Actor a, long threadId, SendRequest r) {
        long me = a.employeeId();
        requireParticipant(me, threadId);
        List<Long> fileIds = r.fileIds() == null ? List.of() : r.fileIds().stream().distinct().toList();
        if (fileIds.size() > MAX_FILES) {
            throw MedixException.badRequest("messages.tooManyFiles", MAX_FILES);
        }
        String body = r.body() == null || r.body().isBlank() ? null : r.body().strip();
        String title = r.taskTitle() == null || r.taskTitle().isBlank() ? null : r.taskTitle().strip();
        boolean task = r.kind() == MessageKind.TASK;
        if (task && title == null) {
            throw MedixException.badRequest("messages.taskTitleRequired");
        }
        if (!task && body == null && fileIds.isEmpty()) {
            throw MedixException.badRequest("messages.empty");
        }
        if (task && r.dueAt() != null && r.dueAt().isBefore(Instant.now().minus(Duration.ofMinutes(1)))) {
            throw MedixException.badRequest("messages.duePast");
        }
        List<Long> others = participants(threadId).stream().filter(id -> id != me).toList();
        if (task && others.isEmpty()) {
            throw MedixException.badRequest("messages.noRecipients");
        }
        long id = jdbc.sql("""
                INSERT INTO msg_message (thread_id, sender_id, kind, body, task_title, due_at) VALUES (:t, :me, :k, :body, :title, :due)
                RETURNING id""")
                .param("t", threadId)
                .param("me", me)
                .param("k", r.kind().name())
                .param("body", body)
                .param("title", task ? title : null)
                .param("due", task && r.dueAt() != null ? Timestamp.from(r.dueAt()) : null)
                .query(Long.class)
                .single();
        if (!fileIds.isEmpty()) {
            int attached = jdbc.sql("UPDATE msg_file SET message_id = :m WHERE id IN (:ids) AND uploaded_by = :me AND message_id IS NULL")
                    .param("m", id)
                    .param("ids", fileIds)
                    .param("me", me)
                    .update();
            if (attached != fileIds.size()) {
                throw MedixException.badRequest("messages.fileMissing");
            }
        }
        if (task) {
            for (long e : others) {
                jdbc.sql("INSERT INTO msg_task_assignee (message_id, employee_id) VALUES (:m, :e)").param("m", id).param("e", e).update();
            }
            audit.record(new AuditEntry("task.create", "msg_message", Long.toString(id), null,
                    Map.of("title", title, "assignees", others, "dueAt", r.dueAt() == null ? "" : r.dueAt().toString()), null), a);
        }
        jdbc.sql("UPDATE msg_thread SET last_message_at = now() WHERE id = :t").param("t", threadId).update();
        jdbc.sql("UPDATE msg_participant SET last_read_id = :m WHERE thread_id = :t AND employee_id = :me")
                .param("m", id)
                .param("t", threadId)
                .param("me", me)
                .update();
        stream.signalAfterCommit(participants(threadId), SSE_EVENT);
        return id;
    }

    // ---------------------------------------------------------------- tahrirlash, o'chirish, o'qildi

    private record Own(long threadId, String kind, Instant createdAt, Instant deletedAt, long senderId) {}

    private Own own(long me, long messageId) {
        Own m = jdbc.sql("SELECT thread_id, kind, created_at, deleted_at, sender_id FROM msg_message WHERE id = :m FOR UPDATE")
                .param("m", messageId)
                .query((rs, n) -> new Own(rs.getLong(1), rs.getString(2), rs.getTimestamp(3).toInstant(), instant(rs.getTimestamp(4)), rs.getLong(5)))
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        requireParticipant(me, m.threadId());
        if (m.senderId() != me) {
            throw MedixException.forbidden("messages.notOwn");
        }
        if (m.deletedAt() != null) {
            throw MedixException.conflict("messages.deleted");
        }
        if (m.createdAt().isBefore(Instant.now().minus(EDIT_WINDOW))) {
            throw MedixException.conflict("messages.editExpired");
        }
        return m;
    }

    @Transactional
    void edit(Actor a, long messageId, String body) {
        Own m = own(a.employeeId(), messageId);
        String text = body == null || body.isBlank() ? null : body.strip();
        boolean hasFiles = jdbc.sql("SELECT EXISTS (SELECT 1 FROM msg_file WHERE message_id = :m)").param("m", messageId).query(Boolean.class).single();
        if ("MESSAGE".equals(m.kind()) && text == null && !hasFiles) {
            throw MedixException.badRequest("messages.empty");
        }
        jdbc.sql("UPDATE msg_message SET body = :b, edited_at = now() WHERE id = :m").param("b", text).param("m", messageId).update();
        stream.signalAfterCommit(participants(m.threadId()), SSE_EVENT);
    }

    @Transactional
    void delete(Actor a, long messageId) {
        Own m = own(a.employeeId(), messageId);
        if ("TASK".equals(m.kind())) {
            throw MedixException.conflict("messages.taskNoDelete");
        }
        jdbc.sql("DELETE FROM msg_file WHERE message_id = :m").param("m", messageId).update();
        jdbc.sql("UPDATE msg_message SET body = NULL, deleted_at = now() WHERE id = :m").param("m", messageId).update();
        stream.signalAfterCommit(participants(m.threadId()), SSE_EVENT);
    }

    @Transactional
    void markRead(Actor a, long threadId, long upTo) {
        long me = a.employeeId();
        requireParticipant(me, threadId);
        int n = jdbc.sql("""
                UPDATE msg_participant SET last_read_id = LEAST(:m, (SELECT coalesce(max(id), 0) FROM msg_message WHERE thread_id = :t))
                WHERE thread_id = :t AND employee_id = :me AND last_read_id < :m""")
                .param("m", upTo)
                .param("t", threadId)
                .param("me", me)
                .update();
        if (n > 0) {
            stream.signalAfterCommit(participants(threadId), SSE_EVENT);
        }
    }

    // ---------------------------------------------------------------- topshiriqlar

    private record TaskHead(long threadId, long senderId, String title) {}

    @Transactional
    void setStatus(Actor a, long messageId, TaskStatus status) {
        long me = a.employeeId();
        TaskHead t = jdbc.sql("SELECT thread_id, sender_id, task_title FROM msg_message WHERE id = :m AND kind = 'TASK'")
                .param("m", messageId)
                .query((rs, n) -> new TaskHead(rs.getLong(1), rs.getLong(2), rs.getString(3)))
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        requireParticipant(me, t.threadId());
        String link = "/messages?thread=" + t.threadId();
        String meName = jdbc.sql("SELECT full_name FROM employee WHERE id = :e").param("e", me).query(String.class).single();
        if (status == TaskStatus.IN_PROGRESS || status == TaskStatus.DONE) {
            List<String> from = status == TaskStatus.IN_PROGRESS ? List.of("NEW") : List.of("NEW", "IN_PROGRESS");
            int n = jdbc.sql("""
                    UPDATE msg_task_assignee SET status = :s, updated_at = now(), done_at = CASE WHEN :s = 'DONE' THEN now() END
                    WHERE message_id = :m AND employee_id = :me AND status IN (:from)""")
                    .param("s", status.name())
                    .param("m", messageId)
                    .param("me", me)
                    .param("from", from)
                    .update();
            if (n == 0) {
                throw MedixException.conflict("messages.taskStatus");
            }
            if (t.senderId() != me) {
                String text = status == TaskStatus.DONE ? "task.done" : "task.inProgress";
                notifications.notifyEmployees(List.of(t.senderId()), notifications.message("TASK", text, link,
                        "task-" + messageId + "-" + me + "-" + status.name() + "-" + System.nanoTime(), t.title(), meName));
            }
        } else {
            if (t.senderId() != me) {
                throw MedixException.forbidden("messages.notOwn");
            }
            List<String> from = status == TaskStatus.NEW ? List.of("DONE", "CANCELLED") : List.of("NEW", "IN_PROGRESS", "DONE");
            List<Long> changed = jdbc.sql("""
                    UPDATE msg_task_assignee SET status = :s, updated_at = now(), done_at = NULL
                    WHERE message_id = :m AND status IN (:from) RETURNING employee_id""")
                    .param("s", status.name())
                    .param("m", messageId)
                    .param("from", from)
                    .query(Long.class)
                    .list();
            if (changed.isEmpty()) {
                throw MedixException.conflict("messages.taskStatus");
            }
            String text = status == TaskStatus.NEW ? "task.reopened" : "task.cancelled";
            notifications.notifyEmployees(changed, notifications.message("TASK", text, link,
                    "task-" + messageId + "-" + status.name() + "-" + System.nanoTime(), t.title(), meName));
        }
        audit.record(new AuditEntry("task.status", "msg_message", Long.toString(messageId), null, Map.of("status", status.name()), null), a);
        stream.signalAfterCommit(participants(t.threadId()), SSE_EVENT);
    }

    @Transactional(readOnly = true)
    List<TaskItem> tasks(Actor a, TaskScope scope, TaskStatus status, boolean overdueOnly) {
        long me = a.employeeId();
        List<Long> ids = scope == TaskScope.MINE
                ? jdbc.sql("""
                        SELECT m.id FROM msg_message m JOIN msg_task_assignee x ON x.message_id = m.id AND x.employee_id = :me
                        ORDER BY (x.status IN ('NEW', 'IN_PROGRESS')) DESC, m.due_at NULLS LAST, m.id DESC LIMIT 500""")
                        .param("me", me).query(Long.class).list()
                : jdbc.sql("SELECT id FROM msg_message WHERE kind = 'TASK' AND sender_id = :me ORDER BY id DESC LIMIT 500")
                        .param("me", me).query(Long.class).list();
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<Long, List<Assignee>> assignees = assigneesOf(ids);
        Instant now = Instant.now();
        List<TaskItem> out = new ArrayList<>();
        jdbc.sql("""
                SELECT m.id, m.thread_id, m.task_title, m.body, m.due_at, m.created_at, m.sender_id, s.full_name
                FROM msg_message m JOIN employee s ON s.id = m.sender_id WHERE m.id IN (:ids)""")
                .param("ids", ids)
                .query(rs -> {
                    long id = rs.getLong("id");
                    List<Assignee> list = assignees.getOrDefault(id, List.of());
                    TaskStatus st = scope == TaskScope.MINE
                            ? list.stream().filter(x -> x.employeeId() == me).map(Assignee::status).findFirst().orElse(TaskStatus.NEW)
                            : overall(list);
                    Instant due = instant(rs.getTimestamp("due_at"));
                    boolean overdue = due != null && due.isBefore(now) && (st == TaskStatus.NEW || st == TaskStatus.IN_PROGRESS);
                    if ((status == null || status == st) && (!overdueOnly || overdue)) {
                        out.add(new TaskItem(id, rs.getLong("thread_id"), rs.getString("task_title"), rs.getString("body"), due,
                                rs.getTimestamp("created_at").toInstant(), rs.getLong("sender_id"), rs.getString("full_name"), st, overdue, list));
                    }
                });
        Map<Long, Integer> order = new HashMap<>();
        for (int i = 0; i < ids.size(); i++) {
            order.put(ids.get(i), i);
        }
        out.sort(java.util.Comparator.comparingInt(t -> order.get(t.messageId())));
        return out;
    }

    /** Guruh topshirig'i umumiy holati: hammasi bekor → bekor; qolganlari bajarilgan → bajarildi; aks holda eng orqadagi. */
    static TaskStatus overall(List<Assignee> list) {
        List<TaskStatus> live = list.stream().map(Assignee::status).filter(s -> s != TaskStatus.CANCELLED).toList();
        if (live.isEmpty()) {
            return TaskStatus.CANCELLED;
        }
        if (live.contains(TaskStatus.NEW)) {
            return live.stream().allMatch(s -> s == TaskStatus.NEW) ? TaskStatus.NEW : TaskStatus.IN_PROGRESS;
        }
        return live.contains(TaskStatus.IN_PROGRESS) ? TaskStatus.IN_PROGRESS : TaskStatus.DONE;
    }

    // ---------------------------------------------------------------- fayllar

    @Transactional
    MessageModels.MessageFile upload(Actor a, String fileName, String contentType, byte[] data) {
        if (data.length == 0) {
            throw MedixException.badRequest("messages.fileEmpty");
        }
        if (data.length > MAX_FILE_BYTES) {
            throw MedixException.badRequest("messages.fileSize");
        }
        String name = fileName == null || fileName.isBlank() ? "fayl" : fileName.replaceAll("[\\\\/\\p{Cntrl}]", "_").strip();
        if (name.length() > 200) {
            name = name.substring(name.length() - 200);
        }
        String type = contentType == null || contentType.isBlank() || contentType.length() > 120 ? "application/octet-stream" : contentType;
        long id = jdbc.sql("""
                INSERT INTO msg_file (uploaded_by, file_name, content_type, size_bytes, data) VALUES (:me, :n, :t, :s, :d) RETURNING id""")
                .param("me", a.employeeId())
                .param("n", name)
                .param("t", type)
                .param("s", data.length)
                .param("d", data)
                .query(Long.class)
                .single();
        return new MessageModels.MessageFile(id, name, type, data.length, isImage(type));
    }

    /** Faylni yuklab olish: faqat yuklagan xodim yoki suhbat qatnashchisi; o'chirilgan xabar fayli — yo'q. */
    @Transactional(readOnly = true)
    FileData file(Actor a, long fileId) {
        return jdbc.sql("""
                SELECT f.file_name, f.content_type, f.data FROM msg_file f LEFT JOIN msg_message m ON m.id = f.message_id
                WHERE f.id = :f AND (
                    (f.message_id IS NULL AND f.uploaded_by = :me)
                    OR (m.deleted_at IS NULL AND EXISTS (SELECT 1 FROM msg_participant p WHERE p.thread_id = m.thread_id AND p.employee_id = :me)))""")
                .param("f", fileId)
                .param("me", a.employeeId())
                .query((rs, n) -> new FileData(rs.getString(1), rs.getString(2), rs.getBytes(3)))
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    /** Yuklangan, lekin xabarga biriktirilmagan fayllar bir kundan keyin o'chiriladi. */
    @Scheduled(cron = "0 15 3 * * *", zone = "Asia/Tashkent")
    @Transactional
    public void dropOrphanFiles() {
        jdbc.sql("DELETE FROM msg_file WHERE message_id IS NULL AND created_at < now() - interval '1 day'").update();
    }

    // ---------------------------------------------------------------- yordamchi

    static boolean isImage(String contentType) {
        return contentType != null && Set.of("image/png", "image/jpeg", "image/webp", "image/gif").contains(contentType.toLowerCase(Locale.ROOT));
    }

    private static Person person(ResultSet rs, int n) throws SQLException {
        long b = rs.getLong("branch_id");
        Long branch = rs.wasNull() ? null : b;
        return new Person(rs.getLong("id"), rs.getString("full_name"), rs.getString("role_code"), rs.getString("role_name"), branch,
                rs.getString("branch_name"));
    }

    private static String clip(String s, int max) {
        String one = s.replaceAll("\\s+", " ").strip();
        return one.length() <= max ? one : one.substring(0, max - 1) + "…";
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
