package uz.yuzplus.integration.opening;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import uz.yuzplus.integration.opening.OpeningImportModels.Section;
import uz.yuzplus.shared.error.YuzplusException;

/**
 * SmartUp / 100+ shablonidagi ko'p varaqli Excel'ni o'qish (BQ1). Varaq turi sarlavhalar (uz-Latn, uz-Cyrl, ru sinonimlari) va
 * varaq nomi bo'yicha aniqlanadi; sarlavha birinchi 20 qator ichida qidiriladi (eksport tepasida sarlavha matni bo'lishi mumkin).
 * Bazaga bog'liq emas — birlik testlari bilan tekshiriladi.
 */
final class OpeningImportSheets {

    private OpeningImportSheets() {}

    /** Ustun maydonlari. */
    enum Field {
        BRANCH, WAREHOUSE, PRODUCT_CODE, BARCODE, PRODUCT_NAME, ZONE, BATCH, PRODUCED, EXPIRY, COST, QTY, BONUS,
        PARTY_TIN, PARTY_NAME, AMOUNT, DUE, DOC_REF, ACCOUNT
    }

    /** Sarlavha sinonimlari — {@link #key(String)} ko'rinishida (kichik harf, tutuq belgilarsiz, bo'shliq bilan). */
    static final Map<Field, List<String>> SYNONYMS = new EnumMap<>(Field.class);

    static {
        SYNONYMS.put(Field.BRANCH, List.of("filial", "filial nomi", "filial kodi", "филиал", "наименование филиала"));
        SYNONYMS.put(Field.WAREHOUSE, List.of("ombor", "ombor nomi", "омбор", "омбор номи", "склад", "наименование склада", "склад хранения"));
        SYNONYMS.put(Field.PRODUCT_CODE, List.of("mahsulot kodi", "маҳсулот коди", "kod", "код", "код товара", "код продукта", "артикул",
                "код номенклатуры"));
        SYNONYMS.put(Field.BARCODE, List.of("shtrix kod", "shtrixkod", "штрих код", "штрихкод", "barcode", "ean"));
        SYNONYMS.put(Field.PRODUCT_NAME, List.of("mahsulot nomi", "mahsulot", "маҳсулот номи", "маҳсулот", "nomi", "номи", "наименование",
                "наименование товара", "товар", "продукт", "номенклатура", "наименование продукта"));
        SYNONYMS.put(Field.ZONE, List.of("zona", "зона", "зона хранения", "ячейка"));
        SYNONYMS.put(Field.BATCH, List.of("partiya", "партия", "seriya", "серия", "номер серии", "серия партии", "номер партии", "партия серия"));
        SYNONYMS.put(Field.PRODUCED, List.of("ishlab chiqarilgan", "ishlab chiqarilgan sana", "ишлаб чиқарилган", "дата производства",
                "дата изготовления", "дата выпуска"));
        SYNONYMS.put(Field.EXPIRY, List.of("yaroqlilik", "yaroqlilik muddati", "яроқлилик", "яроқлилик муддати", "срок годности", "годен до",
                "дата истечения срока годности", "срок годности до"));
        SYNONYMS.put(Field.COST, List.of("tannarx", "tannarxi", "таннарх", "себестоимость", "цена закупки", "закупочная цена", "цена прихода",
                "цена поступления", "себестоимость единицы"));
        SYNONYMS.put(Field.QTY, List.of("soni", "сони", "miqdor", "миқдор", "количество", "кол во", "остаток", "остаток количество",
                "количество остаток"));
        SYNONYMS.put(Field.BONUS, List.of("bonus", "бонус"));
        SYNONYMS.put(Field.PARTY_TIN, List.of("stir", "стир", "инн", "inn", "stir jshshir", "инн пинфл", "пинфл", "jshshir"));
        SYNONYMS.put(Field.PARTY_NAME, List.of("mijoz", "mijoz nomi", "мижоз", "мижоз номи", "yetkazib beruvchi", "етказиб берувчи", "kontragent",
                "контрагент", "наименование контрагента", "клиент", "покупатель", "поставщик", "yb"));
        SYNONYMS.put(Field.AMOUNT, List.of("summa", "сумма", "qarz", "қарз", "qarz summasi", "долг", "сумма долга", "сальдо", "конечное сальдо",
                "сальдо на конец", "qoldiq summasi", "остаток сумма", "сумма остатка", "balans", "баланс"));
        SYNONYMS.put(Field.DUE, List.of("tolov muddati", "тўлов муддати", "muddat", "срок оплаты", "дата оплаты", "срок погашения"));
        SYNONYMS.put(Field.DOC_REF, List.of("asos", "asos №", "асос", "hujjat", "hujjat raqami", "ҳужжат", "основание", "документ",
                "номер документа", "документ основание"));
        SYNONYMS.put(Field.ACCOUNT, List.of("hisob", "hisob nomi", "ҳисоб", "kassa", "kassa bank", "kassa va bank", "касса", "касса банк",
                "счет", "расчетный счет", "банк", "bank"));
    }

    /** Bitta ma'lumot qatori: Excel qator raqami (1 dan) va maydon qiymatlari ({@link LocalDate}, {@link BigDecimal} yoki matn). */
    record SheetRow(int rowNo, Map<Field, Object> values) {

        String text(Field f) {
            Object v = values.get(f);
            return v == null ? "" : v instanceof BigDecimal d ? d.stripTrailingZeros().toPlainString() : v.toString().strip();
        }

        Object raw(Field f) {
            return values.get(f);
        }
    }

    record ParsedSheet(String name, Section section, List<SheetRow> rows) {}

    /** Varaq o'tkazib yuborildi (turi aniqlanmadi): sabab — i18n kalit. */
    record SkippedSheet(String name, String reason) {}

    record Parsed(List<ParsedSheet> sheets, List<SkippedSheet> skipped) {}

    static Parsed read(InputStream in) {
        try (Workbook wb = WorkbookFactory.create(in)) {
            List<ParsedSheet> sheets = new ArrayList<>();
            List<SkippedSheet> skipped = new ArrayList<>();
            DataFormatter fmt = new DataFormatter(Locale.ROOT);
            for (int s = 0; s < wb.getNumberOfSheets(); s++) {
                if (wb.isSheetHidden(s) || wb.isSheetVeryHidden(s)) {
                    continue;
                }
                Sheet sheet = wb.getSheetAt(s);
                Optional<Header> header = findHeader(sheet, fmt);
                if (header.isEmpty()) {
                    if (sheet.getPhysicalNumberOfRows() > 0) {
                        skipped.add(new SkippedSheet(sheet.getSheetName(), "openingImport.sheetUnknown"));
                    }
                    continue;
                }
                Header h = header.get();
                Optional<Section> section = section(sheet.getSheetName(), h);
                if (section.isEmpty()) {
                    skipped.add(new SkippedSheet(sheet.getSheetName(), "openingImport.sheetAmbiguous"));
                    continue;
                }
                sheets.add(new ParsedSheet(sheet.getSheetName(), section.get(), rows(sheet, h, fmt)));
            }
            return new Parsed(sheets, skipped);
        } catch (IOException | RuntimeException e) {
            if (e instanceof YuzplusException me) {
                throw me;
            }
            throw YuzplusException.badRequest("import.unreadable");
        }
    }

    /** Sarlavha: qator raqami (0 dan), ustun → maydon, va asl sarlavha matnlari (mijoz/YB ni ajratish uchun). */
    record Header(int rowIndex, Map<Integer, Field> columns, List<String> titles) {

        boolean has(Field f) {
            return columns.containsValue(f);
        }
    }

    static Optional<Header> findHeader(Sheet sheet, DataFormatter fmt) {
        int first = Math.max(sheet.getFirstRowNum(), 0);
        for (int i = first; i <= Math.min(sheet.getLastRowNum(), first + 20); i++) {
            Row row = sheet.getRow(i);
            if (row == null) {
                continue;
            }
            Map<Integer, Field> columns = new LinkedHashMap<>();
            List<String> titles = new ArrayList<>();
            for (Cell c : row) {
                String title = fmt.formatCellValue(c).strip();
                if (title.isEmpty()) {
                    continue;
                }
                titles.add(key(title));
                field(title).filter(f -> !columns.containsValue(f)).ifPresent(f -> columns.put(c.getColumnIndex(), f));
            }
            Header h = new Header(i, columns, titles);
            if (goods(h) || debt(h) || money(h)) {
                return Optional.of(h);
            }
        }
        return Optional.empty();
    }

    /** Sarlavha matni → maydon (aniq sinonim; bo'lmasa — «… (сум)», «Количество, шт» kabi qo'shimchalarsiz). */
    static Optional<Field> field(String title) {
        String k = key(title);
        for (int pass = 0; pass < 2; pass++) {
            for (Map.Entry<Field, List<String>> e : SYNONYMS.entrySet()) {
                if (e.getValue().contains(k)) {
                    return Optional.of(e.getKey());
                }
            }
            // «Количество шт», «Сумма сум», «Себестоимость uzs» — oxirgi so'z birlik bo'lsa tashlanadi
            String trimmed = k.replaceAll(" (шт|дона|dona|сум|сўм|som|uzs|сумм)$", "");
            if (trimmed.equals(k)) {
                break;
            }
            k = trimmed;
        }
        return Optional.empty();
    }

    private static boolean goods(Header h) {
        return (h.has(Field.PRODUCT_CODE) || h.has(Field.BARCODE) || h.has(Field.PRODUCT_NAME)) && h.has(Field.QTY) && h.has(Field.EXPIRY);
    }

    /** Qarz: kontragent STIR yoki nomi (eksportda nomi ko'pincha «Наименование») + summa. */
    private static boolean debt(Header h) {
        return (h.has(Field.PARTY_TIN) || h.has(Field.PARTY_NAME) || h.has(Field.PRODUCT_NAME)) && h.has(Field.AMOUNT);
    }

    private static boolean money(Header h) {
        return h.has(Field.ACCOUNT) && h.has(Field.AMOUNT) && !h.has(Field.PARTY_TIN) && !h.has(Field.PARTY_NAME);
    }

    private static final List<String> MONEY_HINTS = List.of("kassa", "касса", "bank", "банк", "pul", "пул", "денеж");

    private static final List<String> CUSTOMER_HINTS = List.of("mijoz", "мижоз", "клиент", "покупат", "дебитор", "debitor");
    private static final List<String> SUPPLIER_HINTS = List.of("yetkazib", "етказиб", "yb", "поставщ", "кредитор", "kreditor");

    /** Varaq turi: tovar va pul — sarlavhadan; qarz — varaq nomi, bo'lmasa kontragent ustuni sarlavhasidan (mijoz / YB). */
    static Optional<Section> section(String sheetName, Header h) {
        if (goods(h)) {
            return Optional.of(Section.GOODS);
        }
        if (money(h)) {
            return Optional.of(Section.MONEY);
        }
        String name = key(sheetName);
        if (MONEY_HINTS.stream().anyMatch(name::contains) && !h.has(Field.PARTY_TIN) && (h.has(Field.ACCOUNT) || h.has(Field.PRODUCT_NAME))) {
            return Optional.of(Section.MONEY);
        }
        boolean customer = CUSTOMER_HINTS.stream().anyMatch(name::contains);
        boolean supplier = SUPPLIER_HINTS.stream().anyMatch(name::contains);
        if (customer == supplier) {
            customer = h.titles().stream().anyMatch(t -> CUSTOMER_HINTS.stream().anyMatch(t::contains));
            supplier = h.titles().stream().anyMatch(t -> SUPPLIER_HINTS.stream().anyMatch(t::contains));
        }
        if (customer == supplier) {
            return Optional.empty();
        }
        return Optional.of(customer ? Section.CUSTOMER_DEBT : Section.SUPPLIER_DEBT);
    }

    private static List<SheetRow> rows(Sheet sheet, Header h, DataFormatter fmt) {
        List<SheetRow> rows = new ArrayList<>();
        for (int i = h.rowIndex() + 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            Map<Field, Object> values = new EnumMap<>(Field.class);
            if (row != null) {
                for (Map.Entry<Integer, Field> col : h.columns().entrySet()) {
                    Cell c = row.getCell(col.getKey());
                    Object v = c == null ? null : cellValue(c, fmt);
                    if (v != null && !v.toString().isBlank()) {
                        values.put(col.getValue(), v);
                    }
                }
            }
            if (!values.isEmpty() && !isTotalRow(values)) {
                rows.add(new SheetRow(i + 1, values));
            }
        }
        return rows;
    }

    /** «Итого» / «Jami» qatori (eksport oxirida) — ma'lumot emas. */
    private static boolean isTotalRow(Map<Field, Object> values) {
        return values.values().stream()
                .filter(v -> v instanceof String)
                .map(v -> key((String) v))
                .anyMatch(k -> k.equals("итого") || k.equals("jami") || k.equals("жами") || k.equals("всего") || k.equals("итого по складу"));
    }

    private static Object cellValue(Cell c, DataFormatter fmt) {
        CellType type = c.getCellType() == CellType.FORMULA ? c.getCachedFormulaResultType() : c.getCellType();
        if (type == CellType.NUMERIC) {
            if (DateUtil.isCellDateFormatted(c)) {
                return c.getLocalDateTimeCellValue().toLocalDate();
            }
            return BigDecimal.valueOf(c.getNumericCellValue());
        }
        if (type == CellType.BOOLEAN) {
            return c.getBooleanCellValue() ? "ha" : "yoʻq";
        }
        if (type == CellType.ERROR) {
            return null;
        }
        return fmt.formatCellValue(c).strip();
    }

    // ===== Qiymatlar =====

    private static final Pattern DMY = Pattern.compile("^(\\d{1,2})[./-](\\d{1,2})[./-](\\d{2}|\\d{4})(?:[ T]\\d{1,2}:\\d{2}(?::\\d{2})?)?$");
    private static final Pattern MY = Pattern.compile("^(\\d{1,2})[./-](\\d{4})$");
    private static final Pattern ISO = Pattern.compile("^(\\d{4})-(\\d{2})-(\\d{2})(?:[ T].*)?$");

    /** Noto'g'ri qiymat: i18n kalit + o'rinbosarlar. */
    static final class ValueError extends RuntimeException {
        final String key;
        final transient Object[] args;

        ValueError(String key, Object... args) {
            super(key, null, false, false);
            this.key = key;
            this.args = args;
        }
    }

    /**
     * Sana: Excel sanasi, «30.09.2028», «30.09.28», «30/09/2028 0:00:00», «2028-09-30», «09.2028» (oyning oxirgi kuni), Excel seriya
     * raqami (45000). Bo'sh — {@code null}.
     */
    static LocalDate date(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof LocalDate d) {
            return d;
        }
        if (v instanceof BigDecimal n) {
            return serial(n, n.toPlainString());
        }
        String s = v.toString().strip();
        if (s.isEmpty()) {
            return null;
        }
        try {
            Matcher m = DMY.matcher(s);
            if (m.matches()) {
                int y = Integer.parseInt(m.group(3));
                return LocalDate.of(y < 100 ? 2000 + y : y, Integer.parseInt(m.group(2)), Integer.parseInt(m.group(1)));
            }
            Matcher my = MY.matcher(s);
            if (my.matches()) {
                LocalDate first = LocalDate.of(Integer.parseInt(my.group(2)), Integer.parseInt(my.group(1)), 1);
                return first.withDayOfMonth(first.lengthOfMonth());
            }
            Matcher iso = ISO.matcher(s);
            if (iso.matches()) {
                return LocalDate.parse(iso.group(1) + "-" + iso.group(2) + "-" + iso.group(3), DateTimeFormatter.ISO_LOCAL_DATE);
            }
            if (s.matches("^\\d{5}(\\.0+)?$")) {
                return serial(new BigDecimal(s), s);
            }
        } catch (java.time.DateTimeException e) {
            throw new ValueError("openingImport.badDate", s);
        }
        throw new ValueError("openingImport.badDate", s);
    }

    private static LocalDate serial(BigDecimal n, String shown) {
        double d = n.doubleValue();
        if (d < 20_000 || d > 80_000) {
            throw new ValueError("openingImport.badDate", shown);
        }
        return DateUtil.getLocalDateTime(d).toLocalDate();
    }

    /**
     * Pul: «12 500,50», «12.500,50», «12,500.50», «12500.5», «-1 500», «(1 500,00)», Excel soni → {@code 12500.50} (HALF_UP, 2 xona).
     * Bo'sh — {@code null}.
     */
    static BigDecimal amount(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof BigDecimal d) {
            return d.setScale(2, RoundingMode.HALF_UP);
        }
        String s = v.toString().strip();
        if (s.isEmpty()) {
            return null;
        }
        BigDecimal n = number(s);
        if (n == null) {
            throw new ValueError("openingImport.badAmount", s);
        }
        return n.setScale(2, RoundingMode.HALF_UP);
    }

    /** Butun musbat son: «1 200», «120», Excel 120.0. Bo'sh — {@code null}. */
    static Integer qty(Object v) {
        if (v == null) {
            return null;
        }
        BigDecimal n = v instanceof BigDecimal d ? d : number(v.toString().strip());
        String shown = v instanceof BigDecimal d ? d.stripTrailingZeros().toPlainString() : v.toString().strip();
        if (n == null || n.signum() <= 0 || n.stripTrailingZeros().scale() > 0 || n.compareTo(BigDecimal.valueOf(10_000_000)) > 0) {
            throw new ValueError("openingImport.badQty", shown);
        }
        return n.intValueExact();
    }

    private static BigDecimal number(String raw) {
        String t = raw.replace(" ", "").replace(" ", "").replace(" ", "").replace("'", "")
                .replaceAll("(?i)(soʻm|so'm|сум|сўм|uzs)$", "");
        boolean negative = false;
        if (t.startsWith("(") && t.endsWith(")")) {
            negative = true;
            t = t.substring(1, t.length() - 1);
        }
        if (t.startsWith("-") || t.startsWith("−")) {
            negative = !negative;
            t = t.substring(1);
        }
        if (t.isEmpty()) {
            return null;
        }
        int comma = t.lastIndexOf(',');
        int dot = t.lastIndexOf('.');
        if (comma >= 0 && dot >= 0) {
            // Oxirgi ajratkich — kasr
            t = comma > dot ? t.replace(".", "").replace(",", ".") : t.replace(",", "");
        } else if (comma >= 0 || dot >= 0) {
            char sep = comma >= 0 ? ',' : '.';
            String q = Pattern.quote(String.valueOf(sep));
            if (t.matches("^\\d{1,3}(" + q + "\\d{3})+$")) {
                t = t.replace(String.valueOf(sep), "");
            } else {
                t = t.replace(',', '.');
            }
        }
        if (!t.matches("^\\d{1,16}(\\.\\d+)?$")) {
            return null;
        }
        BigDecimal n = new BigDecimal(t);
        return negative ? n.negate() : n;
    }

    static boolean yes(String s) {
        String k = key(s);
        return k.equals("ha") || k.equals("ҳа") || k.equals("1") || k.equals("true") || k.equals("+") || k.equals("да") || k.equals("bonus")
                || k.equals("бонус");
    }

    /** STIR / JShShIR: faqat raqamlar (9 yoki 14), bo'lmasa — bo'sh. Excel sonlari ham. */
    static String tin(SheetRow r) {
        String t = r.text(Field.PARTY_TIN).replaceAll("[\\s ]", "");
        return t.matches("^(\\d{9}|\\d{14})$") ? t : "";
    }

    /** Taqqoslash kaliti: kichik harf, tutuq belgilarsiz, ё → е, belgilar o'rniga bo'shliq. */
    static String key(String s) {
        if (s == null) {
            return "";
        }
        return s.strip()
                .toLowerCase(Locale.ROOT)
                .replace('ё', 'е')
                .replaceAll("[ʻʼ'`‘’]", "")
                .replaceAll("[^\\p{L}\\p{N}№]+", " ")
                .strip();
    }
}
