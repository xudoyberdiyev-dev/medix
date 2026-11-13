package uz.medix.sales.order;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
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
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import uz.medix.shared.error.MedixException;

/**
 * Markirovka kodlari fayli (egasi 13.11, O5): .xlsx yoki .csv/.txt. Kod ustuni sarlavha bo'yicha topiladi («Markirovka kodi»,
 * «KM», «DataMatrix», «Код маркировки», «Code» …); sarlavha bo'lmasa — kodga o'xshagan birinchi ustun. GTIN/mahsulot
 * ustunlari bo'lsa ham e'tiborsiz — GTIN koddan (01) olinadi. Ajratgich (GS) faylda «&lt;GS&gt;», «{GS}», «\x1d» ko'rinishida
 * bo'lishi mumkin — haqiqiy belgiga almashtiriladi.
 */
final class MarkingImport {

    static final int MAX_CODES = 5000;

    /** Fayldagi bitta kod: Excel/CSV qator raqami (1 dan) va matni. */
    record FileCode(int row, String code) {}

    private static final List<String> HEADERS = List.of("markirovka", "kod", "km", "datamatrix", "data matrix", "code", "код",
            "маркировк", "cis", "sgtin", "км");

    private static final Pattern LOOKS_LIKE_CODE = Pattern.compile("^(\\]d2|\\]C1)?(\\(01\\)|01)\\d{14}.+");

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
        }
        List<FileCode> out = new ArrayList<>();
        for (int i = start; i < rows.size(); i++) {
            List<String> r = rows.get(i);
            String v = col < r.size() ? normalize(r.get(col)) : "";
            if (!v.isEmpty()) {
                out.add(new FileCode(i + 1, v));
            }
        }
        if (out.size() > MAX_CODES) {
            throw MedixException.badRequest("marking.import.tooMany", MAX_CODES);
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
                        cells.add(c == null ? "" : fmt.formatCellValue(c));
                    }
                }
                rows.add(cells);
            }
            return rows;
        } catch (IOException | RuntimeException e) {
            throw MedixException.badRequest("marking.import.unreadable");
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
            throw MedixException.badRequest("marking.import.unreadable");
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

    /** Namuna fayl: bitta ustun «Markirovka kodi» va ikkinchi (ixtiyoriy) «GTIN». */
    static void template(OutputStream out) throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet s = wb.createSheet("Kodlar");
            Row h = s.createRow(0);
            h.createCell(0).setCellValue("Markirovka kodi");
            h.createCell(1).setCellValue("GTIN (ixtiyoriy)");
            Row r = s.createRow(1);
            r.createCell(0).setCellValue("(01)04780069000123(21)ABC123XYZ(17)280531(10)ZN2410(91)D");
            r.createCell(1).setCellValue("04780069000123");
            s.setColumnWidth(0, 70 * 256);
            s.setColumnWidth(1, 20 * 256);
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            wb.write(buf);
            out.write(buf.toByteArray());
        }
    }
}
