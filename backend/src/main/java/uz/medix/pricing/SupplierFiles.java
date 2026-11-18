package uz.medix.pricing;

import java.io.InputStream;
import java.util.List;
import org.springframework.stereotype.Service;
import uz.medix.pricing.reference.ReferencePrices;
import uz.medix.pricing.reference.ReferenceSheetReader;

/**
 * Yetkazib beruvchi fayli (.xlsx/.xls/.csv) — boshqa modullar uchun ochiq API (O15: KK qatorlarini YB faylidan yuklash).
 * O'qish va mahsulotni topish referent narxlar ustasi (O14) bilan bir xil: shtrix-kod → MXIK → kod → xotira → nom.
 */
@Service
public class SupplierFiles {

    public record Sheet(String name, List<List<String>> rows) {}

    public record File(String fileName, long size, List<Sheet> sheets) {}

    public record Query(String name, String barcode, String ikpu, String code, String maker) {}

    /** {@code by}: BARCODE, IKPU, CODE, MEMORY, NAME, NONE; {@code confident=false} — nom bo'yicha taxmin, tekshirish kerak. */
    public record Found(Long productId, String code, String name, String by, boolean confident) {}

    private final ReferencePrices reference;

    SupplierFiles(ReferencePrices reference) {
        this.reference = reference;
    }

    /** Fayl → varaqlar va katakchalar (matn). Hech narsa yozilmaydi. */
    public File read(String fileName, long size, InputStream in) {
        var f = ReferenceSheetReader.read(fileName, size, in);
        return new File(f.fileName(), f.size(), f.sheets().stream().map(s -> new Sheet(s.name(), s.rows())).toList());
    }

    /** Har so'rov uchun mahsulot (faol katalogdan); tartib saqlanadi. */
    public List<Found> match(List<Query> queries) {
        return reference.matchAll(queries);
    }

    /** «12 500,50», «1.250.000» → 2 xonali summa matni; o'qib bo'lmasa yoki ≤ 0 — null. */
    public static String price(String raw) {
        return ReferencePrices.parsePriceText(raw);
    }
}
