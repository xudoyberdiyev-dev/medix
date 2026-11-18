package uz.yuzplus.shared.security;

/**
 * PIN bilan ikkinchi tasdiq (SPEC 13): rahbar tasdiqlari, kassa farqi. Modullar amalni bajarishdan oldin chaqiradi.
 * Xato bo'lsa {@link uz.yuzplus.shared.error.YuzplusException} ({@code pin.notSet}, {@code pin.wrong}, {@code pin.locked}).
 * Xato urinishlar hisobi chaqiruvchi tranzaksiyasi qaytarilsa ham saqlanadi.
 */
public interface PinVerifier {

    void verify(long employeeId, String pin);
}
