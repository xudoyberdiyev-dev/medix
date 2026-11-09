package uz.medix.finance.cash;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * «Kassa» ro'yxati (prototip `Cash`): har kassa — qoldiq, mas'ul kassir, bugungi kirim/chiqim (o'tkazilgan harakatlar),
 * oxirgi yopilgan kun. Filial doirasi serverda; branchId berilmasa — barcha ruxsatli filiallar.
 */
@Service
class CashOverviews {

    record CashCard(
            long id,
            long branchId,
            String branchName,
            String code,
            String name,
            @Schema(nullable = true, description = "Mas'ul (biriktirilgan kassir)") String cashierName,
            String balance,
            @Schema(description = "Bugungi kirim (Asia/Tashkent)") String todayIn,
            @Schema(description = "Bugungi chiqim, musbat son") String todayOut,
            @Schema(nullable = true, description = "Oxirgi yopilgan kun") LocalDate lastClosed) {}

    record CashOverview(@Schema(description = "Bugun (Asia/Tashkent)") LocalDate today, String total, List<CashCard> cards) {}

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;

    CashOverviews(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    CashOverview overview(Actor actor, Long branchId) {
        if (branchId != null && !actor.canAccessBranch(branchId)) {
            throw MedixException.forbidden("auth.forbidden");
        }
        Long scope = actor.allBranches() ? branchId : actor.branchId();
        LocalDate today = LocalDate.now(TASHKENT);
        List<CashCard> cards = jdbc.sql("""
                SELECT a.id, a.branch_id, b.name AS branch_name, a.code, a.name, e.full_name AS cashier, a.balance,
                       coalesce((SELECT sum(m.amount) FROM money_move m WHERE m.account_id = a.id AND m.move_date = :today AND m.amount > 0), 0) AS t_in,
                       coalesce((SELECT -sum(m.amount) FROM money_move m WHERE m.account_id = a.id AND m.move_date = :today AND m.amount < 0), 0) AS t_out,
                       (SELECT max(c.close_date) FROM cash_day_close c WHERE c.account_id = a.id) AS last_closed
                FROM money_account a JOIN branch b ON b.id = a.branch_id LEFT JOIN employee e ON e.id = a.cashier_id
                WHERE a.kind = 'CASH' AND a.active AND (CAST(:b AS BIGINT) IS NULL OR a.branch_id = :b)
                ORDER BY b.id, a.id""")
                .param("today", today)
                .param("b", scope)
                .query((rs, n) -> new CashCard(rs.getLong("id"), rs.getLong("branch_id"), rs.getString("branch_name"), rs.getString("code"),
                        rs.getString("name"), rs.getString("cashier"), money(rs.getBigDecimal("balance")), money(rs.getBigDecimal("t_in")),
                        money(rs.getBigDecimal("t_out")), rs.getObject("last_closed", LocalDate.class)))
                .list()
                .stream()
                .filter(c -> actor.canAccessBranch(c.branchId()))
                .toList();
        Money total = cards.stream().map(c -> Money.of(c.balance())).reduce(Money.ZERO, Money::plus);
        return new CashOverview(today, total.toString(), cards);
    }

    private static String money(BigDecimal v) {
        return new Money(v).toString();
    }

    @RestController
    @Tag(name = "cash")
    static class Controller {
        private final CashOverviews overviews;
        private final CurrentActor currentActor;

        Controller(CashOverviews overviews, CurrentActor currentActor) {
            this.overviews = overviews;
            this.currentActor = currentActor;
        }

        @GetMapping("/api/cash/overview")
        @PreAuthorize("hasAuthority('cash.view')")
        @Operation(summary = "Kassalar roʻyxati (kartalar)", description = "Qoldiq, masʼul, bugungi kirim/chiqim, oxirgi yopilgan kun.")
        CashOverview overview(@RequestParam(required = false) Long branchId) {
            Actor a = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
            return overviews.overview(a, branchId);
        }
    }
}
