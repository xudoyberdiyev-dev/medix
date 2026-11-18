package uz.medix.purchasing.receipt;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import uz.medix.pricing.SupplierFiles;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.KkImportLine;
import uz.medix.purchasing.receipt.ExpectedReceiptModels.KkImportRow;

/**
 * O15: KK qatorlarini yetkazib beruvchi faylidan yuklash. Ustunlar moslangan qatorlar (matn) → mahsulot topiladi (referent narxlar
 * ustasidagi tartib: shtrix-kod → MXIK → kod → xotira → nom), soni / narx / QQS / partiya / yaroqlilik o'qiladi. Hech narsa
 * yozilmaydi — natija KK shakliga qo'shiladi va foydalanuvchi tekshiradi.
 */
@Service
class ExpectedReceiptImport {

    private static final Pattern THOUSANDS = Pattern.compile("\\d{1,3}([.,]\\d{3})+");
    private static final Pattern WHOLE = Pattern.compile("(\\d+)([.,]0+)?");
    private static final Pattern MONTH_YEAR = Pattern.compile("(\\d{1,2})[./-](\\d{4})");
    private static final LocalDate EXCEL_EPOCH = LocalDate.of(1899, 12, 30);
    private static final List<DateTimeFormatter> DATES = java.util.stream.Stream.of("d.M.uuuu", "d/M/uuuu", "d-M-uuuu", "uuuu-M-d", "d.M.uu")
            .map(p -> DateTimeFormatter.ofPattern(p).withResolverStyle(ResolverStyle.STRICT))
            .toList();

    private final SupplierFiles files;

    ExpectedReceiptImport(SupplierFiles files) {
        this.files = files;
    }

    private static String clean(String s) {
        return s == null ? "" : s.replaceAll("[\\s\\u00a0\\u202f']", "");
    }

    /** «500», «500,00», «1 000», «1.000» → 500 / 1000; noto'g'ri yoki chegaradan tashqari — bo'sh. */
    static Optional<Integer> qty(String raw) {
        String s = clean(raw).replaceAll("(?i)(dona|sht|шт|дона|ta|ед)\\.?$", "");
        Matcher w = WHOLE.matcher(s);
        long v;
        if (THOUSANDS.matcher(s).matches()) {
            v = Long.parseLong(s.replaceAll("[.,]", ""));
        } else if (w.matches() && w.group(1).length() <= 9) {
            v = Long.parseLong(w.group(1));
        } else {
            return Optional.empty();
        }
        return v >= 1 && v <= ExpectedReceiptModels.MAX_QTY ? Optional.of((int) v) : Optional.empty();
    }

    /** «12», «12%», «12.0» → 12; «QQSsiz», «без НДС» → 0. */
    static Optional<Integer> vat(String raw) {
        String s = clean(raw).toLowerCase(java.util.Locale.ROOT);
        if (s.isEmpty()) {
            return Optional.empty();
        }
        if (s.contains("siz") || s.contains("без") || s.contains("bez") || s.contains("сиз")) {
            return Optional.of(0);
        }
        Matcher w = WHOLE.matcher(s.replace("%", ""));
        if (w.matches() && w.group(1).length() <= 3) {
            int v = Integer.parseInt(w.group(1));
            return v <= 100 ? Optional.of(v) : Optional.empty();
        }
        return Optional.empty();
    }

    /** «31.12.2027», «2027-12-31», «12.2027» (oy oxiri), Excel sana raqami (46022) → sana. */
    static Optional<LocalDate> date(String raw) {
        String s = clean(raw);
        if (s.isEmpty()) {
            return Optional.empty();
        }
        if (s.matches("\\d{5}(\\.0+)?")) {
            long n = Long.parseLong(s.replaceAll("\\..*", ""));
            return n >= 30_000 && n <= 80_000 ? Optional.of(EXCEL_EPOCH.plusDays(n)) : Optional.empty();
        }
        Matcher my = MONTH_YEAR.matcher(s);
        if (my.matches()) {
            int m = Integer.parseInt(my.group(1));
            return m >= 1 && m <= 12 ? Optional.of(YearMonth.of(Integer.parseInt(my.group(2)), m).atEndOfMonth()) : Optional.empty();
        }
        for (DateTimeFormatter f : DATES) {
            try {
                LocalDate d = LocalDate.parse(s, f);
                return d.getYear() >= 2000 && d.getYear() <= 2100 ? Optional.of(d) : Optional.empty();
            } catch (DateTimeParseException e) {
                // keyingi format
            }
        }
        return Optional.empty();
    }

    private static boolean filled(String s) {
        return s != null && !s.isBlank();
    }

    private static String trim(String s, int max) {
        if (!filled(s)) {
            return null;
        }
        String t = s.strip();
        return t.length() > max ? t.substring(0, max) : t;
    }

    List<KkImportLine> lines(List<KkImportRow> rows, boolean pricesVisible) {
        List<SupplierFiles.Found> found = files.match(rows.stream()
                .map(r -> new SupplierFiles.Query(r.name(), r.barcode(), r.ikpu(), r.code(), r.manufacturer()))
                .toList());
        List<KkImportLine> out = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            KkImportRow r = rows.get(i);
            SupplierFiles.Found f = found.get(i);
            List<String> problems = new ArrayList<>();
            if (f.productId() == null) {
                problems.add("product");
            } else if (!f.confident()) {
                problems.add("productGuess");
            }
            Optional<Integer> q = qty(r.qty());
            if (q.isEmpty()) {
                problems.add("qty");
            }
            String price = pricesVisible ? SupplierFiles.price(r.price()) : null;
            if (pricesVisible && filled(r.price()) && price == null) {
                problems.add("price");
            }
            Optional<Integer> v = vat(r.vat());
            if (filled(r.vat()) && v.isEmpty()) {
                problems.add("vat");
            }
            Optional<LocalDate> exp = date(r.expiry());
            if (filled(r.expiry()) && exp.isEmpty()) {
                problems.add("expiry");
            }
            out.add(new KkImportLine(r.row(), trim(r.name(), 300), f.productId(), f.code(), f.name(), f.by(), f.confident(), q.orElse(null),
                    price, v.orElse(null), trim(r.batch(), 64), exp.orElse(null), problems));
        }
        return out;
    }
}
