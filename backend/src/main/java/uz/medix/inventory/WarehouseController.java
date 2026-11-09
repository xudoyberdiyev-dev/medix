package uz.medix.inventory;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Omborlar va zonalar (Boshqaruv → Omborlar va zonalar). Ko'rish — har bir kirgan xodim o'z filiali doirasida;
 * o'zgartirish — Direktor, Bosh administrator va Filial rahbari (o'z filiali — «filial sozlamalari», SPEC 3).
 */
@RestController
@RequestMapping("/api/warehouses")
@Tag(name = "warehouses", description = "Omborlar va zonalar")
class WarehouseController {

    private static final String MANAGE = "hasAuthority('warehouses.view')";

    record CreateWarehouseRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @Schema(nullable = true) @Size(max = 500) String address,
            @Schema(nullable = true) Set<ZoneType> extraZones) {}

    record UpdateWarehouseRequest(
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @Schema(nullable = true) @Size(max = 500) String address) {}

    /** Ombor kartasi (prototip WarehousePanel): tur, masʼul, ixtiyoriy zonalar va zona nomlari. */
    record WarehouseCardRequest(
            @NotNull(message = "{validation.required}") Long branchId,
            @NotBlank(message = "{validation.required}") @Size(max = 200) String name,
            @Schema(nullable = true) @Size(max = 500) String address,
            @Schema(nullable = true) Set<ZoneType> extraZones,
            @Schema(nullable = true, description = "Ombor turi; berilmasa — NORMAL") WarehouseKind kind,
            @Schema(nullable = true, description = "Masʼul ombor mudiri (shu filial xodimi)") Long keeperId,
            @Schema(nullable = true, description = "Zona nomlari turi boʻyicha; berilmagani — standart nom")
            Map<ZoneType, String> zoneNames) {

        Warehouses.Spec spec() {
            return new Warehouses.Spec(name, address, kind, keeperId, extraZones == null ? Set.of() : extraZones, zoneNames);
        }
    }

    record AddZoneRequest(@NotNull(message = "{validation.required}") ZoneType type,
            @Schema(nullable = true) @Size(max = 100) String name) {}

    record ZoneSellableRequest(@NotNull(message = "{validation.required}") Boolean sellable) {}

    record RenameZoneRequest(@NotBlank(message = "{validation.required}") @Size(max = 100) String name) {}

    record DeactivateRequest(@NotBlank(message = "{validation.required}") @Size(max = 300) String reason) {}

    private final Warehouses warehouses;
    private final WarehouseOverview overview;
    private final CurrentActor currentActor;

    WarehouseController(Warehouses warehouses, WarehouseOverview overview, CurrentActor currentActor) {
        this.warehouses = warehouses;
        this.overview = overview;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    @GetMapping
    @Operation(summary = "Ko'rish mumkin bo'lgan omborlar va ularning zonalari")
    List<Warehouses.Warehouse> list() {
        Actor a = actor();
        if (a.allBranches()) {
            return warehouses.listAll();
        }
        return a.branchId() == null ? List.of() : warehouses.listByBranches(List.of(a.branchId()));
    }

    @GetMapping("/overview")
    @Operation(summary = "Omborlar va zonalar sahifasi: filial → ombor, omborchi, zonalar qoldig'i bilan")
    List<WarehouseOverview.WarehouseOverviewItem> overview() {
        Actor a = actor();
        if (a.allBranches()) {
            return overview.list(null);
        }
        return a.branchId() == null ? List.of() : overview.list(a.branchId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(MANAGE)
    @Operation(summary = "Ombor qo'shish", description = "Qabul, Asosiy saqlash, Karantin, Jo'natish zonalari doim yaratiladi.")
    Warehouses.Warehouse create(@Valid @RequestBody CreateWarehouseRequest r) {
        if (!actor().canAccessBranch(r.branchId()) || !warehouses.branchActive(r.branchId())) {
            throw MedixException.badRequest("employee.branchUnknown");
        }
        Set<ZoneType> extra = r.extraZones() == null ? Set.of() : r.extraZones();
        if (extra.stream().anyMatch(ZoneType.REQUIRED::contains)) {
            throw MedixException.badRequest("warehouse.extraZones");
        }
        return warehouses.create(r.branchId(), r.name(), r.address(), extra);
    }

    @PostMapping("/card")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(MANAGE)
    @Operation(summary = "Ombor qo'shish (karta: tur, masʼul, zonalar)")
    Warehouses.Warehouse createCard(@Valid @RequestBody WarehouseCardRequest r) {
        if (!actor().canAccessBranch(r.branchId()) || !warehouses.branchActive(r.branchId())) {
            throw MedixException.badRequest("employee.branchUnknown");
        }
        warehouses.checkKeeper(r.keeperId(), r.branchId());
        return warehouses.create(r.branchId(), r.spec());
    }

    @PutMapping("/{id}/card")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Ombor kartasini saqlash (tur, masʼul, zonalar)")
    Warehouses.Warehouse updateCard(@PathVariable long id, @Valid @RequestBody WarehouseCardRequest r) {
        Warehouses.Warehouse w = scoped(id);
        if (w.branchId() != r.branchId()) {
            throw MedixException.badRequest("warehouse.branchFixed");
        }
        warehouses.checkKeeper(r.keeperId(), w.branchId());
        return warehouses.configure(id, r.spec());
    }

    @PutMapping("/{id}")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Omborni tahrirlash")
    Warehouses.Warehouse update(@PathVariable long id, @Valid @RequestBody UpdateWarehouseRequest r) {
        scoped(id);
        return warehouses.update(id, r.name(), r.address());
    }

    @PostMapping("/{id}/zones")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(MANAGE)
    @Operation(summary = "Zona qo'shish (Asosiy saqlash, Sovuq yoki Seyf; bir turdagi bir nechta — nomi bilan farqlanadi)")
    Warehouses.Warehouse addZone(@PathVariable long id, @Valid @RequestBody AddZoneRequest r) {
        scoped(id);
        return warehouses.addZone(id, r.type(), r.name());
    }

    @PutMapping("/{id}/zones/{zoneId}")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Zona nomini o'zgartirish")
    Warehouses.Warehouse renameZone(@PathVariable long id, @PathVariable long zoneId, @Valid @RequestBody RenameZoneRequest r) {
        scoped(id);
        return warehouses.renameZone(id, zoneId, r.name());
    }

    @PutMapping("/{id}/zones/{zoneId}/sellable")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Zona «Sotuvga ochiq» almashtirgichi", description = "Qabul, Karantin, Joʻnatish zonalari doim sotuvga yopiq.")
    Warehouses.Warehouse setZoneSellable(@PathVariable long id, @PathVariable long zoneId, @Valid @RequestBody ZoneSellableRequest r) {
        scoped(id);
        return warehouses.setZoneSellable(id, zoneId, r.sellable());
    }

    @PostMapping("/{id}/zones/{zoneId}/close")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Zonani yopish", description = "Majburiy zona va qoldig'i bor zona yopilmaydi.")
    Warehouses.Warehouse closeZone(@PathVariable long id, @PathVariable long zoneId) {
        scoped(id);
        return warehouses.setZoneActive(id, zoneId, false);
    }

    @PostMapping("/{id}/zones/{zoneId}/reopen")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Zonani qayta ochish")
    Warehouses.Warehouse reopenZone(@PathVariable long id, @PathVariable long zoneId) {
        scoped(id);
        return warehouses.setZoneActive(id, zoneId, true);
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Omborni nofaol qilish")
    Warehouses.Warehouse deactivate(@PathVariable long id, @Valid @RequestBody DeactivateRequest r) {
        scoped(id);
        return warehouses.setActive(id, false, r.reason());
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Omborni faollashtirish")
    Warehouses.Warehouse activate(@PathVariable long id) {
        scoped(id);
        return warehouses.setActive(id, true, null);
    }

    /** Boshqa filial ombori — 404 (mavjudligi oshkor qilinmaydi). */
    private Warehouses.Warehouse scoped(long id) {
        Actor a = actor();
        return warehouses.findById(id)
                .filter(w -> a.canAccessBranch(w.branchId()))
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }
}
