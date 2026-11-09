package uz.medix.finance.payment;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * «To'lovlar» ro'yxati (prototip `Payments`): MT (mijozdan kirim) va YT (yetkazib beruvchiga chiqim) bitta jadvalda —
 * kartalar, ko'rinishlar, filtrlar va jamilar brauzerda hisoblanadi. Filial doirasi serverda.
 */
@Service
class PaymentOverviews {

    enum PaymentKind { MT, YT }

    enum PaymentOverviewStatus { DRAFT, PENDING, POSTED, CANCELLED }

    record PaymentOverviewRow(
            PaymentKind kind,
            long id,
            String number,
            long branchId,
            String branchCode,
            LocalDate paymentDate,
            long partyId,
            String party,
            @Schema(nullable = true, description = "MT — mijoz hududi, YT — STIR") String partySub,
            long accountId,
            String account,
            @Schema(allowableValues = {"CASH", "TERMINAL", "BANK"}) String accountKind,
            String amount,
            @Schema(nullable = true, description = "Hujjatlarga taqsimlangan (faqat o'tkazilgan/bekor qilinganda)") String allocated,
            @Schema(nullable = true, description = "Avans (taqsimlanmagan qism)") String advance,
            PaymentOverviewStatus status,
            @Schema(description = "MT: MANUAL / DRIVER; YT: MANUAL") String source,
            String createdBy,
            Instant createdAt) {}

    record PaymentOverview(@Schema(description = "Bugun (Asia/Tashkent)") LocalDate today, List<PaymentOverviewRow> rows) {}

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");
    private static final int LIMIT = 3000;

    private final JdbcClient jdbc;

    PaymentOverviews(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    PaymentOverview overview(Actor actor, Long branchId, LocalDate from, LocalDate to) {
        Long scope = actor.allBranches() ? branchId : actor.branchId();
        List<PaymentOverviewRow> rows = jdbc.sql("""
                SELECT * FROM (
                    SELECT 'MT' AS kind, p.id, p.number, p.branch_id, br.code AS branch_code, p.payment_date, p.customer_id AS party_id,
                           c.name AS party, r.name AS party_sub, p.account_id, a.name AS account, a.kind AS account_kind, p.amount, p.advance,
                           p.status, p.source, cb.full_name AS created_by, p.created_at
                    FROM customer_payment p JOIN counterparty c ON c.id = p.customer_id LEFT JOIN region r ON r.id = c.region_id
                    JOIN money_account a ON a.id = p.account_id JOIN branch br ON br.id = p.branch_id JOIN employee cb ON cb.id = p.created_by
                    WHERE (CAST(:b AS BIGINT) IS NULL OR p.branch_id = :b)
                      AND (CAST(:f AS DATE) IS NULL OR p.payment_date >= :f) AND (CAST(:t AS DATE) IS NULL OR p.payment_date <= :t)
                    UNION ALL
                    SELECT 'YT', p.id, p.number, p.branch_id, br.code, p.payment_date, p.supplier_id, s.name, s.tin, p.account_id, a.name, a.kind,
                           p.amount, p.advance, p.status, 'MANUAL', cb.full_name, p.created_at
                    FROM supplier_payment p JOIN counterparty s ON s.id = p.supplier_id
                    JOIN money_account a ON a.id = p.account_id JOIN branch br ON br.id = p.branch_id JOIN employee cb ON cb.id = p.created_by
                    WHERE (CAST(:b AS BIGINT) IS NULL OR p.branch_id = :b)
                      AND (CAST(:f AS DATE) IS NULL OR p.payment_date >= :f) AND (CAST(:t AS DATE) IS NULL OR p.payment_date <= :t)
                ) x ORDER BY payment_date DESC, created_at DESC, id DESC LIMIT :lim""")
                .param("b", scope)
                .param("f", from == null ? null : java.sql.Date.valueOf(from))
                .param("t", to == null ? null : java.sql.Date.valueOf(to))
                .param("lim", LIMIT)
                .query((rs, n) -> {
                    if (!actor.canAccessBranch(rs.getLong("branch_id"))) {
                        return null;
                    }
                    PaymentOverviewStatus st = PaymentOverviewStatus.valueOf(rs.getString("status"));
                    BigDecimal amount = rs.getBigDecimal("amount");
                    BigDecimal adv = rs.getBigDecimal("advance");
                    boolean settled = adv != null && (st == PaymentOverviewStatus.POSTED || st == PaymentOverviewStatus.CANCELLED);
                    return new PaymentOverviewRow(PaymentKind.valueOf(rs.getString("kind")), rs.getLong("id"), rs.getString("number"),
                            rs.getLong("branch_id"), rs.getString("branch_code"), rs.getDate("payment_date").toLocalDate(), rs.getLong("party_id"),
                            rs.getString("party"), rs.getString("party_sub"), rs.getLong("account_id"), rs.getString("account"),
                            rs.getString("account_kind"), new Money(amount).toString(),
                            settled ? new Money(amount.subtract(adv)).toString() : null, settled ? new Money(adv).toString() : null, st,
                            rs.getString("source"), rs.getString("created_by"), rs.getTimestamp("created_at").toInstant());
                })
                .list()
                .stream()
                .filter(Objects::nonNull)
                .toList();
        return new PaymentOverview(LocalDate.now(TASHKENT), rows);
    }
}

@RestController
@RequestMapping("/api/payments")
@Tag(name = "payments", description = "Mijozdan to'lovlar (MT)")
class PaymentOverviewController {

    private final PaymentOverviews overviews;
    private final CurrentActor currentActor;

    PaymentOverviewController(PaymentOverviews overviews, CurrentActor currentActor) {
        this.overviews = overviews;
        this.currentActor = currentActor;
    }

    @GetMapping("/overview")
    @PreAuthorize("hasAuthority('payments.view')")
    @Operation(summary = "To'lovlar ro'yxati: MT + YT bitta jadvalda (prototip Payments)")
    PaymentOverviews.PaymentOverview overview(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        Actor actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        return overviews.overview(actor, branchId, from, to);
    }
}
