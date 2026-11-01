package uz.medix.shared.web;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;
import io.swagger.v3.oas.models.media.Schema;
import java.util.ArrayList;
import java.util.List;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI tavsifi. Frontend tiplari shu tavsifdan generatsiya qilinadi ({@code frontend/lib/api/schema.ts}),
 * shuning uchun chiqish barqaror bo'lishi kerak: server — nisbiy «/», kalitlar tartiblangan.
 */
@Configuration(proxyBeanMethods = false)
class OpenApiConfig {

    @Bean
    OpenAPI medixOpenApi() {
        return new OpenAPI()
                .info(new Info().title("MEDIX API").version("v1").description("Farmatsevtika ulgurji distribyutsiyasi ERP"))
                .servers(List.of(new Server().url("/")));
    }

    /**
     * Java record maydonlari standart bo'yicha majburiy (frontend tiplarida {@code ?} bo'lmasin).
     * {@code null} bo'lishi mumkin bo'lgan maydon {@code @Schema(nullable = true)} bilan belgilanadi.
     */
    @Bean
    OpenApiCustomizer requiredByDefault() {
        return openApi -> {
            if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
                return;
            }
            openApi.getComponents().getSchemas().values().forEach(raw -> {
                Schema<?> schema = raw;
                var props = schema.getProperties();
                if (props == null) {
                    return;
                }
                List<String> required = new ArrayList<>();
                props.forEach((name, prop) -> {
                    boolean nullable = Boolean.TRUE.equals(prop.getNullable())
                            || (prop.getTypes() != null && prop.getTypes().contains("null"));
                    if (!nullable) {
                        required.add(name);
                    }
                });
                schema.setRequired(required.isEmpty() ? null : required.stream().sorted().toList());
            });
        };
    }
}
