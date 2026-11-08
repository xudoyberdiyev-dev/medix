package uz.medix.catalog.product;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import uz.medix.catalog.product.ProductModels.ChangeCodeRequest;
import uz.medix.catalog.product.ProductModels.DeactivateRequest;
import uz.medix.catalog.product.ProductModels.Filter;
import uz.medix.catalog.product.ProductModels.ProductPage;
import uz.medix.catalog.product.ProductModels.ProductDetail;
import uz.medix.catalog.product.ProductModels.ProductRequest;
import uz.medix.catalog.product.ProductModels.SortField;
import uz.medix.catalog.product.ProductModels.Status;
import uz.medix.catalog.product.ProductModels.View;
import uz.medix.shared.error.MedixException;

/**
 * Mahsulotlar (Ma'lumotnomalar → Mahsulotlar). Ko'rish — har bir kirgan xodim; o'zgartirish — Direktor, Bosh administrator,
 * Xarid (ruxsatlar matritsasi 1.3 kelguncha rol bo'yicha).
 */
@RestController
@RequestMapping("/api/products")
@Tag(name = "products", description = "Mahsulotlar")
class ProductController {

    private static final String MANAGE = "hasAuthority('products.create')";
    private static final int MAX_PAGE_SIZE = 200;

    private final Products products;
    private final ProductExcel excel;

    ProductController(Products products, ProductExcel excel) {
        this.products = products;
        this.excel = excel;
    }

    @GetMapping
    @Operation(summary = "Mahsulotlar ro'yxati", description = "Qidiruv lotin/kirill farqsiz: nom, kod, shtrix-kod, IKPU, Farm ID, "
            + "ishlab chiqaruvchi. Yorliqlar soni va filtr variantlari (soni bilan) bilan.")
    ProductPage list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long manufacturerId,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) List<Long> manufacturerIds,
            @RequestParam(required = false) List<Long> categoryIds,
            @RequestParam(required = false) List<Long> countryIds,
            @RequestParam(required = false) List<Long> supplyEmployeeIds,
            @RequestParam(defaultValue = "ACTIVE") Status status,
            @RequestParam(defaultValue = "ALL") View view,
            @RequestParam(required = false) Boolean controlled,
            @RequestParam(required = false) Boolean marked,
            @Parameter(description = "Qoldiq va narx filiali") @RequestParam(required = false) Long branchId,
            @RequestParam(defaultValue = "false") boolean facets,
            @RequestParam(defaultValue = "NAME") SortField sort,
            @RequestParam(defaultValue = "false") boolean desc,
            @Parameter(description = "0 dan boshlanadi") @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        int safeSize = Math.clamp(size, 1, MAX_PAGE_SIZE);
        Filter f = new Filter(q, List.of(), merge(manufacturerIds, manufacturerId), merge(categoryIds, categoryId), countryIds,
                supplyEmployeeIds, status, view, controlled, marked, branchId, sort, desc, Math.max(page, 0), safeSize);
        return products.search(f, facets);
    }

    @GetMapping("/export")
    @Operation(summary = "Excel'ga eksport (.xlsx)", description = "Jadvaldagi filtrlar bilan (yoki tanlanganlar — ids); ko'pi bilan 50 000 qator.")
    void export(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) List<Long> ids,
            @RequestParam(required = false) Long manufacturerId,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) List<Long> manufacturerIds,
            @RequestParam(required = false) List<Long> categoryIds,
            @RequestParam(required = false) List<Long> countryIds,
            @RequestParam(required = false) List<Long> supplyEmployeeIds,
            @RequestParam(defaultValue = "ACTIVE") Status status,
            @RequestParam(defaultValue = "ALL") View view,
            @RequestParam(required = false) Boolean controlled,
            @RequestParam(required = false) Boolean marked,
            @RequestParam(required = false) Long branchId,
            @RequestParam(defaultValue = "NAME") SortField sort,
            @RequestParam(defaultValue = "false") boolean desc,
            HttpServletResponse response) throws IOException {
        xlsx(response, "mahsulotlar.xlsx");
        excel.export(new Filter(q, ids, merge(manufacturerIds, manufacturerId), merge(categoryIds, categoryId), countryIds, supplyEmployeeIds,
                status, view, controlled, marked, branchId, sort, desc, 0, 1), response.getOutputStream());
    }

    private static List<Long> merge(List<Long> many, Long one) {
        List<Long> out = new java.util.ArrayList<>(many == null ? List.of() : many);
        if (one != null && !out.contains(one)) {
            out.add(one);
        }
        return out;
    }

    @GetMapping("/import-template")
    @Operation(summary = "Import shabloni (.xlsx)")
    void importTemplate(HttpServletResponse response) throws IOException {
        xlsx(response, "mahsulotlar-shablon.xlsx");
        excel.template(response.getOutputStream());
    }

    @PostMapping(path = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(MANAGE)
    @Operation(summary = "Excel'dan import",
            description = "apply=false — faqat tekshiradi (hech narsa yozilmaydi); apply=true — xato bo'lmasa hammasini yozadi.")
    ProductExcel.ImportResult importFile(@RequestPart("file") MultipartFile file, @RequestParam(defaultValue = "false") boolean apply)
            throws IOException {
        try (var in = file.getInputStream()) {
            return excel.importFile(in, apply);
        }
    }

    private static void xlsx(HttpServletResponse response, String filename) {
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");
    }

    @GetMapping("/{id}")
    @Operation(summary = "Mahsulot kartasi")
    ProductDetail get(@PathVariable long id) {
        return products.find(id).orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    @GetMapping("/{id}/history")
    @Operation(summary = "Mahsulot tarixi (kartochka «Tarix»)", description = "Yaratish, tahrir, kod va holat o'zgarishlari — yangilari birinchi.")
    List<ProductModels.HistoryRow> history(@PathVariable long id) {
        products.find(id).orElseThrow(() -> MedixException.notFound("error.notFound"));
        return products.history(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(MANAGE)
    @Operation(summary = "Mahsulot qo'shish", description = "8 raqamli kod avtomatik beriladi.")
    ProductDetail create(@Valid @RequestBody ProductRequest r) {
        return products.create(r);
    }

    @PutMapping("/{id}")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Mahsulotni tahrirlash")
    ProductDetail update(@PathVariable long id, @Valid @RequestBody ProductRequest r) {
        return products.update(id, r);
    }

    @PutMapping("/{id}/code")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Kodni o'zgartirish", description = "Tarixga yoziladi; eski kod boshqa mahsulotga berilmaydi.")
    ProductDetail changeCode(@PathVariable long id, @Valid @RequestBody ChangeCodeRequest r) {
        return products.changeCode(id, r.code(), r.reason());
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Nofaol qilish")
    ProductDetail deactivate(@PathVariable long id, @Valid @RequestBody DeactivateRequest r) {
        return products.setActive(id, false, r.reason());
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Faollashtirish")
    ProductDetail activate(@PathVariable long id) {
        return products.setActive(id, true, null);
    }
}
