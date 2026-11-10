package uz.medix.identity.settings;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.security.CurrentActor;
import uz.medix.shared.settings.SettingKey;

/** Tizim sozlamalari sahifasi (prototip «Sozlamalar»): qiymatlar, QQS tarixi, chop etish imzochilari, hujjat prefikslari, BQ sanasi. */
@Service
public class Settings {

    static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    static final Set<String> NAK_VARIANTS = Set.of("price", "noprice");

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final CurrentActor currentActor;
    private final Clock clock;

    Settings(JdbcClient jdbc, AuditLog audit, CurrentActor currentActor, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.currentActor = currentActor;
        this.clock = clock;
    }

    public record Value(
            String key,
            @Schema(description = "wh | sales | money | sec") String section,
            @Schema(description = "DAY | PCT | SUM | LEN | MIN | TRIES | LOCK") String kind,
            @Schema(description = "DIRECTOR | SECURITY") String scope,
            String value,
            long min,
            long max,
            @Schema(nullable = true, description = "NULL — standart qiymat") OffsetDateTime updatedAt,
            @Schema(nullable = true) String updatedBy) {}

    public record VatRow(long id, String rate, LocalDate validFrom, @Schema(nullable = true) String createdBy,
            @Schema(description = "ACTIVE | FUTURE | PAST") String status) {}

    public record Vat(String current, List<VatRow> history) {}

    public record Option(long id, String name) {}

    public record Signer(
            long branchId,
            String branchCode,
            String branchName,
            @Schema(nullable = true) Long headEmployeeId,
            @Schema(nullable = true) Long accountantEmployeeId,
            @Schema(nullable = true, description = "Avtomatik tanlanadigan filial rahbari") String autoHead,
            @Schema(nullable = true, description = "Avtomatik tanlanadigan bosh buxgalter") String autoAccountant,
            List<Option> headOptions,
            List<Option> accountantOptions) {}

    public record Print(boolean reprint, @Schema(description = "price | noprice") String nakVariant, List<Signer> signers) {}

    public record DocPrefix(String prefix, String name, @Schema(nullable = true) String last, long count) {}

    public record Bq(@Schema(nullable = true) LocalDate cutDate, boolean locked) {}

    public record View(List<Value> values, Vat vat, Print print, List<DocPrefix> docs, Bq bq, boolean canDirector, boolean canSecurity) {}

    public record SignerDraft(long branchId, Long headEmployeeId, Long accountantEmployeeId) {}

    @Transactional(readOnly = true)
    public View view(boolean director, boolean admin) {
        return new View(values(), vat(), print(), docs(), bq(), director, director || admin);
    }

    List<Value> values() {
        Map<String, Value> byKey = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT s.key, s.value, s.updated_at, e.full_name
                FROM system_setting s LEFT JOIN employee e ON e.id = s.updated_by""")
                .query((rs, n) -> {
                    String k = rs.getString("key");
                    SettingKey sk = Arrays.stream(SettingKey.values()).filter(x -> x.name().equals(k)).findFirst().orElse(null);
                    if (sk != null) {
                        Timestamp at = rs.getTimestamp("updated_at");
                        byKey.put(k, new Value(k, sk.section, sk.kind.name(), sk.scope.name(), rs.getString("value"), sk.kind.min, sk.kind.max,
                                at == null ? null : at.toInstant().atOffset(ZoneOffset.UTC), rs.getString("full_name")));
                    }
                    return 0;
                })
                .list();
        return Arrays.stream(SettingKey.values()).map(k -> byKey.get(k.name())).filter(v -> v != null).toList();
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(TASHKENT));
    }

    Vat vat() {
        LocalDate today = today();
        record Raw(long id, BigDecimal rate, LocalDate from, String who) {}
        List<Raw> raw = jdbc.sql("""
                SELECT v.id, v.rate, v.valid_from, e.full_name
                FROM vat_rate v LEFT JOIN employee e ON e.id = v.created_by
                ORDER BY v.valid_from DESC""")
                .query((rs, n) -> new Raw(rs.getLong(1), rs.getBigDecimal(2), rs.getDate(3).toLocalDate(), rs.getString(4)))
                .list();
        Raw active = raw.stream().filter(r -> !r.from().isAfter(today)).findFirst().orElse(null);
        List<VatRow> rows = raw.stream()
                .map(r -> new VatRow(r.id(), rate(r.rate()), r.from(), r.who(),
                        r.from().isAfter(today) ? "FUTURE" : r == active ? "ACTIVE" : "PAST"))
                .toList();
        return new Vat(active == null ? "0" : rate(active.rate()), rows);
    }

    static String rate(BigDecimal r) {
        return r.stripTrailingZeros().scale() <= 0 ? r.setScale(0, RoundingMode.UNNECESSARY).toPlainString() : r.stripTrailingZeros().toPlainString();
    }

    Print print() {
        Map<String, String> cfg = new LinkedHashMap<>();
        jdbc.sql("SELECT key, value FROM system_setting WHERE key LIKE 'print.%'")
                .query((rs, n) -> cfg.put(rs.getString(1), rs.getString(2)))
                .list();
        record Emp(long id, String name, String role, Long branchId) {}
        List<Emp> emps = jdbc.sql("""
                SELECT e.id, e.full_name, r.code, e.branch_id
                FROM employee e JOIN role r ON r.id = e.role_id
                WHERE e.status = 'ACTIVE' AND r.code IN ('DIRECTOR', 'BRANCH_MANAGER', 'ACCOUNTANT')
                ORDER BY e.full_name, e.id""")
                .query((rs, n) -> new Emp(rs.getLong(1), rs.getString(2), rs.getString(3), (Long) rs.getObject(4)))
                .list();
        List<Signer> signers = jdbc.sql("""
                SELECT b.id, b.code, b.name, s.head_employee_id, s.accountant_employee_id
                FROM branch b LEFT JOIN print_signer s ON s.branch_id = b.id
                WHERE b.active ORDER BY b.code""")
                .query((rs, n) -> {
                    long br = rs.getLong(1);
                    List<Option> heads = emps.stream()
                            .filter(e -> ("BRANCH_MANAGER".equals(e.role()) && br == (e.branchId() == null ? -1 : e.branchId())) || "DIRECTOR".equals(e.role()))
                            .map(e -> new Option(e.id(), e.name())).toList();
                    List<Option> accs = emps.stream()
                            .filter(e -> "ACCOUNTANT".equals(e.role()) && (e.branchId() == null || e.branchId() == br))
                            .map(e -> new Option(e.id(), e.name())).toList();
                    String autoHead = emps.stream().filter(e -> "BRANCH_MANAGER".equals(e.role()) && e.branchId() != null && e.branchId() == br)
                            .map(Emp::name).findFirst().orElse(null);
                    String autoAcc = accs.isEmpty() ? null : accs.getFirst().name();
                    return new Signer(br, rs.getString(2), rs.getString(3), (Long) rs.getObject(4), (Long) rs.getObject(5), autoHead, autoAcc, heads, accs);
                })
                .list();
        return new Print(!"false".equals(cfg.get("print.reprint")), cfg.getOrDefault("print.nakVariant", "price"), signers);
    }

    List<DocPrefix> docs() {
        record Seq(String prefix, String branch, long last, OffsetDateTime at) {}
        List<Seq> seqs = jdbc.sql("SELECT prefix, branch_code, last_value, updated_at FROM document_sequence WHERE last_value > 0")
                .query((rs, n) -> new Seq(rs.getString(1), rs.getString(2), rs.getLong(3), rs.getTimestamp(4).toInstant().atOffset(ZoneOffset.UTC)))
                .list();
        List<DocPrefix> out = new ArrayList<>();
        for (DocumentPrefix p : DocumentPrefix.values()) {
            List<Seq> mine = seqs.stream().filter(s -> s.prefix().equals(p.name())).toList();
            Seq latest = mine.stream().max((a, b) -> a.at().compareTo(b.at())).orElse(null);
            out.add(new DocPrefix(p.name(), p.title(), latest == null ? null : "%s-%s-%06d".formatted(p.name(), latest.branch(), latest.last()),
                    mine.stream().mapToLong(Seq::last).sum()));
        }
        return out;
    }

    Bq bq() {
        LocalDate cut = jdbc.sql("SELECT max(cutoff_date) FROM opening_balance WHERE status = 'POSTED'")
                .query(Date.class).optional().map(Date::toLocalDate).orElse(null);
        return new Bq(cut, cut != null);
    }

    /** Qiymatlarni saqlash: bitta tranzaksiya, har o'zgarish — audit. Ruxsat kalit doirasiga qarab. */
    @Transactional
    public View save(Map<String, String> changes, boolean director, boolean admin) {
        if (changes == null || changes.isEmpty()) {
            throw MedixException.badRequest("settings.empty");
        }
        long who = currentActor.current().orElseThrow().employeeId();
        for (Map.Entry<String, String> c : changes.entrySet()) {
            SettingKey key = Arrays.stream(SettingKey.values()).filter(x -> x.name().equals(c.getKey())).findFirst()
                    .orElseThrow(() -> MedixException.badRequest("settings.unknownKey", c.getKey()));
            boolean can = key.scope == SettingKey.Scope.DIRECTOR ? director : director || admin;
            if (!can) {
                throw MedixException.forbidden(key.scope == SettingKey.Scope.DIRECTOR ? "settings.directorOnly" : "settings.securityOnly");
            }
            String v = key.normalize(c.getValue());
            if (v == null) {
                if (key.kind == SettingKey.Kind.SUM) {
                    throw MedixException.badRequest("settings.sumPositive");
                }
                throw MedixException.badRequest("settings.range", key.kind.min, key.kind.max);
            }
            String old = jdbc.sql("SELECT value FROM system_setting WHERE key = :k FOR UPDATE").param("k", key.name()).query(String.class).single();
            if (old.equals(v)) {
                continue;
            }
            jdbc.sql("UPDATE system_setting SET value = :v, updated_at = now(), updated_by = :who WHERE key = :k")
                    .param("v", v).param("who", who).param("k", key.name()).update();
            audit.record(AuditEntry.of("settings.change", "setting", key.name()).change(Map.of("value", old), Map.of("value", v)));
        }
        return view(director, admin);
    }

    /** Yangi QQS stavkasi — faqat kelajak sanadan, bir sanaga bitta. */
    @Transactional
    public View addVat(BigDecimal rate, LocalDate from, boolean director, boolean admin) {
        if (!director) {
            throw MedixException.forbidden("settings.directorOnly");
        }
        if (rate == null || rate.signum() < 0 || rate.compareTo(BigDecimal.valueOf(100)) > 0 || rate.scale() > 2) {
            throw MedixException.badRequest("settings.range", 0, 100);
        }
        if (from == null || !from.isAfter(today())) {
            throw MedixException.badRequest("settings.vatFuture");
        }
        boolean dup = jdbc.sql("SELECT EXISTS (SELECT 1 FROM vat_rate WHERE valid_from = :d)").param("d", Date.valueOf(from)).query(Boolean.class).single();
        if (dup) {
            throw MedixException.conflict("settings.vatDuplicate");
        }
        long who = currentActor.current().orElseThrow().employeeId();
        long id = jdbc.sql("INSERT INTO vat_rate (rate, valid_from, created_by) VALUES (:r, :d, :who) RETURNING id")
                .param("r", rate.setScale(2, RoundingMode.HALF_UP)).param("d", Date.valueOf(from)).param("who", who)
                .query(Long.class).single();
        audit.record(AuditEntry.of("settings.vat", "setting", "vat").change(null, Map.of("id", id, "rate", rate(rate), "validFrom", from.toString())));
        return view(director, admin);
    }

    /** Chop etish sozlamalari (faqat Direktor): qayta chop etish, nakladnoy varianti, imzochilar. */
    @Transactional
    public View savePrint(Boolean reprint, String nakVariant, List<SignerDraft> signers, boolean director, boolean admin) {
        if (!director) {
            throw MedixException.forbidden("settings.directorOnly");
        }
        Map<String, Object> before = new LinkedHashMap<>();
        Map<String, Object> after = new LinkedHashMap<>();
        if (reprint != null) {
            upsertPrint("print.reprint", reprint.toString(), before, after);
        }
        if (nakVariant != null) {
            if (!NAK_VARIANTS.contains(nakVariant)) {
                throw MedixException.badRequest("settings.nakVariant");
            }
            upsertPrint("print.nakVariant", nakVariant, before, after);
        }
        if (signers != null) {
            Print current = print();
            for (SignerDraft d : signers) {
                Signer s = current.signers().stream().filter(x -> x.branchId() == d.branchId()).findFirst()
                        .orElseThrow(() -> MedixException.notFound("error.notFound"));
                if (d.headEmployeeId() != null && s.headOptions().stream().noneMatch(o -> o.id() == d.headEmployeeId())) {
                    throw MedixException.badRequest("settings.signerInvalid");
                }
                if (d.accountantEmployeeId() != null && s.accountantOptions().stream().noneMatch(o -> o.id() == d.accountantEmployeeId())) {
                    throw MedixException.badRequest("settings.signerInvalid");
                }
                jdbc.sql("""
                        INSERT INTO print_signer (branch_id, head_employee_id, accountant_employee_id) VALUES (:b, :h, :a)
                        ON CONFLICT (branch_id) DO UPDATE SET head_employee_id = :h, accountant_employee_id = :a, updated_at = now()""")
                        .param("b", d.branchId()).param("h", d.headEmployeeId()).param("a", d.accountantEmployeeId()).update();
                before.put("signer." + s.branchCode(), s.headEmployeeId() + "/" + s.accountantEmployeeId());
                after.put("signer." + s.branchCode(), d.headEmployeeId() + "/" + d.accountantEmployeeId());
            }
        }
        if (!after.isEmpty()) {
            audit.record(AuditEntry.of("settings.print", "setting", "print").change(before, after));
        }
        return view(director, admin);
    }

    private void upsertPrint(String key, String value, Map<String, Object> before, Map<String, Object> after) {
        long who = currentActor.current().orElseThrow().employeeId();
        String old = jdbc.sql("SELECT value FROM system_setting WHERE key = :k").param("k", key).query(String.class).optional().orElse(null);
        jdbc.sql("""
                INSERT INTO system_setting (key, value, updated_at, updated_by) VALUES (:k, :v, now(), :who)
                ON CONFLICT (key) DO UPDATE SET value = :v, updated_at = now(), updated_by = :who""")
                .param("k", key).param("v", value).param("who", who).update();
        before.put(key, old);
        after.put(key, value);
    }
}
