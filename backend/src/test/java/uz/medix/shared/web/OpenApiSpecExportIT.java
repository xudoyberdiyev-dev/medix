package uz.medix.shared.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import uz.medix.TestcontainersConfig;

/**
 * OpenAPI tavsifini {@code build/openapi/openapi.json} ga yozadi. CI uni
 * {@code frontend/lib/api/openapi.json} bilan solishtiradi — API o'zgarsa, frontend tiplari ham yangilanishi shart.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class OpenApiSpecExportIT {

    @Autowired
    MockMvc mvc;

    @Test
    void exportsOpenApiSpec() throws Exception {
        String json = mvc.perform(get("/api/openapi"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);

        assertThat(json).contains("\"MEDIX API\"");

        Path out = Path.of("build", "openapi", "openapi.json");
        Files.createDirectories(out.getParent());
        Files.writeString(out, json.strip() + "\n", StandardCharsets.UTF_8);
    }
}
