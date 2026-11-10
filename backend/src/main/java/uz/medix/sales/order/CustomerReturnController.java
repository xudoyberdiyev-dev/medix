package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.sales.order.CustomerReturnModels.CustomerReturnDetail;
import uz.medix.sales.order.CustomerReturnModels.CustomerReturnPage;
import uz.medix.sales.order.CustomerReturnModels.CustomerReturnRejectRequest;
import uz.medix.sales.order.CustomerReturnModels.CustomerReturnRequest;
import uz.medix.sales.order.CustomerReturnModels.ReturnableLine;
import uz.medix.sales.order.CustomerReturnModels.ReturnableSale;
import uz.medix.sales.order.CustomerReturnModels.Status;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * QM — mijozdan qaytarish. Ruxsatlar: ko'rish — qm.view, yaratish — qm.create (Operator), qabul qilish / rad etish — qm.approve
 * (Ombor mudiri). Filial doirasi serverda; tannarx yuborilmaydi.
 */
@RestController
@RequestMapping("/api/customer-returns")
@Tag(name = "customer-return", description = "Mijozdan qaytarish (QM)")
class CustomerReturnController {

    private static final String VIEW = "hasAnyAuthority('qm.view', 'qm.create', 'qm.approve', 'qm.cancelPosted')";

    private final CustomerReturns returns;
    private final CurrentActor currentActor;
    private final CustomerReturnPdf pdf;

    CustomerReturnController(CustomerReturns returns, CurrentActor currentActor, CustomerReturnPdf pdf) {
        this.pdf = pdf;
        this.returns = returns;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private CustomerReturnDetail detail(long id) {
        return returns.find(id, actor()).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @GetMapping
    @PreAuthorize(VIEW)
    @Operation(summary = "QM hujjatlari", description = "Qidiruv: raqam, mijoz, sotuv raqami.")
    CustomerReturnPage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) Long saleId,
            @RequestParam(required = false) Status status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return returns.list(actor(), branchId, customerId, saleId, status, q, Math.max(page, 0), Math.clamp(size, 1, 200));
    }

    @GetMapping("/{id}")
    @PreAuthorize(VIEW)
    @Operation(summary = "QM hujjati")
    CustomerReturnDetail get(@PathVariable long id) {
        return detail(id);
    }

    @GetMapping(value = "/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize(VIEW)
    @Operation(summary = "QM dalolatnomasi — PDF (chop etish)")
    ResponseEntity<byte[]> customerReturnPdf(@PathVariable long id) {
        return pdf.render(actor(), id).response();
    }

    @GetMapping("/sales")
    @PreAuthorize("hasAuthority('qm.create')")
    @Operation(summary = "Mijozning yetkazilgan sotuvlari", description = "Qaytarsa bo'ladigan qatorlar soni bilan; filial doirasida.")
    List<ReturnableSale> sales(@RequestParam long customerId, @RequestParam(required = false) Long branchId) {
        return returns.sales(actor(), customerId, branchId);
    }

    @GetMapping("/sales/{saleId}/lines")
    @PreAuthorize("hasAuthority('qm.create')")
    @Operation(summary = "Sotuv qatorlari", description = "Sotilgan / avval qaytarilgan (o'tkazilgan + kutilayotgan) / qoldi; narx — sotuv narxi.")
    List<ReturnableLine> saleLines(@PathVariable long saleId) {
        return returns.saleLines(actor(), saleId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('qm.create')")
    @Operation(summary = "Mijozdan qaytarish",
            description = "«Qabul kutilmoqda» holatida yaratiladi; yaratuvchida qm.approve bo'lsa darhol qabul qilinadi.")
    CustomerReturnDetail create(@Valid @RequestBody CustomerReturnRequest r, Authentication auth) {
        boolean canApprove = auth.getAuthorities().stream().anyMatch(a -> "qm.approve".equals(a.getAuthority()));
        return detail(returns.create(actor(), r, canApprove));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('qm.approve')")
    @Operation(summary = "Qabul qilish", description = "Tovar Karantin zonasiga kiradi, mijoz qarzi qaytarish summasiga kamayadi.")
    CustomerReturnDetail approve(@PathVariable long id) {
        returns.approve(actor(), id);
        return detail(id);
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('qm.approve')")
    @Operation(summary = "Rad etish", description = "Hech narsa o'zgarmaydi; qaytarish miqdori bo'shaydi.")
    CustomerReturnDetail reject(@PathVariable long id, @Valid @RequestBody CustomerReturnRejectRequest r) {
        returns.reject(actor(), id, r.reason());
        return detail(id);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('qm.cancelPosted')")
    @Operation(summary = "O'tkazilganini bekor qilish",
            description = "Karantindan tovar chiqadi, mijoz qarzi qaytadi, hisobotlardan chiqadi. Partiya keyingi hujjat bilan chiqarilgan bo'lsa — 409 qm.cancelBlocked.")
    CustomerReturnDetail cancel(@PathVariable long id, @Valid @RequestBody CustomerReturnRejectRequest r) {
        returns.cancel(actor(), id, r.reason());
        return detail(id);
    }
}
