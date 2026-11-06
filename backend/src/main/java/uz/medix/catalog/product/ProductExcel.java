package uz.medix.catalog.product;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import uz.medix.catalog.product.ProductModels.Filter;
import uz.medix.catalog.product.ProductModels.ProductRequest;
import uz.medix.catalog.product.ProductModels.ProductRow;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;

/**
 * Mahsulotlar .xlsx: eksport (jadval filtrlari bilan) va import (MEDIX shabloni bo'yicha; SmartUp ustunlari namunasi
 * kelganda moslashtiriladi). Import — hammasi yoki hech narsa: bitta xato qator bo'lsa, hech narsa yozilmaydi.
 */
@Service
class ProductExcel {

    static final int MAX_EXPORT_ROWS = 50_000;
    static final int MAX_IMPORT_ROWS = 20_000;

    /** Import shablonining ustunlari (sarlavha nomi bo'yicha topiladi, tartib muhim emas). */
    static final List<String> TEMPLATE = List.of("Kod", "Nomi", "Shartnomadagi nomi", "Klassifikator nomi", "Ishlab chiqaruvchi",
            "Kategoriya", "Davlat", "Birlik", "Shtrix-kod", "IKPU", "Farm ID", "QQS", "Min", "Max", "Markirovkali", "Nazoratdagi",
            "Retsept");

    record ImportRowError(int row, String message) {}

    record ImportResult(boolean applied, int rows, int created, List<String> createdManufacturers, List<String> createdCategories,
            List<ImportRowError> errors) {}

    private final Products products;
    private final JdbcClient jdbc;
    private final AuditLog audit;

    ProductExcel(Products products, JdbcClient jdbc, AuditLog audit) {
        this.products = products;
        this.jdbc = jdbc;
        this.audit = audit;
    }

    // ===== Eksport =====

    @Transactional(readOnly = true)
    void export(Filter filter, OutputStream out) throws IOException {
        List<ProductRow> rows = products.search(new Filter(filter.q(), filter.manufacturerId(), filter.categoryId(), filter.status(),
                filter.controlled(), filter.marked(), filter.sort(), filter.desc(), 0, MAX_EXPORT_ROWS)).items();
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Mahsulotlar");
            CellStyle header = headerStyle(wb);
            String[] titles = {"Kod", "Nomi", "Ishlab chiqaruvchi", "Kategoriya", "Davlat", "Birlik", "QQS, %", "Min", "Max",
                "Markirovkali", "Nazoratdagi", "Retsept", "Holat"};
            Row h = sheet.createRow(0);
            for (int i = 0; i < titles.length; i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles[i]);
                c.setCellStyle(header);
            }
            int r = 1;
            for (ProductRow p : rows) {
                Row row = sheet.createRow(r++);
                int i = 0;
                row.createCell(i++).setCellValue(p.code());
                row.createCell(i++).setCellValue(p.name());
                row.createCell(i++).setCellValue(Optional.ofNullable(p.manufacturer()).orElse(""));
                row.createCell(i++).setCellValue(Optional.ofNullable(p.category()).orElse(""));
                row.createCell(i++).setCellValue(Optional.ofNullable(p.country()).orElse(""));
                row.createCell(i++).setCellValue(p.unit());
                row.createCell(i++).setCellValue(p.vatRate().replace(".00", ""));
                setInt(row.createCell(i++), p.minQty());
                setInt(row.createCell(i++), p.maxQty());
                row.createCell(i++).setCellValue(p.marked() ? "ha" : "yoʻq");
                row.createCell(i++).setCellValue(p.controlled() ? "ha" : "yoʻq");
                row.createCell(i++).setCellValue(p.prescription() ? "ha" : "yoʻq");
                row.createCell(i).setCellValue(p.active() ? "Faol" : "Nofaol");
            }
            int[] widths = {12, 50, 28, 22, 16, 10, 8, 8, 8, 13, 13, 10, 10};
            for (int i = 0; i < widths.length; i++) {
                sheet.setColumnWidth(i, widths[i] * 256);
            }
            sheet.createFreezePane(0, 1);
            wb.write(out);
        }
    }

    /** Bo'sh import shabloni (sarlavhalar va bitta namuna qator). */
    void template(OutputStream out) throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("Mahsulotlar");
            CellStyle header = headerStyle(wb);
            Row h = sheet.createRow(0);
            for (int i = 0; i < TEMPLATE.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(TEMPLATE.get(i));
                c.setCellStyle(header);
                sheet.setColumnWidth(i, (i == 1 ? 40 : 16) * 256);
            }
            String[] sample = {"", "Paracetamol 500 mg tabletka №10", "", "", "Nobel Pharmsanoat", "Analgetiklar", "Oʻzbekiston", "dona",
                "4780000000001", "", "", "12", "", "", "yoʻq", "yoʻq", "yoʻq"};
            Row s = sheet.createRow(1);
            for (int i = 0; i < sample.length; i++) {
                s.createCell(i).setCellValue(sample[i]);
            }
            sheet.createFreezePane(0, 1);
            wb.write(out);
        }
    }

    // ===== Import =====

    @Transactional
    ImportResult importFile(InputStream in, boolean apply) {
        List<Map<String, String>> rows = read(in);
        if (rows.size() > MAX_IMPORT_ROWS) {
            throw MedixException.badRequest("import.tooManyRows", MAX_IMPORT_ROWS);
        }
        Map<String, Long> units = lookup("unit", true);
        Map<String, Long> manufacturers = lookup("manufacturer", false);
        Map<String, Long> categories = lookup("category", false);
        Map<String, Long> countries = lookup("country", true);
        List<String> newManufacturers = new ArrayList<>();
        List<String> newCategories = new ArrayList<>();
        List<ImportRowError> errors = new ArrayList<>();
        Map<String, Integer> seenCodes = new HashMap<>();
        Map<String, Integer> seenBarcodes = new HashMap<>();
        int created = 0;
        for (int i = 0; i < rows.size(); i++) {
            Map<String, String> r = rows.get(i);
            int rowNo = i + 2;
            try {
                String code = r.getOrDefault("Kod", "");
                if (!code.isEmpty()) {
                    if (!code.matches("^[1-9][0-9]{7}$")) {
                        throw new RowError("Kod 8 ta raqam boʻlishi kerak, boshida 0 boʻlmaydi: «" + code + "».");
                    }
                    Integer prev = seenCodes.put(code, rowNo);
                    if (prev != null) {
                        throw new RowError("Kod " + code + " fayl ichida takrorlangan (" + prev + "-qator).");
                    }
                    if (products.codeTaken(code)) {
                        throw new RowError("Kod " + code + " band — bunday mahsulot allaqachon bor.");
                    }
                }
                String name = r.getOrDefault("Nomi", "");
                if (name.isEmpty()) {
                    throw new RowError("Nomi kiritilmagan.");
                }
                Long unit = units.get(key(r.getOrDefault("Birlik", "")));
                if (unit == null) {
                    throw new RowError("Birlik topilmadi: «" + r.getOrDefault("Birlik", "") + "». Maʼlumotnomadagi nom yoki qisqa yozuvni yozing.");
                }
                Long manufacturer = resolveOrCreate("manufacturer", r.get("Ishlab chiqaruvchi"), manufacturers, newManufacturers);
                Long category = resolveOrCreate("category", r.get("Kategoriya"), categories, newCategories);
                Long country = null;
                String countryName = r.getOrDefault("Davlat", "");
                if (!countryName.isEmpty()) {
                    country = countries.get(key(countryName));
                    if (country == null) {
                        throw new RowError("Davlat topilmadi: «" + countryName + "». Avval maʼlumotnomaga qoʻshing.");
                    }
                }
                List<String> barcodes = new ArrayList<>();
                for (String b : r.getOrDefault("Shtrix-kod", "").split("[\\s,;]+")) {
                    if (!b.isBlank()) {
                        Integer prev = seenBarcodes.put(b, rowNo);
                        if (prev != null) {
                            throw new RowError("Shtrix-kod " + b + " fayl ichida takrorlangan (" + prev + "-qator).");
                        }
                        barcodes.add(b);
                    }
                }
                String vat = r.getOrDefault("QQS", "").replace(",", ".").replace("%", "");
                ProductRequest req = new ProductRequest(name, blank(r.get("Shartnomadagi nomi")), blank(r.get("Klassifikator nomi")),
                        manufacturer, category, country, unit, null, blank(r.get("IKPU")), blank(r.get("Farm ID")), barcodes,
                        yes(r.get("Nazoratdagi")), yes(r.get("Markirovkali")), yes(r.get("Retsept")), vat.isEmpty() ? "12" : vat,
                        intOrNull(r.get("Min"), "Min"), intOrNull(r.get("Max"), "Max"));
                checkFormats(req);
                products.create(req, code.isEmpty() ? null : code);
                created++;
            } catch (RowError e) {
                errors.add(new ImportRowError(rowNo, e.getMessage()));
            } catch (MedixException e) {
                errors.add(new ImportRowError(rowNo, e.code()));
            }
            if (errors.size() >= 200) {
                break;
            }
        }
        boolean applied = apply && errors.isEmpty();
        if (!applied) {
            // Ko'rib chiqish yoki xato — hech narsa yozilmaydi.
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
        } else {
            audit.record(AuditEntry.of("product.import", "product", null)
                    .change(null, Map.of("created", created, "manufacturers", newManufacturers.size(), "categories", newCategories.size())));
        }
        return new ImportResult(applied, rows.size(), created, newManufacturers, newCategories, errors);
    }

    private static final class RowError extends RuntimeException {
        RowError(String message) {
            super(message, null, false, false);
        }
    }

    private Long resolveOrCreate(String table, String name, Map<String, Long> known, List<String> createdNames) {
        if (name == null || name.isBlank()) {
            return null;
        }
        Long id = known.get(key(name));
        if (id != null) {
            return id;
        }
        long newId = jdbc.sql("INSERT INTO " + table + " (name) VALUES (:n) RETURNING id").param("n", name.strip()).query(Long.class).single();
        known.put(key(name), newId);
        createdNames.add(name.strip());
        return newId;
    }

    /** Faol yozuvlar: nom (va qisqa nom) → id, katta-kichik harf farqsiz. */
    private Map<String, Long> lookup(String table, boolean withShortName) {
        Map<String, Long> m = new HashMap<>();
        jdbc.sql("SELECT id, name, short_name FROM " + table + " WHERE active").query((rs, n) -> {
            m.put(key(rs.getString("name")), rs.getLong("id"));
            if (withShortName && rs.getString("short_name") != null) {
                m.putIfAbsent(key(rs.getString("short_name")), rs.getLong("id"));
            }
            return null;
        }).list();
        return m;
    }

    private static void checkFormats(ProductRequest r) {
        if (r.ikpu() != null && !r.ikpu().matches("^[0-9]{17}$")) {
            throw new RowError("IKPU 17 ta raqam boʻlishi kerak.");
        }
        if (!r.vatRate().matches("^\\d{1,3}(\\.\\d{1,2})?$")) {
            throw new RowError("QQS stavkasi notoʻgʻri: «" + r.vatRate() + "».");
        }
        for (String b : r.barcodes()) {
            if (!b.matches("^[0-9A-Za-z-]{4,50}$")) {
                throw new RowError("Shtrix-kod notoʻgʻri: «" + b + "».");
            }
        }
        if (r.name().length() > 300) {
            throw new RowError("Nomi 300 belgidan uzun.");
        }
    }

    private static List<Map<String, String>> read(InputStream in) {
        try (Workbook wb = WorkbookFactory.create(in)) {
            Sheet sheet = wb.getSheetAt(0);
            DataFormatter fmt = new DataFormatter(Locale.ROOT);
            Row header = sheet.getRow(sheet.getFirstRowNum());
            if (header == null) {
                throw MedixException.badRequest("import.empty");
            }
            Map<Integer, String> columns = new HashMap<>();
            for (Cell c : header) {
                String title = fmt.formatCellValue(c).strip();
                TEMPLATE.stream().filter(t -> t.equalsIgnoreCase(title)).findFirst().ifPresent(t -> columns.put(c.getColumnIndex(), t));
            }
            if (!columns.containsValue("Nomi") || !columns.containsValue("Birlik")) {
                throw MedixException.badRequest("import.badHeader");
            }
            List<Map<String, String>> rows = new ArrayList<>();
            for (int i = header.getRowNum() + 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                Map<String, String> values = new HashMap<>();
                if (row != null) {
                    for (Map.Entry<Integer, String> col : columns.entrySet()) {
                        Cell c = row.getCell(col.getKey());
                        String v = c == null ? "" : cellText(c, fmt);
                        if (!v.isEmpty()) {
                            values.put(col.getValue(), v);
                        }
                    }
                }
                if (!values.isEmpty()) {
                    rows.add(values);
                } else {
                    rows.add(Map.of("__empty", "1"));
                }
            }
            // Oxiridagi bo'sh qatorlar tashlanadi; o'rtadagilar qator raqami saqlanishi uchun bo'sh xarita bo'lib qoladi.
            while (!rows.isEmpty() && rows.getLast().containsKey("__empty")) {
                rows.removeLast();
            }
            return rows.stream().map(m -> m.containsKey("__empty") ? Map.<String, String>of() : m).toList();
        } catch (IOException | RuntimeException e) {
            if (e instanceof MedixException me) {
                throw me;
            }
            throw MedixException.badRequest("import.unreadable");
        }
    }

    /** Raqamli kataklar (kod, shtrix-kod) «4.78E12» bo'lib qolmasin. */
    private static String cellText(Cell c, DataFormatter fmt) {
        if (c.getCellType() == CellType.NUMERIC) {
            BigDecimal d = BigDecimal.valueOf(c.getNumericCellValue());
            return d.stripTrailingZeros().toPlainString();
        }
        return fmt.formatCellValue(c).strip();
    }

    private static CellStyle headerStyle(Workbook wb) {
        CellStyle s = wb.createCellStyle();
        Font f = wb.createFont();
        f.setBold(true);
        s.setFont(f);
        return s;
    }

    private static void setInt(Cell c, Integer v) {
        if (v != null) {
            c.setCellValue(v);
        }
    }

    private static String key(String s) {
        return s == null ? "" : s.strip().toLowerCase(Locale.ROOT).replaceAll("[ʻʼ'`‘’]", "");
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static boolean yes(String s) {
        String k = key(s);
        return k.equals("ha") || k.equals("1") || k.equals("true") || k.equals("+") || k.equals("да");
    }

    private static Integer intOrNull(String s, String column) {
        if (s == null || s.isBlank()) {
            return null;
        }
        if (!s.strip().matches("^\\d{1,7}$") || Integer.parseInt(s.strip()) < 1) {
            throw new RowError(column + " — butun musbat son boʻlishi kerak: «" + s + "».");
        }
        return Integer.parseInt(s.strip());
    }
}
