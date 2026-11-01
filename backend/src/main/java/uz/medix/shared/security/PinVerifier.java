package uz.medix.shared.security;

/**
 * PIN bilan ikkinchi tasdiq (SPEC 13): rahbar tasdiqlari, kassa farqi. Modullar amalni bajarishdan oldin chaqiradi.
 * Xato bo'lsa {@link uz.medix.shared.error.MedixException} ({@code pin.notSet}, {@code pin.wrong}, {@code pin.locked}).
 * Xato urinishlar hisobi chaqiruvchi tranzaksiyasi qaytarilsa ham saqlanadi.
 */
public interface PinVerifier {

    void verify(long employeeId, String pin);
}
