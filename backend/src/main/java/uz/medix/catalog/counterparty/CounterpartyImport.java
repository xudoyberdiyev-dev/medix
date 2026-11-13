package uz.medix.catalog.counterparty;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.catalog.counterparty.CounterpartyModels.CounterpartyRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.Kind;
import uz.medix.catalog.counterparty.CounterpartyModels.Role;
import uz.medix.catalog.counterparty.CounterpartyModels.TermsRequest;
import uz.medix.catalog.product.ProductImport;
import uz.medix.catalog.product.ProductImport.ImportMessage;
import uz.medix.catalog.product.ProductImport.ImportRowInput;
import uz.medix.catalog.product.ProductImport.RowStatus;
import uz.medix.catalog.product.ProductImport.Tone;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;

/**
 * Kontragentlar import ustasi (prototip `ImportWizard`, turlari «cust» va «sup»): fayl o'qish va moslashtirish profili —
 * mahsulot ustasi bilan umumiy ({@link ProductImport}); bu yerda — qatorlarni tekshirish va yaratish.
 * Har qator yangi kontragent; STIR bazada bo'lsa — xato (mavjud karta o'zgartirilmaydi). Chegirma maydoni yo'q (egasi qarori kutilmoqda).
 */
@Service
class CounterpartyImport {

    static final int MAX_ROWS = 5000;

    /** Prototip `BQ_FIELDS.cust` (chegirmasiz). */
    static final List<String> CUSTOMER_FIELDS = List.of("stir", "cname", "ctype", "region", "address", "phone", "limit", "days", "zone");

    /** Prototip `BQ_FIELDS.sup`. */
    static final List<String> SUPPLIER_FIELDS = List.of("stir", "cname", "region", "address", "phone", "days", "lead");

    private record Existing(long id, String name, boolean hasRole) {}

    static final List<String> REQUIRED = List.of("stir", "cname");

    record CounterpartyImportRequest(
            @NotNull Role role,
            @Schema(nullable = true, description = "Filial shartlari (limit, muddatlar) shu filialga yoziladi") Long branchId,
            @NotNull @Size(max = MAX_ROWS) List<@Valid ImportRowInput> rows) {}

    record CounterpartyImportRow(int row, RowStatus status, @Schema(nullable = true) String tin,
            @Schema(nullable = true, description = "apply=true da yaratilgan kontragent") Long createdId,
            @Schema(nullable = true, description = "STIR bo'yicha mavjud karta — unga faqat tanlangan filial sharti qo'shiladi") Long existingId,
            List<ImportMessage> messages) {}

    record CounterpartyImportResult(boolean applied, int ok, int warn, int error, int created,
            @Schema(description = "Mavjud kartalarga filial sharti qo'shilgan qatorlar") int updated, List<CounterpartyImportRow> rows) {}

    private final Counterparties counterparties;
    private final JdbcClient jdbc;
    private final AuditLog audit;

    CounterpartyImport(Counterparties counterparties, JdbcClient jdbc, AuditLog audit) {
        this.counterparties = counterparties;
        this.jdbc = jdbc;
        this.audit = audit;
    }

    static List<String> fields(Role role) {
        return role == Role.SUPPLIER ? SUPPLIER_FIELDS : CUSTOMER_FIELDS;
    }

    static String profileType(Role role) {
        return role == Role.SUPPLIER ? "suppliers" : "customers";
    }

    /**
     * {@code apply=false} — faqat tekshiradi; {@code apply=true} — OK/ogohlantirishli qatorlar bitta tranzaksiyada yaratiladi.
     * {@code termsAllowed} — filial shartlarini yozish ruxsati (clients.terms / suppliers.terms); yo'q bo'lsa shartlar o'tkazib yuboriladi.
     */
    @Transactional
    CounterpartyImportResult check(CounterpartyImportRequest req, boolean apply, boolean termsAllowed) {
        if (req.role() == Role.ALL) {
            throw MedixException.badRequest("counterparty.roleRequired");
        }
        boolean customer = req.role() == Role.CUSTOMER;
        List<String> fields = fields(req.role());
        Map<String, Long> regions = new HashMap<>();
        jdbc.sql("SELECT id, name FROM region WHERE active").query((rs, n) -> regions.put(key(rs.getString("name")), rs.getLong("id"))).list();
        // O6: savdo zonasi — tanlangan filialning faol zonalari, nom bo'yicha
        Map<String, Long> zones = new HashMap<>();
        if (customer && req.branchId() != null) {
            jdbc.sql("SELECT id, name FROM sales_zone WHERE active AND branch_id = :b").param("b", req.branchId())
                    .query((rs, n) -> zones.put(key(rs.getString("name")), rs.getLong("id"))).list();
        }
        Map<String, Integer> seenTins = new HashMap<>();
        List<CounterpartyImportRow> out = new ArrayList<>();
        int ok = 0;
        int warn = 0;
        int error = 0;
        int created = 0;
        int updated = 0;
        for (ImportRowInput in : req.rows()) {
            Map<String, String> v = new HashMap<>();
            for (String f : fields) {
                String s = in.values().get(f);
                v.put(f, s == null ? "" : s.strip());
            }
            List<ImportMessage> msgs = new ArrayList<>();
            for (String f : REQUIRED) {
                if (v.get(f).isEmpty()) {
                    msgs.add(err("cReq", "f", f));
                }
            }
            Existing existing = null;
            String tin = v.get("stir").replaceAll("[\\s\\u00a0-]", "");
            if (!tin.isEmpty()) {
                if (!tin.matches("^([0-9]{9}|[0-9]{14})$")) {
                    msgs.add(err("cTinBad", "t", v.get("stir")));
                } else {
                    Optional<Existing> owner = jdbc.sql("SELECT id, name, is_customer, is_supplier FROM counterparty WHERE tin = :t")
                            .param("t", tin)
                            .query((rs, n) -> new Existing(rs.getLong("id"), rs.getString("name"), customer ? rs.getBoolean("is_customer") : rs.getBoolean("is_supplier")))
                            .optional();
                    Integer prev = seenTins.get(tin);
                    if (prev != null) {
                        msgs.add(err("cTinDupFile", "r", String.valueOf(prev)));
                    } else if (owner.isPresent()) {
                        seenTins.put(tin, in.row());
                        existing = owner.get();
                        if (!existing.hasRole()) {
                            msgs.add(err("cTinOtherRole", "n", existing.name()));
                        }
                    } else {
                        seenTins.put(tin, in.row());
                    }
                }
            }
            for (String[] lim : new String[][] {{"cname", "300"}, {"address", "500"}, {"phone", "64"}}) {
                if (v.get(lim[0]).length() > Integer.parseInt(lim[1])) {
                    msgs.add(err("cTooLong", "f", lim[0]));
                }
            }
            Kind kind = null;
            if (customer && !v.get("ctype").isEmpty()) {
                kind = parseKind(v.get("ctype"));
                if (kind == null) {
                    msgs.add(warn("cKindUnknown", "t", v.get("ctype")));
                }
            }
            Long regionId = null;
            if (!v.get("region").isEmpty()) {
                regionId = regions.get(key(v.get("region")));
                if (regionId == null) {
                    msgs.add(warn("cRegionUnknown", "t", v.get("region")));
                }
            }
            String limit = null;
            if (customer && !v.get("limit").isEmpty()) {
                String l = v.get("limit").replaceAll("[\\s\\u00a0]", "").replace(",", ".");
                if (l.matches("^\\d{1,16}(\\.\\d{1,2})?$")) {
                    limit = l;
                } else {
                    msgs.add(err("cMoneyBad", "f", "limit", "t", v.get("limit")));
                }
            }
            Integer days = days(v.get("days"), "days", msgs);
            Integer lead = customer ? null : days(v.get("lead"), "lead", msgs);
            Long zoneId = null;
            if (customer && !v.getOrDefault("zone", "").isEmpty() && req.branchId() != null) {
                zoneId = zones.get(key(v.get("zone")));
                if (zoneId == null) {
                    msgs.add(err("cZoneUnknown", "t", v.get("zone")));
                }
            }
            boolean hasTerms = limit != null || days != null || lead != null || zoneId != null
                    || (customer && !v.getOrDefault("zone", "").isEmpty());
            if (hasTerms && req.branchId() == null) {
                msgs.add(err("cBranchReq"));
            } else if (hasTerms && !termsAllowed) {
                msgs.add(existing != null && existing.hasRole() ? err("cTinTaken", "n", existing.name()) : warn("cTermsSkipped"));
            }
            if (existing != null && existing.hasRole() && msgs.stream().noneMatch(m -> m.tone() == Tone.ERROR)) {
                // Prototip: STIR bo'yicha mavjud kartaga faqat joriy filial sharti qo'shiladi; shart yo'q yoki filialda allaqachon bor — o'tkazib yuboriladi
                boolean branchHasTerms = req.branchId() != null && jdbc.sql(
                                "SELECT count(*) FROM counterparty_branch_terms WHERE counterparty_id = :c AND branch_id = :b")
                        .param("c", existing.id())
                        .param("b", req.branchId())
                        .query(Long.class)
                        .single() > 0;
                msgs.add(!hasTerms || branchHasTerms ? err("cTinTaken", "n", existing.name()) : warn("cTinExisting", "n", existing.name()));
            }
            boolean hasErr = msgs.stream().anyMatch(m -> m.tone() == Tone.ERROR);
            RowStatus st = hasErr ? RowStatus.ERROR : msgs.isEmpty() ? RowStatus.OK : RowStatus.WARN;
            switch (st) {
                case OK -> ok++;
                case WARN -> warn++;
                case ERROR -> error++;
            }
            Long createdId = null;
            Long existingId = existing != null && !hasErr ? existing.id() : null;
            if (!hasErr && apply && existingId != null) {
                TermsRequest terms = customer
                        ? new TermsRequest(limit, days, null, null, null, null, null, null, null, null, zoneId)
                        : new TermsRequest(null, null, null, null, null, days, null, null, null, lead, null);
                counterparties.saveTerms(existingId, req.branchId(), terms, customer, !customer);
                updated++;
            } else if (!hasErr && apply) {
                CounterpartyRequest r = new CounterpartyRequest(tin, v.get("cname"), null, customer, !customer, kind, regionId,
                        blank(v.get("address")), blank(v.get("phone")), null, null, null, null, null, null, null, null);
                createdId = counterparties.create(r);
                if (hasTerms && termsAllowed) {
                    TermsRequest terms = customer
                            ? new TermsRequest(limit, days, null, null, null, null, null, null, null, null, zoneId)
                            : new TermsRequest(null, null, null, null, null, days, null, null, null, lead, null);
                    counterparties.saveTerms(createdId, req.branchId(), terms, customer, !customer);
                }
                created++;
            }
            out.add(new CounterpartyImportRow(in.row(), st, tin.isEmpty() ? null : tin, createdId, existingId, msgs));
        }
        if (apply && created + updated > 0) {
            audit.record(AuditEntry.of("counterparty.import", "counterparty", null)
                    .change(null, Map.of("role", req.role().name(), "created", created, "updated", updated, "skipped", error)));
        }
        return new CounterpartyImportResult(apply && created + updated > 0, ok, warn, error, created, updated, out);
    }

    /** Tur: lotin, kirill va rus nomlari yoki enum nomi; tanilmasa — null (ogohlantirish, tur bo'sh qoladi). */
    static Kind parseKind(String s) {
        String k = key(s);
        if (k.isEmpty()) {
            return null;
        }
        for (Kind kind : Kind.values()) {
            if (kind.name().toLowerCase(Locale.ROOT).equals(k)) {
                return kind;
            }
        }
        if (k.startsWith("dorixona") || k.startsWith("apteka") || k.startsWith("дорихона") || k.startsWith("аптека")) {
            return Kind.PHARMACY;
        }
        if (k.startsWith("klinika") || k.startsWith("клиника") || k.startsWith("clinic")) {
            return Kind.CLINIC;
        }
        if (k.startsWith("shifoxona") || k.startsWith("kasalxona") || k.startsWith("bolnica") || k.startsWith("больница")
                || k.startsWith("шифохона") || k.startsWith("касалхона") || k.startsWith("hospital")) {
            return Kind.HOSPITAL;
        }
        if (k.startsWith("distrib") || k.startsWith("дистриб") || k.startsWith("ulgurji") || k.startsWith("улгуржи")) {
            return Kind.DISTRIBUTOR;
        }
        if (k.startsWith("ishlabchiqaruvchi") || k.startsWith("ишлабчиқарувчи") || k.startsWith("proizvoditel") || k.startsWith("производитель")
                || k.startsWith("maker") || k.startsWith("manufacturer")) {
            return Kind.MAKER;
        }
        return null;
    }

    /** Solishtirish kaliti: kichik harf, bo'shliq va tinish belgilarisiz. */
    static String key(String s) {
        if (s == null) {
            return "";
        }
        return Normalizer.normalize(s, Normalizer.Form.NFC).toLowerCase(Locale.ROOT).replaceAll("[\\s\\p{Punct}ʻʼ‘’`]", "");
    }

    private static Integer days(String s, String field, List<ImportMessage> msgs) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.strip().replaceAll("[\\s\\u00a0]", "");
        if (!t.matches("^\\d{1,3}$") || Integer.parseInt(t) > 365) {
            msgs.add(err("cDaysBad", "f", field, "t", s));
            return null;
        }
        return Integer.parseInt(t);
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private static ImportMessage err(String key, String... kv) {
        return new ImportMessage(Tone.ERROR, key, params(kv));
    }

    private static ImportMessage warn(String key, String... kv) {
        return new ImportMessage(Tone.WARN, key, params(kv));
    }

    private static Map<String, String> params(String... kv) {
        Map<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put(kv[i], kv[i + 1]);
        }
        return m;
    }
}
