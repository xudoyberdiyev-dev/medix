package uz.medix.sales.order;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import uz.medix.sales.order.OrderModels.DeliveryType;
import uz.medix.sales.order.OrderModels.OrderStatus;
import uz.medix.sales.order.OrderModels.OrderSummary;
import uz.medix.sales.order.OrderModels.PaymentType;
import uz.medix.shared.money.Money;

/** Buyurtmalar ro'yxati .xlsx (SPEC 120: jadval standarti — eksport, jami qatori). Pul matn sifatida (BigDecimal, float yo'q). */
final class OrderExcel {

    static final int MAX_ROWS = 20_000;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private OrderExcel() {}

    static void write(List<OrderSummary> items, HttpServletResponse response) throws IOException {
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"buyurtmalar.xlsx\"");
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Buyurtmalar");
            CellStyle header = wb.createCellStyle();
            Font font = wb.createFont();
            font.setBold(true);
            header.setFont(font);
            CellStyle money = wb.createCellStyle();
            money.setAlignment(HorizontalAlignment.RIGHT);
            CellStyle totalMoney = wb.createCellStyle();
            totalMoney.setAlignment(HorizontalAlignment.RIGHT);
            totalMoney.setFont(font);
            List<String> titles = List.of("Raqam", "Sana", "Mijoz", "Yetkazish", "Qatorlar", "Summa", "Toʻlov turi", "Operator", "Hozir kimda",
                    "Holat", "Ombor");
            Row h = sheet.createRow(0);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(header);
            }
            int r = 1;
            long lines = 0;
            Money total = Money.ZERO;
            for (OrderSummary o : items) {
                Row row = sheet.createRow(r++);
                int i = 0;
                row.createCell(i++).setCellValue(o.number());
                row.createCell(i++).setCellValue(DAY.format(o.orderDate()));
                row.createCell(i++).setCellValue(o.customer());
                row.createCell(i++).setCellValue(delivery(o));
                row.createCell(i++).setCellValue(o.lines());
                Money sum = Money.of(o.total());
                Cell m = row.createCell(i++);
                m.setCellValue(sum.format());
                m.setCellStyle(money);
                row.createCell(i++).setCellValue(paymentLabel(o.paymentType()));
                row.createCell(i++).setCellValue(o.createdBy());
                row.createCell(i++).setCellValue(o.holder() == null ? "" : o.holder());
                row.createCell(i++).setCellValue(statusLabel(o.status()));
                row.createCell(i).setCellValue(o.warehouse());
                lines += o.lines();
                total = total.plus(sum);
            }
            Row sumRow = sheet.createRow(r);
            Cell label = sumRow.createCell(0);
            label.setCellValue("Jami: " + items.size() + " ta");
            label.setCellStyle(header);
            Cell l = sumRow.createCell(4);
            l.setCellValue(lines);
            l.setCellStyle(header);
            Cell t = sumRow.createCell(5);
            t.setCellValue(total.format());
            t.setCellStyle(totalMoney);
            int[] widths = {18, 12, 40, 26, 10, 18, 16, 24, 28, 22, 20};
            for (int i = 0; i < titles.size(); i++) {
                sheet.setColumnWidth(i, widths[i] * 256);
            }
            sheet.createFreezePane(0, 1);
            wb.write(response.getOutputStream());
        }
    }

    private static String delivery(OrderSummary o) {
        if (o.deliveryType() == DeliveryType.PICKUP) {
            return "Oʻzi olib ketadi";
        }
        return o.deliveryDate() == null ? "Yetkazib berish" : "Yetkazib berish · " + DAY.format(o.deliveryDate());
    }

    static String paymentLabel(PaymentType p) {
        return switch (p) {
            case CASH -> "Naqd";
            case TRANSFER -> "Perechisleniye";
            case ONLINE -> "Online";
        };
    }

    static String statusLabel(OrderStatus s) {
        return switch (s) {
            case DRAFT -> "Qoralama";
            case PENDING_APPROVAL -> "Tasdiqlashda";
            case QUEUED -> "Navbatda";
            case PICKING -> "Yigʻilmoqda";
            case MARKING -> "Markirovkada";
            case CHECKING -> "Hisobdan oʻtkazilmoqda";
            case DOCUMENTING -> "Hujjatlashtirilmoqda";
            case LOADING -> "Yuklanmoqda";
            case IN_TRANSIT -> "Yoʻlda";
            case DELIVERED -> "Yetkazildi";
            case UNDELIVERED -> "Yetkazilmadi";
            case REJECTED -> "Rad etilgan";
            case CANCELLED -> "Bekor qilingan";
        };
    }
}
