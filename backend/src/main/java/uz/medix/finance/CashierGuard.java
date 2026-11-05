package uz.medix.finance;

import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.Authorities;
import uz.medix.shared.security.CurrentActor;

/**
 * Kassir faqat o'z kassasida (SPEC 3, 13): kassaga kassir biriktirilgan bo'lsa, undagi pul harakatini faqat shu kassir yoki
 * nazoratchi ({@code cash.approve} — Direktor, Admin, Filial rahbari) bajaradi. Filialda kassaga biriktirilgan xodim boshqa
 * (biriktirilmagan yoki o'zgalarning) kassasidan foydalanmaydi. Terminal va bank hisoblari — faqat ruxsat kalitlari bo'yicha.
 */
@Component
public class CashierGuard {

    public static final String SUPERVISOR = "cash.approve";

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;

    CashierGuard(JdbcClient jdbc, CurrentActor currentActor) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
    }

    /** Joriy xodim shu hisobda pul harakati qila oladimi; yo'q bo'lsa — 403. So'rovdan tashqarida (tizim ishi) tekshirilmaydi. */
    public void check(long accountId) {
        Optional<Actor> actor = currentActor.current();
        if (actor.isEmpty() || Authorities.has(SUPERVISOR)) {
            return;
        }
        record A(String kind, Long cashierId, long branchId, String name) {}
        A a = jdbc.sql("SELECT kind, cashier_id, branch_id, name FROM money_account WHERE id = :id")
                .param("id", accountId)
                .query((rs, n) -> new A(rs.getString("kind"), (Long) rs.getObject("cashier_id"), rs.getLong("branch_id"), rs.getString("name")))
                .optional()
                .orElse(null);
        if (a == null || !"CASH".equals(a.kind())) {
            return;
        }
        long me = actor.get().employeeId();
        if (a.cashierId() != null) {
            if (a.cashierId() != me) {
                throw MedixException.forbidden("money.notYourCash", a.name());
            }
            return;
        }
        boolean hasOwn = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM money_account WHERE branch_id = :b AND kind = 'CASH' AND active AND cashier_id = :e)""")
                .param("b", a.branchId())
                .param("e", me)
                .query(Boolean.class)
                .single();
        if (hasOwn) {
            throw MedixException.forbidden("money.useOwnCash", a.name());
        }
    }
}
