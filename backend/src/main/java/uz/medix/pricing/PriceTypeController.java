package uz.medix.pricing;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Narx turlari (SPEC 6: 8 ta, o'zgarmas ro'yxat). Narxlarning o'zi — 3-bosqichda. */
@RestController
@RequestMapping("/api/price-types")
@Tag(name = "pricing", description = "Narxlar")
class PriceTypeController {

    record PriceType(long id, String code, String name, boolean base, boolean batch) {}

    private final JdbcClient jdbc;

    PriceTypeController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "Narx turlari")
    List<PriceType> list() {
        return jdbc.sql("SELECT id, code, name, base, batch FROM price_type WHERE active ORDER BY sort_order").query(PriceType.class).list();
    }
}
