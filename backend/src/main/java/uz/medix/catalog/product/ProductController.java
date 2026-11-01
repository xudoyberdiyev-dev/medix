package uz.medix.catalog.product;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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
import uz.medix.catalog.product.ProductModels.ChangeCodeRequest;
import uz.medix.catalog.product.ProductModels.DeactivateRequest;
import uz.medix.catalog.product.ProductModels.Filter;
import uz.medix.catalog.product.ProductModels.ProductPage;
import uz.medix.catalog.product.ProductModels.ProductDetail;
import uz.medix.catalog.product.ProductModels.ProductRequest;
import uz.medix.catalog.product.ProductModels.SortField;
import uz.medix.catalog.product.ProductModels.Status;
import uz.medix.shared.error.MedixException;

/**
 * Mahsulotlar (Ma'lumotnomalar → Mahsulotlar). Ko'rish — har bir kirgan xodim; o'zgartirish — Direktor, Bosh administrator,
 * Xarid (ruxsatlar matritsasi 1.3 kelguncha rol bo'yicha).
 */
@RestController
@RequestMapping("/api/products")
@Tag(name = "products", description = "Mahsulotlar")
class ProductController {

    private static final String MANAGE = "hasAnyRole('DIRECTOR', 'ADMIN', 'PURCHASER')";
    private static final int MAX_PAGE_SIZE = 200;

    private final Products products;

    ProductController(Products products) {
        this.products = products;
    }

    @GetMapping
    @Operation(summary = "Mahsulotlar ro'yxati", description = "Qidiruv lotin/kirill farqsiz: nom, kod, shtrix-kod, ishlab chiqaruvchi.")
    ProductPage list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long manufacturerId,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(defaultValue = "ACTIVE") Status status,
            @RequestParam(required = false) Boolean controlled,
            @RequestParam(required = false) Boolean marked,
            @RequestParam(defaultValue = "NAME") SortField sort,
            @RequestParam(defaultValue = "false") boolean desc,
            @Parameter(description = "0 dan boshlanadi") @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        int safeSize = Math.clamp(size, 1, MAX_PAGE_SIZE);
        return products.search(new Filter(q, manufacturerId, categoryId, status, controlled, marked, sort, desc, Math.max(page, 0), safeSize));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Mahsulot kartasi")
    ProductDetail get(@PathVariable long id) {
        return products.find(id).orElseThrow(() -> MedixException.notFound("error.notFound"));
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
