package uz.yuzplus.integration.opening;

import java.io.IOException;
import java.io.OutputStream;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

/** «SmartUp dan ko'chirish» shabloni: 4 varaq, sarlavha + izoh qatori + 2–3 namuna qator (o'qishda izoh qatori — xato emas, tashlanadi). */
final class OpeningImportTemplate {

    private OpeningImportTemplate() {}

    record SheetSpec(String name, List<String> headers, List<String> notes, List<List<String>> samples) {}

    static final List<SheetSpec> SHEETS = List.of(
            new SheetSpec("Tovar",
                    List.of("Filial", "Ombor", "Mahsulot kodi", "Shtrix-kod", "Mahsulot nomi", "Zona", "Partiya", "Ishlab chiqarilgan",
                            "Yaroqlilik", "Tannarx", "Soni", "Bonus"),
                    List.of("kod yoki nom; bitta filial boʻlsa — boʻsh", "ombor nomi", "100+ kodi (8 raqam)", "kod topilmasa", "kod va shtrix-kod boʻlmasa",
                            "boʻsh — Asosiy saqlash", "majburiy", "ixtiyoriy", "30.09.2028 yoki 09.2028", "1 dona, soʻm", "butun son", "ha / yoʻq"),
                    List.of(List.of("TSH", "Asosiy ombor", "12345678", "4780012345678", "Paracetamol 500 mg №10", "", "PR-2405", "01.05.2025",
                                    "30.09.2028", "12500,00", "120", "yoʻq"),
                            List.of("TSH", "Asosiy ombor", "", "4780012345679", "Ibuprofen 200 mg №20", "", "IB-118", "", "03.2027", "8400,50", "45",
                                    "yoʻq"))),
            new SheetSpec("Mijozlar qarzi",
                    List.of("Filial", "STIR", "Mijoz", "Summa", "Toʻlov muddati", "Asos №"),
                    List.of("kod yoki nom", "9 yoki 14 raqam", "STIR boʻlmasa — nom boʻyicha", "qarz; manfiy — avans", "ixtiyoriy", "ixtiyoriy"),
                    List.of(List.of("TSH", "301234567", "Shifo Plus MChJ", "15000000,00", "15.12.2026", "SU-0412"),
                            List.of("TSH", "302345678", "Dorixona 24", "-500000,00", "", ""))),
            new SheetSpec("YB qarzi",
                    List.of("Filial", "STIR", "Yetkazib beruvchi", "Summa", "Toʻlov muddati", "Asos №"),
                    List.of("kod yoki nom", "9 yoki 14 raqam", "STIR boʻlmasa — nom boʻyicha", "bizning qarzimiz; manfiy — avans", "ixtiyoriy",
                            "ixtiyoriy"),
                    List.of(List.of("TSH", "201234567", "Farm Distribyutor MChJ", "42000000,00", "20.12.2026", "HF-778"))),
            new SheetSpec("Kassa va bank",
                    List.of("Filial", "Hisob", "Summa"),
                    List.of("kod yoki nom", "100+ dagi kassa yoki bank hisobi nomi", "musbat"),
                    List.of(List.of("TSH", "Asosiy kassa", "3500000,00"), List.of("TSH", "Hisob raqam (Kapitalbank)", "120000000,00"))));

    static void write(OutputStream out) throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            CellStyle header = wb.createCellStyle();
            Font bold = wb.createFont();
            bold.setBold(true);
            header.setFont(bold);
            CellStyle note = wb.createCellStyle();
            Font italic = wb.createFont();
            italic.setItalic(true);
            italic.setColor(org.apache.poi.ss.usermodel.IndexedColors.GREY_50_PERCENT.getIndex());
            note.setFont(italic);
            for (SheetSpec spec : SHEETS) {
                Sheet sheet = wb.createSheet(spec.name());
                Row h = sheet.createRow(0);
                Row n = sheet.createRow(1);
                for (int i = 0; i < spec.headers().size(); i++) {
                    Cell c = h.createCell(i);
                    c.setCellValue(spec.headers().get(i));
                    c.setCellStyle(header);
                    Cell nc = n.createCell(i);
                    nc.setCellValue("(" + spec.notes().get(i) + ")");
                    nc.setCellStyle(note);
                    sheet.setColumnWidth(i, 22 * 256);
                }
                int r = 2;
                for (List<String> sample : spec.samples()) {
                    Row row = sheet.createRow(r++);
                    for (int i = 0; i < sample.size(); i++) {
                        row.createCell(i).setCellValue(sample.get(i));
                    }
                }
                sheet.createFreezePane(0, 2);
            }
            wb.write(out);
        }
    }
}
