package uz.medix;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Ilova haqiqiy PostgreSQL bilan ishga tushadi va Flyway migratsiyalari qo'llanadi. */
@SpringBootTest
@Import(TestcontainersConfig.class)
class ApplicationIT {

    @Autowired
    JdbcClient jdbc;

    @Test
    void contextStartsAndMigrationsApplied() {
        Integer tables = jdbc.sql("SELECT count(*) FROM information_schema.tables WHERE table_name = 'document_sequence'")
                .query(Integer.class)
                .single();
        assertThat(tables).isEqualTo(1);
    }
}
