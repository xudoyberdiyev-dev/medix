package uz.medix.shared.pdf;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/** Tayyor PDF: fayl nomi (hujjat raqami) va baytlar. Brauzerda ochiladi (inline). */
public record PdfDocument(String name, byte[] body) {

    public ResponseEntity<byte[]> response() {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(name + ".pdf").build().toString())
                .body(body);
    }
}
