package uz.medix.identity.settings;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.numbering.DocumentPrefix;
import uz.medix.shared.security.Authorities;
import uz.medix.shared.security.CurrentActor;
import uz.medix.shared.settings.SettingKey;
import uz.medix.shared.settings.SystemSettings;

/**
 * «Sozlamalar» sahifasi (prototip Settings): Ombor, Savdo, Pul va tasdiqlar chegaralari, Soliq (QQS tarixi), Chop etish
 * (imzo qo'yuvchilar, takroriy nusxa, yuk xati varianti), Hujjatlar (raqamlash — faqat ko'rish), Boshlang'ich qoldiq (kesish
 * sanasi — faqat ko'rish), Xavfsizlik. Ko'rish — settings.view; Direktor bo'limlari — settings.edit; Xavfsizlik —
 * settings.security. Har o'zgarish audit jurnaliga yoziladi.
 */
@RestController
@RequestMapping("/api/settings")
@Tag(name = "settings", description = "Sozlamalar")
class SettingsController {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    enum VatStatus { ACTIVE, FUTURE, PAST }

    enum InvoiceVariant { PRICE, NOPRICE }

    record SettingValue(SettingKey key, SettingKey.Section section, SettingKey.Kind kind, SettingKey.Scope scope,
            @Schema(description = "Qiymat: SUM — \"2000000.00\", qolganlari — butun son") String value, long min, long max,
            @Schema(nullable = true) Instant updatedAt, @Schema(nullable = true) String updatedBy) {}

    record VatRow(long id, String rate, LocalDate validFrom, @Schema(nullable = true) String createdBy, VatStatus status) {}

    record EmployeeOption(long id, String name) {}

    record SignerRow(long branchId, String branchName, @Schema(nullable = true) Long headId, @Schema(nullable = true) Long accountantId,
            @Schema(nullable = true, description = "Avtomatik (rol bo'yicha) rahbar") String autoHead,
            @Schema(nullable = true, description = "Avtomatik (rol bo'yicha) bosh hisobchi") String autoAccountant,
            List<EmployeeOption> headOptions, List<EmployeeOption> accountantOptions) {}

    record PrintSettings(boolean reprintMark, InvoiceVariant invoiceVariant, List<SignerRow> signers) {}

    record DocPrefixRow(DocumentPrefix prefix, @Schema(nullable = true) String lastNumber, long count) {}

    record OpeningCut(@Schema(nullable = true) LocalDate cutoffDate, boolean locked) {}

    record SettingsView(List<SettingValue> values, boolean canEdit, boolean canSecurity, String vatRate, List<VatRow> vatHistory,
            PrintSettings print, List<DocPrefixRow> docs, OpeningCut opening,
            @Schema(description = "Hozir tasdiqlashda turgan buyurtmalar") int pendingOrders) {}

    record SettingsUpdate(@NotNull Map<SettingKey, String> values) {}

    record VatRequest(@NotBlank(message = "{validation.required}") @Pattern(regexp = "^\\d{1,3}([.,]\\d{1,2})?$", message = "{settings.invalid}") String rate,
            @NotNull(message = "{validation.required}") LocalDate validFrom) {}

    record PrintUpdate(@Schema(nullable = true) Boolean reprintMark, @Schema(nullable = true) InvoiceVariant invoiceVariant) {}

    record SignerUpdate(@Schema(nullable = true, description = "null — avtomatik") Long headId,
            @Schema(nullable = true, description = "null — avtomatik") Long accountantId) {}

    private static final List<String> HEAD_ROLES = List.of("BRANCH_MANAGER", "DIRECTOR");
    private static final List<String> ACC_ROLES = List.of("ACCOUNTANT");

    private final JdbcClient jdbc;
    private final SystemSettings settings;
    private final AuditLog audit;
    private final CurrentActor actor;
    private final Clock clock;

    SettingsController(JdbcClient jdbc, SystemSettings settings, AuditLog audit, CurrentActor actor, Clock clock) {
        this.jdbc = jdbc;
        this.settings = settings;
        this.audit = audit;
        this.actor = actor;
        this.clock = clock;
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(TASHKENT));
    }

    private Long me() {
        return actor.current().map(a -> a.employeeId()).orElse(null);
    }

    static String text(SettingKey k, BigDecimal v) {
        return k.kind() == SettingKey.Kind.SUM ? v.setScale(2).toPlainString() : v.stripTrailingZeros().toPlainString();
    }

    @GetMapping
    @PreAuthorize("hasAuthority('settings.view')")
    @Transactional(readOnly = true)
    @Operation(summary = "Sozlamalar", description = "Barcha bo'limlar qiymatlari, oxirgi o'zgarish (kim, qachon) va tahrirlash huquqlari.")
    SettingsView get() {
        record Row(String key, BigDecimal value, Instant at, String who) {}
        Map<String, Row> rows = new HashMap<>();
        jdbc.sql("""
                SELECT s.key, s.value, s.updated_at, e.full_name FROM app_setting s LEFT JOIN employee e ON e.id = s.updated_by""")
                .query((rs, i) -> new Row(rs.getString(1), rs.getBigDecimal(2),
                        rs.getTimestamp(3) == null ? null : rs.getTimestamp(3).toInstant(), rs.getString(4)))
                .list()
                .forEach(r -> rows.put(r.key(), r));
        List<SettingValue> values = Arrays.stream(SettingKey.values()).map(k -> {
            Row r = rows.get(k.name());
            BigDecimal v = r == null ? settings.value(k) : r.value();
            return new SettingValue(k, k.section(), k.kind(), k.scope(), text(k, v), k.kind().min(), k.kind().max(),
                    r == null ? null : r.at(), r == null ? null : r.who());
        }).toList();

        LocalDate today = today();
        record Vat(long id, BigDecimal rate, LocalDate from, String who) {}
        List<Vat> vats = jdbc.sql("""
                SELECT v.id, v.rate, v.valid_from, e.full_name FROM vat_rate v LEFT JOIN employee e ON e.id = v.created_by
                ORDER BY v.valid_from DESC""")
                .query((rs, i) -> new Vat(rs.getLong(1), rs.getBigDecimal(2), rs.getDate(3).toLocalDate(), rs.getString(4)))
                .list();
        Long activeId = vats.stream().filter(v -> !v.from().isAfter(today)).map(Vat::id).findFirst().orElse(null);
        List<VatRow> vatRows = vats.stream()
                .map(v -> new VatRow(v.id(), v.rate().stripTrailingZeros().toPlainString(), v.from(), v.who(),
                        v.from().isAfter(today) ? VatStatus.FUTURE : Long.valueOf(v.id()).equals(activeId) ? VatStatus.ACTIVE : VatStatus.PAST))
                .toList();

        int pending = jdbc.sql("SELECT count(*) FROM sales_order WHERE status = 'PENDING_APPROVAL'").query(Integer.class).single();
        return new SettingsView(values, Authorities.has("settings.edit"), Authorities.has("settings.security"),
                settings.vatRate(today).stripTrailingZeros().toPlainString(), vatRows, print(), docs(), opening(), pending);
    }

    private PrintSettings print() {
        record Cfg(boolean reprint, String variant) {}
        Cfg c = jdbc.sql("SELECT reprint_mark, invoice_variant FROM print_setting WHERE id = 1")
                .query((rs, i) -> new Cfg(rs.getBoolean(1), rs.getString(2)))
                .optional()
                .orElse(new Cfg(true, "PRICE"));
        record Emp(long id, String name, String role, Long branchId) {}
        List<Emp> emps = jdbc.sql("""
                SELECT e.id, e.full_name, r.code, e.branch_id FROM employee e JOIN role r ON r.id = e.role_id
                WHERE e.status = 'ACTIVE' AND r.code IN ('BRANCH_MANAGER', 'DIRECTOR', 'ACCOUNTANT') ORDER BY e.full_name""")
                .query((rs, i) -> new Emp(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getObject(4, Long.class)))
                .list();
        record Br(long id, String name, Long head, Long acc) {}
        List<Br> branches = jdbc.sql("""
                SELECT b.id, b.name, s.head_id, s.accountant_id FROM branch b LEFT JOIN print_signer s ON s.branch_id = b.id
                WHERE b.active ORDER BY b.code""")
                .query((rs, i) -> new Br(rs.getLong(1), rs.getString(2), rs.getObject(3, Long.class), rs.getObject(4, Long.class)))
                .list();
        List<SignerRow> signers = new ArrayList<>();
        for (Br b : branches) {
            List<EmployeeOption> heads = emps.stream()
                    .filter(e -> HEAD_ROLES.contains(e.role()) && (e.branchId() == null || e.branchId() == b.id()))
                    .map(e -> new EmployeeOption(e.id(), e.name()))
                    .toList();
            List<EmployeeOption> accs = emps.stream()
                    .filter(e -> ACC_ROLES.contains(e.role()) && (e.branchId() == null || e.branchId() == b.id()))
                    .map(e -> new EmployeeOption(e.id(), e.name()))
                    .toList();
            String autoHead = emps.stream().filter(e -> "BRANCH_MANAGER".equals(e.role()) && e.branchId() != null && e.branchId() == b.id())
                    .map(Emp::name).findFirst().orElse(null);
            String autoAcc = emps.stream().filter(e -> "ACCOUNTANT".equals(e.role()) && (e.branchId() == null || e.branchId() == b.id()))
                    .map(Emp::name).findFirst().orElse(null);
            signers.add(new SignerRow(b.id(), b.name(), b.head(), b.acc(), autoHead, autoAcc, heads, accs));
        }
        return new PrintSettings(c.reprint(), InvoiceVariant.valueOf(c.variant()), signers);
    }

    private List<DocPrefixRow> docs() {
        record Seq(String prefix, String branch, long last) {}
        Map<String, List<Seq>> by = new LinkedHashMap<>();
        jdbc.sql("SELECT prefix, branch_code, last_value FROM document_sequence WHERE last_value > 0 ORDER BY updated_at DESC")
                .query((rs, i) -> new Seq(rs.getString(1), rs.getString(2), rs.getLong(3)))
                .list()
                .forEach(s -> by.computeIfAbsent(s.prefix(), k -> new ArrayList<>()).add(s));
        return Arrays.stream(DocumentPrefix.values()).map(p -> {
            List<Seq> l = by.getOrDefault(p.name(), List.of());
            String last = l.isEmpty() ? null : "%s-%s-%06d".formatted(p.name(), l.getFirst().branch(), l.getFirst().last());
            return new DocPrefixRow(p, last, l.stream().mapToLong(Seq::last).sum());
        }).toList();
    }

    private OpeningCut opening() {
        return jdbc.sql("""
                SELECT max(cutoff_date) FILTER (WHERE status = 'POSTED') AS posted_cut, max(cutoff_date) FILTER (WHERE status <> 'CANCELLED') AS any_cut,
                       bool_or(status = 'POSTED') AS posted
                FROM opening_balance""")
                .query((rs, i) -> {
                    java.sql.Date d = rs.getDate("posted_cut") != null ? rs.getDate("posted_cut") : rs.getDate("any_cut");
                    return new OpeningCut(d == null ? null : d.toLocalDate(), rs.getBoolean("posted"));
                })
                .single();
    }

    @PutMapping
    @PreAuthorize("hasAnyAuthority('settings.edit', 'settings.security')")
    @Transactional
    @Operation(summary = "Sozlamalarni saqlash", description = "Bir nechta qiymat birdaniga; har biri oraliq bo'yicha tekshiriladi, audit — eski → yangi.")
    SettingsView update(@Valid @RequestBody SettingsUpdate r) {
        Map<SettingKey, BigDecimal> parsed = new LinkedHashMap<>();
        r.values().forEach((k, raw) -> {
            boolean allowed = k.scope() == SettingKey.Scope.SECURITY ? Authorities.has("settings.security") : Authorities.has("settings.edit");
            if (!allowed) {
                throw MedixException.forbidden(k.scope() == SettingKey.Scope.SECURITY ? "settings.roSec" : "settings.roDir");
            }
            BigDecimal v;
            try {
                v = new BigDecimal(raw == null ? "" : raw.strip().replace(" ", "").replace(',', '.'));
            } catch (NumberFormatException e) {
                throw MedixException.badRequest("settings.invalid");
            }
            if (!k.kind().valid(v)) {
                throw k.kind() == SettingKey.Kind.SUM ? MedixException.badRequest("settings.sumPositive")
                        : MedixException.badRequest("settings.range", String.valueOf(k.kind().min()), String.valueOf(k.kind().max()));
            }
            parsed.put(k, v);
        });
        Long me = me();
        parsed.forEach((k, v) -> {
            BigDecimal old = jdbc.sql("SELECT value FROM app_setting WHERE key = :k FOR UPDATE").param("k", k.name())
                    .query(BigDecimal.class).optional().orElse(null);
            if (old != null && old.compareTo(v) == 0) {
                return;
            }
            jdbc.sql("""
                    INSERT INTO app_setting (key, value, updated_by, updated_at) VALUES (:k, :v, :e, now())
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()""")
                    .param("k", k.name()).param("v", v).param("e", me).update();
            audit.record(AuditEntry.of("settings.update", "app_setting", k.name())
                    .change(Map.of("value", old == null ? "" : text(k, old)), Map.of("value", text(k, v))));
        });
        return get();
    }

    @PostMapping("/vat")
    @PreAuthorize("hasAuthority('settings.edit')")
    @Transactional
    @Operation(summary = "Yangi QQS stavkasi", description = "Faqat kelajakdagi sanadan; bir sanaga bitta stavka. Avvalgi hujjatlar o'z stavkasida qoladi.")
    SettingsView addVat(@Valid @RequestBody VatRequest r) {
        BigDecimal rate = new BigDecimal(r.rate().replace(',', '.'));
        if (rate.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw MedixException.badRequest("settings.range", "0", "100");
        }
        if (!r.validFrom().isAfter(today())) {
            throw MedixException.badRequest("settings.vatFuture");
        }
        int n = jdbc.sql("INSERT INTO vat_rate (rate, valid_from, created_by) VALUES (:r, :d, :e) ON CONFLICT (valid_from) DO NOTHING")
                .param("r", rate).param("d", r.validFrom()).param("e", me()).update();
        if (n == 0) {
            throw MedixException.conflict("settings.vatDuplicate");
        }
        audit.record(AuditEntry.of("settings.vat", "vat_rate", r.validFrom())
                .change(null, Map.of("rate", rate.stripTrailingZeros().toPlainString(), "validFrom", r.validFrom().toString())));
        return get();
    }

    @PutMapping("/print")
    @PreAuthorize("hasAuthority('settings.edit')")
    @Transactional
    @Operation(summary = "Chop etish sozlamalari", description = "Takroriy nusxa belgisi va yuk xati standart varianti.")
    SettingsView updatePrint(@RequestBody PrintUpdate r) {
        record Cfg(boolean reprint, String variant) {}
        Cfg old = jdbc.sql("SELECT reprint_mark, invoice_variant FROM print_setting WHERE id = 1 FOR UPDATE")
                .query((rs, i) -> new Cfg(rs.getBoolean(1), rs.getString(2))).single();
        boolean reprint = r.reprintMark() == null ? old.reprint() : r.reprintMark();
        String variant = r.invoiceVariant() == null ? old.variant() : r.invoiceVariant().name();
        jdbc.sql("UPDATE print_setting SET reprint_mark = :r, invoice_variant = :v, updated_by = :e, updated_at = now() WHERE id = 1")
                .param("r", reprint).param("v", variant).param("e", me()).update();
        audit.record(AuditEntry.of("settings.print", "print_setting", 1)
                .change(Map.of("reprintMark", old.reprint(), "invoiceVariant", old.variant()), Map.of("reprintMark", reprint, "invoiceVariant", variant)));
        return get();
    }

    @PutMapping("/print/signers/{branchId}")
    @PreAuthorize("hasAuthority('settings.edit')")
    @Transactional
    @Operation(summary = "Filial imzo qo'yuvchilari", description = "Rahbar va bosh hisobchi; null — avtomatik (rol bo'yicha).")
    SettingsView updateSigners(@PathVariable long branchId, @RequestBody SignerUpdate r) {
        if (jdbc.sql("SELECT count(*) FROM branch WHERE id = :b AND active").param("b", branchId).query(Integer.class).single() == 0) {
            throw MedixException.notFound("error.notFound");
        }
        checkSigner(r.headId(), HEAD_ROLES, branchId);
        checkSigner(r.accountantId(), ACC_ROLES, branchId);
        record Old(Long head, Long acc) {}
        Old old = jdbc.sql("SELECT head_id, accountant_id FROM print_signer WHERE branch_id = :b FOR UPDATE").param("b", branchId)
                .query((rs, i) -> new Old(rs.getObject(1, Long.class), rs.getObject(2, Long.class)))
                .optional().orElse(new Old(null, null));
        jdbc.sql("""
                INSERT INTO print_signer (branch_id, head_id, accountant_id, updated_by, updated_at) VALUES (:b, :h, :a, :e, now())
                ON CONFLICT (branch_id) DO UPDATE SET head_id = EXCLUDED.head_id, accountant_id = EXCLUDED.accountant_id,
                    updated_by = EXCLUDED.updated_by, updated_at = now()""")
                .param("b", branchId).param("h", r.headId()).param("a", r.accountantId()).param("e", me()).update();
        Map<String, Object> before = new HashMap<>();
        before.put("headId", old.head());
        before.put("accountantId", old.acc());
        Map<String, Object> after = new HashMap<>();
        after.put("headId", r.headId());
        after.put("accountantId", r.accountantId());
        audit.record(AuditEntry.of("settings.signers", "print_setting", branchId).change(before, after));
        return get();
    }

    private void checkSigner(Long id, List<String> roles, long branchId) {
        if (id == null) {
            return;
        }
        int ok = jdbc.sql("""
                SELECT count(*) FROM employee e JOIN role r ON r.id = e.role_id
                WHERE e.id = :id AND e.status = 'ACTIVE' AND r.code IN (:roles) AND (e.branch_id IS NULL OR e.branch_id = :b)""")
                .param("id", id).param("roles", roles).param("b", branchId).query(Integer.class).single();
        if (ok == 0) {
            throw MedixException.badRequest("settings.signerInvalid");
        }
    }
}
