package uz.medix.reporting.home;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.CurrentActor;

/** Operator bosh sahifasi (SPEC 8): reports.own — faqat o'zi kiritgan buyurtmalar. */
@RestController
@Tag(name = "home", description = "Bosh sahifalar")
class OperatorHomeController {

    private final OperatorHome home;
    private final CurrentActor currentActor;

    OperatorHomeController(OperatorHome home, CurrentActor currentActor) {
        this.home = home;
        this.currentActor = currentActor;
    }

    @GetMapping("/api/home/operator")
    @PreAuthorize("hasAuthority('reports.own')")
    @Operation(summary = "Operator bosh sahifasi: o'z sof savdosi, buyurtma holatlari, «Diqqat talab qiladi», eng katta mijozlar")
    OperatorHome.OperatorHomeView operatorHome(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return home.home(currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized")), from, to);
    }

    @GetMapping("/api/home/operator/customers")
    @PreAuthorize("hasAuthority('orders.create')")
    @Operation(summary = "«Mijoz holati»: nomi yoki STIR bo'yicha 3 ta mijoz — bloklangan, litsenziya, qarz / limit, muddati o'tgan (o'z filiali)")
    List<OperatorHome.CustomerStatus> customers(@RequestParam String q) {
        return home.customers(currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized")), q);
    }
}
