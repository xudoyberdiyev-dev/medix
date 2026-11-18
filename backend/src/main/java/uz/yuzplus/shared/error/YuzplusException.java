package uz.yuzplus.shared.error;

import java.util.Arrays;
import org.springframework.http.HttpStatus;

/**
 * Foydalanuvchiga ko'rsatiladigan xato. {@code code} — i18n kaliti ({@code messages.properties}),
 * matn shu kalitdan olinadi; frontend {@code code} bo'yicha ham ajrata oladi.
 */
public class YuzplusException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final transient Object[] args;

    public YuzplusException(HttpStatus status, String code, Object... args) {
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

    public static YuzplusException badRequest(String code, Object... args) {
        return new YuzplusException(HttpStatus.BAD_REQUEST, code, args);
    }

    public static YuzplusException unauthorized(String code, Object... args) {
        return new YuzplusException(HttpStatus.UNAUTHORIZED, code, args);
    }

    public static YuzplusException forbidden(String code, Object... args) {
        return new YuzplusException(HttpStatus.FORBIDDEN, code, args);
    }

    public static YuzplusException notFound(String code, Object... args) {
        return new YuzplusException(HttpStatus.NOT_FOUND, code, args);
    }

    public static YuzplusException conflict(String code, Object... args) {
        return new YuzplusException(HttpStatus.CONFLICT, code, args);
    }
}
