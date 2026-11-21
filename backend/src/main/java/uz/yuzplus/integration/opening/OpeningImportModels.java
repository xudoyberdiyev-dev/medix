package uz.yuzplus.integration.opening;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;

/** «SmartUp dan ko'chirish» (BQ1) — bitta fayl bilan boshlang'ich qoldiq. Pul — satr. */
final class OpeningImportModels {

    private OpeningImportModels() {}

    static final long MAX_FILE_BYTES = 10L * 1024 * 1024;
    static final int MAX_ISSUES = 500;

    enum Section { GOODS, CUSTOMER_DEBT, SUPPLIER_DEBT, MONEY }

    /** Guruhning (ombor yoki filial×tur) hozirgi BQ holati: qoralama almashtiriladi, o'tkazilgani bo'lsa — xato. */
    enum Existing { NONE, DRAFT, POSTED }

    record ImportIssue(String sheet, @Schema(nullable = true, description = "Excel qator raqami; null — varaq yoki guruh xatosi") Integer row,
            String message) {}

    record SectionTotal(Section section, int rows,
            @Schema(description = "Tovar — dona; boshqalar — 0") long qty,
            @Schema(nullable = true, description = "Tovar — tannarx jami (faqat special.cost bilan); boshqalar — summa jami") String amount) {}

    record ImportGroup(Section section, long branchId, String branch, @Schema(nullable = true) Long warehouseId,
            @Schema(nullable = true) String warehouse, int rows, long qty, @Schema(nullable = true) String amount, Existing existing) {}

    record OpeningImportPreview(
            String fileName,
            LocalDate cutoffDate,
            List<SectionTotal> sections,
            List<ImportGroup> groups,
            List<ImportIssue> errors,
            @Schema(description = "Ogohlantirishlar (muddati o'tgan partiya, o'tkazib yuborilgan varaq) — yaratishga to'sqinlik qilmaydi")
                    List<ImportIssue> warnings,
            @Schema(description = "Xatolar ro'yxati chegarada kesilgan") boolean errorsTruncated,
            boolean canApply) {}

    record CreatedDoc(Section section, long id, String number, long branchId, String branch, @Schema(nullable = true) String warehouse,
            int rows, boolean posted) {}

    record OpeningImportResult(List<CreatedDoc> documents, boolean posted) {}
}
