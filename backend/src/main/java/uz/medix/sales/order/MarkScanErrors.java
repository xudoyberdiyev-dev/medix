package uz.medix.sales.order;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Rad etilgan skanerlashni alohida tranzaksiyada yozadi — asosiy tranzaksiya xato bilan qaytsa ham yozuv qoladi («Xato urishlar»). */
@Service
class MarkScanErrors {

    private final JdbcClient jdbc;

    MarkScanErrors(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void record(long orderId, long employeeId, String errorKey) {
        jdbc.sql("""
                INSERT INTO mark_scan_error (order_id, employee_id, error_key)
                SELECT id, :e, :k FROM sales_order WHERE id = :o""")
                .param("o", orderId)
                .param("e", employeeId)
                .param("k", errorKey.length() > 64 ? errorKey.substring(0, 64) : errorKey)
                .update();
    }
}
