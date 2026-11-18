package uz.medix.pricing.reference;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import uz.medix.pricing.reference.ReferenceModels.RefFile;
import uz.medix.pricing.reference.ReferenceModels.RefSheet;
import uz.medix.shared.error.MedixException;

/** Referent narxlar fayli (.xlsx/.xls/.csv) → varaqlar va katakchalar (matn). Katalog import ustasidagi o'qish bilan bir xil. */
public final class ReferenceSheetReader {

    private static final int MAX_ROWS = ReferenceModels.MAX_ROWS;
    private static final int MAX_COLS = 100;
    private static final int MAX_SHEETS = 20;

    private ReferenceSheetReader() {}

    private static String cellText(Cell c, DataFormatter fmt) {
        if (c.getCellType() == CellType.NUMERIC) {
            return BigDecimal.valueOf(c.getNumericCellValue()).stripTrailingZeros().toPlainString();
        }
        if (c.getCellType() == CellType.FORMULA && c.getCachedFormulaResultType() == CellType.NUMERIC) {
            return BigDecimal.valueOf(c.getNumericCellValue()).stripTrailingZeros().toPlainString();
        }
        return fmt.formatCellValue(c).strip();
    }

    public static RefFile read(String fileName, long size, InputStream in) {
        String name = fileName == null ? "fayl" : fileName;
        if (name.toLowerCase(Locale.ROOT).endsWith(".csv")) {
            return new RefFile(name, size, List.of(new RefSheet(name.replaceAll("(?i)\\.csv$", ""), readCsv(in))));
        }
        try (Workbook wb = WorkbookFactory.create(in)) {
            DataFormatter fmt = new DataFormatter(Locale.ROOT);
            List<RefSheet> sheets = new ArrayList<>();
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
                            cells.add(c == null ? "" : cellText(c, fmt));
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
                sheets.add(new RefSheet(sheet.getSheetName(), rows));
            }
            if (sheets.stream().allMatch(sh -> sh.rows().isEmpty())) {
                throw MedixException.badRequest("import.empty");
            }
            return new RefFile(name, size, sheets);
        } catch (IOException | RuntimeException e) {
            if (e instanceof MedixException me) {
                throw me;
            }
            throw MedixException.badRequest("import.unreadableAny");
        }
    }

    /** CSV: UTF-8 (BOM bilan ham), ajratkich — «;», «,» yoki tab (birinchi qatordan aniqlanadi), qo'shtirnoqlar. */
    private static List<List<String>> readCsv(InputStream in) {
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
}
