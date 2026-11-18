package uz.yuzplus.sales.order;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import uz.yuzplus.shared.error.YuzplusException;

/**
 * Markirovka kodlari fayli (egasi 13.11, O5): .xlsx yoki .csv/.txt. Kod ustuni sarlavha bo'yicha topiladi («Markirovka kodi»,
 * «KM», «DataMatrix», «Код маркировки», «Code» …); sarlavha bo'lmasa — kodga o'xshagan birinchi ustun. Ajratgich (GS) faylda
 * «&lt;GS&gt;», «{GS}», «\x1d» ko'rinishida bo'lishi mumkin — haqiqiy belgiga almashtiriladi.
 *
 * <p>O16 (egasi namunasi): ustunlar «Markirovka kodi» | «GTIN»; har mahsulot oldidan sarlavha qatori — dori nomi (tashlab
 * yuboriladi: kod ustunida 14+ raqamli ketma-ketlik yo'q); ostida quti (SSCC) va dona kodlari. GTIN ustuni quti kodi qaysi
 * mahsulotniki ekanini bildiradi (EAN-13 — GTIN-14 ga «0» bilan); dona kodida GTIN koddan olinadi.
 */
final class MarkingImport {

    static final int MAX_CODES = 5000;

    /** Fayldagi bitta kod: Excel/CSV qator raqami (1 dan) va matni. */
    record FileCode(int row, String code, String gtin) {

        FileCode(int row, String code) {
            this(row, code, null);
        }
    }

    private static final Pattern HAS_CODE_DIGITS = Pattern.compile(".*\\d{14,}.*");

    private static final Pattern GTIN_VALUE = Pattern.compile("\\d{8}|\\d{12,14}");

    private static final List<String> HEADERS = List.of("markirovka", "kod", "km", "datamatrix", "data matrix", "code", "код",
            "маркировк", "cis", "sgtin", "км");

    private static final Pattern LOOKS_LIKE_CODE = Pattern.compile("^(\\]d2|\\]C1)?((\\(01\\)|01)\\d{14}.+|(\\(00\\)|00)\\d{18}|\\d{15,19})$");

    private static final Pattern GS_TEXT = Pattern.compile("<GS>|\\{GS}|\\[GS]|\\\\x1[dD]|\\\\u001[dD]|&#29;|␝", Pattern.CASE_INSENSITIVE);

    private MarkingImport() {}

    static List<FileCode> read(String fileName, InputStream in) {
        String name = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        List<List<String>> rows = name.endsWith(".csv") || name.endsWith(".txt") ? readText(in) : readExcel(in);
        return codes(rows);
    }

    /** Ajratgich matnini GS belgisiga almashtiradi, chetdagi bo'shliq va qo'shtirnoqlarni olib tashlaydi. */
    static String normalize(String raw) {
        String s = raw == null ? "" : raw.strip();
        if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) {
            s = s.substring(1, s.length() - 1).replace("\"\"", "\"");
        }
        return GS_TEXT.matcher(s).replaceAll("\u001D");
    }

    static List<FileCode> codes(List<List<String>> rows) {
        int first = 0;
        while (first < rows.size() && rows.get(first).stream().allMatch(String::isBlank)) {
            first++;
        }
        if (first == rows.size()) {
            return List.of();
        }
        List<String> head = rows.get(first);
        int col = -1;
        int gtinCol = -1;
        int start = first;
        for (int j = 0; j < head.size() && col < 0; j++) {
            if (looksLikeCode(head.get(j))) {
                col = j; // sarlavhasiz fayl
            }
        }
        if (col < 0) {
            start = first + 1;
            for (int j = 0; j < head.size() && col < 0; j++) {
                String h = head.get(j).toLowerCase(Locale.ROOT).strip();
                if (HEADERS.stream().anyMatch(h::contains) && !h.contains("gtin")) {
                    col = j;
                }
            }
            if (col < 0) {
                col = 0;
            }
            for (int j = 0; j < head.size() && gtinCol < 0; j++) {
                String h = head.get(j).toLowerCase(Locale.ROOT).strip();
                if (j != col && (h.contains("gtin") || h.contains("shtrix") || h.contains("штрих") || h.contains("ean"))) {
                    gtinCol = j;
                }
            }
        } else if (col + 1 < head.size() && GTIN_VALUE.matcher(head.get(col + 1).strip()).matches()) {
            gtinCol = col + 1;
        }
        List<FileCode> out = new ArrayList<>();
        for (int i = start; i < rows.size(); i++) {
            List<String> r = rows.get(i);
            String v = col < r.size() ? normalize(r.get(col)) : "";
            // O16: mahsulot sarlavha qatori (dori nomi) — kod emas, tashlab yuboriladi
            if (!v.isEmpty() && HAS_CODE_DIGITS.matcher(v).matches()) {
                String g = gtinCol >= 0 && gtinCol < r.size() ? r.get(gtinCol).strip() : "";
                out.add(new FileCode(i + 1, v, GTIN_VALUE.matcher(g).matches() ? g : null));
            }
        }
        if (out.size() > MAX_CODES) {
            throw YuzplusException.badRequest("marking.import.tooMany", MAX_CODES);
        }
        return out;
    }

    private static boolean looksLikeCode(String v) {
        return LOOKS_LIKE_CODE.matcher(normalize(v)).matches();
    }

    private static List<List<String>> readExcel(InputStream in) {
        try (Workbook wb = WorkbookFactory.create(in)) {
            DataFormatter fmt = new DataFormatter(Locale.ROOT);
            Sheet sheet = wb.getSheetAt(0);
            List<List<String>> rows = new ArrayList<>();
            int last = Math.min(sheet.getLastRowNum(), MAX_CODES + 10);
            for (int i = 0; i <= last; i++) {
                Row row = sheet.getRow(i);
                List<String> cells = new ArrayList<>();
                if (row != null) {
                    for (int j = 0; j < Math.min(row.getLastCellNum(), 30); j++) {
                        Cell c = row.getCell(j);
                        // Raqam bo'lib qolgan SSCC/GTIN: ilmiy ko'rinishsiz (oldingi nollar parse'da tiklanadi)
                        cells.add(c == null ? "" : c.getCellType() == org.apache.poi.ss.usermodel.CellType.NUMERIC
                                ? java.math.BigDecimal.valueOf(c.getNumericCellValue()).toPlainString().replaceAll("\\.0+$", "")
                                : fmt.formatCellValue(c));
                    }
                }
                rows.add(cells);
            }
            return rows;
        } catch (IOException | RuntimeException e) {
            throw YuzplusException.badRequest("marking.import.unreadable");
        }
    }

    private static List<List<String>> readText(InputStream in) {
        List<String> lines = new ArrayList<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String l;
            while ((l = r.readLine()) != null && lines.size() <= MAX_CODES + 10) {
                lines.add(lines.isEmpty() && l.startsWith("﻿") ? l.substring(1) : l);
            }
        } catch (IOException e) {
            throw YuzplusException.badRequest("marking.import.unreadable");
        }
        String head = lines.stream().filter(x -> !x.isBlank()).findFirst().orElse("");
        // Kod ichida «,» yoki «;» bo'lishi mumkin: ajratgich faqat sarlavhali ko'p ustunli faylda ishlatiladi
        String sep = head.contains("\t") ? "\t" : looksLikeCode(head) ? null : head.contains(";") ? ";" : head.contains(",") ? "," : null;
        List<List<String>> rows = new ArrayList<>();
        for (String l : lines) {
            rows.add(sep == null ? List.of(l) : List.of(l.split(Pattern.quote(sep), -1)));
        }
        return rows;
    }

    /** Namuna fayl (O16, egasi formati): «Markirovka kodi» | «GTIN»; mahsulot sarlavhasi, ostida quti (SSCC) va dona kodlari. */
    static void template(OutputStream out) throws IOException {
        MarkCodesSheet.write(out, "Kodlar", List.of(
                new MarkCodesSheet.Entry("Namuna dori 500 mg №10", "4780011675089", "00047800116744728760", true),
                new MarkCodesSheet.Entry("Namuna dori 500 mg №10", "4780011675089", "00047800116744727275", true),
                new MarkCodesSheet.Entry("Namuna dori 500 mg №10", "4780011675089", "0104780011675089217HTFlJLN7jbo3", false)));
    }
}
