package uz.medix.finance;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;

/**
 * Xodimni filial kassalariga kassir qilib biriktirish (prototip WizStaff «Kassasi»): berilgan kassalar unga oʻtadi, avval
 * unga biriktirilgan, roʻyxatda yoʻq kassalar boʻshatiladi. Faqat shu filialning naqd kassalari.
 */
@Service
public class CashierAssignments {

    private final JdbcClient jdbc;
    private final AuditLog audit;

    CashierAssignments(JdbcClient jdbc, AuditLog audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @Transactional
    public void assign(long employeeId, Long branchId, Collection<Long> accountIds) {
        Set<Long> ids = accountIds == null ? Set.of() : new TreeSet<>(accountIds);
        if (!ids.isEmpty()) {
            long ok = jdbc.sql("SELECT count(*) FROM money_account WHERE id IN (:ids) AND branch_id = :b AND kind = 'CASH'")
                    .param("ids", ids)
                    .param("b", branchId == null ? -1L : branchId)
                    .query(Long.class)
                    .single();
            if (ok != ids.size()) {
                throw MedixException.badRequest("employee.cashInvalid");
            }
        }
        List<Long> before = accountsOf(employeeId);
        jdbc.sql("UPDATE money_account SET cashier_id = NULL, version = version + 1 WHERE cashier_id = :e"
                        + (ids.isEmpty() ? "" : " AND id NOT IN (:ids)"))
                .param("e", employeeId)
                .param("ids", ids.isEmpty() ? List.of(-1L) : ids)
                .update();
        if (!ids.isEmpty()) {
            jdbc.sql("UPDATE money_account SET cashier_id = :e, version = version + 1 WHERE id IN (:ids) AND cashier_id IS DISTINCT FROM :e")
                    .param("e", employeeId)
                    .param("ids", ids)
                    .update();
        }
        if (!new TreeSet<>(before).equals(ids)) {
            audit.record(AuditEntry.of("money.account.cashier", "employee", employeeId)
                    .change(Map.of("accountIds", before), Map.of("accountIds", List.copyOf(ids))));
        }
    }

    /** Xodim kassir boʻlgan kassalar. */
    @Transactional(readOnly = true)
    public List<Long> accountsOf(long employeeId) {
        return jdbc.sql("SELECT id FROM money_account WHERE cashier_id = :e ORDER BY id").param("e", employeeId).query(Long.class).list();
    }
}
