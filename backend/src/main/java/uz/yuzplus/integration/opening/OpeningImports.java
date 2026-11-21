package uz.yuzplus.integration.opening;

import java.io.InputStream;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.yuzplus.finance.opening.OpeningFinanceImport;
import uz.yuzplus.integration.opening.OpeningImportModels.CreatedDoc;
import uz.yuzplus.integration.opening.OpeningImportModels.Existing;
import uz.yuzplus.integration.opening.OpeningImportModels.ImportGroup;
import uz.yuzplus.integration.opening.OpeningImportModels.ImportIssue;
import uz.yuzplus.integration.opening.OpeningImportModels.OpeningImportPreview;
import uz.yuzplus.integration.opening.OpeningImportModels.OpeningImportResult;
import uz.yuzplus.integration.opening.OpeningImportModels.Section;
import uz.yuzplus.integration.opening.OpeningImportModels.SectionTotal;
import uz.yuzplus.integration.opening.OpeningImportSheets.Field;
import uz.yuzplus.integration.opening.OpeningImportSheets.ParsedSheet;
import uz.yuzplus.integration.opening.OpeningImportSheets.SheetRow;
import uz.yuzplus.integration.opening.OpeningImportSheets.ValueError;
import uz.yuzplus.inventory.opening.OpeningGoodsImport;
import uz.yuzplus.shared.error.YuzplusException;
import uz.yuzplus.shared.money.Money;
import uz.yuzplus.shared.security.Actor;
import uz.yuzplus.shared.text.Texts;

/**
 * BQ1 — «SmartUp dan ko'chirish»: bitta Excel fayldan tovar, mijozlar qarzi, YB qarzi, kassa va bank boshlang'ich qoldig'i.
 * Ko'rib chiqish hech narsa yozmaydi. Yaratish — bitta tranzaksiyada: har ombor uchun tovar BQ qoralamasi, har filial×tur uchun
 * pul BQ qoralamasi (mavjud qoralama almashtiriladi; o'tkazilgani bo'lsa — xato), ixtiyoriy ravishda hammasi o'tkaziladi.
 * Qoidalar — mavjud BQ servislarida (yangi biznes qoidasi yo'q).
 */
@Service
class OpeningImports {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final OpeningGoodsImport goods;
    private final OpeningFinanceImport finance;
    private final Texts texts;
    private final Clock clock;

    OpeningImports(JdbcClient jdbc, OpeningGoodsImport goods, OpeningFinanceImport finance, Texts texts, Clock clock) {
        this.jdbc = jdbc;
        this.goods = goods;
        this.finance = finance;
        this.texts = texts;
        this.clock = clock;
    }

    /** Foydalanuvchi huquqlari (controller beradi). */
    record Rights(boolean goods, boolean cost, boolean approve) {}

    // ===== Reja (ko'rib chiqish va yaratish uchun umumiy) =====

    private record BranchRef(long id, String code, String name) {}

    private record WarehouseRef(long id, long branchId, String name) {}

    private record PartyRef(long id, boolean customer, boolean supplier) {}

    private record AccountRef(long id, long branchId, String code, String name) {}

    private static final class GoodsGroup {
        final BranchRef branch;
        final WarehouseRef warehouse;
        final String sheet;
        final List<OpeningGoodsImport.Line> lines = new ArrayList<>();
        final List<Integer> rows = new ArrayList<>();
        long qty;
        BigDecimal cost = BigDecimal.ZERO;

        GoodsGroup(BranchRef branch, WarehouseRef warehouse, String sheet) {
            this.branch = branch;
            this.warehouse = warehouse;
            this.sheet = sheet;
        }
    }

    private static final class FinanceGroup {
        final Section section;
        final BranchRef branch;
        final String sheet;
        final List<OpeningFinanceImport.Line> lines = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;

        FinanceGroup(Section section, BranchRef branch, String sheet) {
            this.section = section;
            this.branch = branch;
            this.sheet = sheet;
        }
    }

    private final class Plan {
        final Actor actor;
        final Rights rights;
        final LocalDate cutoff;
        final List<ImportIssue> errors = new ArrayList<>();
        final List<ImportIssue> warnings = new ArrayList<>();
        boolean truncated;
        final Map<Long, GoodsGroup> goodsGroups = new LinkedHashMap<>();
        final Map<String, FinanceGroup> financeGroups = new LinkedHashMap<>();
        final Map<Long, Existing> goodsExisting = new HashMap<>();
        final Map<String, Existing> financeExisting = new HashMap<>();

        // Ma'lumotnomalar
        final List<BranchRef> branches = new ArrayList<>();
        final List<WarehouseRef> warehouses = new ArrayList<>();
        final Map<String, Long> productByCode = new HashMap<>();
        final Map<String, Long> productByBarcode = new HashMap<>();
        final Map<String, Long> productByName = new HashMap<>();
        final Map<String, PartyRef> partyByTin = new HashMap<>();
        final Map<String, PartyRef> partyByName = new HashMap<>();
        final Map<Long, PartyRef> parties = new HashMap<>();
        final List<AccountRef> accounts = new ArrayList<>();

        Plan(Actor actor, Rights rights, LocalDate cutoff) {
            this.actor = actor;
            this.rights = rights;
            this.cutoff = cutoff;
        }

        void error(String sheet, Integer row, String key, Object... args) {
            if (errors.size() >= OpeningImportModels.MAX_ISSUES) {
                truncated = true;
                return;
            }
            errors.add(new ImportIssue(sheet, row, texts.getIn(Texts.requestLocale(), key, args)));
        }

        void warn(String sheet, Integer row, String key, Object... args) {
            if (warnings.size() < OpeningImportModels.MAX_ISSUES) {
                warnings.add(new ImportIssue(sheet, row, texts.getIn(Texts.requestLocale(), key, args)));
            }
        }
    }

    // ===== Ochiq amallar =====

    @Transactional(readOnly = true)
    OpeningImportPreview preview(Actor actor, Rights rights, InputStream in, String fileName, LocalDate cutoff) {
        Plan p = plan(actor, rights, in, cutoff);
        return toPreview(p, fileName);
    }

    @Transactional
    OpeningImportResult apply(Actor actor, Rights rights, InputStream in, String fileName, LocalDate cutoff, boolean post) {
        if (post && !rights.approve()) {
            throw YuzplusException.forbidden("openingImport.postForbidden");
        }
        Plan p = plan(actor, rights, in, cutoff);
        if (!p.errors.isEmpty()) {
            throw YuzplusException.badRequest("openingImport.hasErrors", p.errors.size() + (p.truncated ? "+" : ""));
        }
        if (p.goodsGroups.isEmpty() && p.financeGroups.isEmpty()) {
            throw YuzplusException.badRequest("import.empty");
        }
        String note = texts.getIn(Texts.UZ, "openingImport.note", fileName == null ? "" : fileName);
        List<CreatedDoc> docs = new ArrayList<>();
        for (GoodsGroup g : p.goodsGroups.values()) {
            long id = goods.replaceDraft(actor, g.branch.id(), g.warehouse.id(), cutoff, g.lines, fileName, note);
            docs.add(new CreatedDoc(Section.GOODS, id, goods.number(id), g.branch.id(), g.branch.name(), g.warehouse.name(), g.lines.size(), post));
        }
        for (FinanceGroup g : p.financeGroups.values()) {
            OpeningFinanceImport.Section s = OpeningFinanceImport.Section.valueOf(g.section.name());
            long id = finance.replaceDraft(actor, s, g.branch.id(), cutoff, g.lines, note);
            docs.add(new CreatedDoc(g.section, id, finance.number(id), g.branch.id(), g.branch.name(), null, g.lines.size(), post));
        }
        if (post) {
            for (CreatedDoc d : docs) {
                if (d.section() == Section.GOODS) {
                    goods.post(actor, d.id());
                } else {
                    finance.post(actor, d.id());
                }
            }
        }
        return new OpeningImportResult(docs, post);
    }

    // ===== Rejani tuzish =====

    private Plan plan(Actor actor, Rights rights, InputStream in, LocalDate cutoff) {
        Plan p = new Plan(actor, rights, cutoff);
        OpeningImportSheets.Parsed parsed = OpeningImportSheets.read(in);
        if (cutoff.isAfter(LocalDate.now(clock.withZone(TASHKENT)))) {
            p.error("", null, "opening.futureDate");
        }
        for (OpeningImportSheets.SkippedSheet s : parsed.skipped()) {
            p.warn(s.name(), null, s.reason());
        }
        if (parsed.sheets().isEmpty() || parsed.sheets().stream().allMatch(s -> s.rows().isEmpty())) {
            throw YuzplusException.badRequest("openingImport.noSheets");
        }
        loadRefs(p, parsed);
        for (ParsedSheet sheet : parsed.sheets()) {
            if (sheet.section() == Section.GOODS) {
                if (!rights.goods() && !sheet.rows().isEmpty()) {
                    p.error(sheet.name(), null, "openingImport.goodsForbidden");
                    continue;
                }
                sheet.rows().forEach(r -> goodsRow(p, sheet.name(), r));
            } else {
                sheet.rows().forEach(r -> financeRow(p, sheet, r));
            }
        }
        // Qatorlararo qoidalar (takror, bir partiya — bitta yaroqlilik, Seyf) — BQ qoralamasi bilan bir xil
        for (GoodsGroup g : p.goodsGroups.values()) {
            for (String e : goods.validate(g.warehouse.id(), g.lines)) {
                int dash = e.indexOf('-');
                int idx = Integer.parseInt(e.substring(0, dash)) - 1;
                p.error(g.sheet, g.rows.get(idx), "openingImport.lineRule", e.substring(e.indexOf(':') + 1).strip());
            }
            Existing ex = Existing.valueOf(goods.existing(g.warehouse.id()).name());
            p.goodsExisting.put(g.warehouse.id(), ex);
            if (ex == Existing.POSTED) {
                p.error(g.sheet, null, "openingImport.goodsPosted", g.warehouse.name());
            }
        }
        for (Map.Entry<String, FinanceGroup> e : p.financeGroups.entrySet()) {
            FinanceGroup g = e.getValue();
            Existing ex = Existing.valueOf(finance.existing(g.branch.id(), OpeningFinanceImport.Section.valueOf(g.section.name())).name());
            p.financeExisting.put(e.getKey(), ex);
            if (ex == Existing.POSTED) {
                p.error(g.sheet, null, "openingImport.financePosted", g.branch.name());
            }
        }
        return p;
    }

    private void loadRefs(Plan p, OpeningImportSheets.Parsed parsed) {
        jdbc.sql("SELECT id, code, name FROM branch WHERE active ORDER BY id")
                .query((rs, n) -> new BranchRef(rs.getLong("id"), rs.getString("code"), rs.getString("name")))
                .list()
                .stream()
                .filter(b -> p.actor.canAccessBranch(b.id()))
                .forEach(p.branches::add);
        jdbc.sql("SELECT id, branch_id, name FROM warehouse WHERE active ORDER BY id")
                .query((rs, n) -> new WarehouseRef(rs.getLong("id"), rs.getLong("branch_id"), rs.getString("name")))
                .list()
                .stream()
                .filter(w -> p.actor.canAccessBranch(w.branchId()))
                .forEach(p.warehouses::add);
        boolean hasGoods = parsed.sheets().stream().anyMatch(s -> s.section() == Section.GOODS);
        boolean hasDebt = parsed.sheets().stream().anyMatch(s -> s.section() == Section.CUSTOMER_DEBT || s.section() == Section.SUPPLIER_DEBT);
        if (hasGoods) {
            jdbc.sql("SELECT id, code, name FROM product WHERE active").query((rs, n) -> {
                p.productByCode.put(rs.getString("code"), rs.getLong("id"));
                // Bir xil nomli ikki mahsulot — nom bo'yicha topilmaydi (-1)
                p.productByName.merge(OpeningImportSheets.key(rs.getString("name")), rs.getLong("id"), (a, b) -> -1L);
                return null;
            }).list();
            jdbc.sql("SELECT b.barcode, b.product_id FROM product_barcode b JOIN product p ON p.id = b.product_id WHERE p.active")
                    .query((rs, n) -> p.productByBarcode.putIfAbsent(rs.getString("barcode"), rs.getLong("product_id")))
                    .list();
        }
        if (hasDebt) {
            jdbc.sql("SELECT id, tin, name, is_customer, is_supplier FROM counterparty").query((rs, n) -> {
                PartyRef ref = new PartyRef(rs.getLong("id"), rs.getBoolean("is_customer"), rs.getBoolean("is_supplier"));
                p.parties.put(ref.id(), ref);
                p.partyByTin.put(rs.getString("tin"), ref);
                p.partyByName.merge(OpeningImportSheets.key(rs.getString("name")), ref, (a, b) -> new PartyRef(-1, false, false));
                return null;
            }).list();
        }
        jdbc.sql("SELECT id, branch_id, code, name FROM money_account WHERE active ORDER BY id")
                .query((rs, n) -> new AccountRef(rs.getLong("id"), rs.getLong("branch_id"), rs.getString("code"), rs.getString("name")))
                .list()
                .stream()
                .filter(a -> p.actor.canAccessBranch(a.branchId()))
                .forEach(p.accounts::add);
    }

    /** Filial ustuni (kod yoki nom); bo'sh — yagona ruxsatli filial. Topilmasa — xato va {@code null}. */
    private BranchRef branch(Plan p, String sheet, SheetRow r, boolean optional) {
        String text = r.text(Field.BRANCH);
        if (text.isEmpty()) {
            if (p.branches.size() == 1) {
                return p.branches.getFirst();
            }
            if (!optional) {
                p.error(sheet, r.rowNo(), "openingImport.branchRequired");
            }
            return null;
        }
        String k = OpeningImportSheets.key(text);
        for (BranchRef b : p.branches) {
            if (b.code().equalsIgnoreCase(text.strip()) || OpeningImportSheets.key(b.name()).equals(k)) {
                return b;
            }
        }
        p.error(sheet, r.rowNo(), "openingImport.branchUnknown", text);
        return null;
    }

    private void goodsRow(Plan p, String sheet, SheetRow r) {
        int row = r.rowNo();
        BranchRef branch = branch(p, sheet, r, true);
        if (branch == null && !r.text(Field.BRANCH).isEmpty()) {
            return;
        }
        // Ombor: nomi bo'yicha (filial ichida yoki barcha ruxsatli filiallarda — yagona bo'lsa); bo'sh — filialning yagona ombori
        String wText = r.text(Field.WAREHOUSE);
        List<WarehouseRef> candidates = p.warehouses.stream()
                .filter(w -> branch == null || w.branchId() == branch.id())
                .filter(w -> wText.isEmpty() || OpeningImportSheets.key(w.name()).equals(OpeningImportSheets.key(wText)))
                .toList();
        if (candidates.size() != 1) {
            if (wText.isEmpty()) {
                p.error(sheet, row, "openingImport.warehouseRequired");
            } else if (candidates.isEmpty()) {
                p.error(sheet, row, "openingImport.warehouseUnknown", wText);
            } else {
                p.error(sheet, row, "openingImport.warehouseAmbiguous", wText);
            }
            return;
        }
        WarehouseRef w = candidates.getFirst();
        BranchRef wb = p.branches.stream().filter(b -> b.id() == w.branchId()).findFirst().orElse(null);
        if (wb == null) {
            p.error(sheet, row, "openingImport.warehouseUnknown", wText);
            return;
        }
        Long product = product(p, r);
        if (product == null) {
            String shown = firstNonEmpty(r.text(Field.PRODUCT_CODE), r.text(Field.BARCODE), r.text(Field.PRODUCT_NAME));
            p.error(sheet, row, shown.isEmpty() ? "openingImport.productRequired" : "openingImport.productUnknown", shown);
            return;
        }
        Long zone = goods.zone(w.id(), r.text(Field.ZONE)).orElse(null);
        if (zone == null) {
            p.error(sheet, row, "openingImport.zoneUnknown", r.text(Field.ZONE), w.name());
            return;
        }
        String batch = r.text(Field.BATCH);
        if (batch.isEmpty()) {
            p.error(sheet, row, "openingImport.batchRequired");
            return;
        }
        if (batch.length() > 60) {
            p.error(sheet, row, "openingImport.batchTooLong");
            return;
        }
        try {
            LocalDate produced = OpeningImportSheets.date(r.raw(Field.PRODUCED));
            LocalDate expiry = OpeningImportSheets.date(r.raw(Field.EXPIRY));
            if (expiry == null) {
                p.error(sheet, row, "openingImport.expiryRequired");
                return;
            }
            boolean bonus = OpeningImportSheets.yes(r.text(Field.BONUS));
            BigDecimal cost = OpeningImportSheets.amount(r.raw(Field.COST));
            if (cost == null) {
                if (!bonus) {
                    p.error(sheet, row, "openingImport.costRequired");
                    return;
                }
                cost = BigDecimal.ZERO.setScale(2);
            }
            if (cost.signum() < 0) {
                p.error(sheet, row, "openingImport.badAmount", r.text(Field.COST));
                return;
            }
            Integer qty = OpeningImportSheets.qty(r.raw(Field.QTY));
            if (qty == null) {
                p.error(sheet, row, "openingImport.qtyRequired");
                return;
            }
            if (expiry.isBefore(p.cutoff)) {
                p.warn(sheet, row, "openingImport.expired", batch);
            }
            GoodsGroup g = p.goodsGroups.computeIfAbsent(w.id(), k -> new GoodsGroup(wb, w, sheet));
            g.lines.add(new OpeningGoodsImport.Line(product, zone, batch, produced, expiry, cost.toPlainString(), bonus, qty));
            g.rows.add(row);
            g.qty += qty;
            g.cost = g.cost.add(cost.multiply(BigDecimal.valueOf(qty)));
        } catch (ValueError e) {
            p.error(sheet, row, e.key, e.args);
        }
    }

    private static Long product(Plan p, SheetRow r) {
        String code = r.text(Field.PRODUCT_CODE);
        String barcode = r.text(Field.BARCODE);
        if (!code.isEmpty()) {
            Long id = p.productByCode.get(code);
            if (id == null) {
                id = p.productByBarcode.get(code);
            }
            if (id != null) {
                return id;
            }
        }
        if (!barcode.isEmpty() && p.productByBarcode.containsKey(barcode)) {
            return p.productByBarcode.get(barcode);
        }
        String name = r.text(Field.PRODUCT_NAME);
        if (!name.isEmpty()) {
            Long id = p.productByName.get(OpeningImportSheets.key(name));
            if (id != null && id > 0) {
                return id;
            }
        }
        return null;
    }

    private void financeRow(Plan p, ParsedSheet sheet, SheetRow r) {
        int row = r.rowNo();
        BranchRef branch = branch(p, sheet.name(), r, false);
        if (branch == null) {
            return;
        }
        BigDecimal amount;
        LocalDate due;
        try {
            amount = OpeningImportSheets.amount(r.raw(Field.AMOUNT));
            due = OpeningImportSheets.date(r.raw(Field.DUE));
        } catch (ValueError e) {
            p.error(sheet.name(), row, e.key, e.args);
            return;
        }
        if (amount == null || amount.signum() == 0) {
            p.error(sheet.name(), row, "openingImport.amountRequired");
            return;
        }
        String key = sheet.section().name() + ":" + branch.id();
        OpeningFinanceImport.Line line;
        if (sheet.section() == Section.MONEY) {
            if (amount.signum() < 0) {
                p.error(sheet.name(), row, "openingImport.moneyNegative");
                return;
            }
            String text = firstNonEmpty(r.text(Field.ACCOUNT), r.text(Field.PRODUCT_NAME));
            String k = OpeningImportSheets.key(text);
            AccountRef a = p.accounts.stream()
                    .filter(x -> x.branchId() == branch.id())
                    .filter(x -> x.code().equalsIgnoreCase(text) || OpeningImportSheets.key(x.name()).equals(k))
                    .findFirst()
                    .orElse(null);
            if (a == null) {
                p.error(sheet.name(), row, "openingImport.accountUnknown", text, branch.name());
                return;
            }
            FinanceGroup g = p.financeGroups.get(key);
            if (g != null && g.lines.stream().anyMatch(l -> Objects.equals(l.accountId(), a.id()))) {
                p.error(sheet.name(), row, "openingImport.accountDuplicate", a.name());
                return;
            }
            line = new OpeningFinanceImport.Line(null, a.id(), amount.toPlainString(), null, null);
        } else {
            String tin = OpeningImportSheets.tin(r);
            String name = firstNonEmpty(r.text(Field.PARTY_NAME), r.text(Field.PRODUCT_NAME));
            PartyRef party = !tin.isEmpty() ? p.partyByTin.get(tin) : null;
            if (party == null && !name.isEmpty()) {
                PartyRef byName = p.partyByName.get(OpeningImportSheets.key(name));
                party = byName == null || byName.id() < 0 ? null : byName;
            }
            if (party == null) {
                String shown = firstNonEmpty(tin, name, r.text(Field.PARTY_TIN));
                p.error(sheet.name(), row, shown.isEmpty() ? "openingImport.partyRequired" : "openingImport.partyUnknown", shown);
                return;
            }
            boolean customer = sheet.section() == Section.CUSTOMER_DEBT;
            if (customer ? !party.customer() : !party.supplier()) {
                p.error(sheet.name(), row, customer ? "openingImport.notCustomer" : "openingImport.notSupplier", firstNonEmpty(name, tin));
                return;
            }
            String ref = r.text(Field.DOC_REF);
            if (ref.length() > 60) {
                ref = ref.substring(0, 60);
            }
            line = new OpeningFinanceImport.Line(party.id(), null, amount.toPlainString(), amount.signum() > 0 ? due : null,
                    ref.isEmpty() ? null : ref);
        }
        FinanceGroup g = p.financeGroups.computeIfAbsent(key, k -> new FinanceGroup(sheet.section(), branch, sheet.name()));
        g.lines.add(line);
        g.total = g.total.add(amount);
    }

    // ===== Natija =====

    private OpeningImportPreview toPreview(Plan p, String fileName) {
        Map<Section, long[]> counts = new EnumMap<>(Section.class);
        Map<Section, BigDecimal> sums = new EnumMap<>(Section.class);
        List<ImportGroup> groups = new ArrayList<>();
        for (GoodsGroup g : p.goodsGroups.values()) {
            counts.computeIfAbsent(Section.GOODS, s -> new long[2])[0] += g.lines.size();
            counts.get(Section.GOODS)[1] += g.qty;
            sums.merge(Section.GOODS, g.cost, BigDecimal::add);
            groups.add(new ImportGroup(Section.GOODS, g.branch.id(), g.branch.name(), g.warehouse.id(), g.warehouse.name(), g.lines.size(), g.qty,
                    p.rights.cost() ? new Money(g.cost).toString() : null, p.goodsExisting.getOrDefault(g.warehouse.id(), Existing.NONE)));
        }
        for (Map.Entry<String, FinanceGroup> e : p.financeGroups.entrySet()) {
            FinanceGroup g = e.getValue();
            counts.computeIfAbsent(g.section, s -> new long[2])[0] += g.lines.size();
            sums.merge(g.section, g.total, BigDecimal::add);
            groups.add(new ImportGroup(g.section, g.branch.id(), g.branch.name(), null, null, g.lines.size(), 0, new Money(g.total).toString(),
                    p.financeExisting.getOrDefault(e.getKey(), Existing.NONE)));
        }
        List<SectionTotal> sections = new ArrayList<>();
        for (Section s : Section.values()) {
            long[] c = counts.get(s);
            if (c == null) {
                continue;
            }
            String amount = s == Section.GOODS && !p.rights.cost() ? null : new Money(sums.getOrDefault(s, BigDecimal.ZERO)).toString();
            sections.add(new SectionTotal(s, (int) c[0], s == Section.GOODS ? c[1] : 0, amount));
        }
        boolean canApply = p.errors.isEmpty() && !groups.isEmpty();
        return new OpeningImportPreview(fileName == null ? "" : fileName, p.cutoff, sections, groups, p.errors, p.warnings, p.truncated, canApply);
    }

    private static String firstNonEmpty(String... values) {
        for (String v : values) {
            if (v != null && !v.isEmpty()) {
                return v;
            }
        }
        return "";
    }
}
