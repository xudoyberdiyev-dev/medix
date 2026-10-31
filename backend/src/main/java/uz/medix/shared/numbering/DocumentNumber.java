package uz.medix.shared.numbering;

import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Hujjat raqami: {@code PREFIKS-FILIAL-000001}, masalan {@code BY-TSH-000355}. */
public record DocumentNumber(DocumentPrefix prefix, String branchCode, long sequence) {

    private static final Pattern BRANCH = Pattern.compile("[A-Z]{3}");
    private static final Pattern FORMAT = Pattern.compile("([A-Z]{2,3})-([A-Z]{3})-(\\d{6,})");

    public DocumentNumber {
        Objects.requireNonNull(prefix, "prefix");
        Objects.requireNonNull(branchCode, "branchCode");
        if (!BRANCH.matcher(branchCode).matches()) {
            throw new IllegalArgumentException("Filial kodi 3 ta katta lotin harfidan iborat bo'lishi kerak: " + branchCode);
        }
        if (sequence < 1) {
            throw new IllegalArgumentException("Tartib raqami 1 dan boshlanadi: " + sequence);
        }
    }

    public static DocumentNumber parse(String value) {
        Matcher m = FORMAT.matcher(value == null ? "" : value.trim());
        if (!m.matches()) {
            throw new IllegalArgumentException("Hujjat raqami formati noto'g'ri: " + value);
        }
        return new DocumentNumber(DocumentPrefix.valueOf(m.group(1)), m.group(2), Long.parseLong(m.group(3)));
    }

    @Override
    public String toString() {
        return "%s-%s-%06d".formatted(prefix.name(), branchCode, sequence);
    }
}
