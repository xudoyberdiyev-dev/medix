package uz.yuzplus.integration.opening;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
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

    private static Row row(Sheet sheet, int index, String... values) {
        Row r = sheet.createRow(index);
        for (int i = 0; i < values.length; i++) {
            r.createCell(i).setCellValue(values[i]);
        }
        return r;
    }
}
