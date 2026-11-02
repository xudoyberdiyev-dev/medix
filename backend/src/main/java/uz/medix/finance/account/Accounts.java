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
            @Schema(nullable = true) String accountNo, boolean active, String balance) {}

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
                SELECT id, branch_id, kind, code, name, bank_name, account_no, active, balance FROM money_account WHERE branch_id = :b
                ORDER BY CASE kind WHEN 'CASH' THEN 0 WHEN 'TERMINAL' THEN 1 ELSE 2 END, id""")
                .param("b", branchId)
                .query((rs, n) -> new Account(rs.getLong("id"), rs.getLong("branch_id"), Kind.valueOf(rs.getString("kind")), rs.getString("code"),
                        rs.getString("name"), rs.getString("bank_name"), rs.getString("account_no"), rs.getBoolean("active"),
                        new Money(rs.getBigDecimal("balance")).toString()))
                .list();
    }

    private void ensureDefaults(long branchId) {
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
        return jdbc.sql("SELECT id, branch_id, kind, code, name, bank_name, account_no, active, balance FROM money_account WHERE id = :id")
                .param("id", id)
                .query((rs, n) -> new Account(rs.getLong("id"), rs.getLong("branch_id"), Kind.valueOf(rs.getString("kind")), rs.getString("code"),
                        rs.getString("name"), rs.getString("bank_name"), rs.getString("account_no"), rs.getBoolean("active"),
                        new Money(rs.getBigDecimal("balance")).toString()))
                .optional();
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
