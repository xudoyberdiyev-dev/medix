package uz.medix.inventory.transfer;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.inventory.transfer.BranchSaleModels.BranchRef;
import uz.medix.inventory.transfer.BranchSaleModels.BranchSaleSummary;
import uz.medix.inventory.transfer.WarehouseTransferModels.WarehouseTransferSummary;
import uz.medix.inventory.transfer.ZoneTransferModels.ZoneTransferSummary;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Ko'chirish — bitta ro'yxat (prototip «Transfers»): ZK + OK + FS. Har tur faqat o'z ko'rish ruxsati bo'lsa qo'shiladi; filial
 * doirasi har turning o'z servisida. Summa — faqat FS va special.cost bilan.
 */
@RestController
@RequestMapping("/api/transfers")
@Tag(name = "transfer-overview", description = "Ko'chirish — ZK, OK, FS bitta ro'yxatda")
class TransferOverviewController {

    static final int PER_KIND = 200;

    private static final Set<String> ZK_VIEW = Set.of("transfer.view", "transfer.zk", "transfer.quar");
    private static final Set<String> OK_VIEW = Set.of("transfer.view", "transfer.ok", "transfer.send", "transfer.receive");
    private static final Set<String> FS_VIEW = Set.of("transfer.view", "transfer.fs", "transfer.send", "transfer.receive");

    enum Kind { ZK, OK, FS }

    /** Prototip holatlari: OK/FS «Qabul qilindi» yetishmovchilik bilan — DIFF. */
    enum State { PENDING, POSTED, REJECTED, DRAFT, TRANSIT, RECEIVED, DIFF, CANCELLED }

    /** OUT — shu filialdan chiquvchi (FS sotuvchi), IN — kiruvchi (FS xaridor), INTERNAL — filial ichida (ZK, OK). */
    enum Direction { INTERNAL, OUT, IN }

    record Place(@Schema(nullable = true) BranchRef branch, String warehouse, @Schema(nullable = true) String zone) {}

    record TransferItem(Kind kind, long id, String number, Instant createdAt, Place from, Place to, State state,
            Direction direction, int lines, long qty, int shortageQty,
            @Schema(nullable = true, description = "Faqat FS va special.cost ruxsati bilan") String total,
            @Schema(nullable = true) String invoiceNumber, String createdBy) {}

    record TransferOverview(List<TransferItem> items, boolean truncated) {}

    private final ZoneTransfers zones;
    private final WarehouseTransfers warehouses;
    private final BranchSales sales;
    private final CurrentActor currentActor;

    TransferOverviewController(ZoneTransfers zones, WarehouseTransfers warehouses, BranchSales sales, CurrentActor currentActor) {
        this.zones = zones;
        this.warehouses = warehouses;
        this.sales = sales;
        this.currentActor = currentActor;
    }

    private static boolean any(Set<String> auths, Set<String> need) {
        return auths.stream().anyMatch(need::contains);
    }

    @GetMapping("/overview")
    @PreAuthorize("hasAnyAuthority('transfer.view', 'transfer.zk', 'transfer.quar', 'transfer.ok', 'transfer.fs', 'transfer.send',"
            + " 'transfer.receive')")
    @Operation(summary = "Ko'chirishlar (ZK, OK, FS)", description = "Har turdan oxirgi " + PER_KIND + " ta; branchId — filial.")
    TransferOverview overview(@RequestParam(required = false) Long branchId, Authentication auth) {
        Actor actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        Set<String> auths = auth.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(java.util.stream.Collectors.toSet());
        boolean canCost = auths.contains("special.cost");
        Long me = branchId != null ? branchId : actor.allBranches() ? null : actor.branchId();
        List<TransferItem> items = new ArrayList<>();
        boolean truncated = false;
        if (any(auths, ZK_VIEW)) {
            var page = zones.list(actor, branchId, null, null, 0, PER_KIND);
            truncated |= page.total() > page.items().size();
            page.items().forEach(z -> items.add(zk(z)));
        }
        if (any(auths, OK_VIEW)) {
            var page = warehouses.list(actor, branchId, null, null, 0, PER_KIND);
            truncated |= page.total() > page.items().size();
            page.items().forEach(o -> items.add(ok(o)));
        }
        if (any(auths, FS_VIEW)) {
            var page = sales.list(actor, branchId, null, 0, PER_KIND, canCost);
            truncated |= page.total() > page.items().size();
            page.items().forEach(f -> items.add(fs(f, me)));
        }
        items.sort(Comparator.comparing(TransferItem::createdAt).reversed().thenComparing(TransferItem::id, Comparator.reverseOrder()));
        return new TransferOverview(items, truncated);
    }

    private static TransferItem zk(ZoneTransferSummary z) {
        State s = switch (z.status()) {
            case PENDING -> State.PENDING;
            case POSTED -> State.POSTED;
            case REJECTED -> State.REJECTED;
        };
        return new TransferItem(Kind.ZK, z.id(), z.number(), z.createdAt(), new Place(null, z.warehouse(), z.from().name()),
                new Place(null, z.warehouse(), z.to().name()), s, Direction.INTERNAL, z.lines(), z.qty(), 0, null, null, z.createdBy());
    }

    static State state(WarehouseTransferModels.Status st, int shortage) {
        return switch (st) {
            case DRAFT -> State.DRAFT;
            case IN_TRANSIT -> State.TRANSIT;
            case RECEIVED -> shortage > 0 ? State.DIFF : State.RECEIVED;
            case CANCELLED -> State.CANCELLED;
        };
    }

    private static TransferItem ok(WarehouseTransferSummary o) {
        return new TransferItem(Kind.OK, o.id(), o.number(), o.createdAt(),
                new Place(null, o.fromWarehouse().name(), o.fromZone() == null ? null : o.fromZone().name()),
                new Place(null, o.toWarehouse().name(), o.toZone() == null ? null : o.toZone().name()), state(o.status(), o.shortageQty()),
                Direction.INTERNAL, o.lines(), o.qty(), o.shortageQty(), null, null, o.createdBy());
    }

    private static TransferItem fs(BranchSaleSummary f, Long me) {
        Direction d = me == null ? Direction.OUT : f.buyer().id() == me ? Direction.IN : Direction.OUT;
        return new TransferItem(Kind.FS, f.id(), f.number(), f.createdAt(),
                new Place(f.seller(), f.fromWarehouse().name(), f.fromZone() == null ? null : f.fromZone().name()),
                new Place(f.buyer(), f.toWarehouse().name(), f.toZone() == null ? null : f.toZone().name()), state(f.status(), f.shortageQty()),
                d, f.lines(), f.qty(), f.shortageQty(), f.total(), f.invoiceNumber(), f.createdBy());
    }
}
