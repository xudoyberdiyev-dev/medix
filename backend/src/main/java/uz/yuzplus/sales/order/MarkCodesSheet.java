package uz.yuzplus.sales.order;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;

/**
 * Markirovka kodlari .xlsx — egasi formati (O16, `docs/notes/markirovka-namuna-egasi.xlsx`): ustunlar «Markirovka kodi» | «GTIN»;
 * har mahsulot oldidan qalin sarlavha qatori (dori nomi), ostida avval shu mahsulotning quti (agregatsiya, SSCC) kodlari, keyin
 * dona kodlari. Chiqarish va yuklash bir xil format (Saplayn, 1C, kodlar jurnali, zaxira kodlar, namuna).
 */
final class MarkCodesSheet {

    /** Bitta kod: mahsulot nomi, GTIN ustuni (EAN-13 ko'rinishida, bo'lsa), to'liq kod, quti kodimi. */
    record Entry(String product, String gtin, String code, boolean aggregate) {}

    private MarkCodesSheet() {}

    /** GTIN-14 → Excel ustuni uchun EAN-13 (boshidagi «0» olib tashlanadi), boshqasi o'zgarishsiz. */
    static String gtinColumn(String gtin14) {
        if (gtin14 == null) {
            return "";
        }
        String g = gtin14.strip();
        return g.length() == 14 && g.startsWith("0") ? g.substring(1) : g;
    }

    /** Mahsulot bo'yicha guruhlash (birinchi uchragan tartibda), ichida — quti kodlari, keyin donalar. */
    static List<Object> grouped(List<Entry> entries) {
        Map<String, List<Entry>> byProduct = new LinkedHashMap<>();
        for (Entry e : entries) {
            byProduct.computeIfAbsent(e.product() == null ? "" : e.product(), k -> new ArrayList<>()).add(e);
        }
        List<Object> out = new ArrayList<>();
        for (Map.Entry<String, List<Entry>> g : byProduct.entrySet()) {
            out.add(g.getKey());
            g.getValue().stream().filter(Entry::aggregate).forEach(out::add);
            g.getValue().stream().filter(e -> !e.aggregate()).forEach(out::add);
        }
        return out;
    }

    static void write(OutputStream out, String sheetName, List<Entry> entries) throws IOException {
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet(sheetName);
            CellStyle bold = wb.createCellStyle();
            Font f = wb.createFont();
            f.setBold(true);
            bold.setFont(f);
            Row h = sheet.createRow(0);
            h.createCell(0).setCellValue("Markirovka kodi");
            h.createCell(1).setCellValue("GTIN");
            h.getCell(0).setCellStyle(bold);
            h.getCell(1).setCellStyle(bold);
            int r = 1;
            for (Object o : grouped(entries)) {
                Row row = sheet.createRow(r++);
                if (o instanceof String product) {
                    row.createCell(0).setCellValue(product);
                    row.getCell(0).setCellStyle(bold);
                } else if (o instanceof Entry e) {
                    row.createCell(0).setCellValue(e.code());
                    row.createCell(1).setCellValue(gtinColumn(e.gtin()));
                }
            }
            sheet.setColumnWidth(0, 70 * 256);
            sheet.setColumnWidth(1, 20 * 256);
            wb.write(out);
        }
    }
}
