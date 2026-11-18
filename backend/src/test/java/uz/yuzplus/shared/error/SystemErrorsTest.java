package uz.yuzplus.shared.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.StaticMessageSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

/** P4: kutilmagan xato jurnalga yoziladi (4xx va YuzplusException — yo'q); Telegram xulosasida shaxsiy maʼlumot yo'q, ID'lar yashiriladi. */
class SystemErrorsTest {

    @Test
    void unexpectedErrorIsRecorded() {
        SystemErrors errors = mock(SystemErrors.class);
        GlobalExceptionHandler handler = new GlobalExceptionHandler(new StaticMessageSource(), errors);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/orders/15/pick/start");
        IllegalStateException e = new IllegalStateException("kutilmagan");

        assertThat(handler.unexpected(e, request).getStatus()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR.value());
        verify(errors).record(eq("POST"), eq("/api/orders/15/pick/start"), eq(e));
    }

    @Test
    void clientErrorsAreNotRecorded() {
        SystemErrors errors = mock(SystemErrors.class);
        GlobalExceptionHandler handler = new GlobalExceptionHandler(new StaticMessageSource(), errors);
        handler.unexpected(new ResponseStatusException(HttpStatus.NOT_FOUND), new MockHttpServletRequest("GET", "/api/yoq"));
        verify(errors, never()).record(any(), any(), any());
    }

    @Test
    void summaryHasCountsTypesAndMaskedIds() {
        var s = new SystemErrors.Status(Instant.now(), 3, 5,
                List.of(new SystemErrors.Group("java.lang.IllegalStateException", "/api/orders/15/pick/start", 2),
                        new SystemErrors.Group("org.springframework.dao.DataIntegrityViolationException", "/api/receipts", 1)),
                List.of());
        String text = SystemErrors.summaryText(s);
        assertThat(text).startsWith("⚠️ 100+: oxirgi 24 soatda 3 ta server xatosi (7 kunda 5).")
                .contains("• 2 × IllegalStateException — /api/orders/{id}/pick/start")
                .contains("• 1 × DataIntegrityViolationException — /api/receipts")
                .doesNotContain("/15/");
    }
}
