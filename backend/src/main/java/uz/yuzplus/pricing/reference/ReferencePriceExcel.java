package uz.yuzplus.pricing.reference;

import java.io.IOException;
import java.io.OutputStream;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;
import uz.yuzplus.pricing.reference.ReferenceModels.CompareDetail;
import uz.yuzplus.pricing.reference.ReferenceModels.CompareLine;
import uz.yuzplus.pricing.reference.ReferenceModels.LineStatus;
import uz.yuzplus.shared.money.Money;

/** Solishtirish natijasi .xlsx: har yorliq alohida varaq (yoki tanlangan bitta yorliq). */
@Component
class ReferencePriceExcel {

    private static final String[] TITLES = {"Qator", "Fayldagi nomi", "Ishlab chiqaruvchi (fayl)", "Mahsulot kodi", "Mahsulot (bizda)",
        "Ishlab chiqaruvchi", "Bizning narx", "Referent narx", "Farq", "Farq, %", "Manba", "Holat"};

    private static final Map<LineStatus, String> LABEL = Map.of(LineStatus.DEARER, "Qimmat", LineStatus.CHEAPER, "Arzon",
            LineStatus.MATCH, "Mos", LineStatus.NOT_FOUND, "Topilmadi", LineStatus.NO_PRICE, "Narx yoʻq");

    private static final List<LineStatus> TABS = List.of(LineStatus.DEARER, LineStatus.CHEAPER, LineStatus.MATCH, LineStatus.NOT_FOUND);

    static boolean inTab(LineStatus tab, LineStatus s) {
        return tab == LineStatus.NOT_FOUND ? s == LineStatus.NOT_FOUND || s == LineStatus.NO_PRICE : s == tab;
    }

    void write(CompareDetail d, LineStatus only, OutputStream out) throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Font bold = wb.createFont();
            bold.setBold(true);
            CellStyle header = wb.createCellStyle();
            header.setFont(bold);
            CellStyle money = wb.createCellStyle();
            money.setAlignment(org.apache.poi.ss.usermodel.HorizontalAlignment.RIGHT);
            for (LineStatus tab : only == null ? TABS : List.of(only == LineStatus.NO_PRICE ? LineStatus.NOT_FOUND : only)) {
                Sheet sheet = wb.createSheet(LABEL.get(tab));
                Row h = sheet.createRow(0);
                for (int i = 0; i < TITLES.length; i++) {
                    Cell c = h.createCell(i);
                    c.setCellValue(TITLES[i]);
                    c.setCellStyle(header);
                }
                int r = 1;
                for (CompareLine l : d.lines()) {
                    if (!inTab(tab, l.status())) {
                        continue;
                    }
                    Row row = sheet.createRow(r++);
                    row.createCell(0).setCellValue(l.rowNo());
                    row.createCell(1).setCellValue(l.name());
                    text(row, 2, l.manufacturer());
                    text(row, 3, l.productCode());
                    text(row, 4, l.productName());
                    text(row, 5, l.productMaker());
                    num(row, 6, l.ourPrice(), money);
                    num(row, 7, l.refPrice(), money);
                    num(row, 8, l.diff(), money);
                    num(row, 9, l.diffPct(), null);
                    text(row, 10, l.source());
                    row.createCell(11).setCellValue(LABEL.get(l.status()));
                }
                for (int i = 0; i < TITLES.length; i++) {
                    sheet.setColumnWidth(i, i == 1 || i == 4 ? 12_000 : 4_500);
                }
            }
            wb.write(out);
        }
    }

    private static void text(Row row, int i, String v) {
        if (v != null) {
            row.createCell(i).setCellValue(v);
        }
    }

    /** Pul — formatlangan satr (loyihadagi boshqa eksportlar kabi, float yo'q); foiz — vergul bilan. */
    private static void num(Row row, int i, String v, CellStyle style) {
        if (v != null) {
            Cell c = row.createCell(i);
            c.setCellValue(style == null ? v.replace('.', ',') : Money.of(v).format());
            if (style != null) {
                c.setCellStyle(style);
            }
        }
    }
}
