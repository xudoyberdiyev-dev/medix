package uz.medix.pricing;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
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
 * Mahsulot narxi tarixi (prototip `PriceHistoryPanel`, kartochka «Narxlar»): filial va narx turi bo'yicha kuchga kirish sanasi,
 * narx, oldingisiga nisbatan o'zgarish (%), NO hujjati va kim kiritgani; joriy va kelajakdagi narx belgilanadi.
 */
@RestController
@RequestMapping("/api/prices/history")
@Tag(name = "pricing", description = "Narxlar")
class PriceHistoryController {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    record PriceHistoryRow(
            LocalDate effectiveFrom,
            String amount,
            @Schema(nullable = true, description = "Oldingi narxga nisbatan, %, bir xona aniqlikda (masalan «5.3», «-2.0»)") String changePct,
            long priceChangeId,
            String priceChangeNumber,
            @Schema(nullable = true) String employee,
            boolean current,
            boolean future) {}

    record PriceHistory(long branchId, long priceTypeId, String priceTypeName, List<PriceHistoryRow> rows) {}

    private final JdbcClient jdbc;
    private final CurrentActor currentActor;
    private final Clock clock;

    PriceHistoryController(JdbcClient jdbc, CurrentActor currentActor, Clock clock) {
        this.jdbc = jdbc;
        this.currentActor = currentActor;
        this.clock = clock;
    }

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "Mahsulot narxi tarixi", description = "branchId berilmasa — o'z filiali (yoki birinchi filial); priceTypeId — bazaviy.")
    PriceHistory history(@RequestParam long productId, @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long priceTypeId) {
        Actor actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        long branch = branchId != null ? branchId : actor.branchId() != null ? actor.branchId()
                : jdbc.sql("SELECT min(id) FROM branch WHERE active").query(Long.class).optional().orElse(-1L);
        if (!actor.canAccessBranch(branch)) {
            throw MedixException.forbidden("auth.forbidden");
        }
        record Type(long id, String name) {}
        Type type = jdbc.sql(priceTypeId == null ? "SELECT id, name FROM price_type WHERE base" : "SELECT id, name FROM price_type WHERE id = :t")
                .param("t", priceTypeId == null ? -1L : priceTypeId)
                .query(Type.class)
                .optional()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
        LocalDate today = LocalDate.now(clock.withZone(TASHKENT));
        record Raw(LocalDate effectiveFrom, BigDecimal amount, long priceChangeId, String number, String employee) {}
        List<Raw> raw = jdbc.sql("""
                SELECT x.effective_from, x.amount, x.price_change_id, c.number, e.full_name AS employee
                FROM price x JOIN price_change c ON c.id = x.price_change_id LEFT JOIN employee e ON e.id = c.created_by
                WHERE x.product_id = :p AND x.branch_id = :b AND x.price_type_id = :t
                ORDER BY x.effective_from, x.id""")
                .param("p", productId)
                .param("b", branch)
                .param("t", type.id())
                .query(Raw.class)
                .list();
        // Joriy — bugungacha kuchga kirganlarning oxirgisi
        int currentIdx = -1;
        for (int i = 0; i < raw.size(); i++) {
            if (!raw.get(i).effectiveFrom().isAfter(today)) {
                currentIdx = i;
            }
        }
        List<PriceHistoryRow> rows = new ArrayList<>();
        for (int i = raw.size() - 1; i >= 0; i--) {
            Raw r = raw.get(i);
            String pct = null;
            if (i > 0 && raw.get(i - 1).amount().signum() > 0) {
                BigDecimal prev = raw.get(i - 1).amount();
                pct = r.amount().subtract(prev).multiply(BigDecimal.valueOf(100)).divide(prev, 1, RoundingMode.HALF_UP).toPlainString();
            }
            rows.add(new PriceHistoryRow(r.effectiveFrom(), new Money(r.amount()).toString(), pct, r.priceChangeId(), r.number(), r.employee(),
                    i == currentIdx, r.effectiveFrom().isAfter(today)));
        }
        return new PriceHistory(branch, type.id(), type.name(), rows);
    }
}
