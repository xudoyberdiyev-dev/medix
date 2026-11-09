package uz.medix.finance.opening;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.finance.opening.OpeningFinanceModels.CancelRequest;
import uz.medix.finance.opening.OpeningFinanceModels.OpeningFinanceDetail;
import uz.medix.finance.opening.OpeningFinanceModels.OpeningFinanceRequest;
import uz.medix.finance.opening.OpeningFinanceModels.OpeningFinanceSummary;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * BQ — mijozlar qarzi, YB qarzi, kassa va bank. Ruxsatlar: ko'rish — opening.list / opening.view, qoralama — opening.create,
 * o'tkazish — opening.approve, qoralamani bekor qilish — opening.create yoki opening.cancel. Filial doirasi serverda.
 */
@RestController
@RequestMapping("/api/opening-finance")
@Tag(name = "opening-finance", description = "Boshlang'ich qoldiq: qarzlar, kassa va bank")
class OpeningFinanceController {

    private static final String VIEW = "hasAnyAuthority('opening.list', 'opening.view')";

    private final OpeningFinances openings;
    private final CurrentActor currentActor;

    OpeningFinanceController(OpeningFinances openings, CurrentActor currentActor) {
        this.openings = openings;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private OpeningFinanceDetail detail(long id) {
        return openings.find(id, actor()).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @GetMapping
    @PreAuthorize(VIEW)
    @Operation(summary = "BQ (pul turlari) ro'yxati", description = "Oxirgi 500 ta.")
    List<OpeningFinanceSummary> list(@RequestParam(required = false) Long branchId) {
        return openings.list(actor(), branchId);
    }

    @GetMapping("/{id}")
    @PreAuthorize(VIEW)
    @Operation(summary = "BQ (pul turlari) hujjati")
    OpeningFinanceDetail get(@PathVariable long id) {
        return detail(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('opening.create')")
    @Operation(summary = "Qoralama")
    OpeningFinanceDetail create(@Valid @RequestBody OpeningFinanceRequest r) {
        return detail(openings.create(r, actor()));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('opening.create')")
    @Operation(summary = "Qoralamani saqlash")
    OpeningFinanceDetail update(@PathVariable long id, @Valid @RequestBody OpeningFinanceRequest r) {
        openings.update(id, r, actor());
        return detail(id);
    }

    @PostMapping("/{id}/post")
    @PreAuthorize("hasAuthority('opening.approve')")
    @Operation(summary = "O'tkazish", description = "Qarz jurnali yoki kassa/bank jurnaliga yoziladi; filial va tur bo'yicha bitta.")
    OpeningFinanceDetail post(@PathVariable long id) {
        openings.post(id, actor());
        return detail(id);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyAuthority('opening.create', 'opening.cancel')")
    @Operation(summary = "Qoralamani bekor qilish")
    OpeningFinanceDetail cancel(@PathVariable long id, @Valid @RequestBody CancelRequest r) {
        openings.cancel(id, r.reason(), actor());
        return detail(id);
    }
}
