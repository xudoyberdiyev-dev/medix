package uz.medix.reporting.workers;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.security.Actor;
import uz.medix.shared.security.CurrentActor;

/** Yig'uvchilar natijasi (reports.pickers) va Markirovkachilar natijasi (reports.markers): filial doirasida, .xlsx eksport. */
@RestController
@Tag(name = "reports", description = "Hisobotlar")
class WorkerReportController {

    private final WorkerReport report;
    private final CurrentActor currentActor;

    WorkerReportController(WorkerReport report, CurrentActor currentActor) {
        this.report = report;
        this.currentActor = currentActor;
    }

    private WorkerReport.WorkerReportView build(WorkerReport.Kind kind, Long branchId, LocalDate from, LocalDate to) {
        Actor actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        return report.report(actor, kind, branchId, from, to);
    }

    @GetMapping("/api/reports/pickers/mine")
    @PreAuthorize("hasAuthority('picking.do')")
    @Operation(summary = "Bugungi natijam (Yig'uvchi)")
    WorkerReport.WorkerRow pickerToday() {
        Actor actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        return report.mine(actor, WorkerReport.Kind.PICKERS);
    }

    @GetMapping("/api/reports/markers/mine")
    @PreAuthorize("hasAuthority('marking.scan')")
    @Operation(summary = "Bugungi natijam (Markirovkachi)")
    WorkerReport.WorkerRow markerToday() {
        Actor actor = currentActor.current().orElseThrow(() -> MedixException.unauthorized("auth.unauthorized"));
        return report.mine(actor, WorkerReport.Kind.MARKERS);
    }

    @GetMapping("/api/reports/pickers")
    @PreAuthorize("hasAuthority('reports.pickers')")
    @Operation(summary = "Yig'uvchilar natijasi: yakunlangan buyurtmalar, qatorlar, dona, vaqt (berilgan / haqiqiy), vaqtida / kechikkan, FEFO'dan chetlashish")
    WorkerReport.WorkerReportView pickers(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return build(WorkerReport.Kind.PICKERS, branchId, from, to);
    }

    @GetMapping("/api/reports/markers")
    @PreAuthorize("hasAuthority('reports.markers')")
    @Operation(summary = "Markirovkachilar natijasi: yakunlangan buyurtmalar, qatorlar, kodlar, olib tashlangan kodlar, vaqt, vaqtida / kechikkan")
    WorkerReport.WorkerReportView markers(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return build(WorkerReport.Kind.MARKERS, branchId, from, to);
    }

    @GetMapping("/api/reports/pickers/export")
    @PreAuthorize("hasAuthority('reports.pickers')")
    @Operation(summary = "Yig'uvchilar natijasi .xlsx")
    void pickersExport(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to, HttpServletResponse response)
            throws IOException {
        export(build(WorkerReport.Kind.PICKERS, branchId, from, to), response);
    }

    @GetMapping("/api/reports/markers/export")
    @PreAuthorize("hasAuthority('reports.markers')")
    @Operation(summary = "Markirovkachilar natijasi .xlsx")
    void markersExport(@RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to, HttpServletResponse response)
            throws IOException {
        export(build(WorkerReport.Kind.MARKERS, branchId, from, to), response);
    }

    private static void export(WorkerReport.WorkerReportView r, HttpServletResponse response) throws IOException {
        boolean pick = r.kind() == WorkerReport.Kind.PICKERS;
        String title = pick ? "Yigʻuvchilar natijasi" : "Markirovkachilar natijasi";
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + (pick ? "yiguvchilar" : "markirovkachilar") + "-natijasi-"
                + r.from() + "-" + r.to() + ".xlsx\"");
        try (SXSSFWorkbook wb = new SXSSFWorkbook(200)) {
            Sheet sheet = wb.createSheet(pick ? "Yigʻuvchilar" : "Markirovkachilar");
            CellStyle bold = wb.createCellStyle();
            Font font = wb.createFont();
            font.setBold(true);
            bold.setFont(font);
            List<String> titles = new ArrayList<>(List.of(pick ? "Yigʻuvchi" : "Markirovkachi", "Buyurtmalar", "Qatorlar",
                    pick ? "Dona" : "Kodlar", "Berilgan vaqt, daq", "Haqiqiy vaqt, daq", "Oʻrtacha, daq", "Vaqtida", "Kechikkan"));
            titles.add(pick ? "FEFOʻdan chetlashish" : "Olib tashlangan kodlar");
            sheet.createRow(0).createCell(0).setCellValue(title + ": " + format(r.from()) + " – " + format(r.to()));
            Row h = sheet.createRow(2);
            for (int i = 0; i < titles.size(); i++) {
                Cell c = h.createCell(i);
                c.setCellValue(titles.get(i));
                c.setCellStyle(bold);
            }
            int n = 3;
            for (WorkerReport.WorkerRow row : r.rows()) {
                write(sheet.createRow(n++), row, pick, null);
            }
            write(sheet.createRow(n), r.total(), pick, bold);
            sheet.setColumnWidth(0, 36 * 256);
            for (int i = 1; i < titles.size(); i++) {
                sheet.setColumnWidth(i, 16 * 256);
            }
            sheet.createFreezePane(0, 3);
            wb.write(response.getOutputStream());
        }
    }

    private static void write(Row x, WorkerReport.WorkerRow r, boolean pick, CellStyle style) {
        Cell name = x.createCell(0);
        name.setCellValue(r.name());
        if (style != null) {
            name.setCellStyle(style);
        }
        Integer last = pick ? r.fefoDeviations() : r.removedCodes();
        int[] values = {r.orders(), r.lines(), r.units(), r.givenMinutes(), r.actualMinutes(), r.avgMinutes(), r.onTime(), r.late(),
            last == null ? 0 : last};
        for (int i = 0; i < values.length; i++) {
            Cell c = x.createCell(1 + i);
            c.setCellValue(values[i]);
            if (style != null) {
                c.setCellStyle(style);
            }
        }
    }

    private static String format(LocalDate d) {
        return "%02d.%02d.%d".formatted(d.getDayOfMonth(), d.getMonthValue(), d.getYear());
    }
}
