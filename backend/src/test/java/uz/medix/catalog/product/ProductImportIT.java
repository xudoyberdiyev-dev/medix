package uz.medix.catalog.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
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

/** Import ustasi: fayl o'qish (.xlsx/.csv), qatorlarni tekshirish, xatosizlarini yaratish, moslashtirish profili. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig.class)
class ProductImportIT {

    private static final String PASSWORD = "Sinov-parol-2026";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    private Cookie loginAs(String role) throws Exception {
        String login = "imw" + UUID.randomUUID().toString().substring(0, 8);
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
            Sheet s = wb.createSheet("Tovarlar");
            for (int i = 0; i < rows.length; i++) {
                Row row = s.createRow(i);
                for (int j = 0; j < rows[i].length; j++) {
                    row.createCell(j).setCellValue(rows[i][j]);
                }
            }
            wb.createSheet("Bosh");
            wb.write(out);
            return new MockMultipartFile("file", "smartup.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray());
        }
    }

    @Test
    void readsXlsxAndCsv() throws Exception {
        Cookie c = loginAs("PURCHASER");
        mvc.perform(multipart("/api/products/import/read").file(xlsx(new String[][] {{"Hisobot"}, {"Kod", "Nomi"}, {"10000001", "A"}}))
                        .with(csrf()).cookie(c))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fileName").value("smartup.xlsx"))
                .andExpect(jsonPath("$.sheets", hasSize(2)))
                .andExpect(jsonPath("$.sheets[0].name").value("Tovarlar"))
                .andExpect(jsonPath("$.sheets[0].rows", hasSize(3)))
                .andExpect(jsonPath("$.sheets[0].rows[2][0]").value("10000001"));
        byte[] csv = "\uFEFFNomi;Izoh\r\n\"Para; 500\";\"a \"\"b\"\"\"\r\n".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        mvc.perform(multipart("/api/products/import/read").file(new MockMultipartFile("file", "m.csv", "text/csv", csv)).with(csrf()).cookie(c))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sheets[0].rows[0][0]").value("Nomi"))
                .andExpect(jsonPath("$.sheets[0].rows[1][0]").value("Para; 500"))
                .andExpect(jsonPath("$.sheets[0].rows[1][1]").value("a \"b\""));
        mvc.perform(multipart("/api/products/import/read").file(new MockMultipartFile("file", "x.xlsx", "application/octet-stream", new byte[] {1, 2}))
                        .with(csrf()).cookie(c))
                .andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/products/import/read").file(xlsx(new String[][] {{"A"}})).with(csrf()).cookie(loginAs("OPERATOR")))
                .andExpect(status().isForbidden());
    }

    private static String row(int n, String... kv) {
        StringBuilder sb = new StringBuilder("{\"row\":" + n + ",\"values\":{");
        for (int i = 0; i < kv.length; i += 2) {
            sb.append(i == 0 ? "" : ",").append('"').append(kv[i]).append("\":\"").append(kv[i + 1]).append('"');
        }
        return sb.append("}}").toString();
    }

    @Test
    void checksRowsThenCreatesOnlyValid() throws Exception {
        Cookie c = loginAs("PURCHASER");
        String tag = UUID.randomUUID().toString().substring(0, 6);
        String ikpu = "12345678901234567";
        String base = "47" + String.valueOf(1_000_000_000L + (long) (Math.random() * 8_999_999_999L));
        int sum = 0;
        for (int i = 0; i < 12; i++) {
            sum += (base.charAt(11 - i) - '0') * (i % 2 == 0 ? 3 : 1);
        }
        int check = (10 - sum % 10) % 10;
        String bc = base + check;
        String badBc = base + (check + 1) % 10;
        String body = "{\"rows\":[" + String.join(",",
                row(1, "name", "Wiz A " + tag, "classifier", "Paracetamol", "maker", "Wiz Zavod " + tag, "cat", "Wiz Kat " + tag,
                        "ikpu", ikpu, "farmId", "F1", "barcode", bc, "form", "Tabletka", "pack", "10"),
                row(2, "code", "123", "name", "Wiz B " + tag, "classifier", "X", "maker", "Wiz Zavod " + tag, "cat", "Wiz Kat " + tag,
                        "ikpu", ikpu, "farmId", "F2", "form", "Nomaʼlum"),
                row(3, "name", "Wiz C " + tag, "classifier", "X", "maker", "Wiz Zavod " + tag, "cat", "K", "ikpu", ikpu, "farmId", "F3",
                        "barcode", badBc),
                row(4, "name", "Wiz A " + tag, "classifier", "X", "maker", "wiz zavod " + tag, "cat", "K", "ikpu", ikpu, "farmId", "F4"),
                row(5, "name", "Wiz E " + tag, "classifier", "X", "maker", "M", "cat", "K", "ikpu", "12", "farmId", "F5", "barcode", bc),
                row(6, "name", "", "maker", "M")) + "]}";
        mvc.perform(post("/api/products/import/check").contentType(MediaType.APPLICATION_JSON).content(body).with(csrf()).cookie(c))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(false))
                .andExpect(jsonPath("$.ok").value(1))
                .andExpect(jsonPath("$.warn").value(1))
                .andExpect(jsonPath("$.error").value(4))
                .andExpect(jsonPath("$.rows[0].status").value("OK"))
                .andExpect(jsonPath("$.rows[0].codeAuto").value(true))
                .andExpect(jsonPath("$.rows[1].status").value("WARN"))
                .andExpect(jsonPath("$.rows[1].messages[0].key").value("pCodeAuto"))
                .andExpect(jsonPath("$.rows[1].messages[1].key").value("pFormUnknown"))
                .andExpect(jsonPath("$.rows[2].messages[0].key").value("pBcBad"))
                .andExpect(jsonPath("$.rows[3].messages[0].key").value("pNameDupFile"))
                .andExpect(jsonPath("$.rows[3].messages[0].params.r").value("1"))
                .andExpect(jsonPath("$.rows[4].messages[0].key").value("pIkpuBad"))
                .andExpect(jsonPath("$.rows[4].messages[1].key").value("pBcDupFile"))
                .andExpect(jsonPath("$.rows[5].messages[0].key").value("pReq"))
                .andExpect(jsonPath("$.newManufacturers", hasSize(1)));
        assertThat(jdbc.sql("SELECT count(*) FROM product WHERE name LIKE :n").param("n", "Wiz % " + tag).query(Long.class).single()).isZero();

        mvc.perform(post("/api/products/import/check").param("apply", "true").contentType(MediaType.APPLICATION_JSON).content(body)
                        .with(csrf()).cookie(c))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(true))
                .andExpect(jsonPath("$.created").value(2))
                .andExpect(jsonPath("$.rows[0].createdCode").isString());
        assertThat(jdbc.sql("SELECT count(*) FROM product WHERE name LIKE :n").param("n", "Wiz % " + tag).query(Long.class).single()).isEqualTo(2L);
        assertThat(jdbc.sql("SELECT dosage_form FROM product WHERE name = :n").param("n", "Wiz A " + tag).query(String.class).single())
                .isEqualTo("TABLET");

        // Takroran — endi katalogda bor
        mvc.perform(post("/api/products/import/check").contentType(MediaType.APPLICATION_JSON).content(body).with(csrf()).cookie(c))
                .andExpect(jsonPath("$.rows[0].status").value("ERROR"))
                .andExpect(jsonPath("$.rows[0].messages[0].key").value("pBcDup"))
                .andExpect(jsonPath("$.rows[0].messages[1].key").value("pNameDup"));
    }

    @Test
    void savesMappingProfile() throws Exception {
        Cookie c = loginAs("PURCHASER");
        mvc.perform(put("/api/products/import/profile").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"SMARTUP · mahsulotlar\",\"mapping\":{\"name\":\"Наименование\",\"code\":\"Код товара\",\"bogus\":\"X\"}}")
                        .with(csrf()).cookie(c))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mapping.name").value("Наименование"));
        mvc.perform(get("/api/products/import/profile").cookie(c))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("SMARTUP · mahsulotlar"))
                .andExpect(jsonPath("$.mapping.code").value("Код товара"))
                .andExpect(jsonPath("$.mapping.bogus").doesNotExist());
        mvc.perform(put("/api/products/import/profile").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"P\",\"mapping\":{}}")
                        .with(csrf()).cookie(c))
                .andExpect(status().isBadRequest());
    }

    @Test
    void barcodeChecksum() {
        assertThat(ProductImport.barcodeOk("4006381333931")).isTrue();
        assertThat(ProductImport.barcodeOk("4006381333932")).isFalse();
        assertThat(ProductImport.barcodeOk("96385074")).isTrue();
        assertThat(ProductImport.barcodeOk("ABC-123")).isTrue();
        assertThat(ProductImport.parseForm("kapsula")).isEqualTo(ProductModels.DosageForm.CAPSULE);
    }
}
