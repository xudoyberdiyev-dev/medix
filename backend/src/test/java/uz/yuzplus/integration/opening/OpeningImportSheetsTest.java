package uz.yuzplus.integration.opening;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import uz.yuzplus.integration.opening.OpeningImportModels.Section;
import uz.yuzplus.integration.opening.OpeningImportSheets.Field;
import uz.yuzplus.integration.opening.OpeningImportSheets.Parsed;
import uz.yuzplus.integration.opening.OpeningImportSheets.ParsedSheet;
import uz.yuzplus.integration.opening.OpeningImportSheets.ValueError;

/** BQ1: SmartUp / 100+ fayli — varaq turini aniqlash, sarlavha sinonimlari, sana, summa va son. */
class OpeningImportSheetsTest {

    @Test
    void russianSmartUpHeadersAreRecognised() {
        assertThat(OpeningImportSheets.field("Код")).contains(Field.PRODUCT_CODE);
        assertThat(OpeningImportSheets.field("Наименование")).contains(Field.PRODUCT_NAME);
        assertThat(OpeningImportSheets.field("Штрих-код")).contains(Field.BARCODE);
        assertThat(OpeningImportSheets.field("Склад")).contains(Field.WAREHOUSE);
        assertThat(OpeningImportSheets.field("Серия")).contains(Field.BATCH);
        assertThat(OpeningImportSheets.field("Срок годности")).contains(Field.EXPIRY);
        assertThat(OpeningImportSheets.field("Дата производства")).contains(Field.PRODUCED);
        assertThat(OpeningImportSheets.field("Себестоимость, сум")).contains(Field.COST);
        assertThat(OpeningImportSheets.field("Кол-во")).contains(Field.QTY);
        assertThat(OpeningImportSheets.field("Количество, шт")).contains(Field.QTY);
        assertThat(OpeningImportSheets.field("ИНН")).contains(Field.PARTY_TIN);
        assertThat(OpeningImportSheets.field("Контрагент")).contains(Field.PARTY_NAME);
        assertThat(OpeningImportSheets.field("Сумма")).contains(Field.AMOUNT);
        assertThat(OpeningImportSheets.field("Филиал")).contains(Field.BRANCH);
        assertThat(OpeningImportSheets.field("Касса")).contains(Field.ACCOUNT);
        assertThat(OpeningImportSheets.field("Счёт")).contains(Field.ACCOUNT);
    }

    @Test
    void uzbekLatinAndCyrillicHeadersAreRecognised() {
        assertThat(OpeningImportSheets.field("Mahsulot kodi")).contains(Field.PRODUCT_CODE);
        assertThat(OpeningImportSheets.field("Yaroqlilik")).contains(Field.EXPIRY);
        assertThat(OpeningImportSheets.field("Toʻlov muddati")).contains(Field.DUE);
        assertThat(OpeningImportSheets.field("To'lov muddati")).contains(Field.DUE);
        assertThat(OpeningImportSheets.field("Asos №")).contains(Field.DOC_REF);
        assertThat(OpeningImportSheets.field("Маҳсулот коди")).contains(Field.PRODUCT_CODE);
        assertThat(OpeningImportSheets.field("Яроқлилик")).contains(Field.EXPIRY);
        assertThat(OpeningImportSheets.field("Тасодифий")).isEmpty();
    }

    @Test
    void datesInAllCommonFormats() {
        assertThat(OpeningImportSheets.date("30.09.2028")).isEqualTo(LocalDate.of(2028, 9, 30));
        assertThat(OpeningImportSheets.date("30/09/2028 0:00:00")).isEqualTo(LocalDate.of(2028, 9, 30));
        assertThat(OpeningImportSheets.date("30.09.28")).isEqualTo(LocalDate.of(2028, 9, 30));
        assertThat(OpeningImportSheets.date("09.2028")).isEqualTo(LocalDate.of(2028, 9, 30));
        assertThat(OpeningImportSheets.date("02.2028")).isEqualTo(LocalDate.of(2028, 2, 29));
        assertThat(OpeningImportSheets.date("2028-09-30")).isEqualTo(LocalDate.of(2028, 9, 30));
        assertThat(OpeningImportSheets.date(LocalDate.of(2027, 1, 1))).isEqualTo(LocalDate.of(2027, 1, 1));
        // Excel seriya raqami: 47026 = 2028-09-30
        assertThat(OpeningImportSheets.date(new BigDecimal("47026"))).isEqualTo(LocalDate.of(2028, 9, 30));
        assertThat(OpeningImportSheets.date("")).isNull();
        assertThatThrownBy(() -> OpeningImportSheets.date("31.02.2028")).isInstanceOf(ValueError.class);
        assertThatThrownBy(() -> OpeningImportSheets.date("ertaga")).isInstanceOf(ValueError.class);
    }

    @Test
    void amountsWithSeparatorsAndSigns() {
        assertThat(OpeningImportSheets.amount("12 500,50")).isEqualByComparingTo("12500.50");
        assertThat(OpeningImportSheets.amount("12.500,50")).isEqualByComparingTo("12500.50");
        assertThat(OpeningImportSheets.amount("12,500.50")).isEqualByComparingTo("12500.50");
        assertThat(OpeningImportSheets.amount("12500.5")).isEqualByComparingTo("12500.50");
        assertThat(OpeningImportSheets.amount("1.250.000")).isEqualByComparingTo("1250000");
        assertThat(OpeningImportSheets.amount("-1 500")).isEqualByComparingTo("-1500");
        assertThat(OpeningImportSheets.amount("(1 500,00)")).isEqualByComparingTo("-1500");
        assertThat(OpeningImportSheets.amount("15000 сум")).isEqualByComparingTo("15000");
        assertThat(OpeningImportSheets.amount(new BigDecimal("12345.675"))).isEqualByComparingTo("12345.68");
        assertThat(OpeningImportSheets.amount("")).isNull();
        assertThatThrownBy(() -> OpeningImportSheets.amount("12a")).isInstanceOf(ValueError.class);
    }

    @Test
    void quantities() {
        assertThat(OpeningImportSheets.qty("1 200")).isEqualTo(1200);
        assertThat(OpeningImportSheets.qty(new BigDecimal("120.0"))).isEqualTo(120);
        assertThatThrownBy(() -> OpeningImportSheets.qty("1,5")).isInstanceOf(ValueError.class);
        assertThatThrownBy(() -> OpeningImportSheets.qty("0")).isInstanceOf(ValueError.class);
        assertThatThrownBy(() -> OpeningImportSheets.qty("-3")).isInstanceOf(ValueError.class);
    }

    @Test
    void workbookSectionsAreDetectedByHeadersAndSheetNames() throws Exception {
        byte[] file;
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            CellStyle dateStyle = wb.createCellStyle();
            dateStyle.setDataFormat(wb.getCreationHelper().createDataFormat().getFormat("dd.mm.yyyy"));
            // SmartUp: tepada sarlavha matni, keyin ustunlar, oxirida «Итого»
            Sheet goods = wb.createSheet("Остатки товаров");
            goods.createRow(0).createCell(0).setCellValue("Остатки товаров на 01.11.2026");
            row(goods, 2, "Склад", "Код", "Наименование", "Серия", "Срок годности", "Себестоимость", "Количество");
            Row g = row(goods, 3, "Asosiy ombor", "12345678", "Paracetamol", "PR-1", "", "12 500,00", "");
            g.getCell(4).setCellValue(LocalDate.of(2028, 9, 30));
            g.getCell(4).setCellStyle(dateStyle);
            g.getCell(6).setCellValue(120);
            row(goods, 4, "Итого", "", "", "", "", "", "120");
            Sheet customers = wb.createSheet("Дебиторка (клиенты)");
            row(customers, 0, "ИНН", "Наименование", "Сумма");
            row(customers, 1, "301234567", "Shifo Plus", "15 000 000,00");
            Sheet suppliers = wb.createSheet("Qarzlar");
            row(suppliers, 0, "STIR", "Yetkazib beruvchi", "Summa");
            row(suppliers, 1, "201234567", "Farm", "42000000");
            Sheet money = wb.createSheet("Kassa va bank");
            row(money, 0, "Filial", "Hisob", "Summa");
            row(money, 1, "(kod yoki nom)", "(hisob nomi)", "(musbat)");
            row(money, 2, "TSH", "Asosiy kassa", "3500000");
            Sheet other = wb.createSheet("Izoh");
            row(other, 0, "Bu fayl SmartUp dan");
            wb.write(out);
            file = out.toByteArray();
        }
        Parsed parsed = OpeningImportSheets.read(new ByteArrayInputStream(file));
        assertThat(parsed.sheets()).extracting(ParsedSheet::section)
                .containsExactly(Section.GOODS, Section.CUSTOMER_DEBT, Section.SUPPLIER_DEBT, Section.MONEY);
        ParsedSheet goods = parsed.sheets().getFirst();
        assertThat(goods.rows()).hasSize(1);
        assertThat(goods.rows().getFirst().rowNo()).isEqualTo(4);
        assertThat(goods.rows().getFirst().raw(Field.EXPIRY)).isEqualTo(LocalDate.of(2028, 9, 30));
        assertThat(goods.rows().getFirst().text(Field.QTY)).isEqualTo("120");
        assertThat(parsed.sheets().get(1).rows().getFirst().text(Field.PRODUCT_NAME)).isEqualTo("Shifo Plus");
        // Izoh qatori («(…)») tashlanadi
        assertThat(parsed.sheets().get(3).rows()).hasSize(1);
        assertThat(parsed.skipped()).extracting(OpeningImportSheets.SkippedSheet::name).containsExactly("Izoh");
    }

    @Test
    void templateIsReadBackWithoutSkippedSheets() throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        OpeningImportTemplate.write(out);
        Parsed parsed = OpeningImportSheets.read(new ByteArrayInputStream(out.toByteArray()));
        assertThat(parsed.skipped()).isEmpty();
        assertThat(parsed.sheets()).extracting(ParsedSheet::section)
                .containsExactly(Section.GOODS, Section.CUSTOMER_DEBT, Section.SUPPLIER_DEBT, Section.MONEY);
        assertThat(parsed.sheets()).extracting(s -> s.rows().size()).containsExactly(2, 2, 1, 2);
    }

    @Test
    void moreSmartUpReportHeaders() {
        assertThat(OpeningImportSheets.field("Код ТМЦ")).contains(Field.PRODUCT_CODE);
        assertThat(OpeningImportSheets.field("Наименование ТМЦ")).contains(Field.PRODUCT_NAME);
        assertThat(OpeningImportSheets.field("Остаток на конец периода")).contains(Field.QTY);
        assertThat(OpeningImportSheets.field("Сальдо на конец периода")).contains(Field.AMOUNT);
        assertThat(OpeningImportSheets.field("Сальдо на конец (Дебет)")).contains(Field.DEBIT);
        assertThat(OpeningImportSheets.field("Кредит")).contains(Field.CREDIT);
        assertThat(OpeningImportSheets.field("Наименование клиента")).contains(Field.PARTY_NAME);
        assertThat(OpeningImportSheets.field("Себестоимость за ед.")).contains(Field.COST);
    }

    /** Oborot-saldo vedomosti: ikki qatorli sarlavha, boshlang'ich saldo va oborotlar tashlanadi, oxirgi saldo Дт − Кт / Кт − Дт. */
    @Test
    void turnoverReportWithTwoRowHeaderAndDebitCredit() throws Exception {
        byte[] file;
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet customers = wb.createSheet("Дебиторская задолженность");
            saldoHeader(customers, "Клиент");
            numbers(row(customers, 2, "Shifo Plus", "301234567"), 100, 0, 50, 20, 130, 0);
            numbers(row(customers, 3, "Avans Farm", "301234568"), 0, 0, 0, 500, 0, 500);
            row(customers, 4, "Итого", "", "", "", "", "", "130", "500");
            Sheet suppliers = wb.createSheet("Кредиторка");
            saldoHeader(suppliers, "Поставщик");
            numbers(row(suppliers, 2, "Farm Group", "201234567"), 0, 400, 0, 600, 0, 1000);
            wb.write(out);
            file = out.toByteArray();
        }
        Parsed parsed = OpeningImportSheets.read(new ByteArrayInputStream(file));
        assertThat(parsed.skipped()).isEmpty();
        assertThat(parsed.sheets()).extracting(ParsedSheet::section).containsExactly(Section.CUSTOMER_DEBT, Section.SUPPLIER_DEBT);
        ParsedSheet c = parsed.sheets().getFirst();
        assertThat(c.rows()).hasSize(2);
        assertThat(c.rows().getFirst().rowNo()).isEqualTo(3);
        assertThat(c.rows().getFirst().text(Field.PARTY_NAME)).isEqualTo("Shifo Plus");
        assertThat(c.rows().getFirst().text(Field.PARTY_TIN)).isEqualTo("301234567");
        assertThat(c.rows().getFirst().raw(Field.AMOUNT)).isEqualTo(new BigDecimal("130.00"));
        assertThat(c.rows().get(1).raw(Field.AMOUNT)).isEqualTo(new BigDecimal("-500.00"));
        assertThat(parsed.sheets().get(1).rows().getFirst().raw(Field.AMOUNT)).isEqualTo(new BigDecimal("1000.00"));
    }

    /** Qoldiq hisoboti: «Склад: …» guruh qatori, tovar guruhi sarlavhasi, oxirgi qoldiq ustuni, tannarx = summa / soni. */
    @Test
    void stockReportWithWarehouseGroupsAndTotalSum() throws Exception {
        byte[] file;
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet goods = wb.createSheet("Остатки");
            row(goods, 0, "Код", "Наименование", "Серия", "Срок годности", "Остаток на начало", "", "Остаток на конец", "");
            row(goods, 1, "", "", "", "", "Кол-во", "Сумма", "Кол-во", "Сумма");
            for (int col : new int[] {0, 1, 2, 3}) {
                goods.addMergedRegion(new CellRangeAddress(0, 1, col, col));
            }
            goods.addMergedRegion(new CellRangeAddress(0, 0, 4, 5));
            goods.addMergedRegion(new CellRangeAddress(0, 0, 6, 7));
            row(goods, 2, "Склад: Asosiy ombor");
            row(goods, 3, "", "Анальгетики");
            Row p = row(goods, 4, "12345678", "Paracetamol", "PR-1", "30.09.2028");
            numbers(p, 4, 9, 3, 50000);
            row(goods, 5, "Склад: Filial ombori");
            numbers(row(goods, 6, "87654321", "Ibuprofen", "IB-2", "09.2028"), 0, 0, 7, 7000);
            wb.write(out);
            file = out.toByteArray();
        }
        Parsed parsed = OpeningImportSheets.read(new ByteArrayInputStream(file));
        assertThat(parsed.sheets()).extracting(ParsedSheet::section).containsExactly(Section.GOODS);
        ParsedSheet g = parsed.sheets().getFirst();
        assertThat(g.rows()).extracting(OpeningImportSheets.SheetRow::rowNo).containsExactly(5, 7);
        OpeningImportSheets.SheetRow first = g.rows().getFirst();
        assertThat(first.text(Field.WAREHOUSE)).isEqualTo("Asosiy ombor");
        assertThat(first.text(Field.QTY)).isEqualTo("3");
        assertThat(first.raw(Field.COST)).isEqualTo(new BigDecimal("16666.67"));
        assertThat(g.rows().get(1).text(Field.WAREHOUSE)).isEqualTo("Filial ombori");
        assertThat(g.rows().get(1).raw(Field.COST)).isEqualTo(new BigDecimal("1000.00"));
    }

    /** SmartUp eski formatda (.xls, Excel 97–2003) ham eksport qiladi — shu fayl ham oʻqiladi. */
    @Test
    void legacyXlsIsReadToo() throws Exception {
        byte[] file;
        try (HSSFWorkbook wb = new HSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet customers = wb.createSheet("Дебиторка");
            saldoHeader(customers, "Клиент");
            numbers(row(customers, 2, "Shifo Plus", "301234567"), 0, 0, 0, 0, 2500.5, 0);
            wb.write(out);
            file = out.toByteArray();
        }
        Parsed parsed = OpeningImportSheets.read(new ByteArrayInputStream(file));
        assertThat(parsed.sheets()).extracting(ParsedSheet::section).containsExactly(Section.CUSTOMER_DEBT);
        assertThat(parsed.sheets().getFirst().rows().getFirst().raw(Field.AMOUNT)).isEqualTo(new BigDecimal("2500.50"));
    }

    private static void saldoHeader(Sheet sheet, String party) {
        row(sheet, 0, party, "ИНН", "Сальдо на начало периода", "", "Обороты за период", "", "Сальдо на конец периода", "");
        row(sheet, 1, "", "", "Дебет", "Кредит", "Дебет", "Кредит", "Дебет", "Кредит");
        sheet.addMergedRegion(new CellRangeAddress(0, 1, 0, 0));
        sheet.addMergedRegion(new CellRangeAddress(0, 1, 1, 1));
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 2, 3));
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 4, 5));
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 6, 7));
    }

    /** Qatorga mavjud matn kataklaridan keyin sonli kataklar qo'shadi. */
    private static Row numbers(Row r, double... values) {
        int start = Math.max(r.getLastCellNum(), 0);
        for (int i = 0; i < values.length; i++) {
            r.createCell(start + i).setCellValue(values[i]);
        }
        return r;
    }

    private static Row row(Sheet sheet, int index, String... values) {
        Row r = sheet.createRow(index);
        for (int i = 0; i < values.length; i++) {
            r.createCell(i).setCellValue(values[i]);
        }
        return r;
    }
}
