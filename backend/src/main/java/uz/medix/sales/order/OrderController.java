package uz.medix.sales.order;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.sales.order.OrderModels.OrderDetail;
import uz.medix.sales.order.OrderModels.OrderPage;
import uz.medix.sales.order.OrderModels.OrderReasonRequest;
import uz.medix.sales.order.OrderModels.OrderRequest;
import uz.medix.sales.order.OrderModels.OrderStatus;
import uz.medix.sales.order.OrderModels.PaymentType;
import uz.medix.sales.order.OrderModels.PreviousOrder;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Buyurtmalar (BY). Ruxsatlar (T12): ko'rish — orders.view, yaratish — orders.create, tasdiq — approvals.branch /
 * approvals.director, bekor qilish — orders.cancel (o'z buyurtmasi), orders.manage, orders.cancelPick (Navbatda … Yuklanmoqda).
 */
@RestController
@RequestMapping("/api/orders")
@Tag(name = "orders", description = "Buyurtmalar")
class OrderController {

    private final Orders orders;
    private final OrderPicking picking;
    private final OrderMonitor monitor;
    private final OrderIssues issues;
    private final CurrentActor currentActor;

    OrderController(Orders orders, OrderPicking picking, OrderMonitor monitor, OrderIssues issues, CurrentActor currentActor) {
        this.issues = issues;
        this.orders = orders;
        this.picking = picking;
        this.monitor = monitor;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private static boolean has(Authentication auth, String key) {
        return auth.getAuthorities().stream().anyMatch(a -> key.equals(a.getAuthority()));
    }

    private OrderDetail detail(long id) {
        return orders.find(id, actor()).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('orders.view', 'approvals.view')")
    @Operation(summary = "Buyurtmalar")
    OrderPage list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) OrderStatus status,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "false") boolean mine,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return orders.list(actor(), branchId, status, customerId, q, mine, Math.max(page, 0), Math.clamp(size, 1, 200));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('orders.view', 'approvals.view')")
    @Operation(summary = "Buyurtma", description = "Qoralamada — joriy narxlar, qoldiq va «N ta muammo» paneli.")
    OrderDetail get(@PathVariable long id) {
        return detail(id);
    }

    @GetMapping("/catalog")
    @PreAuthorize("hasAuthority('orders.create')")
    @Operation(summary = "«Mahsulot qo'shish» katalogi", description = "Mavjud qoldiq, mijoz narxi, eng yaqin muddat, min/max.")
    OrderModels.CatalogPage catalog(
            @RequestParam long warehouseId,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "true") boolean inStockOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return orders.catalog(actor(), warehouseId, customerId, q, inStockOnly, Math.max(page, 0), Math.clamp(size, 1, 200));
    }

    @GetMapping("/previous")
    @PreAuthorize("hasAuthority('orders.create')")
    @Operation(summary = "Mijozning oxirgi 5 ta buyurtmasi", description = "«Oldingi buyurtmani takrorlash» uchun.")
    List<PreviousOrder> previous(@RequestParam long customerId) {
        return orders.previous(actor(), customerId);
    }

    @GetMapping("/default-payment-type")
    @PreAuthorize("hasAuthority('orders.create')")
    @Operation(summary = "To'lov turi standarti", description = "Mijozning oxirgi buyurtmasidan, bo'lmasa Perechisleniye.")
    PaymentType defaultPaymentType(@RequestParam long customerId) {
        return orders.defaultPaymentType(customerId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('orders.create')")
    @Operation(summary = "Buyurtma qoralamasi", description = "Raqam darhol beriladi (BY-TSH-000001). Qoldiq va qarzga ta'sir qilmaydi.")
    OrderDetail create(@Valid @RequestBody OrderRequest r) {
        return detail(orders.create(actor(), r));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('orders.create')")
    @Operation(summary = "Qoralamani tahrirlash")
    OrderDetail update(@PathVariable long id, @Valid @RequestBody OrderRequest r) {
        orders.update(actor(), id, r);
        return detail(id);
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAuthority('orders.create')")
    @Operation(summary = "Yuborish", description = "Xato bo'lsa — yuborilmaydi; tasdiq sababi bo'lsa — tasdiqqa, aks holda — Navbatga.")
    OrderDetail submit(@PathVariable long id) {
        orders.submit(actor(), id);
        return detail(id);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAnyAuthority('approvals.branch', 'approvals.director')")
    @Operation(summary = "Tasdiqlash")
    OrderDetail approve(@PathVariable long id, Authentication auth) {
        orders.approve(actor(), id, has(auth, "approvals.branch"), has(auth, "approvals.director"));
        return detail(id);
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAnyAuthority('approvals.branch', 'approvals.director')")
    @Operation(summary = "Rad etish")
    OrderDetail reject(@PathVariable long id, @Valid @RequestBody OrderReasonRequest r, Authentication auth) {
        orders.reject(actor(), id, r.reason(), has(auth, "approvals.branch"), has(auth, "approvals.director"));
        return detail(id);
    }

    @PostMapping("/{id}/return")
    @PreAuthorize("hasAnyAuthority('orders.create', 'approvals.branch', 'approvals.director')")
    @Operation(summary = "Qoralamaga qaytarish", description = "Faqat «Tasdiqlashda» holatidan.")
    OrderDetail returnToDraft(@PathVariable long id, Authentication auth) {
        orders.returnToDraft(actor(), id, has(auth, "approvals.branch") || has(auth, "approvals.director"));
        return detail(id);
    }

    @PostMapping("/{id}/time")
    @PreAuthorize("hasAuthority('orders.queue')")
    @Operation(summary = "Vaqt berish", description = "Yig'ish va markirovka uchun daqiqa (har buyurtmaga alohida). Faqat «Navbatda».")
    OrderDetail giveTime(@PathVariable long id, @Valid @RequestBody OrderModels.TimeRequest r) {
        picking.giveTime(actor(), id, r.pickMinutes(), r.markMinutes());
        return detail(id);
    }

    @GetMapping("/monitor")
    @PreAuthorize("hasAuthority('orders.queue')")
    @Operation(summary = "Ombor mudiri monitori", description = "Bosqichlar ustunlari, taymerlar, kechikkanlar (Navbatda … Yuklanmoqda).")
    OrderMonitor.MonitorBoard monitor(@RequestParam(required = false) Long branchId) {
        return monitor.board(actor(), branchId);
    }

    @PostMapping("/{id}/issues")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyAuthority('picking.do', 'marking.scan', 'trip.driver')")
    @Operation(summary = "«Muammo bor»", description = "Sabab tanlanadi; xabar Ombor mudiriga keladi, taymer to'xtamaydi.")
    OrderIssues.OrderIssueItem reportIssue(@PathVariable long id, @Valid @RequestBody OrderIssues.IssueRequest r) {
        return issues.report(actor(), id, r.reason(), r.note());
    }

    @GetMapping("/issues")
    @PreAuthorize("hasAuthority('orders.queue')")
    @Operation(summary = "Muammolar", description = "Ombor mudiri paneli: ochiq (standart) yoki barchasi; buyurtma bo'yicha.")
    List<OrderIssues.OrderIssueItem> listIssues(@RequestParam(required = false) Long orderId, @RequestParam(defaultValue = "true") boolean open) {
        return issues.list(actor(), orderId, open);
    }

    @PostMapping("/issues/{issueId}/resolve")
    @PreAuthorize("hasAuthority('orders.queue')")
    @Operation(summary = "Muammoni hal qilindi deb belgilash")
    OrderIssues.OrderIssueItem resolveIssue(@PathVariable long issueId, @Valid @RequestBody OrderIssues.ResolveRequest r) {
        return issues.resolve(actor(), issueId, r.resolution());
    }

    @GetMapping("/pick-queue")
    @PreAuthorize("hasAnyAuthority('picking.do', 'orders.queue')")
    @Operation(summary = "Yig'uvchi navbati", description = "Vaqt berilgan «Navbatda» va «Yig'ilmoqda» buyurtmalar.")
    List<OrderModels.PickQueueItem> pickQueue() {
        return picking.queue(actor());
    }

    @PostMapping("/{id}/pick/start")
    @PreAuthorize("hasAuthority('picking.do')")
    @Operation(summary = "Yig'ishni boshlash", description = "Bir yig'uvchida bitta faol buyurtma.")
    OrderDetail pickStart(@PathVariable long id) {
        picking.start(actor(), id);
        return detail(id);
    }

    @PostMapping("/{id}/pick/finish")
    @PreAuthorize("hasAuthority('picking.do')")
    @Operation(summary = "Yig'ishni yakunlash", description = "Partiya tasdig'i; tovar Jo'natish zonasiga o'tadi.")
    OrderDetail pickFinish(@PathVariable long id, @Valid @RequestBody OrderModels.PickFinishRequest r) {
        picking.finish(actor(), id, r.lines());
        return detail(id);
    }

    @PostMapping("/{id}/check")
    @PreAuthorize("hasAuthority('orders.check')")
    @Operation(summary = "Hisobdan o'tkazish", description = "Barcha qatorlar «Tekshirildi» va joylar soni → «Hujjatlashtirilmoqda».")
    OrderDetail check(@PathVariable long id, @Valid @RequestBody OrderModels.CheckRequest r) {
        picking.check(actor(), id, r.checkedLines(), r.places());
        return detail(id);
    }

    @PostMapping("/{id}/return-to-pick")
    @PreAuthorize("hasAuthority('orders.check')")
    @Operation(summary = "Yig'ishga qaytarish", description = "Sabab bilan; tovar olingan joyiga qaytadi, zahira qayta qo'yiladi.")
    OrderDetail returnToPick(@PathVariable long id, @Valid @RequestBody OrderReasonRequest r) {
        picking.returnToPick(actor(), id, r.reason());
        return detail(id);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyAuthority('orders.cancel', 'orders.manage', 'orders.cancelPick')")
    @Operation(summary = "Bekor qilish", description = "Sabab majburiy. «Yo'lda» va undan keyin bekor qilinmaydi.")
    OrderDetail cancel(@PathVariable long id, @Valid @RequestBody OrderReasonRequest r, Authentication auth) {
        orders.cancel(actor(), id, r.reason(), has(auth, "orders.cancel"), has(auth, "orders.manage"), has(auth, "orders.cancelPick"));
        return detail(id);
    }
}
