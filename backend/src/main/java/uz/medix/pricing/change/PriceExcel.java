package uz.medix.pricing.change;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.pricing.change.PriceChangeModels.PricePage;
import uz.medix.pricing.change.PriceChangeModels.PriceRow;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;

/**
 * Amaldagi narxlar .xlsx (SPEC 4 «Jadvallar standarti», «Narx o'rnatish»): jadvaldagi filtr, sana va saralash bilan;
 * har faol narx turi — alohida ustun (QQS bilan). Pul matn sifatida (BigDecimal, float yo'q). Oxirida jami qatori.
 */
@Component
class PriceExcel {

    static final int MAX_EXPORT_ROWS = 50_000;
    static final int MAX_IMPORT_ROWS = 20_000;

    /** «Narx o'rnatish» eksporti: ko'rinib turgan qatorlar — kiritilgan (saqlanmagan) yangi narx bilan (prototip doExport). */
    record SetExportRow(@jakarta.validation.constraints.NotBlank String code, @jakarta.validation.constraints.NotBlank String name,
            String currentPrice, String newPrice) {}

    record SetExportRequest(@jakarta.validation.constraints.NotNull @jakarta.validation.constraints.Size(max = MAX_EXPORT_ROWS)
            List<@jakarta.validation.Valid SetExportRow> rows) {}

    /** Importdagi muammoli qator: Excel qatori raqami, kod, sabab — CODE_UNKNOWN / PRICE_BAD / DUPLICATE. */
    record SetImportIssue(int row, String code, String reason) {}

    record SetImportLine(int row, long productId, String code, String price) {}

    record SetImportResult(int rows, List<SetImportLine> lines, List<SetImportIssue> issues) {}

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

    void exportSet(List<SetExportRow> rows, OutputStream out) throws IOException {
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Narxlar");
            Font bold = wb.createFont();
            bold.setBold(true);
            CellStyle header = wb.createCellStyle();
            header.setFont(bold);
            CellStyle money = wb.createCellStyle();
            money.setAlignment(HorizontalAlignment.RIGHT);
            List<String> titles = List.of("Kod", "Mahsulot", "Joriy narx (QQS bilan)", "Yangi narx (QQS bilan)");
            Row h = sheet.createRow(0);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(header);
            }
            int r = 1;
            for (SetExportRow x : rows) {
                Row row = sheet.createRow(r++);
                row.createCell(0).setCellValue(x.code());
                row.createCell(1).setCellValue(x.name());
                String[] prices = {x.currentPrice(), x.newPrice()};
                for (int i = 0; i < 2; i++) {
                    Cell c = row.createCell(2 + i);
                    c.setCellValue(prices[i] == null || prices[i].isBlank() ? "" : Money.of(prices[i]).format());
                    c.setCellStyle(money);
                }
            }
            sheet.setColumnWidth(0, 12 * 256);
            sheet.setColumnWidth(1, 50 * 256);
            sheet.setColumnWidth(2, 22 * 256);
            sheet.setColumnWidth(3, 22 * 256);
            sheet.createFreezePane(0, 1);
            wb.write(out);
        }
    }

    private record Product(long id, String code) {}

    /**
     * «Excel'dan yuklash»: birinchi varaq; sarlavha (dastlabki 10 qatordan) — «Kod» va «Yangi narx» (yoki «Narx») ustunlari.
     * Hech narsa yozilmaydi — topilgan narxlar jadvalga qo'yiladi, saqlash odatdagi NO orqali.
     */
    @Transactional(readOnly = true)
    SetImportResult importSet(InputStream in) throws IOException {
        DataFormatter fmt = new DataFormatter(Locale.ROOT);
        List<String[]> cells = new ArrayList<>();
        try (Workbook wb = WorkbookFactory.create(in)) {
            Sheet sheet = wb.getSheetAt(0);
            for (int i = 0; i <= Math.min(sheet.getLastRowNum(), MAX_IMPORT_ROWS + 10); i++) {
                Row row = sheet.getRow(i);
                if (row == null) {
                    cells.add(new String[0]);
                    continue;
                }
                String[] v = new String[Math.max(row.getLastCellNum(), 0)];
                for (int c = 0; c < v.length; c++) {
                    Cell cell = row.getCell(c);
                    v[c] = cell == null ? "" : fmt.formatCellValue(cell).strip();
                }
                cells.add(v);
            }
        } catch (IOException | RuntimeException e) {
            throw MedixException.badRequest("prices.import.badFile");
        }
        int head = -1;
        int codeCol = -1;
        int priceCol = -1;
        for (int i = 0; i < Math.min(cells.size(), 10) && head < 0; i++) {
            int[] cols = columns(cells.get(i));
            if (cols[0] >= 0 && cols[1] >= 0) {
                head = i;
                codeCol = cols[0];
                priceCol = cols[1];
            }
        }
        if (head < 0) {
            throw MedixException.badRequest("prices.import.noColumns");
        }
        Map<String, Long> byCode = new HashMap<>();
        jdbc.sql("SELECT id, code FROM product WHERE active").query(Product.class).list()
                .forEach(p -> byCode.put(p.code().toLowerCase(Locale.ROOT), p.id()));
        List<SetImportLine> lines = new ArrayList<>();
        List<SetImportIssue> issues = new ArrayList<>();
        Map<Long, Integer> seen = new HashMap<>();
        int rows = 0;
        for (int i = head + 1; i < cells.size(); i++) {
            String[] v = cells.get(i);
            String code = codeCol < v.length ? v[codeCol] : "";
            String price = priceCol < v.length ? v[priceCol] : "";
            if (code.isEmpty() && price.isEmpty()) {
                continue;
            }
            rows++;
            int excelRow = i + 1;
            if (price.isEmpty()) {
                continue; // yangi narx kiritilmagan — o'zgarishsiz
            }
            Long id = byCode.get(code.toLowerCase(Locale.ROOT));
            if (id == null) {
                issues.add(new SetImportIssue(excelRow, code, "CODE_UNKNOWN"));
                continue;
            }
            BigDecimal amount = parseAmount(price);
            if (amount == null || amount.signum() <= 0 || amount.scale() > 2) {
                issues.add(new SetImportIssue(excelRow, code, "PRICE_BAD"));
                continue;
            }
            if (seen.putIfAbsent(id, excelRow) != null) {
                issues.add(new SetImportIssue(excelRow, code, "DUPLICATE"));
                continue;
            }
            lines.add(new SetImportLine(excelRow, id, code, new Money(amount).amount().toPlainString()));
        }
        return new SetImportResult(rows, lines, issues);
    }

    /** [kod ustuni, narx ustuni]; «Yangi narx» bo'lmasa — «Narx». Lotin, kirill, rus. */
    static int[] columns(String[] header) {
        int code = -1;
        int newPrice = -1;
        int price = -1;
        for (int c = 0; c < header.length; c++) {
            String h = header[c].toLowerCase(Locale.ROOT).replace('ʻ', '\'').replace('‘', '\'').strip();
            if (code < 0 && (h.equals("kod") || h.equals("код") || h.equals("code") || h.equals("mahsulot kodi") || h.equals("код товара"))) {
                code = c;
            } else if (newPrice < 0 && (h.startsWith("yangi narx") || h.startsWith("янги нарх") || h.startsWith("новая цена"))) {
                newPrice = c;
            } else if (price < 0 && (h.startsWith("narx") || h.startsWith("нарх") || h.startsWith("цена"))) {
                price = c;
            }
        }
        return new int[] {code, newPrice >= 0 ? newPrice : price};
    }

    /** «1.250.000,00», «1 250 000.5», «1250000» → BigDecimal; tushunarsiz bo'lsa null. */
    static BigDecimal parseAmount(String raw) {
        String s = raw.strip().replaceAll("(?iu)\\s*(so[ʻ'‘]?m|сум|сўм|uzs)$", "").replaceAll("[\\s\u00A0\u202F']", "");
        if (!s.matches("[0-9.,]+")) {
            return null;
        }
        int dot = s.lastIndexOf('.');
        int comma = s.lastIndexOf(',');
        String normal;
        if (dot >= 0 && comma >= 0) {
            char dec = dot > comma ? '.' : ',';
            char thou = dec == '.' ? ',' : '.';
            normal = s.replace(String.valueOf(thou), "").replace(dec, '.');
        } else if (comma >= 0) {
            normal = s.indexOf(',') == comma && s.length() - comma - 1 != 3 ? s.replace(',', '.') : s.replace(",", "");
        } else if (dot >= 0) {
            normal = s.indexOf('.') == dot && s.length() - dot - 1 != 3 ? s : s.replace(".", "");
        } else {
            normal = s;
        }
        try {
            return new BigDecimal(normal).stripTrailingZeros();
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
