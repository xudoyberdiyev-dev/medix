package uz.medix.catalog.counterparty;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
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
import uz.medix.catalog.counterparty.CounterpartyModels.ContractRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.CounterpartyDetail;
import uz.medix.catalog.counterparty.CounterpartyModels.CounterpartyRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.LicenseRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.CounterpartyPage;
import uz.medix.catalog.counterparty.CounterpartyModels.PriceTypeAttachRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.PriceTypeAttachResult;
import uz.medix.catalog.counterparty.CounterpartyModels.PriceTypeCustomers;
import uz.medix.catalog.counterparty.CounterpartyModels.ReasonRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.Role;
import uz.medix.catalog.counterparty.CounterpartyModels.SortField;
import uz.medix.catalog.counterparty.CounterpartyModels.Status;
import uz.medix.catalog.counterparty.CounterpartyModels.TermsRequest;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/**
 * Kontragentlar (Ma'lumotnomalar → Mijozlar / Yetkazib beruvchilar). Ruxsat kartadagi rol bo'yicha (1.3):
 * mijoz — {@code clients.*}, yetkazib beruvchi — {@code suppliers.*}; ikki rolli kartada ikkala tomon tekshiriladi.
 * Filial shartlarida xodim faqat ruxsati bor tomonni o'zgartiradi (masalan, Xarid — faqat YB shartlarini).
 */
@RestController
@RequestMapping("/api/counterparties")
@Tag(name = "counterparties", description = "Kontragentlar")
class CounterpartyController {


    private final Counterparties counterparties;
    private final CurrentActor currentActor;
    private final CounterpartyExcel excel;

    CounterpartyController(Counterparties counterparties, CurrentActor currentActor, CounterpartyExcel excel) {
        this.counterparties = counterparties;
        this.currentActor = currentActor;
        this.excel = excel;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private static boolean has(Authentication auth, String key) {
        return auth.getAuthorities().stream().anyMatch(a -> key.equals(a.getAuthority()));
    }

    private static void require(Authentication auth, String key) {
        if (!has(auth, key)) {
            throw MedixException.forbidden("auth.forbidden");
        }
    }

    /** Karta: mijoz tomoni — clients.create, YB tomoni — suppliers.create (ikkalasi bo'lsa ikkalasi). */
    private static void requireEdit(Authentication auth, boolean customer, boolean supplier) {
        if ((customer && !has(auth, "clients.create")) || (supplier && !has(auth, "suppliers.create")) || (!customer && !supplier
                && !has(auth, "clients.create") && !has(auth, "suppliers.create"))) {
            throw MedixException.forbidden("auth.forbidden");
        }
    }

    private static void requireEdit(Authentication auth, CounterpartyDetail cp) {
        requireEdit(auth, cp.customer(), cp.supplier());
    }

    private static void requireBlock(Authentication auth, CounterpartyDetail cp) {
        if (!((cp.customer() && has(auth, "clients.block")) || (cp.supplier() && has(auth, "suppliers.block")))) {
            throw MedixException.forbidden("auth.forbidden");
        }
    }

    private CounterpartyDetail detail(long id) {
        return counterparties.find(id, actor()).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @GetMapping
    @Operation(summary = "Kontragentlar", description = "Qidiruv: nom, STIR, telefon, kontakt (lotin/kirill farqsiz).")
    CounterpartyPage list(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "ALL") Role role,
            @RequestParam(defaultValue = "ACTIVE") Status status,
            @RequestParam(required = false) Long regionId,
            @Parameter(description = "Eskirgan: sort=TIN bilan bir xil") @RequestParam(defaultValue = "false") boolean sortByTin,
            @RequestParam(required = false) SortField sort,
            @RequestParam(defaultValue = "false") boolean desc,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return counterparties.search(q, role, status, regionId, sort(sort, sortByTin), desc, Math.max(page, 0), Math.clamp(size, 1, 200));
    }

    private static SortField sort(SortField sort, boolean sortByTin) {
        return sort != null ? sort : sortByTin ? SortField.TIN : SortField.NAME;
    }

    @GetMapping("/price-type-customers")
    @PreAuthorize("hasAuthority('clients.terms')")
    @Operation(summary = "Narx turiga biriktirish — mijozlar ro'yxati",
            description = "Faol mijozlar va shu filialdagi joriy narx turi; avval shu turga biriktirilganlar. Qidiruv: nom, STIR.")
    PriceTypeCustomers priceTypeCustomers(@RequestParam long branchId, @RequestParam long priceTypeId,
            @RequestParam(required = false) String q, @RequestParam(defaultValue = "200") int limit) {
        if (!actor().canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        return counterparties.priceTypeCustomers(branchId, priceTypeId, q, Math.clamp(limit, 1, 500));
    }

    @PutMapping("/price-type-customers")
    @PreAuthorize("hasAuthority('clients.terms')")
    @Operation(summary = "Mijozlarni narx turiga biriktirish",
            description = "attach — shu filial shartidagi narx turi shu turga; detach — shu turda bo'lsa bazaviyga qaytadi. Auditda.")
    PriceTypeAttachResult attachPriceType(@Valid @RequestBody PriceTypeAttachRequest r) {
        if (!actor().canAccessBranch(r.branchId())) {
            throw MedixException.notFound("error.notFound");
        }
        return new PriceTypeAttachResult(counterparties.attachPriceType(r));
    }

    @GetMapping("/export")
    @Operation(summary = "Excel'ga eksport (.xlsx)",
            description = "Jadvaldagi filtrlar va saralash bilan; ko'pi bilan 50 000 qator. Mijozlar — clients.view, YB — suppliers.view; "
                    + "telefon va kontakt — clients.contact / suppliers.contact bilan.")
    void export(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "ALL") Role role,
            @RequestParam(defaultValue = "ACTIVE") Status status,
            @RequestParam(required = false) Long regionId,
            @RequestParam(required = false) SortField sort,
            @RequestParam(defaultValue = "false") boolean desc,
            Authentication auth,
            HttpServletResponse response) throws IOException {
        boolean customers = has(auth, "clients.view");
        boolean suppliers = has(auth, "suppliers.view");
        Role scope = switch (role) {
            case CUSTOMER -> customers ? Role.CUSTOMER : null;
            case SUPPLIER -> suppliers ? Role.SUPPLIER : null;
            case ALL -> customers && suppliers ? Role.ALL : customers ? Role.CUSTOMER : suppliers ? Role.SUPPLIER : null;
        };
        if (scope == null) {
            throw MedixException.forbidden("auth.forbidden");
        }
        boolean contacts = switch (scope) {
            case CUSTOMER -> has(auth, "clients.contact");
            case SUPPLIER -> has(auth, "suppliers.contact");
            case ALL -> has(auth, "clients.contact") && has(auth, "suppliers.contact");
        };
        String file = switch (scope) {
            case CUSTOMER -> "mijozlar.xlsx";
            case SUPPLIER -> "yetkazib-beruvchilar.xlsx";
            case ALL -> "kontragentlar.xlsx";
        };
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + file + "\"");
        excel.export(counterparties.search(q, scope, status, regionId, sort(sort, false), desc, 0, CounterpartyExcel.MAX_EXPORT_ROWS),
                contacts, response.getOutputStream());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Kontragent kartasi")
    CounterpartyDetail get(@PathVariable long id) {
        return detail(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Kontragent qo'shish")
    CounterpartyDetail create(@Valid @RequestBody CounterpartyRequest r, Authentication auth) {
        requireEdit(auth, r.customer(), r.supplier());
        return detail(counterparties.create(r));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Kartani tahrirlash")
    CounterpartyDetail update(@PathVariable long id, @Valid @RequestBody CounterpartyRequest r, Authentication auth) {
        CounterpartyDetail current = detail(id);
        requireEdit(auth, current.customer() || r.customer(), current.supplier() || r.supplier());
        counterparties.update(id, r);
        return detail(id);
    }

    @PostMapping("/{id}/block")
    @Operation(summary = "Bloklash", description = "Bloklangan mijozga buyurtma kiritilmaydi.")
    CounterpartyDetail block(@PathVariable long id, @Valid @RequestBody ReasonRequest r, Authentication auth) {
        requireBlock(auth, detail(id));
        counterparties.block(id, r.reason());
        return detail(id);
    }

    @PostMapping("/{id}/unblock")
    @Operation(summary = "Blokdan chiqarish")
    CounterpartyDetail unblock(@PathVariable long id, Authentication auth) {
        requireBlock(auth, detail(id));
        counterparties.unblock(id);
        return detail(id);
    }

    @PostMapping("/{id}/deactivate")
    @Operation(summary = "Nofaol qilish")
    CounterpartyDetail deactivate(@PathVariable long id, @Valid @RequestBody ReasonRequest r, Authentication auth) {
        requireEdit(auth, detail(id));
        counterparties.setActive(id, false, r.reason());
        return detail(id);
    }

    @PostMapping("/{id}/activate")
    @Operation(summary = "Faollashtirish")
    CounterpartyDetail activate(@PathVariable long id, Authentication auth) {
        requireEdit(auth, detail(id));
        counterparties.setActive(id, true, null);
        return detail(id);
    }

    @PostMapping("/{id}/licenses")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Litsenziya qo'shish")
    CounterpartyDetail addLicense(@PathVariable long id, @Valid @RequestBody LicenseRequest r, Authentication auth) {
        require(auth, "clients.lic");
        counterparties.saveLicense(id, null, r);
        return detail(id);
    }

    @PutMapping("/{id}/licenses/{licenseId}")
    @Operation(summary = "Litsenziyani tahrirlash")
    CounterpartyDetail updateLicense(@PathVariable long id, @PathVariable long licenseId, @Valid @RequestBody LicenseRequest r,
            Authentication auth) {
        require(auth, "clients.lic");
        counterparties.saveLicense(id, licenseId, r);
        return detail(id);
    }

    @PostMapping("/{id}/contracts")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Shartnoma qo'shish")
    CounterpartyDetail addContract(@PathVariable long id, @Valid @RequestBody ContractRequest r, Authentication auth) {
        requireEdit(auth, detail(id));
        counterparties.saveContract(id, null, r, actor());
        return detail(id);
    }

    @PutMapping("/{id}/contracts/{contractId}")
    @Operation(summary = "Shartnomani tahrirlash")
    CounterpartyDetail updateContract(@PathVariable long id, @PathVariable long contractId, @Valid @RequestBody ContractRequest r,
            Authentication auth) {
        requireEdit(auth, detail(id));
        counterparties.saveContract(id, contractId, r, actor());
        return detail(id);
    }

    @PutMapping("/{id}/terms/{branchId}")
    @Operation(summary = "Filial shartlari", description = "Limit, to'lov muddati, narx turi, minimal yaroqlilik, operator; YB shartlari.")
    CounterpartyDetail saveTerms(@PathVariable long id, @PathVariable long branchId, @Valid @RequestBody TermsRequest r,
            Authentication auth) {
        if (!actor().canAccessBranch(branchId)) {
            throw MedixException.notFound("error.notFound");
        }
        CounterpartyDetail cp = detail(id);
        boolean customerSide = cp.customer() && has(auth, "clients.terms");
        boolean supplierSide = cp.supplier() && has(auth, "suppliers.terms");
        if (!customerSide && !supplierSide) {
            throw MedixException.forbidden("auth.forbidden");
        }
        counterparties.saveTerms(id, branchId, r, customerSide, supplierSide);
        return detail(id);
    }
}
