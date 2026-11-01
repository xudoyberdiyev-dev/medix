package uz.medix.shared.web;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;
import java.util.List;
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
}
