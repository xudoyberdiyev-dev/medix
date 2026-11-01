package uz.medix.catalog.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.UUID;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import uz.medix.TestcontainersConfig;

/** Mahsulotlar .xlsx: import (tekshiruv → yozish, hammasi yoki hech narsa) va eksport. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ProductExcelIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private Cookie loginAs(String role) throws Exception {
        String login = "xls" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.sql("""
                INSERT INTO employee (login, full_name, role_id, password_hash, must_change_password)
                SELECT :login, 'Sinov', id, :hash, false FROM role WHERE code = :role""")
                .param("login", login)
                .param("hash", encoder.encode(PASSWORD))
                .param("role", role)
                .update();
        MvcResult r = mvc.perform(post("/api/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"login\":\"" + login + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        for (String h : r.getResponse().getHeaders("Set-Cookie")) {
            if (h.startsWith("MEDIX_SESSION=")) {
                return new Cookie("MEDIX_SESSION", h.substring("MEDIX_SESSION=".length(), h.indexOf(';')));
            }
        }
        throw new AssertionError("sessiya yo'q");
    }

    private static MockMultipartFile xlsx(String[][] rows) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet s = wb.createSheet();
            for (int i = 0; i < rows.length; i++) {
                Row row = s.createRow(i);
                for (int j = 0; j < rows[i].length; j++) {
                    row.createCell(j).setCellValue(rows[i][j]);
                }
            }
            wb.write(out);
            return new MockMultipartFile("file", "m.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray());
        }
    }

    @Test
    void importValidatesThenApplies() throws Exception {
        Cookie purchaser = loginAs("PURCHASER");
        String tag = UUID.randomUUID().toString().substring(0, 6);
        String code = String.valueOf(10_000_000 + (int) (Math.random() * 89_999_999));
        String[] header = {"Kod", "Nomi", "Ishlab chiqaruvchi", "Kategoriya", "Birlik", "Shtrix-kod", "QQS", "Markirovkali", "Min"};
        MockMultipartFile bad = xlsx(new String[][] {
            header,
            {code, "Import A " + tag, "Import Zavod " + tag, "Import Kat " + tag, "dona", "", "12", "ha", ""},
            {"", "", "", "", "dona", "", "", "", ""},
            {"", "Import C " + tag, "", "", "kilogramm", "", "", "", ""},
            {"", "Import D " + tag, "", "", "dona", "", "", "", "-3"},
        });
        mvc.perform(multipart("/api/products/import").file(bad).param("apply", "true").with(csrf()).cookie(purchaser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(false))
                .andExpect(jsonPath("$.errors", hasSize(3)))
                .andExpect(jsonPath("$.errors[0].row").value(3));
        assertThat(jdbc.sql("SELECT count(*) FROM product WHERE name LIKE :n").param("n", "Import % " + tag).query(Long.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM manufacturer WHERE name = :n").param("n", "Import Zavod " + tag).query(Long.class).single()).isZero();

        MockMultipartFile good = xlsx(new String[][] {
            header,
            {code, "Import A " + tag, "Import Zavod " + tag, "Import Kat " + tag, "dona", "478" + code, "12", "ha", "2"},
            {"", "Import B " + tag, "import zavod " + tag, "", "Dona", "", "0", "yoʻq", ""},
        });
        mvc.perform(multipart("/api/products/import").file(good).with(csrf()).cookie(purchaser))
                .andExpect(jsonPath("$.applied").value(false))
                .andExpect(jsonPath("$.created").value(2))
                .andExpect(jsonPath("$.errors", hasSize(0)));
        assertThat(jdbc.sql("SELECT count(*) FROM product WHERE name LIKE :n").param("n", "Import % " + tag).query(Long.class).single()).isZero();

        mvc.perform(multipart("/api/products/import").file(good).param("apply", "true").with(csrf()).cookie(purchaser))
                .andExpect(jsonPath("$.applied").value(true))
                .andExpect(jsonPath("$.createdManufacturers", hasSize(1)));
        assertThat(jdbc.sql("SELECT marked FROM product WHERE code = :c").param("c", code).query(Boolean.class).single()).isTrue();

        // Operator import qila olmaydi
        mvc.perform(multipart("/api/products/import").file(good).with(csrf()).cookie(loginAs("OPERATOR"))).andExpect(status().isForbidden());

        // Eksport — o'qiladigan .xlsx, import qilingan mahsulot bor
        byte[] file = mvc.perform(get("/api/products/export").param("q", code).cookie(purchaser))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray();
        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(file))) {
            Sheet s = wb.getSheetAt(0);
            assertThat(s.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Kod");
            assertThat(s.getRow(1).getCell(0).getStringCellValue()).isEqualTo(code);
            assertThat(s.getLastRowNum()).isEqualTo(1);
        }
    }

    @Test
    void badFileIsRejected() throws Exception {
        Cookie admin = loginAs("ADMIN");
        MockMultipartFile junk = new MockMultipartFile("file", "x.xlsx", "application/octet-stream", "salom".getBytes());
        mvc.perform(multipart("/api/products/import").file(junk).with(csrf()).cookie(admin))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("import.unreadable"));
        MockMultipartFile noHeader = xlsx(new String[][] {{"A", "B"}, {"1", "2"}});
        mvc.perform(multipart("/api/products/import").file(noHeader).with(csrf()).cookie(admin))
                .andExpect(jsonPath("$.code").value("import.badHeader"));
        mvc.perform(get("/api/products/import-template").cookie(admin)).andExpect(status().isOk());
    }
}
