package uz.medix.inventory.opening;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.inventory.ZoneType;
import uz.medix.inventory.opening.OpeningBalances.Head;
import uz.medix.inventory.opening.OpeningBalances.ZoneRef;
import uz.medix.inventory.opening.OpeningModels.OpeningImportResult;
import uz.medix.inventory.opening.OpeningModels.OpeningImportError;
import uz.medix.inventory.opening.OpeningModels.OpeningLineRequest;
import uz.medix.inventory.opening.OpeningModels.Status;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;

/**
 * BQ qatorlari .xlsx dan (MEDIX shabloni; SmartUp ustunlari namunasi kelganda moslashtiriladi). Hammasi yoki hech narsa:
 * bitta xato bo'lsa — qoralama o'zgarmaydi. Mahsulot 8 raqamli kod (yoki shtrix-kod) bo'yicha, zona nomi yoki turi bo'yicha
 * (bo'sh — Asosiy saqlash) topiladi.
 */
@Service
class OpeningExcel {

    static final List<String> TEMPLATE = List.of("Mahsulot kodi", "Mahsulot nomi", "Zona", "Partiya", "Ishlab chiqarilgan", "Yaroqlilik",
            "Tannarx", "Soni", "Bonus");

    private static final Pattern DMY = Pattern.compile("^(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})$");
    private static final Pattern MY = Pattern.compile("^(\\d{1,2})[./-](\\d{4})$");

    private final OpeningBalances openings;
    private final JdbcClient jdbc;

    OpeningExcel(OpeningBalances openings, JdbcClient jdbc) {
        this.openings = openings;
        this.jdbc = jdbc;
    }

    void template(OutputStream out) throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("Boshlangʻich qoldiq");
            CellStyle header = wb.createCellStyle();
            Font f = wb.createFont();
            f.setBold(true);
            header.setFont(f);
            Row h = sheet.createRow(0);
            for (int i = 0; i < TEMPLATE.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(TEMPLATE.get(i));
                c.setCellStyle(header);
                sheet.setColumnWidth(i, (i == 1 ? 40 : 16) * 256);
            }
            String[] sample = {"12345678", "Paracetamol 500 mg tabletka №10", "Asosiy saqlash", "PR-2405", "01.05.2025", "01.05.2028",
                "12500,00", "120", "yoʻq"};
            Row s = sheet.createRow(1);
            for (int i = 0; i < sample.length; i++) {
                s.createCell(i).setCellValue(sample[i]);
            }
            sheet.createFreezePane(0, 1);
            wb.write(out);
        }
    }

    /** {@code apply=false} — faqat tekshiruv (ko'rib chiqish); {@code true} — xato bo'lmasa qoralama qatorlari almashtiriladi. */
    @Transactional
    OpeningImportResult importFile(Actor actor, long docId, InputStream in, String fileName, boolean apply) {
        Head h = openings.lock(docId, actor);
        if (h.status() != Status.DRAFT) {
            throw MedixException.conflict("opening.notDraft", h.status().name());
        }
        List<Map<String, Object>> rows = read(in);
        if (rows.size() > OpeningModels.MAX_LINES) {
            throw MedixException.badRequest("import.tooManyRows", OpeningModels.MAX_LINES);
        }
        Map<String, Long> byCode = new HashMap<>();
        jdbc.sql("SELECT id, code FROM product WHERE active").query((rs, n) -> byCode.put(rs.getString("code"), rs.getLong("id"))).list();
        Map<String, Long> byBarcode = new HashMap<>();
        jdbc.sql("SELECT b.barcode, b.product_id FROM product_barcode b JOIN product p ON p.id = b.product_id WHERE p.active")
                .query((rs, n) -> byBarcode.putIfAbsent(rs.getString("barcode"), rs.getLong("product_id")))
                .list();
        List<ZoneRef> zones = openings.zones(h.warehouseId());
        Long mainZone = zones.stream().filter(z -> z.type() == ZoneType.MAIN).map(ZoneRef::id).findFirst().orElse(null);

        List<OpeningImportError> errors = new ArrayList<>();
        List<OpeningLineRequest> lines = new ArrayList<>();
        List<Integer> rowNumbers = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> r = rows.get(i);
            int rowNo = i + 2;
            if (r.isEmpty()) {
                continue;
            }
            try {
                String code = text(r, "Mahsulot kodi");
                if (code.isEmpty()) {
                    throw new RowError("Mahsulot kodi kiritilmagan.");
                }
                Long product = byCode.containsKey(code) ? byCode.get(code) : byBarcode.get(code);
                if (product == null) {
                    throw new RowError("Mahsulot topilmadi: «" + code + "». 8 raqamli MEDIX kodi yoki shtrix-kodni yozing.");
                }
                String zoneName = text(r, "Zona");
                Long zone = zoneName.isEmpty() ? mainZone : findZone(zones, zoneName);
                if (zone == null) {
                    throw new RowError("Zona topilmadi: «" + zoneName + "». Shu ombordagi zona nomini yozing.");
                }
                String batch = text(r, "Partiya");
                if (batch.isEmpty()) {
                    throw new RowError("Partiya raqami kiritilmagan.");
                }
                if (batch.length() > 60) {
                    throw new RowError("Partiya raqami 60 belgidan uzun.");
                }
                LocalDate produced = date(r.get("Ishlab chiqarilgan"), "Ishlab chiqarilgan", false);
                LocalDate expiry = date(r.get("Yaroqlilik"), "Yaroqlilik", true);
                boolean bonus = yes(text(r, "Bonus"));
                String cost = money(text(r, "Tannarx"), bonus);
                Integer qty = qty(text(r, "Soni"));
                lines.add(new OpeningLineRequest(product, zone, batch, produced, expiry, cost, bonus, qty));
                rowNumbers.add(rowNo);
            } catch (RowError e) {
                errors.add(new OpeningImportError(rowNo, e.getMessage()));
            }
            if (errors.size() >= 200) {
                break;
            }
        }
        if (errors.isEmpty()) {
            // Qatorlararo qoidalar (takror, bir partiya — bitta yaroqlilik, Seyf) — qoralama qoidalari bilan bir xil.
            for (String e : openings.validate(h.warehouseId(), lines)) {
                int idx = Integer.parseInt(e.substring(0, e.indexOf('-'))) - 1;
                errors.add(new OpeningImportError(rowNumbers.get(idx), e.substring(e.indexOf(':') + 1).strip()));
            }
        }
        if (lines.isEmpty() && errors.isEmpty()) {
            throw MedixException.badRequest("import.empty");
        }
        boolean applied = apply && errors.isEmpty();
        if (applied) {
            openings.replaceFromImport(actor, docId, lines, fileName);
        }
        return new OpeningImportResult(applied, lines.size() + errors.size(), errors);
    }

    private static Long findZone(List<ZoneRef> zones, String name) {
        String k = key(name);
        for (ZoneRef z : zones) {
            if (key(z.name()).equals(k) || key(z.type().name()).equals(k) || key(z.type().defaultName()).equals(k)) {
                return z.id();
            }
        }
        return null;
    }

    private static final class RowError extends RuntimeException {
        RowError(String message) {
            super(message, null, false, false);
        }
    }

    private static String text(Map<String, Object> r, String col) {
        Object v = r.get(col);
        return v == null ? "" : v.toString().strip();
    }

    static LocalDate date(Object v, String column, boolean required) {
        if (v instanceof LocalDate d) {
            return d;
        }
        String s = v == null ? "" : v.toString().strip();
        if (s.isEmpty()) {
            if (required) {
                throw new RowError(column + " sanasi kiritilmagan.");
            }
            return null;
        }
        try {
            Matcher m = DMY.matcher(s);
            if (m.matches()) {
                return LocalDate.of(Integer.parseInt(m.group(3)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(1)));
            }
            Matcher my = MY.matcher(s);
            if (my.matches()) {
                // «05.2028» — oyning oxirgi kuni (qadoqdagi yaroqlilik odatda oy bilan yoziladi).
                LocalDate first = LocalDate.of(Integer.parseInt(my.group(2)), Integer.parseInt(my.group(1)), 1);
                return first.withDayOfMonth(first.lengthOfMonth());
            }
            return LocalDate.parse(s, DateTimeFormatter.ISO_LOCAL_DATE);
        } catch (java.time.DateTimeException e) {
            throw new RowError(column + " sanasi notoʻgʻri: «" + s + "». Masalan: 01.05.2028.");
        }
    }

    static String money(String s, boolean bonus) {
        if (s.isEmpty()) {
            if (bonus) {
                return "0";
            }
            throw new RowError("Tannarx kiritilmagan.");
        }
        // «12 500,50», «12.500,50», «12500.5» — barchasi 12500.50
        String t = s.replace(" ", "").replace(" ", "").replace("soʻm", "").replace("so'm", "");
        if (t.matches("^\\d{1,3}(\\.\\d{3})+(,\\d{1,2})?$")) {
            t = t.replace(".", "").replace(",", ".");
        } else {
            t = t.replace(",", ".");
        }
        if (!t.matches("^\\d{1,16}(\\.\\d{1,2})?$")) {
            throw new RowError("Tannarx notoʻgʻri: «" + s + "». Masalan: 12500,00.");
        }
        return t;
    }

    private static Integer qty(String s) {
        String t = s.replace(" ", "");
        if (!t.matches("^\\d{1,8}$") || Integer.parseInt(t) < 1 || Integer.parseInt(t) > OpeningModels.MAX_QTY) {
            throw new RowError("Soni — butun musbat son boʻlishi kerak: «" + s + "».");
        }
        return Integer.parseInt(t);
    }

    private static String key(String s) {
        return s == null ? "" : s.strip().toLowerCase(Locale.ROOT).replaceAll("[ʻʼ'`‘’]", "");
    }

    private static boolean yes(String s) {
        String k = key(s);
        return k.equals("ha") || k.equals("1") || k.equals("true") || k.equals("+") || k.equals("да");
    }

    /** Sarlavha bo'yicha ustunlar; sana kataklari {@link LocalDate}, qolganlari matn. Oxiridagi bo'sh qatorlar tashlanadi. */
    private static List<Map<String, Object>> read(InputStream in) {
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
                TEMPLATE.stream().filter(t -> key(t).equals(key(title))).findFirst().ifPresent(t -> columns.put(c.getColumnIndex(), t));
            }
            if (!columns.containsValue("Mahsulot kodi") || !columns.containsValue("Soni") || !columns.containsValue("Yaroqlilik")) {
                throw MedixException.badRequest("opening.importBadHeader");
            }
            List<Map<String, Object>> rows = new ArrayList<>();
            for (int i = header.getRowNum() + 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                Map<String, Object> values = new HashMap<>();
                if (row != null) {
                    for (Map.Entry<Integer, String> col : columns.entrySet()) {
                        Cell c = row.getCell(col.getKey());
                        if (c == null) {
                            continue;
                        }
                        Object v = cellValue(c, fmt);
                        if (v != null && !v.toString().isBlank()) {
                            values.put(col.getValue(), v);
                        }
                    }
                }
                rows.add(values);
            }
            while (!rows.isEmpty() && rows.getLast().isEmpty()) {
                rows.removeLast();
            }
            return rows;
        } catch (IOException | RuntimeException e) {
            if (e instanceof MedixException me) {
                throw me;
            }
            throw MedixException.badRequest("import.unreadable");
        }
    }

    private static Object cellValue(Cell c, DataFormatter fmt) {
        CellType type = c.getCellType() == CellType.FORMULA ? c.getCachedFormulaResultType() : c.getCellType();
        if (type == CellType.NUMERIC) {
            if (DateUtil.isCellDateFormatted(c)) {
                return c.getLocalDateTimeCellValue().toLocalDate();
            }
            return BigDecimal.valueOf(c.getNumericCellValue()).stripTrailingZeros().toPlainString();
        }
        return fmt.formatCellValue(c).strip();
    }
}
