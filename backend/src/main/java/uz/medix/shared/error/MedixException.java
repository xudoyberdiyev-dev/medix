package uz.medix.shared.error;

import java.util.Arrays;
import org.springframework.http.HttpStatus;

/**
 * Foydalanuvchiga ko'rsatiladigan xato. {@code code} — i18n kaliti ({@code messages.properties}),
 * matn shu kalitdan olinadi; frontend {@code code} bo'yicha ham ajrata oladi.
 */
public class MedixException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final transient Object[] args;

    public MedixException(HttpStatus status, String code, Object... args) {
        super(code);
        this.status = status;
        this.code = code;
        this.args = args.clone();
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public Object[] args() {
        return Arrays.copyOf(args, args.length);
    }

    public static MedixException badRequest(String code, Object... args) {
        return new MedixException(HttpStatus.BAD_REQUEST, code, args);
    }

    public static MedixException unauthorized(String code, Object... args) {
        return new MedixException(HttpStatus.UNAUTHORIZED, code, args);
    }

    public static MedixException forbidden(String code, Object... args) {
        return new MedixException(HttpStatus.FORBIDDEN, code, args);
    }

    public static MedixException notFound(String code, Object... args) {
        return new MedixException(HttpStatus.NOT_FOUND, code, args);
    }

    public static MedixException conflict(String code, Object... args) {
        return new MedixException(HttpStatus.CONFLICT, code, args);
    }
}
