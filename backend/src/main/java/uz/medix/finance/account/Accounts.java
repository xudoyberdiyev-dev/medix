package uz.medix.finance.account;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;

/**
 * Pul hisoblari (SPEC 5.5): har filialda kassa(lar), Terminal va bank hisoblari. Filialda hisob bo'lmasa — birinchi murojaatda
 * «Asosiy kassa» va «Terminal» yaratiladi. Kod: K-TSH-1, T-TSH-1, B-TSH-1.
 */
@Service
public class Accounts {

    public enum Kind { CASH, TERMINAL, BANK }

    public record Account(long id, long branchId, Kind kind, String code, String name, @Schema(nullable = true) String bankName,
            @Schema(nullable = true) String accountNo, boolean active, String balance,
            @Schema(nullable = true, description = "Biriktirilgan kassir (faqat kassa)") Long cashierId,
            @Schema(nullable = true) String cashierName) {}

    public record CashierRequest(@Schema(nullable = true, description = "null — biriktirishni olib tashlash") Long cashierId) {}

    public record CashierOption(long id, String fullName, @Schema(nullable = true) String cashName) {}

    public record AccountRequest(@NotNull(message = "{validation.required}") Long branchId, @NotNull(message = "{validation.required}") Kind kind,
            @NotBlank(message = "{validation.required}") @Size(max = 120) String name, @Schema(nullable = true) @Size(max = 120) String bankName,
            @Schema(nullable = true, description = "Bank hisob raqami (20 raqam)") @Pattern(regexp = "\\d{20}", message = "{money.accountNoInvalid}")
            String accountNo) {}

    private final JdbcClient jdbc;
    private final AuditLog audit;

    Accounts(JdbcClient jdbc, AuditLog audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @Transactional
    public List<Account> list(Actor actor, long branchId) {
        if (!actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        ensureDefaults(branchId);
        return jdbc.sql("""
                SELECT a.id, a.branch_id, a.kind, a.code, a.name, a.bank_name, a.account_no, a.active, a.balance, a.cashier_id, e.full_name AS cashier_name
                FROM money_account a LEFT JOIN employee e ON e.id = a.cashier_id WHERE a.branch_id = :b
                ORDER BY CASE a.kind WHEN 'CASH' THEN 0 WHEN 'TERMINAL' THEN 1 ELSE 2 END, a.id""")
                .param("b", branchId)
                .query(Accounts::map)
                .list();
    }

    /** Filialning standart hisoblari (kassa, Terminal) birinchi murojaatda yaratiladi; chaqiruvchi tranzaksiyasida. */
    public void ensureDefaults(long branchId) {
        // Filial qatori qulflanadi — parallel birinchi murojaatda takror yaratilmaydi
        jdbc.sql("SELECT id FROM branch WHERE id = :b FOR UPDATE").param("b", branchId).query(Long.class).single();
        boolean any = jdbc.sql("SELECT EXISTS (SELECT 1 FROM money_account WHERE branch_id = :b)").param("b", branchId).query(Boolean.class).single();
        if (!any) {
            insert(branchId, Kind.CASH, "Asosiy kassa", null, null);
            insert(branchId, Kind.TERMINAL, "Terminal", null, null);
        }
    }

    private long insert(long branchId, Kind kind, String name, String bankName, String accountNo) {
        String branchCode = jdbc.sql("SELECT code FROM branch WHERE id = :b").param("b", branchId).query(String.class).single();
        String prefix = switch (kind) {
            case CASH -> "K";
            case TERMINAL -> "T";
            case BANK -> "B";
        };
        int seq = jdbc.sql("SELECT count(*) + 1 FROM money_account WHERE branch_id = :b AND kind = :k")
                .param("b", branchId).param("k", kind.name()).query(Integer.class).single();
        return jdbc.sql("""
                INSERT INTO money_account (branch_id, kind, code, name, bank_name, account_no) VALUES (:b, :k, :c, :n, :bn, :an) RETURNING id""")
                .param("b", branchId)
                .param("k", kind.name())
                .param("c", prefix + "-" + branchCode + "-" + seq)
                .param("n", name)
                .param("bn", bankName)
                .param("an", accountNo)
                .query(Long.class)
                .single();
    }

    @Transactional
    public long create(Actor actor, AccountRequest r) {
        if (!actor.canAccessBranch(r.branchId())) {
            throw MedixException.notFound("error.notFound");
        }
        ensureDefaults(r.branchId());
        if (r.kind() == Kind.BANK && (r.accountNo() == null || r.accountNo().isBlank())) {
            throw MedixException.badRequest("money.accountNoRequired");
        }
        long id = insert(r.branchId(), r.kind(), r.name().strip(), blank(r.bankName()), r.kind() == Kind.BANK ? r.accountNo() : null);
        audit.record(AuditEntry.of("money.account.create", "money_account", id).change(null, Map.of("kind", r.kind().name(), "name", r.name().strip())));
        return id;
    }

    /** Hisob filiali va faolligi (to'lov hujjatlari tekshiruvi uchun). */
    @Transactional(readOnly = true)
    public java.util.Optional<Account> find(long id) {
        return jdbc.sql("""
                SELECT a.id, a.branch_id, a.kind, a.code, a.name, a.bank_name, a.account_no, a.active, a.balance, a.cashier_id, e.full_name AS cashier_name
                FROM money_account a LEFT JOIN employee e ON e.id = a.cashier_id WHERE a.id = :id""")
                .param("id", id)
                .query(Accounts::map)
                .optional();
    }

    private static Account map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new Account(rs.getLong("id"), rs.getLong("branch_id"), Kind.valueOf(rs.getString("kind")), rs.getString("code"), rs.getString("name"),
                rs.getString("bank_name"), rs.getString("account_no"), rs.getBoolean("active"), new Money(rs.getBigDecimal("balance")).toString(),
                (Long) rs.getObject("cashier_id"), rs.getString("cashier_name"));
    }

    /**
     * Kassaga kassir biriktirish (SPEC 3: kassir amallarni faqat o'z kassasida bajaradi). Nomzod — shu filialning faol xodimi, roli
     * kassa amallariga ruxsatli ({@code cash.io}). Bir xodim bir necha kassaga biriktirilishi mumkin.
     */
    @Transactional
    public void assignCashier(Actor actor, long accountId, Long cashierId) {
        Account acc = find(accountId).filter(a -> actor.canAccessBranch(a.branchId())).orElseThrow(() -> MedixException.notFound("error.notFound"));
        if (acc.kind() != Kind.CASH) {
            throw MedixException.badRequest("money.cashierOnlyCash");
        }
        if (cashierId != null && cashierOptions(actor, acc.branchId()).stream().noneMatch(o -> o.id() == cashierId)) {
            throw MedixException.badRequest("money.cashierUnknown");
        }
        jdbc.sql("UPDATE money_account SET cashier_id = :c, version = version + 1 WHERE id = :id").param("c", cashierId).param("id", accountId).update();
        audit.record(AuditEntry.of("money.account.cashier", "money_account", accountId)
                .change(acc.cashierId() == null ? null : Map.of("cashierId", acc.cashierId()), cashierId == null ? null : Map.of("cashierId", cashierId)));
    }

    /** Kassaga biriktirish mumkin bo'lgan xodimlar: filialning faol xodimlari, roli cash.io ga ega. */
    @Transactional(readOnly = true)
    public List<CashierOption> cashierOptions(Actor actor, long branchId) {
        if (!actor.canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        return jdbc.sql("""
                SELECT e.id, e.full_name,
                       (SELECT string_agg(a.name, ', ' ORDER BY a.id) FROM money_account a WHERE a.cashier_id = e.id AND a.branch_id = :b) AS cash_name
                FROM employee e JOIN role_permission rp ON rp.role_id = e.role_id AND rp.permission_key = 'cash.io'
                WHERE e.branch_id = :b AND e.status = 'ACTIVE' ORDER BY e.full_name""")
                .param("b", branchId)
                .query((rs, n) -> new CashierOption(rs.getLong("id"), rs.getString("full_name"), rs.getString("cash_name")))
                .list();
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
