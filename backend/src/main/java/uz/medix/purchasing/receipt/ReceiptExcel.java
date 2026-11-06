package uz.medix.purchasing.receipt;

import java.io.IOException;
import java.io.OutputStream;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptStatus;
import uz.medix.purchasing.receipt.ReceiptModels.ReceiptSummary;
import uz.medix.shared.money.Money;

/**
 * Kirimlar ro'yxati .xlsx (T12-audit №4): ro'yxatdagi filtrlar bilan. Summa ustuni faqat narx ko'rish ruxsati borlarga
 * (API ham yubormaydi — {@code amount == null}); pul matn ko'rinishida (1.250.000,00), Excel float'ga aylantirmasin.
 */
final class ReceiptExcel {

    /** Bir faylda eng ko'p qator. */
    static final int MAX_ROWS = 10_000;

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm").withZone(ZoneId.of("Asia/Tashkent"));
    private static final Map<ReceiptStatus, String> STATUS = Map.of(ReceiptStatus.DRAFT, "Qoralama", ReceiptStatus.ACCEPTED, "Qabul qilindi",
            ReceiptStatus.POSTED, "Oʻtkazildi", ReceiptStatus.CANCELLED, "Bekor qilingan");

    private ReceiptExcel() {}

    static void write(List<ReceiptSummary> rows, long total, boolean prices, OutputStream out) throws IOException {
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Kirimlar");
            CellStyle bold = wb.createCellStyle();
            Font font = wb.createFont();
            font.setBold(true);
            bold.setFont(font);
            List<String> titles = new ArrayList<>(List.of("Raqam", "Sana", "Yetkazib beruvchi", "Yuk xati", "Ombor", "Holat", "Qatorlar", "Dona"));
            if (prices) {
                titles.add("Summa, soʻm");
            }
            titles.addAll(List.of("Toʻlov kuni", "Oldindan toʻlangan", "Kiritdi", "Kiritilgan vaqt"));
            sheet.createRow(0).createCell(0).setCellValue("Kirimlar" + (total > rows.size()
                    ? " — birinchi " + rows.size() + " ta (jami " + total + "). Filtr bilan qisqartiring." : ": " + rows.size() + " ta"));
            Row h = sheet.createRow(2);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(bold);
            }
            int n = 3;
            for (ReceiptSummary r : rows) {
                Row x = sheet.createRow(n++);
                int col = 0;
                x.createCell(col++).setCellValue(r.number());
                x.createCell(col++).setCellValue(day(r.receiptDate()));
                x.createCell(col++).setCellValue(r.supplier());
                x.createCell(col++).setCellValue(r.invoiceNumber() == null ? "" : r.invoiceNumber());
                x.createCell(col++).setCellValue(r.warehouse());
                x.createCell(col++).setCellValue(STATUS.get(r.status()));
                x.createCell(col++).setCellValue(r.lines());
                x.createCell(col++).setCellValue(r.totalQty());
                if (prices) {
                    x.createCell(col++).setCellValue(r.amount() == null ? "" : Money.of(r.amount()).format());
                }
                x.createCell(col++).setCellValue(day(r.dueDate()));
                x.createCell(col++).setCellValue(r.prepaid() ? "Ha" : "");
                x.createCell(col++).setCellValue(r.createdBy());
                x.createCell(col).setCellValue(TIME.format(r.createdAt()));
            }
            sheet.setColumnWidth(0, 18 * 256);
            sheet.setColumnWidth(2, 36 * 256);
            for (int i = 3; i < titles.size(); i++) {
                sheet.setColumnWidth(i, 16 * 256);
            }
            sheet.createFreezePane(0, 3);
            wb.write(out);
        }
    }

    private static String day(LocalDate d) {
        return d == null ? "" : DAY.format(d);
    }
}
