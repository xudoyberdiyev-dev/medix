package uz.medix.catalog.counterparty;

import java.io.IOException;
import java.io.OutputStream;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.stereotype.Component;
import uz.medix.catalog.counterparty.CounterpartyModels.CounterpartyPage;
import uz.medix.catalog.counterparty.CounterpartyModels.CounterpartyRow;

/** Kontragentlar ro'yxati .xlsx (SPEC 4 «Jadvallar standarti»): jadvaldagi filtr va saralash bilan, oxirida jami qatori. */
@Component
class CounterpartyExcel {

    static final int MAX_EXPORT_ROWS = 50_000;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    static String role(CounterpartyRow r) {
        return r.customer() && r.supplier() ? "Mijoz, YB" : r.customer() ? "Mijoz" : r.supplier() ? "YB" : "";
    }

    static String status(CounterpartyRow r) {
        return !r.active() ? "Nofaol" : r.blocked() ? "Bloklangan" : "Faol";
    }

    void export(CounterpartyPage page, boolean contacts, OutputStream out) throws IOException {
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Kontragentlar");
            CellStyle header = wb.createCellStyle();
            Font bold = wb.createFont();
            bold.setBold(true);
            header.setFont(bold);
            List<String> titles = new ArrayList<>(List.of("STIR / JShShIR", "Nomi", "Yuridik nomi", "Rol", "Hudud"));
            if (contacts) {
                titles.add("Telefon");
            }
            titles.addAll(List.of("Litsenziya muddati", "Holat"));
            Row h = sheet.createRow(0);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(header);
            }
            int r = 1;
            for (CounterpartyRow cp : page.items()) {
                Row row = sheet.createRow(r++);
                int i = 0;
                row.createCell(i++).setCellValue(cp.tin());
                row.createCell(i++).setCellValue(cp.name());
                row.createCell(i++).setCellValue(Objects.toString(cp.legalName(), ""));
                row.createCell(i++).setCellValue(role(cp));
                row.createCell(i++).setCellValue(Objects.toString(cp.region(), ""));
                if (contacts) {
                    row.createCell(i++).setCellValue(Objects.toString(cp.phone(), ""));
                }
                row.createCell(i++).setCellValue(cp.licenseValidUntil() == null ? "" : cp.licenseValidUntil().format(DAY));
                row.createCell(i).setCellValue(status(cp));
            }
            Row total = sheet.createRow(r);
            Cell t = total.createCell(0);
            t.setCellValue("Jami");
            t.setCellStyle(header);
            Cell n = total.createCell(1);
            n.setCellValue(page.items().size());
            n.setCellStyle(header);
            int[] widths = contacts ? new int[] {16, 40, 40, 11, 20, 18, 18, 12} : new int[] {16, 40, 40, 11, 20, 18, 12};
            for (int i = 0; i < widths.length; i++) {
                sheet.setColumnWidth(i, widths[i] * 256);
            }
            sheet.createFreezePane(0, 1);
            wb.write(out);
        }
    }
}
