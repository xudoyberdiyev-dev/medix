package uz.medix.shared.pdf;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

/**
 * Server PDF (SPEC 10): {@code resources/pdf/<nom>.html} Thymeleaf shabloni (XHTML) → OpenHTMLtoPDF. Shrift — DejaVu Sans
 * (o'zbek lotin va kirill harflari, ʻ ʼ). Umumiy uslub — {@code pdf/_base.css} (shablon ichiga {@code th:insert} bilan).
 */
@Service
public class PdfRenderer {

    public static final String FONT = "DejaVu Sans";

    private final TemplateEngine engine;

    public PdfRenderer() {
        ClassLoaderTemplateResolver r = new ClassLoaderTemplateResolver();
        r.setPrefix("pdf/");
        r.setSuffix(".html");
        r.setTemplateMode(TemplateMode.HTML);
        r.setCharacterEncoding("UTF-8");
        r.setCacheable(true);
        engine = new TemplateEngine();
        engine.setTemplateResolver(r);
    }

    /** Shablonni HTML matniga aylantirish (testlar va ko'rish uchun). */
    public String html(String template, Map<String, Object> vars) {
        return engine.process(template, new Context(Locale.forLanguageTag("uz"), vars));
    }

    /** Shablon → PDF baytlari (A4). */
    public byte[] render(String template, Map<String, Object> vars) {
        String html = html(template, vars);
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PdfRendererBuilder b = new PdfRendererBuilder();
            b.useFont(() -> font("fonts/DejaVuSans.ttf"), FONT, 400, PdfRendererBuilder.FontStyle.NORMAL, true);
            b.useFont(() -> font("fonts/DejaVuSans-Bold.ttf"), FONT, 700, PdfRendererBuilder.FontStyle.NORMAL, true);
            b.withHtmlContent(html, null);
            b.toStream(out);
            b.run();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static InputStream font(String path) {
        InputStream in = PdfRenderer.class.getClassLoader().getResourceAsStream(path);
        if (in == null) {
            throw new IllegalStateException("Shrift topilmadi: " + path);
        }
        return in;
    }
}
