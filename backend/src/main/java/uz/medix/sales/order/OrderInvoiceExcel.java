package uz.medix.sales.order;

import java.io.IOException;
import java.io.OutputStream;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.sales.order.OrderModels.InvoiceDoc;
import uz.medix.sales.order.OrderModels.InvoiceLine;
import uz.medix.sales.order.OrderModels.InvoiceParty;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/** Hisob-faktura — Excel (O11): PDF bilan bir xil ustunlar, rekvizitlar, jami soʻz bilan. */
@Service
class OrderInvoiceExcel {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final List<String> TITLES = List.of("№", "Tovar nomi", "MXIK (IKPU) kodi", "Oʻlchov birligi", "Birlik kodi", "Partiya",
            "Yaroqlilik", "Miqdori", "Narxi", "Yetkazib berish qiymati", "QQS stavkasi, %", "QQS summasi", "QQS bilan qiymati",
            "Markirovka kodlari");

    private final OrderInvoices invoices;

    OrderInvoiceExcel(OrderInvoices invoices) {
        this.invoices = invoices;
    }

    @Transactional(readOnly = true)
    String write(Actor actor, long orderId, OutputStream out) throws IOException {
        InvoiceDoc d = invoices.find(actor, orderId).orElseThrow(() -> MedixException.notFound("error.notFound"));
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet sh = wb.createSheet("Hisob-faktura");
            CellStyle bold = wb.createCellStyle();
            Font f = wb.createFont();
            f.setBold(true);
            bold.setFont(f);
            int r = 0;
            text(sh.createRow(r++), 0, "HISOB-FAKTURA № " + d.invoiceNumber() + " · " + DATE.format(d.saleDate()), bold);
            text(sh.createRow(r++), 0, "Shartnoma: " + (d.contract() == null ? "—" : d.contract())
                    + (d.contractDate() == null ? "" : " · " + DATE.format(d.contractDate())), null);
            r = party(sh, r, "Sotuvchi", d.seller(), bold);
            r = party(sh, r, "Xaridor", d.buyer(), bold);
            r++;
            Row h = sh.createRow(r++);
            for (int i = 0; i < TITLES.size(); i++) {
                text(h, i, TITLES.get(i), bold);
            }
            int n = 1;
            for (InvoiceLine l : d.lines()) {
                Row row = sh.createRow(r++);
                int i = 0;
                row.createCell(i++).setCellValue(n++);
                text(row, i++, l.productName(), null);
                text(row, i++, l.ikpu(), null);
                text(row, i++, l.unit(), null);
                text(row, i++, l.unitCode(), null);
                text(row, i++, l.batch(), null);
                text(row, i++, l.expiryDate() == null ? null : DATE.format(l.expiryDate()), null);
                row.createCell(i++).setCellValue(l.qty());
                num(row, i++, l.price(), null);
                num(row, i++, l.netAmount(), null);
                text(row, i++, l.vatRate(), null);
                num(row, i++, l.vatAmount(), null);
                num(row, i++, l.amount(), null);
                row.createCell(i).setCellValue(l.markCount());
            }
            Row tot = sh.createRow(r++);
            text(tot, 1, "Jami", bold);
            tot.createCell(7).setCellValue(d.lines().stream().mapToLong(InvoiceLine::qty).sum());
            num(tot, 9, d.netTotal(), null);
            num(tot, 11, d.vatTotal(), null);
            num(tot, 12, d.total(), null);
            tot.createCell(13).setCellValue(d.markCount());
            text(sh.createRow(r + 1), 0, "Jami toʻlanadigan summa (QQS bilan): " + d.totalInWords(), bold);
            for (int i = 0; i < TITLES.size(); i++) {
                sh.setColumnWidth(i, i == 1 ? 40 * 256 : 16 * 256);
            }
            wb.write(out);
        }
        return d.invoiceNumber();
    }

    private static int party(Sheet sh, int r, String title, InvoiceParty p, CellStyle bold) {
        Row row = sh.createRow(r++);
        text(row, 0, title, bold);
        text(row, 1, p.name(), bold);
        String[][] kv = {{"Manzil", p.address()}, {"STIR", p.tin()}, {"QQS toʻlovchi reg. kodi", p.vatCode()},
                {"Hisob raqami", p.bankAccount()}, {"Bank", p.bankName()}, {"MFO", p.mfo()}, {"Telefon", p.phone()}};
        for (String[] e : kv) {
            Row x = sh.createRow(r++);
            text(x, 0, e[0], null);
            text(x, 1, e[1] == null ? "—" : e[1], null);
        }
        return r;
    }

    private static void text(Row row, int i, String v, CellStyle style) {
        Cell c = row.createCell(i);
        c.setCellValue(v == null ? "" : v);
        if (style != null) {
            c.setCellStyle(style);
        }
    }

    /** Pul — boshqa eksportlar kabi formatlangan matn ({@code 1.250.000,00}); float/double ishlatilmaydi. */
    private static void num(Row row, int i, String v, CellStyle style) {
        text(row, i, v == null ? "" : Money.of(v).format(), style);
    }
}
