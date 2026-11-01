package uz.medix.shared.error;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.ErrorResponse;

/**
 * Barcha API xatolari RFC 9457 ProblemDetail ko'rinishida: {@code detail} — foydalanuvchi tilidagi matn
 * (nima bo'ldi + nima qilish kerak), {@code code} — i18n kaliti, {@code errors} — maydon xatolari.
 * Texnik tafsilot faqat jurnalga yoziladi.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** V1 da faqat o'zbek (lotin); kirill va rus — V2. */
    public static final Locale UZ = Locale.forLanguageTag("uz-Latn");

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final MessageSource messages;

    public GlobalExceptionHandler(MessageSource messages) {
        this.messages = messages;
    }

    @ExceptionHandler(MedixException.class)
    ProblemDetail medix(MedixException e) {
        return problem(e.status(), e.code(), e.args());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail validation(MethodArgumentNotValidException e) {
        ProblemDetail pd = problem(HttpStatus.BAD_REQUEST, "validation.failed");
        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError fe : e.getBindingResult().getFieldErrors()) {
            errors.putIfAbsent(fe.getField(), messages.getMessage(fe, UZ));
        }
        pd.setProperty("errors", errors);
        return pd;
    }

    @ExceptionHandler({AccessDeniedException.class, AuthorizationDeniedException.class})
    ProblemDetail accessDenied(RuntimeException e) {
        return problem(HttpStatus.FORBIDDEN, "auth.forbidden");
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail unreadable(HttpMessageNotReadableException e) {
        return problem(HttpStatus.BAD_REQUEST, "error.request");
    }

    /** Yo'l yoki so'rov parametri noto'g'ri turda (masalan, mavjud bo'lmagan ma'lumotnoma turi). */
    @ExceptionHandler(org.springframework.beans.TypeMismatchException.class)
    ProblemDetail typeMismatch(org.springframework.beans.TypeMismatchException e) {
        return problem(HttpStatus.BAD_REQUEST, "error.request");
    }

    @ExceptionHandler(Exception.class)
    ProblemDetail unexpected(Exception e) {
        if (e instanceof ErrorResponse er) {
            // Spring MVC'ning standart xatolari: 404, 405, 415, noto'g'ri parametr.
            HttpStatus status = HttpStatus.resolve(er.getStatusCode().value());
            if (status != null && status.is4xxClientError()) {
                return problem(status, status == HttpStatus.NOT_FOUND ? "error.notFound" : "error.request");
            }
        }
        log.error("Kutilmagan xato", e);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "error.unexpected");
    }

    public ProblemDetail problem(HttpStatus status, String code, Object... args) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(status, messages.getMessage(code, args, code, UZ));
        pd.setProperty("code", code);
        return pd;
    }
}
