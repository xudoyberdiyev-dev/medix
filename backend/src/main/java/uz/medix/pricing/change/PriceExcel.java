package uz.medix.pricing.change;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.pricing.change.PriceChangeModels.PricePage;
import uz.medix.pricing.change.PriceChangeModels.PriceRow;
import uz.medix.shared.money.Money;

/**
 * Amaldagi narxlar .xlsx (SPEC 4 «Jadvallar standarti», «Narx o'rnatish»): jadvaldagi filtr, sana va saralash bilan;
 * har faol narx turi — alohida ustun (QQS bilan). Pul matn sifatida (BigDecimal, float yo'q). Oxirida jami qatori.
 */
@Component
class PriceExcel {

    static final int MAX_EXPORT_ROWS = 50_000;

    private record Type(long id, String name) {}

    private final JdbcClient jdbc;

    PriceExcel(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    void export(PricePage page, OutputStream out) throws IOException {
        List<Type> types = jdbc.sql("SELECT id, name FROM price_type WHERE active AND NOT batch ORDER BY sort_order").query(Type.class).list();
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Narxlar");
            Font bold = wb.createFont();
            bold.setBold(true);
            CellStyle header = wb.createCellStyle();
            header.setFont(bold);
            CellStyle money = wb.createCellStyle();
            money.setAlignment(HorizontalAlignment.RIGHT);
            List<String> titles = new ArrayList<>(List.of("Kod", "Nomi", "Ishlab chiqaruvchi"));
            types.forEach(t -> titles.add(t.name()));
            Row h = sheet.createRow(0);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(header);
            }
            int r = 1;
            for (PriceRow p : page.items()) {
                Row row = sheet.createRow(r++);
                row.createCell(0).setCellValue(p.code());
                row.createCell(1).setCellValue(p.name());
                row.createCell(2).setCellValue(Objects.toString(p.manufacturer(), ""));
                for (int i = 0; i < types.size(); i++) {
                    String v = p.prices().get(String.valueOf(types.get(i).id()));
                    Cell c = row.createCell(3 + i);
                    c.setCellValue(v == null ? "" : Money.of(v).format());
                    c.setCellStyle(money);
                }
            }
            Row total = sheet.createRow(r);
            Cell t = total.createCell(0);
            t.setCellValue("Jami");
            t.setCellStyle(header);
            Cell n = total.createCell(1);
            n.setCellValue(page.items().size());
            n.setCellStyle(header);
            sheet.setColumnWidth(0, 12 * 256);
            sheet.setColumnWidth(1, 50 * 256);
            sheet.setColumnWidth(2, 28 * 256);
            for (int i = 0; i < types.size(); i++) {
                sheet.setColumnWidth(3 + i, 18 * 256);
            }
            sheet.createFreezePane(0, 1);
            wb.write(out);
        }
    }
}
