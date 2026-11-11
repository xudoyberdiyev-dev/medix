package uz.medix.catalog.product;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.catalog.product.ProductModels.ProductRequest;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/**
 * Import ustasi (prototip `ImportWizard`, turi «products»): 1) fayl o'qiladi (varaqlar → katakchalar, .xlsx/.csv);
 * 2–3) varaq, sarlavha qatori va ustun moslashtirish — brauzerda; 4) qatorlar tekshiriladi (har qatorga holat va izohlar);
 * 5) xatosiz (OK va ogohlantirishli) qatorlar bitta tranzaksiyada yaratiladi, xato qatorlar o'tkazib yuboriladi.
 */
@Service
public class ProductImport {

    static final int MAX_ROWS = ProductExcel.MAX_IMPORT_ROWS;
    static final int MAX_COLS = 100;
    static final int MAX_SHEETS = 20;
    static final String TYPE = "products";

    /** MEDIX maydonlari (prototip `BQ_FIELDS.products` + MEDIX shablonidagi qo'shimchalar). */
    static final List<String> FIELDS = List.of("code", "name", "contractName", "classifier", "maker", "country", "cat", "form", "dose",
            "pack", "unit", "barcode", "ikpu", "farmId", "note", "vat", "min", "max", "marked", "controlled", "prescription");

    /** Prototip bo'yicha majburiy maydonlar. */
    static final List<String> REQUIRED = List.of("name", "classifier", "maker", "cat", "ikpu", "farmId");

    // ===== DTO =====

    public record ImportSheet(String name, List<List<String>> rows) {}

    public record ImportFile(String fileName, long size, List<ImportSheet> sheets) {}

    public record ImportRowInput(int row, @NotNull Map<String, String> values) {}

    record ImportCheckRequest(@NotNull @Size(max = MAX_ROWS) List<@Valid ImportRowInput> rows) {}

    public enum RowStatus { OK, WARN, ERROR }

    public enum Tone { ERROR, WARN }

    @Schema(description = "Izoh: `key` — frontend tarjima kaliti (bq_m_*), `params` — o'rniga qo'yiladigan qiymatlar")
    public record ImportMessage(Tone tone, String key, Map<String, String> params) {}

    record ImportRowCheck(int row, RowStatus status, @Schema(nullable = true) String code, boolean codeAuto,
            @Schema(nullable = true) String createdCode, List<ImportMessage> messages) {}

    record ImportCheckResult(boolean applied, int ok, int warn, int error, int created, List<String> newManufacturers,
            List<String> newCategories, List<ImportRowCheck> rows) {}

    public record ImportProfile(String name, Map<String, String> mapping) {}

    public record ImportProfileRequest(@NotNull @Size(min = 1, max = 120) String name, @NotNull Map<String, String> mapping) {}

    private final Products products;
    private final ProductExcel excel;
    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final CurrentActor actor;

    ProductImport(Products products, ProductExcel excel, JdbcClient jdbc, AuditLog audit, CurrentActor actor) {
        this.products = products;
        this.excel = excel;
        this.jdbc = jdbc;
        this.audit = audit;
        this.actor = actor;
    }

    // ===== 1. Faylni o'qish =====

    public ImportFile read(String fileName, long size, InputStream in) {
        String name = fileName == null ? "fayl" : fileName;
        if (name.toLowerCase(Locale.ROOT).endsWith(".csv")) {
            return new ImportFile(name, size, List.of(new ImportSheet(name.replaceAll("(?i)\\.csv$", ""), readCsv(in))));
        }
        try (Workbook wb = WorkbookFactory.create(in)) {
            DataFormatter fmt = new DataFormatter(Locale.ROOT);
            List<ImportSheet> sheets = new ArrayList<>();
            for (int s = 0; s < Math.min(wb.getNumberOfSheets(), MAX_SHEETS); s++) {
                Sheet sheet = wb.getSheetAt(s);
                List<List<String>> rows = new ArrayList<>();
                int last = Math.min(sheet.getLastRowNum(), MAX_ROWS + 50);
                for (int i = 0; i <= last; i++) {
                    Row row = sheet.getRow(i);
                    List<String> cells = new ArrayList<>();
                    if (row != null) {
                        int lastCell = Math.min(row.getLastCellNum(), MAX_COLS);
                        for (int j = 0; j < lastCell; j++) {
                            Cell c = row.getCell(j);
                            cells.add(c == null ? "" : ProductExcel.cellText(c, fmt));
                        }
                    }
                    while (!cells.isEmpty() && cells.getLast().isEmpty()) {
                        cells.removeLast();
                    }
                    rows.add(cells);
                }
                while (!rows.isEmpty() && rows.getLast().isEmpty()) {
                    rows.removeLast();
                }
                sheets.add(new ImportSheet(sheet.getSheetName(), rows));
            }
            if (sheets.stream().allMatch(sh -> sh.rows().isEmpty())) {
                throw MedixException.badRequest("import.empty");
            }
            return new ImportFile(name, size, sheets);
        } catch (IOException | RuntimeException e) {
            if (e instanceof MedixException me) {
                throw me;
            }
            throw MedixException.badRequest("import.unreadableAny");
        }
    }

    /** CSV: UTF-8 (BOM bilan ham), ajratkich — «;», «,» yoki tab (birinchi qatordan aniqlanadi), qo'shtirnoqlar. */
    static List<List<String>> readCsv(InputStream in) {
        List<String> lines = new ArrayList<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String l;
            while ((l = r.readLine()) != null && lines.size() <= MAX_ROWS + 50) {
                lines.add(l);
            }
        } catch (IOException e) {
            throw MedixException.badRequest("import.unreadableAny");
        }
        if (lines.isEmpty()) {
            throw MedixException.badRequest("import.empty");
        }
        if (lines.getFirst().startsWith("﻿")) {
            lines.set(0, lines.getFirst().substring(1));
        }
        String first = lines.getFirst();
        char sep = ';';
        long semi = first.chars().filter(c -> c == ';').count();
        long comma = first.chars().filter(c -> c == ',').count();
        long tab = first.chars().filter(c -> c == '\t').count();
        if (tab > semi && tab > comma) {
            sep = '\t';
        } else if (comma > semi) {
            sep = ',';
        }
        List<List<String>> rows = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        List<String> row = new ArrayList<>();
        boolean quoted = false;
        for (int li = 0; li < lines.size(); li++) {
            String line = lines.get(li);
            for (int i = 0; i < line.length(); i++) {
                char ch = line.charAt(i);
                if (quoted) {
                    if (ch == '"' && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                        cell.append('"');
                        i++;
                    } else if (ch == '"') {
                        quoted = false;
                    } else {
                        cell.append(ch);
                    }
                } else if (ch == '"' && cell.isEmpty()) {
                    quoted = true;
                } else if (ch == sep) {
                    row.add(cell.toString().strip());
                    cell.setLength(0);
                } else {
                    cell.append(ch);
                }
            }
            if (quoted) {
                cell.append('\n');
                continue;
            }
            row.add(cell.toString().strip());
            cell.setLength(0);
            while (!row.isEmpty() && row.getLast().isEmpty()) {
                row.removeLast();
            }
            rows.add(row.size() > MAX_COLS ? new ArrayList<>(row.subList(0, MAX_COLS)) : row);
            row = new ArrayList<>();
        }
        while (!rows.isEmpty() && rows.getLast().isEmpty()) {
            rows.removeLast();
        }
        return rows;
    }

    // ===== 4–5. Tekshirish va yaratish =====

    /** {@code apply=false} — faqat tekshiradi (hech narsa yozilmaydi); {@code apply=true} — OK/ogohlantirishli qatorlarni yaratadi. */
    @Transactional
    ImportCheckResult check(ImportCheckRequest req, boolean apply) {
        Map<String, Long> units = excel.lookup("unit", true);
        Map<String, Long> manufacturers = excel.lookup("manufacturer", false);
        Map<String, Long> categories = excel.lookup("category", false);
        Map<String, Long> countries = excel.lookup("country", true);
        Map<String, Integer> seenCodes = new HashMap<>();
        Map<String, Integer> seenBarcodes = new HashMap<>();
        Map<String, Integer> seenNames = new HashMap<>();
        Map<String, String> newMakers = new LinkedHashMap<>();
        Map<String, String> newCats = new LinkedHashMap<>();
        List<ImportRowCheck> out = new ArrayList<>();
        int ok = 0;
        int warn = 0;
        int error = 0;
        int created = 0;
        for (ImportRowInput in : req.rows()) {
            Map<String, String> v = new HashMap<>();
            for (String f : FIELDS) {
                String s = in.values().get(f);
                v.put(f, s == null ? "" : s.strip());
            }
            List<ImportMessage> msgs = new ArrayList<>();
            for (String f : REQUIRED) {
                if (v.get(f).isEmpty()) {
                    msgs.add(err("pReq", "f", f));
                }
            }
            if (v.get("name").length() > 300) {
                msgs.add(err("pTooLong", "f", "name"));
            }
            // Kod: band yoki noto'g'ri bo'lsa — avtomatik beriladi (ogohlantirish)
            String code = v.get("code").replaceAll("\\D", "");
            if (!code.isEmpty() && (!code.matches("^[1-9][0-9]{7}$") || seenCodes.containsKey(code) || products.codeTaken(code))) {
                msgs.add(warn("pCodeAuto", "c", code));
                code = "";
            }
            if (!code.isEmpty()) {
                seenCodes.put(code, in.row());
            }
            ProductModels.DosageForm form = parseForm(v.get("form"));
            if (!v.get("form").isEmpty() && form == null) {
                msgs.add(warn("pFormUnknown", "t", v.get("form")));
            }
            Long unit = units.get(ProductExcel.key(v.get("unit").isEmpty() ? "dona" : v.get("unit")));
            if (unit == null) {
                msgs.add(err("pUnitUnknown", "t", v.get("unit")));
            }
            Long country = null;
            if (!v.get("country").isEmpty()) {
                country = countries.get(ProductExcel.key(v.get("country")));
                if (country == null) {
                    msgs.add(err("pCountryUnknown", "t", v.get("country")));
                }
            }
            String ikpu = v.get("ikpu").replaceAll("\\s", "");
            if (!ikpu.isEmpty() && !ikpu.matches("^[0-9]{17}$")) {
                msgs.add(err("pIkpuBad"));
            }
            List<String> barcodes = new ArrayList<>();
            for (String b : v.get("barcode").split("[\\s,;]+")) {
                if (b.isBlank()) {
                    continue;
                }
                if (!barcodeOk(b)) {
                    msgs.add(err("pBcBad"));
                    continue;
                }
                List<ProductModels.BarcodeOwner> owners = products.duplicates(null, null, null, List.of(b), null).barcodes();
                Integer prev = seenBarcodes.get(b);
                if (!owners.isEmpty()) {
                    msgs.add(err("pBcDup", "n", owners.getFirst().product().name()));
                } else if (prev != null) {
                    msgs.add(err("pBcDupFile", "r", String.valueOf(prev)));
                } else {
                    seenBarcodes.put(b, in.row());
                    barcodes.add(b);
                }
            }
            String vat = v.get("vat").replace(",", ".").replace("%", "").strip();
            if (vat.isEmpty()) {
                vat = "12";
            }
            if (!vat.matches("^\\d{1,3}(\\.\\d{1,2})?$")) {
                msgs.add(err("pVatBad", "t", v.get("vat")));
            }
            Integer min = positiveInt(v.get("min"), "min", msgs);
            Integer max = positiveInt(v.get("max"), "max", msgs);
            Integer pack = positiveInt(v.get("pack"), "pack", msgs);
            if (min != null && max != null && min > max) {
                msgs.add(err("pMaxMin"));
            }
            for (String[] lim : new String[][] {{"contractName", "300"}, {"classifier", "500"}, {"farmId", "50"}, {"dose", "50"}, {"note", "1000"}}) {
                if (v.get(lim[0]).length() > Integer.parseInt(lim[1])) {
                    msgs.add(err("pTooLong", "f", lim[0]));
                }
            }
            // Dublikat: nom + ishlab chiqaruvchi (katalogda yoki faylda)
            String makerKey = ProductExcel.key(v.get("maker"));
            Long makerId = manufacturers.get(makerKey);
            if (!v.get("name").isEmpty()) {
                if (makerId != null) {
                    ProductModels.Ref same = products.duplicates(v.get("name"), makerId, null, List.of(), null).sameName();
                    if (same != null) {
                        msgs.add(err("pNameDup", "n", same.name()));
                    }
                }
                String nk = ProductExcel.key(v.get("name")) + "|" + makerKey;
                Integer prev = seenNames.get(nk);
                if (prev != null) {
                    msgs.add(err("pNameDupFile", "r", String.valueOf(prev)));
                } else {
                    seenNames.put(nk, in.row());
                }
            }
            boolean hasErr = msgs.stream().anyMatch(m -> m.tone() == Tone.ERROR);
            RowStatus st = hasErr ? RowStatus.ERROR : msgs.isEmpty() ? RowStatus.OK : RowStatus.WARN;
            switch (st) {
                case OK -> ok++;
                case WARN -> warn++;
                case ERROR -> error++;
            }
            String createdCode = null;
            if (!hasErr) {
                if (makerId == null && !makerKey.isEmpty()) {
                    newMakers.putIfAbsent(makerKey, v.get("maker"));
                }
                String catKey = ProductExcel.key(v.get("cat"));
                if (!catKey.isEmpty() && !categories.containsKey(catKey)) {
                    newCats.putIfAbsent(catKey, v.get("cat"));
                }
                if (apply) {
                    Long maker = resolveOrCreate("manufacturer", v.get("maker"), manufacturers);
                    Long cat = resolveOrCreate("category", v.get("cat"), categories);
                    ProductRequest pr = new ProductRequest(v.get("name"), ProductExcel.blank(v.get("contractName")),
                            ProductExcel.blank(v.get("classifier")), maker, cat, country, unit, null, ProductExcel.blank(ikpu),
                            ProductExcel.blank(v.get("farmId")), barcodes, ProductExcel.yes(v.get("controlled")),
                            ProductExcel.yes(v.get("marked")), ProductExcel.yes(v.get("prescription")), vat, min, max, form,
                            ProductExcel.blank(v.get("dose")), pack, pack, ProductExcel.blank(v.get("note")), null, false);
                    createdCode = products.create(pr, code.isEmpty() ? null : code).code();
                    created++;
                }
            }
            out.add(new ImportRowCheck(in.row(), st, code.isEmpty() ? null : code, code.isEmpty(), createdCode, msgs));
        }
        if (apply && created > 0) {
            audit.record(AuditEntry.of("product.import", "product", null)
                    .change(null, Map.of("created", created, "skipped", error, "manufacturers", newMakers.size(), "categories", newCats.size())));
        }
        return new ImportCheckResult(apply && created > 0, ok, warn, error, created, List.copyOf(newMakers.values()),
                List.copyOf(newCats.values()), out);
    }

    private Long resolveOrCreate(String table, String name, Map<String, Long> known) {
        if (name == null || name.isBlank()) {
            return null;
        }
        Long id = known.get(ProductExcel.key(name));
        if (id != null) {
            return id;
        }
        long newId = jdbc.sql("INSERT INTO " + table + " (name) VALUES (:n) RETURNING id").param("n", name.strip()).query(Long.class).single();
        known.put(ProductExcel.key(name), newId);
        return newId;
    }

    /** EAN-13 / EAN-8 — nazorat raqami tekshiriladi; boshqa formatlar — umumiy qoida (4–50 belgi). */
    static boolean barcodeOk(String b) {
        if (!b.matches("^[0-9A-Za-z-]{4,50}$")) {
            return false;
        }
        if (b.matches("^\\d{13}$") || b.matches("^\\d{8}$")) {
            int sum = 0;
            int n = b.length();
            for (int i = 0; i < n - 1; i++) {
                int d = b.charAt(n - 2 - i) - '0';
                sum += i % 2 == 0 ? d * 3 : d;
            }
            return (10 - sum % 10) % 10 == b.charAt(n - 1) - '0';
        }
        return true;
    }

    static ProductModels.DosageForm parseForm(String s) {
        String k = ProductExcel.key(s);
        if (k.isEmpty()) {
            return null;
        }
        for (Map.Entry<ProductModels.DosageForm, String> e : ProductExcel.FORM_NAMES.entrySet()) {
            if (ProductExcel.key(e.getValue()).equals(k) || e.getKey().name().toLowerCase(Locale.ROOT).equals(k)) {
                return e.getKey();
            }
        }
        return null;
    }

    private static Integer positiveInt(String s, String field, List<ImportMessage> msgs) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.strip().replaceAll("[\\s ]", "");
        if (!t.matches("^\\d{1,6}$") || Integer.parseInt(t) < 1) {
            msgs.add(err("pIntBad", "f", field, "t", s));
            return null;
        }
        return Integer.parseInt(t);
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

    // ===== Moslashtirish profili =====

    @Transactional(readOnly = true)
    public java.util.Optional<ImportProfile> profile(String type) {
        return jdbc.sql("SELECT name FROM import_profile WHERE type = :t").param("t", type).query(String.class).optional().map(name -> {
            Map<String, String> m = new LinkedHashMap<>();
            jdbc.sql("SELECT field, column_title FROM import_profile_field WHERE type = :t ORDER BY field").param("t", type)
                    .query((rs, i) -> m.put(rs.getString(1), rs.getString(2))).list();
            return new ImportProfile(name, m);
        });
    }

    @Transactional
    ImportProfile saveProfile(String type, ImportProfileRequest r) {
        return saveProfile(type, FIELDS, r);
    }

    /** Profil — ixtiyoriy turdagi import uchun (masalan, kontragentlar): faqat {@code fields} dagi maydonlar saqlanadi. */
    @Transactional
    public ImportProfile saveProfile(String type, List<String> fields, ImportProfileRequest r) {
        Map<String, String> mapping = new LinkedHashMap<>();
        r.mapping().forEach((f, title) -> {
            if (fields.contains(f) && title != null && !title.isBlank()) {
                mapping.put(f, title.strip().length() > 200 ? title.strip().substring(0, 200) : title.strip());
            }
        });
        if (mapping.isEmpty()) {
            throw MedixException.badRequest("import.profileEmpty");
        }
        Long emp = actor.current().map(a -> a.employeeId()).orElse(null);
        jdbc.sql("""
                INSERT INTO import_profile (type, name, updated_by, updated_at) VALUES (:t, :n, :e, now())
                ON CONFLICT (type) DO UPDATE SET name = EXCLUDED.name, updated_by = EXCLUDED.updated_by, updated_at = now()""")
                .param("t", type).param("n", r.name().strip()).param("e", emp).update();
        jdbc.sql("DELETE FROM import_profile_field WHERE type = :t").param("t", type).update();
        mapping.forEach((f, title) -> jdbc.sql("INSERT INTO import_profile_field (type, field, column_title) VALUES (:t, :f, :c)")
                .param("t", type).param("f", f).param("c", title).update());
        audit.record(AuditEntry.of("import.profile", "import_profile", null).change(null, Map.of("type", type, "fields", mapping.size())));
        return new ImportProfile(r.name().strip(), mapping);
    }
}
