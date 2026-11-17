package uz.medix.finance.debt;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.lang.reflect.RecordComponent;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.PageMargin;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import uz.medix.finance.PartyLedger.Side;
import uz.medix.shared.pdf.PdfDocument;
import uz.medix.shared.pdf.PdfRenderer;
import uz.medix.shared.security.Actor;

/** Akt sverka — server PDF va Excel (O17, egasi shabloni): {@link ReconActDoc} modelidan. */
@Service
class DebtActPdf {

    static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private final ReconActDoc docs;
    private final PdfRenderer pdf;

    DebtActPdf(ReconActDoc docs, PdfRenderer pdf) {
        this.docs = docs;
        this.pdf = pdf;
    }

    /** Raqamsiz akt (qarz sahifasidan): davr bo'yicha. */
    PdfDocument render(Actor actor, Side side, long branchId, long counterpartyId, LocalDate from, LocalDate to, String lang, boolean letter) {
        return pdf(docs.build(actor, side, branchId, counterpartyId, from, to, lang, null, null, null, letter));
    }

    PdfDocument pdf(ReconActDoc.Doc d) {
        return new PdfDocument(d.fileName(), pdf.render("recon-act", Map.of("d", toMap(d))));
    }

    ResponseEntity<byte[]> xlsxResponse(ReconActDoc.Doc d) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, XLSX)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + d.fileName().replaceAll("[^A-Za-z0-9-]", "") + ".xlsx\"")
                .body(xlsx(d));
    }

    /** Thymeleaf uchun: record → Map (ichma-ich, ro'yxatlar bilan). */
    static Object toMap(Object o) {
        if (o instanceof Record r) {
            Map<String, Object> m = new LinkedHashMap<>();
            for (RecordComponent c : r.getClass().getRecordComponents()) {
                try {
                    m.put(c.getName(), toMap(c.getAccessor().invoke(r)));
                } catch (ReflectiveOperationException e) {
                    throw new IllegalStateException(e);
                }
            }
            return m;
        }
        if (o instanceof List<?> list) {
            List<Object> out = new ArrayList<>();
            for (Object x : list) {
                out.add(toMap(x));
            }
            return out;
        }
        return o;
    }

    /** Excel — shablon tuzilmasiga yaqin: A–I ustunlar, birlashtirilgan sarlavhalar, chop etishga tayyor (albom, sahifaga sig'adi). */
    static byte[] xlsx(ReconActDoc.Doc d) {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet s = wb.createSheet("Akt");
            Font boldFont = wb.createFont();
            boldFont.setBold(true);
            CellStyle bold = wb.createCellStyle();
            bold.setFont(boldFont);
            CellStyle center = wb.createCellStyle();
            center.setFont(boldFont);
            center.setAlignment(HorizontalAlignment.CENTER);
            CellStyle wrap = wb.createCellStyle();
            wrap.setWrapText(true);
            wrap.setVerticalAlignment(VerticalAlignment.TOP);
            CellStyle head = boxed(wb, true, HorizontalAlignment.CENTER);
            CellStyle cell = boxed(wb, false, HorizontalAlignment.LEFT);
            CellStyle num = boxed(wb, false, HorizontalAlignment.RIGHT);
            CellStyle tot = boxed(wb, true, HorizontalAlignment.LEFT);
            CellStyle totNum = boxed(wb, true, HorizontalAlignment.RIGHT);
            int[] widths = {12, 48, 10, 16, 16, 16, 16, 16, 16};
            for (int i = 0; i < widths.length; i++) {
                s.setColumnWidth(i, widths[i] * 256);
            }
            int r = 0;
            r = merged(s, r, d.title(), center);
            r = merged(s, r, d.asOf(), center);
            r = merged(s, r, d.between(), center);
            r++;
            Row intro = s.createRow(r);
            intro.setHeightInPoints(30);
            r = merged(s, r, d.intro(), wrap);
            r = merged(s, r, d.point1(), bold);
            r = merged(s, r, d.currencyLine(), null);
            // Sarlavha: 2 qator
            Row h1 = s.createRow(r);
            Row h2 = s.createRow(r + 1);
            String[] top = {d.l().get("colDate"), d.l().get("colDoc"), d.l().get("colCurrency"), d.l().get("colByUs"), "", "",
                    d.l().get("colByThem"), "", ""};
            String[] sub = {"", "", "", d.l().get("colSum"), d.l().get("colDebit"), d.l().get("colCredit"), d.l().get("colSum"),
                    d.l().get("colDebit"), d.l().get("colCredit")};
            for (int i = 0; i < 9; i++) {
                h1.createCell(i).setCellValue(top[i]);
                h1.getCell(i).setCellStyle(head);
                h2.createCell(i).setCellValue(sub[i]);
                h2.getCell(i).setCellStyle(head);
            }
            for (int i = 0; i < 3; i++) {
                s.addMergedRegion(new CellRangeAddress(r, r + 1, i, i));
            }
            s.addMergedRegion(new CellRangeAddress(r, r, 3, 5));
            s.addMergedRegion(new CellRangeAddress(r, r, 6, 8));
            h1.setHeightInPoints(30);
            int headerRow = r;
            r += 2;
            r = row(s, r, d.opening(), tot, totNum, false);
            for (ReconActDoc.Row x : d.rows()) {
                r = row(s, r, x, cell, num, true);
            }
            r = row(s, r, d.turnover(), tot, totNum, false);
            r = row(s, r, d.closing(), tot, totNum, false);
            r++;
            r = merged(s, r, d.point2(), bold);
            r = merged(s, r, d.debtLine(), wrap);
            r = merged(s, r, d.point3(), bold);
            r++;
            Row req = s.createRow(r);
            req.setHeightInPoints(42);
            req.createCell(0).setCellValue(d.us().requisites());
            req.getCell(0).setCellStyle(wrap);
            req.createCell(5).setCellValue(d.them().requisites());
            req.getCell(5).setCellStyle(wrap);
            s.addMergedRegion(new CellRangeAddress(r, r, 0, 3));
            s.addMergedRegion(new CellRangeAddress(r, r, 5, 8));
            r += 2;
            String[][] signs = {
                {d.l().get("head") + " ____________ " + nz(d.head()), d.l().get("position") + " ____________"},
                {d.l().get("accountant") + " ____________ " + nz(d.accountant()), d.l().get("sign") + " ____________"},
                {d.l().get("stamp"), d.l().get("fio") + " ____________"},
                {"", d.l().get("stamp")}};
            for (String[] line : signs) {
                Row x = s.createRow(r++);
                x.createCell(0).setCellValue(line[0]);
                x.createCell(5).setCellValue(line[1]);
                r++;
            }
            if (d.letter() != null) {
                ReconActDoc.Letter l = d.letter();
                r += 2;
                s.setRowBreak(r - 1);
                Row x = s.createRow(r++);
                x.createCell(0).setCellValue(l.date());
                x.createCell(5).setCellValue(l.to());
                s.createRow(r++).createCell(5).setCellValue(l.toName());
                r += 2;
                r = merged(s, r, l.title(), center);
                r++;
                Row body = s.createRow(r);
                body.setHeightInPoints(60);
                r = merged(s, r, l.body(), wrap);
                r += 2;
                Row sig = s.createRow(r++);
                sig.createCell(0).setCellValue(l.director());
                sig.createCell(3).setCellValue("______________");
                sig.createCell(5).setCellValue("______________________________");
                Row cap = s.createRow(r++);
                cap.createCell(3).setCellValue(l.sign());
                cap.createCell(5).setCellValue(l.fio());
                s.createRow(r).createCell(2).setCellValue(l.stamp());
            }
            s.setRepeatingRows(new CellRangeAddress(headerRow, headerRow + 1, -1, -1));
            s.getPrintSetup().setLandscape(true);
            s.getPrintSetup().setPaperSize(org.apache.poi.ss.usermodel.PrintSetup.A4_PAPERSIZE);
            s.setFitToPage(true);
            s.getPrintSetup().setFitWidth((short) 1);
            s.getPrintSetup().setFitHeight((short) 0);
            s.setMargin(PageMargin.LEFT, 0.4);
            s.setMargin(PageMargin.RIGHT, 0.4);
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static CellStyle boxed(XSSFWorkbook wb, boolean boldText, HorizontalAlignment align) {
        CellStyle c = wb.createCellStyle();
        c.setBorderTop(BorderStyle.THIN);
        c.setBorderBottom(BorderStyle.THIN);
        c.setBorderLeft(BorderStyle.THIN);
        c.setBorderRight(BorderStyle.THIN);
        c.setAlignment(align);
        c.setVerticalAlignment(VerticalAlignment.CENTER);
        c.setWrapText(true);
        if (boldText) {
            Font f = wb.createFont();
            f.setBold(true);
            c.setFont(f);
        }
        return c;
    }

    private static int merged(Sheet s, int r, String text, CellStyle style) {
        Row row = s.getRow(r) == null ? s.createRow(r) : s.getRow(r);
        row.createCell(0).setCellValue(text);
        if (style != null) {
            row.getCell(0).setCellStyle(style);
        }
        s.addMergedRegion(new CellRangeAddress(r, r, 0, 8));
        return r + 1;
    }

    private static int row(Sheet s, int r, ReconActDoc.Row x, CellStyle text, CellStyle num, boolean doc) {
        Row row = s.createRow(r);
        String[] v = {x.date(), x.doc(), x.currency(), x.amount(), x.ourDebit(), x.ourCredit(), doc ? x.amount() : "", x.theirDebit(),
                x.theirCredit()};
        for (int i = 0; i < 9; i++) {
            row.createCell(i).setCellValue(v[i]);
            row.getCell(i).setCellStyle(i < 3 ? text : num);
        }
        return r + 1;
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
