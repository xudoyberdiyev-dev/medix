package uz.medix.catalog.refprice;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.io.OutputStream;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
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
import uz.medix.catalog.product.ProductImport;
import uz.medix.catalog.refprice.RefPriceModels.CompareMode;
import uz.medix.catalog.refprice.RefPriceModels.CompareResult;
import uz.medix.catalog.refprice.RefPriceModels.CompareRow;
import uz.medix.catalog.refprice.RefPriceModels.MatchRequest;
import uz.medix.catalog.refprice.RefPriceModels.RefList;
import uz.medix.catalog.refprice.RefPriceModels.ReceiptWarning;
import uz.medix.catalog.refprice.RefPriceModels.RowStatus;
import uz.medix.catalog.refprice.RefPriceModels.UploadRequest;
import uz.medix.catalog.refprice.RefPriceModels.UploadResult;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** O14: referent narxlar — fayl yuklash, moslash, solishtirish (kirim narxi faqat tannarx huquqi bilan), Excel. */
@RestController
@RequestMapping("/api/reference-prices")
@Tag(name = "reference-prices", description = "Referent narx bilan solishtirish")
class RefPriceController {

    private static final String REF = "hasAuthority('prices.reference')";
    static final String PROFILE_TYPE = "refprices";
    static final List<String> FIELDS = List.of("name", "barcode", "ikpu", "code", "manufacturer", "unit", "price");

    private final RefPrices refPrices;
    private final ProductImport files;
    private final CurrentActor currentActor;

    RefPriceController(RefPrices refPrices, ProductImport files, CurrentActor currentActor) {
        this.refPrices = refPrices;
        this.files = files;
        this.currentActor = currentActor;
    }

    private Actor actor() {
        return currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
    }

    private static boolean has(Authentication auth, String key) {
        return auth.getAuthorities().stream().anyMatch(a -> key.equals(a.getAuthority()));
    }

    @GetMapping
    @PreAuthorize(REF)
    @Operation(summary = "Yuklangan fayllar tarixi (oxirgi 200)")
    List<RefList> lists() {
        return refPrices.lists();
    }

    @PostMapping(path = "/read", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(REF)
    @Operation(summary = "Faylni o'qish (.xlsx/.xls/.csv) — varaqlar va katakchalar; hech narsa yozilmaydi")
    ProductImport.ImportFile read(@RequestPart("file") MultipartFile file) throws IOException {
        try (var in = file.getInputStream()) {
            return files.read(file.getOriginalFilename(), file.getSize(), in);
        }
    }

    @GetMapping("/profile")
    @PreAuthorize(REF)
    @Operation(summary = "Saqlangan ustunlar moslashi", description = "Profil bo'lmasa — 204.")
    ResponseEntity<ProductImport.ImportProfile> profile() {
        return files.profile(PROFILE_TYPE).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/profile")
    @PreAuthorize(REF)
    @Operation(summary = "Ustunlar moslashini saqlash")
    ProductImport.ImportProfile saveProfile(@Valid @RequestBody ProductImport.ImportProfileRequest request) {
        return files.saveProfile(PROFILE_TYPE, FIELDS, request);
    }

    @PostMapping
    @PreAuthorize(REF)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Moslangan qatorlarni saqlash va mahsulotga moslash",
            description = "Tartib: shtrix-kod/GTIN → avval qo'lda moslangan → MXIK → kod → nom o'xshashligi. Nom/narxi yaroqsiz qatorlar o'tkazib yuboriladi.")
    UploadResult upload(@Valid @RequestBody UploadRequest request) {
        return refPrices.upload(request, actor());
    }

    @GetMapping("/{id}/compare")
    @PreAuthorize(REF)
    @Operation(summary = "Solishtirish natijasi",
            description = "SALE — narx turi (berilmasa bazaviy); RECEIPT — kirim (receiptId) yoki filialdagi oxirgi o'tkazilgan kirim narxi, faqat special.cost bilan.")
    CompareResult compare(@PathVariable long id, @RequestParam(defaultValue = "SALE") CompareMode mode,
            @RequestParam(required = false) Long priceTypeId, @RequestParam(required = false) Long receiptId,
            @RequestParam(required = false) Long branchId, Authentication auth) {
        if (mode == CompareMode.RECEIPT && !has(auth, "special.cost")) {
            throw MedixException.forbidden("auth.forbidden");
        }
        return refPrices.compare(id, mode, priceTypeId, receiptId, branchId, actor());
    }

    @PutMapping("/{id}/rows/{rowId}/product")
    @PreAuthorize(REF)
    @Operation(summary = "Qo'lda moslash (null — olib tashlash); keyingi fayllarda avtomatik qo'llanadi")
    void match(@PathVariable long id, @PathVariable long rowId, @RequestBody MatchRequest request) {
        refPrices.match(id, rowId, request.productId(), actor());
    }

    @GetMapping("/{id}/export")
    @PreAuthorize(REF)
    @Operation(summary = "Excel'ga eksport (.xlsx) — bitta yorliq (status) yoki hammasi")
    void export(@PathVariable long id, @RequestParam(defaultValue = "SALE") CompareMode mode, @RequestParam(required = false) Long priceTypeId,
            @RequestParam(required = false) Long receiptId, @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) RowStatus status, Authentication auth, HttpServletResponse response) throws IOException {
        CompareResult r = compare(id, mode, priceTypeId, receiptId, branchId, auth);
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"referent-narx-" + id + ".xlsx\"");
        write(r, status, response.getOutputStream());
    }

    @GetMapping("/receipt-warnings")
    @PreAuthorize("hasAuthority('receipt.view')")
    @Operation(summary = "Kirim kartochkasi: referent narxdan qimmat qatorlar (tannarx huquqisiz — bo'sh)")
    List<ReceiptWarning> receiptWarnings(@RequestParam long receiptId, Authentication auth) {
        if (!has(auth, "special.cost")) {
            return List.of();
        }
        return refPrices.receiptWarnings(receiptId, actor());
    }

    private static final String[] STATUS = {"Qimmat", "Arzon", "Mos", "Topilmadi"};

    static void write(CompareResult r, RowStatus only, OutputStream out) throws IOException {
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet("Solishtirish");
            CellStyle header = wb.createCellStyle();
            Font bold = wb.createFont();
            bold.setBold(true);
            header.setFont(bold);
            String ours = r.mode() == CompareMode.SALE ? "Bizning narx (" + r.priceType() + ")" : "Kirim narxi";
            String[] titles = {"№", "Fayldagi nom", "Ishlab chiqaruvchi (fayl)", "Mahsulot kodi", "Mahsulot", "Ishlab chiqaruvchi", "Moslik",
                "Tekshiring", ours, "Referent narx", "Farq", "Farq, %", "Holat", "Manba"};
            Row h = sheet.createRow(0);
            for (int i = 0; i < titles.length; i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles[i]);
                c.setCellStyle(header);
            }
            int n = 1;
            for (CompareRow x : r.rows()) {
                if (only != null && x.status() != only) {
                    continue;
                }
                Row row = sheet.createRow(n++);
                int i = 0;
                row.createCell(i++).setCellValue(x.rowNo());
                row.createCell(i++).setCellValue(x.name());
                row.createCell(i++).setCellValue(x.manufacturer() == null ? "" : x.manufacturer());
                row.createCell(i++).setCellValue(x.product() == null ? "" : x.product().code());
                row.createCell(i++).setCellValue(x.product() == null ? "" : x.product().name());
                row.createCell(i++).setCellValue(x.product() == null || x.product().manufacturer() == null ? "" : x.product().manufacturer());
                row.createCell(i++).setCellValue(x.matchKind().name());
                row.createCell(i++).setCellValue(x.needsCheck() ? "ha" : "");
                money(row.createCell(i++), x.ourPrice());
                money(row.createCell(i++), x.refPrice());
                money(row.createCell(i++), x.diff());
                if (x.diffPct() == null) {
                    row.createCell(i++).setCellValue("");
                } else {
                    row.createCell(i++).setCellValue(x.diffPct());
                }
                row.createCell(i++).setCellValue(STATUS[x.status().ordinal()]);
                row.createCell(i).setCellValue(x.source() == null ? "" : x.source());
            }
            wb.write(out);
        }
    }

    /** Excel katagi — son (ko'rsatish uchun); hisob-kitob BigDecimal'da qilingan. */
    private static void money(Cell c, String v) {
        if (v == null) {
            c.setCellValue("");
        } else {
            c.setCellValue(Money.of(v).format());
        }
    }
}
