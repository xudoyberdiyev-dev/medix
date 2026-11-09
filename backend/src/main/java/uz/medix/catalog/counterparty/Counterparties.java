package uz.medix.catalog.counterparty;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.catalog.counterparty.CounterpartyModels.Contract;
import uz.medix.catalog.counterparty.CounterpartyModels.ContractRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.CounterpartyDetail;
import uz.medix.catalog.counterparty.CounterpartyModels.CounterpartyRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.CounterpartyRow;
import uz.medix.catalog.counterparty.CounterpartyModels.License;
import uz.medix.catalog.counterparty.CounterpartyModels.LicenseRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.CounterpartyPage;
import uz.medix.catalog.counterparty.CounterpartyModels.PaymentType;
import uz.medix.catalog.counterparty.CounterpartyModels.PriceTypeAttachRequest;
import uz.medix.catalog.counterparty.CounterpartyModels.PriceTypeCustomer;
import uz.medix.catalog.counterparty.CounterpartyModels.PriceTypeCustomers;
import uz.medix.catalog.counterparty.CounterpartyModels.Ref;
import uz.medix.catalog.counterparty.CounterpartyModels.Role;
import uz.medix.catalog.counterparty.CounterpartyModels.SortField;
import uz.medix.catalog.counterparty.CounterpartyModels.Status;
import uz.medix.catalog.counterparty.CounterpartyModels.Terms;
import uz.medix.catalog.counterparty.CounterpartyModels.TermsRequest;
import uz.medix.shared.audit.AuditEntry;
import uz.medix.shared.audit.AuditLog;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.money.Money;
import uz.medix.shared.security.Actor;
import uz.medix.shared.text.SearchMatch;
import uz.medix.shared.text.SearchText;

/** Kontragentlar (SPEC 2): bitta STIR — bitta karta; litsenziyalar, shartnomalar, filial shartlari. */
@Service
class Counterparties {

    private static final ZoneId TASHKENT = ZoneId.of("Asia/Tashkent");

    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final Clock clock;

    Counterparties(JdbcClient jdbc, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    // ===== O'qish =====

    @Transactional(readOnly = true)
    CounterpartyPage search(String q, Role role, Status status, Long regionId, SortField sort, boolean desc, int page, int size) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new HashMap<>();
        switch (role) {
            case CUSTOMER -> where.append(" AND c.is_customer");
            case SUPPLIER -> where.append(" AND c.is_supplier");
            case ALL -> { }
        }
        switch (status) {
            case ACTIVE -> where.append(" AND c.active AND NOT c.blocked");
            case BLOCKED -> where.append(" AND c.blocked");
            case INACTIVE -> where.append(" AND NOT c.active");
            case ALL -> { }
        }
        if (regionId != null) {
            where.append(" AND c.region_id = :region");
            params.put("region", regionId);
        }
        String nq = SearchText.normalize(q);
        if (!nq.isEmpty()) {
            String[] parts = nq.split(" ");
            where.append(" AND (c.tin = :exact OR (true");
            for (int i = 0; i < parts.length && i < 8; i++) {
                where.append(" AND c.search_text LIKE :w").append(i).append(" ESCAPE '\\'");
                params.put("w" + i, "%" + SearchText.likeEscape(parts[i]) + "%");
            }
            where.append("))");
            params.put("exact", q.strip());
        }
        long total = jdbc.sql("SELECT count(*) FROM counterparty c" + where).params(params).query(Long.class).single();
        List<CounterpartyRow> items = jdbc.sql("""
                SELECT c.id, c.tin, c.name, c.legal_name, c.is_customer, c.is_supplier, r.name AS region, c.phone,
                       (SELECT max(l.valid_until) FROM counterparty_license l WHERE l.counterparty_id = c.id) AS license_valid_until,
                       c.blocked, c.active, c.contact_person
                FROM counterparty c LEFT JOIN region r ON r.id = c.region_id""" + where
                        + orderBy(sort, desc) + ", c.id LIMIT :limit OFFSET :offset")
                .params(params)
                .param("limit", size)
                .param("offset", (long) page * size)
                .query((rs, n) -> row(rs, nq.isEmpty() ? null : q))
                .list();
        return new CounterpartyPage(items, total, page, size);
    }

    @Transactional(readOnly = true)
    Optional<CounterpartyDetail> find(long id, Actor actor) {
        record Base(long id, String tin, String name, String legalName, boolean isCustomer, boolean isSupplier, Long regionId,
                String region, String address, String phone, String contactPerson, String email, String bankName,
                String bankAccount, String bankMfo, String vatCode, String note, boolean blocked, String blockedReason,
                boolean active) {}
        Optional<Base> base = jdbc.sql("""
                SELECT c.id, c.tin, c.name, c.legal_name, c.is_customer, c.is_supplier, c.region_id, r.name AS region, c.address,
                       c.phone, c.contact_person, c.email, c.bank_name, c.bank_account, c.bank_mfo, c.vat_code, c.note,
                       c.blocked, c.blocked_reason, c.active
                FROM counterparty c LEFT JOIN region r ON r.id = c.region_id WHERE c.id = :id""")
                .param("id", id)
                .query(Base.class)
                .optional();
        if (base.isEmpty()) {
            return Optional.empty();
        }
        Base b = base.get();
        List<License> licenses = jdbc.sql("""
                SELECT id, number, kind, issued_on, valid_until, controlled_allowed FROM counterparty_license
                WHERE counterparty_id = :id ORDER BY valid_until DESC NULLS LAST, id DESC""")
                .param("id", id)
                .query((rs, n) -> new License(rs.getLong("id"), rs.getString("number"), rs.getString("kind"),
                        date(rs, "issued_on"), date(rs, "valid_until"), rs.getBoolean("controlled_allowed")))
                .list();
        List<Contract> contracts = jdbc.sql("""
                SELECT id, branch_id, number, signed_on, valid_until, note FROM counterparty_contract
                WHERE counterparty_id = :id ORDER BY signed_on DESC NULLS LAST, id DESC""")
                .param("id", id)
                .query((rs, n) -> new Contract(rs.getLong("id"), rs.getLong("branch_id"), rs.getString("number"),
                        date(rs, "signed_on"), date(rs, "valid_until"), rs.getString("note")))
                .list()
                .stream()
                .filter(c -> actor.canAccessBranch(c.branchId()))
                .toList();
        List<Terms> terms = jdbc.sql("""
                SELECT t.branch_id, t.credit_limit, t.payment_days, t.price_type_id, pt.name AS price_type, t.min_shelf_life_days,
                       t.operator_employee_id, op.full_name AS operator, t.supplier_payment_days, t.default_payment_type,
                       t.supply_employee_id, se.full_name AS supply_employee
                FROM counterparty_branch_terms t
                LEFT JOIN price_type pt ON pt.id = t.price_type_id
                LEFT JOIN employee op ON op.id = t.operator_employee_id
                LEFT JOIN employee se ON se.id = t.supply_employee_id
                WHERE t.counterparty_id = :id ORDER BY t.branch_id""")
                .param("id", id)
                .query((rs, n) -> new Terms(rs.getLong("branch_id"),
                        Optional.ofNullable(rs.getBigDecimal("credit_limit")).map(v -> new Money(v).toString()).orElse(null),
                        (Integer) rs.getObject("payment_days"), ref(rs, "price_type_id", "price_type"),
                        (Integer) rs.getObject("min_shelf_life_days"), ref(rs, "operator_employee_id", "operator"),
                        (Integer) rs.getObject("supplier_payment_days"),
                        Optional.ofNullable(rs.getString("default_payment_type")).map(PaymentType::valueOf).orElse(null),
                        ref(rs, "supply_employee_id", "supply_employee")))
                .list()
                .stream()
                .filter(t -> actor.canAccessBranch(t.branchId()))
                .toList();
        return Optional.of(new CounterpartyDetail(b.id(), b.tin(), b.name(), b.legalName(), b.isCustomer(), b.isSupplier(),
                b.regionId() == null ? null : new Ref(b.regionId(), b.region()), b.address(), b.phone(), b.contactPerson(), b.email(),
                b.bankName(), b.bankAccount(), b.bankMfo(), b.vatCode(), b.note(), b.blocked(), b.blockedReason(), b.active(),
                licenses, contracts, terms));
    }

    // ===== Karta =====

    @Transactional
    long create(CounterpartyRequest r) {
        validateCard(r, null);
        long id = jdbc.sql("""
                INSERT INTO counterparty (tin, name, legal_name, is_customer, is_supplier, region_id, address, phone, contact_person,
                                          email, bank_name, bank_account, bank_mfo, vat_code, note)
                VALUES (:tin, :name, :legal, :customer, :supplier, :region, :address, :phone, :contact, :email, :bank, :account,
                        :mfo, :vat, :note) RETURNING id""")
                .params(cardParams(r))
                .query(Long.class)
                .single();
        refreshSearchText(id);
        audit.record(AuditEntry.of("counterparty.create", "counterparty", id).change(null, cardParams(r)));
        return id;
    }

    @Transactional
    void update(long id, CounterpartyRequest r) {
        Map<String, Object> before = lockCard(id);
        validateCard(r, id);
        jdbc.sql("""
                UPDATE counterparty SET tin = :tin, name = :name, legal_name = :legal, is_customer = :customer, is_supplier = :supplier,
                       region_id = :region, address = :address, phone = :phone, contact_person = :contact, email = :email,
                       bank_name = :bank, bank_account = :account, bank_mfo = :mfo, vat_code = :vat, note = :note,
                       updated_at = now(), version = version + 1
                WHERE id = :id""")
                .params(cardParams(r))
                .param("id", id)
                .update();
        refreshSearchText(id);
        audit.record(AuditEntry.of("counterparty.update", "counterparty", id).change(before, cardParams(r)));
    }

    @Transactional
    void block(long id, String reason) {
        lockCard(id);
        jdbc.sql("UPDATE counterparty SET blocked = true, blocked_reason = :r, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("r", reason.strip())
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("counterparty.block", "counterparty", id).withReason(reason.strip()));
    }

    @Transactional
    void unblock(long id) {
        lockCard(id);
        jdbc.sql("UPDATE counterparty SET blocked = false, blocked_reason = NULL, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("id", id)
                .update();
        audit.record(AuditEntry.of("counterparty.unblock", "counterparty", id));
    }

    @Transactional
    void setActive(long id, boolean active, String reason) {
        lockCard(id);
        jdbc.sql("UPDATE counterparty SET active = :a, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("a", active)
                .param("id", id)
                .update();
        var entry = AuditEntry.of(active ? "counterparty.activate" : "counterparty.deactivate", "counterparty", id);
        audit.record(reason == null ? entry : entry.withReason(reason.strip()));
    }

    // ===== Litsenziya, shartnoma, shartlar =====

    @Transactional
    void saveLicense(long counterpartyId, Long licenseId, LicenseRequest r) {
        lockCard(counterpartyId);
        datesInOrder(r.issuedOn(), r.validUntil());
        Map<String, Object> p = new HashMap<>();
        p.put("cp", counterpartyId);
        p.put("number", r.number().strip());
        p.put("kind", r.kind().strip());
        p.put("issued", r.issuedOn() == null ? null : Date.valueOf(r.issuedOn()));
        p.put("until", r.validUntil() == null ? null : Date.valueOf(r.validUntil()));
        p.put("controlled", r.controlledAllowed());
        if (licenseId == null) {
            long id = jdbc.sql("""
                    INSERT INTO counterparty_license (counterparty_id, number, kind, issued_on, valid_until, controlled_allowed)
                    VALUES (:cp, :number, :kind, :issued, :until, :controlled) RETURNING id""")
                    .params(p)
                    .query(Long.class)
                    .single();
            audit.record(AuditEntry.of("counterparty.licenseAdd", "counterparty", counterpartyId).change(null, Map.of("licenseId", id)));
        } else {
            int n = jdbc.sql("""
                    UPDATE counterparty_license SET number = :number, kind = :kind, issued_on = :issued, valid_until = :until,
                           controlled_allowed = :controlled WHERE id = :lid AND counterparty_id = :cp""")
                    .params(p)
                    .param("lid", licenseId)
                    .update();
            if (n == 0) {
                throw MedixException.notFound("error.notFound");
            }
            audit.record(AuditEntry.of("counterparty.licenseUpdate", "counterparty", counterpartyId)
                    .change(null, Map.of("licenseId", licenseId)));
        }
    }

    @Transactional
    void saveContract(long counterpartyId, Long contractId, ContractRequest r, Actor actor) {
        lockCard(counterpartyId);
        datesInOrder(r.signedOn(), r.validUntil());
        if (!actor.canAccessBranch(r.branchId()) || !branchExists(r.branchId())) {
            throw MedixException.badRequest("employee.branchUnknown");
        }
        Map<String, Object> p = new HashMap<>();
        p.put("cp", counterpartyId);
        p.put("branch", r.branchId());
        p.put("number", r.number().strip());
        p.put("signed", r.signedOn() == null ? null : Date.valueOf(r.signedOn()));
        p.put("until", r.validUntil() == null ? null : Date.valueOf(r.validUntil()));
        p.put("note", blankToNull(r.note()));
        boolean dup = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM counterparty_contract WHERE counterparty_id = :cp AND branch_id = :branch
                               AND number = :number AND id <> :cid)""")
                .params(p)
                .param("cid", contractId == null ? 0L : contractId)
                .query(Boolean.class)
                .single();
        if (dup) {
            throw MedixException.conflict("counterparty.contractDuplicate", r.number().strip());
        }
        if (contractId == null) {
            long id = jdbc.sql("""
                    INSERT INTO counterparty_contract (counterparty_id, branch_id, number, signed_on, valid_until, note)
                    VALUES (:cp, :branch, :number, :signed, :until, :note) RETURNING id""")
                    .params(p)
                    .query(Long.class)
                    .single();
            audit.record(AuditEntry.of("counterparty.contractAdd", "counterparty", counterpartyId).change(null, Map.of("contractId", id)));
        } else {
            Long branch = jdbc.sql("SELECT branch_id FROM counterparty_contract WHERE id = :cid AND counterparty_id = :cp")
                    .param("cid", contractId)
                    .param("cp", counterpartyId)
                    .query(Long.class)
                    .optional()
                    .filter(actor::canAccessBranch)
                    .orElseThrow(() -> MedixException.notFound("error.notFound"));
            jdbc.sql("""
                    UPDATE counterparty_contract SET branch_id = :branch, number = :number, signed_on = :signed, valid_until = :until,
                           note = :note WHERE id = :cid""")
                    .params(p)
                    .param("cid", contractId)
                    .update();
            audit.record(AuditEntry.of("counterparty.contractUpdate", "counterparty", counterpartyId)
                    .change(Map.of("branchId", branch), Map.of("contractId", contractId, "branchId", r.branchId())));
        }
    }

    @Transactional
    void saveTerms(long counterpartyId, long branchId, TermsRequest r, boolean customerSide, boolean supplierSide) {
        lockCard(counterpartyId);
        if (!branchExists(branchId)) {
            throw MedixException.badRequest("employee.branchUnknown");
        }
        checkRef("price_type", r.priceTypeId());
        checkEmployee(r.operatorId());
        checkEmployee(r.supplyEmployeeId());
        BigDecimal limit = r.creditLimit() == null || r.creditLimit().isBlank() ? null : Money.of(r.creditLimit()).amount();
        Map<String, Object> p = new HashMap<>();
        p.put("cp", counterpartyId);
        p.put("branch", branchId);
        p.put("limit", limit);
        p.put("days", r.paymentDays());
        p.put("price", r.priceTypeId());
        p.put("shelf", r.minShelfLifeDays());
        p.put("operator", r.operatorId());
        p.put("sdays", r.supplierPaymentDays());
        p.put("ptype", r.defaultPaymentType() == null ? null : r.defaultPaymentType().name());
        p.put("supply", r.supplyEmployeeId());
        Map<String, Object> before = jdbc.sql("""
                SELECT credit_limit, payment_days, price_type_id, min_shelf_life_days, operator_employee_id, supplier_payment_days,
                       default_payment_type, supply_employee_id
                FROM counterparty_branch_terms WHERE counterparty_id = :cp AND branch_id = :branch FOR UPDATE""")
                .param("cp", counterpartyId)
                .param("branch", branchId)
                .query()
                .listOfRows()
                .stream()
                .findFirst()
                .orElse(null);
        // Ruxsati yo'q tomon o'zgarmaydi — mavjud qiymatlar saqlanadi.
        if (before != null) {
            if (!customerSide) {
                p.put("limit", before.get("credit_limit"));
                p.put("days", before.get("payment_days"));
                p.put("price", before.get("price_type_id"));
                p.put("shelf", before.get("min_shelf_life_days"));
                p.put("operator", before.get("operator_employee_id"));
            }
            if (!supplierSide) {
                p.put("sdays", before.get("supplier_payment_days"));
                p.put("ptype", before.get("default_payment_type"));
                p.put("supply", before.get("supply_employee_id"));
            }
        } else {
            if (!customerSide) {
                for (String k : List.of("limit", "days", "price", "shelf", "operator")) {
                    p.put(k, null);
                }
            }
            if (!supplierSide) {
                for (String k : List.of("sdays", "ptype", "supply")) {
                    p.put(k, null);
                }
            }
        }
        jdbc.sql("""
                INSERT INTO counterparty_branch_terms (counterparty_id, branch_id, credit_limit, payment_days, price_type_id,
                       min_shelf_life_days, operator_employee_id, supplier_payment_days, default_payment_type, supply_employee_id)
                VALUES (:cp, :branch, :limit, :days, :price, :shelf, :operator, :sdays, :ptype, :supply)
                ON CONFLICT (counterparty_id, branch_id) DO UPDATE SET credit_limit = excluded.credit_limit,
                       payment_days = excluded.payment_days, price_type_id = excluded.price_type_id,
                       min_shelf_life_days = excluded.min_shelf_life_days, operator_employee_id = excluded.operator_employee_id,
                       supplier_payment_days = excluded.supplier_payment_days, default_payment_type = excluded.default_payment_type,
                       supply_employee_id = excluded.supply_employee_id, updated_at = now(),
                       version = counterparty_branch_terms.version + 1""")
                .params(p)
                .update();
        Map<String, Object> after = new HashMap<>(p);
        after.remove("cp");
        after.put("limit", p.get("limit") == null ? null : p.get("limit").toString());
        audit.record(AuditEntry.of("counterparty.terms", "counterparty", counterpartyId).change(before, after));
    }

    /**
     * «Mijozlarga biriktirish» ro'yxati: faol mijozlar (qidiruv — nom/STIR, lotin-kirill farqsiz), shu filialdagi joriy narx turi bilan;
     * avval shu turga biriktirilganlar, keyin nom bo'yicha.
     */
    @Transactional(readOnly = true)
    PriceTypeCustomers priceTypeCustomers(long branchId, long priceTypeId, String q, int limit) {
        Map<String, Object> params = new HashMap<>();
        params.put("b", branchId);
        params.put("t", priceTypeId);
        StringBuilder where = new StringBuilder(" WHERE c.is_customer AND c.active");
        String nq = SearchText.normalize(q);
        if (!nq.isEmpty()) {
            String[] parts = nq.split(" ");
            where.append(" AND (c.tin = :exact OR (true");
            for (int i = 0; i < parts.length && i < 8; i++) {
                where.append(" AND c.search_text LIKE :w").append(i).append(" ESCAPE '\\'");
                params.put("w" + i, "%" + SearchText.likeEscape(parts[i]) + "%");
            }
            where.append("))");
            params.put("exact", q.strip());
        }
        String from = " FROM counterparty c LEFT JOIN counterparty_branch_terms bt ON bt.counterparty_id = c.id AND bt.branch_id = :b"
                + " LEFT JOIN price_type pt ON pt.id = bt.price_type_id";
        long total = jdbc.sql("SELECT count(*)" + from + where).params(params).query(Long.class).single();
        long attached = jdbc.sql("SELECT count(*) FROM counterparty_branch_terms WHERE branch_id = :b AND price_type_id = :t")
                .param("b", branchId).param("t", priceTypeId).query(Long.class).single();
        params.put("lim", limit);
        List<PriceTypeCustomer> items = jdbc.sql("SELECT c.id, c.name, c.tin, bt.price_type_id, pt.name AS price_type" + from + where
                        + " ORDER BY (bt.price_type_id = :t) IS TRUE DESC, lower(c.name), c.id LIMIT :lim")
                .params(params)
                .query((rs, n) -> new PriceTypeCustomer(rs.getLong("id"), rs.getString("name"), rs.getString("tin"),
                        rs.getObject("price_type_id", Long.class), rs.getString("price_type")))
                .list();
        return new PriceTypeCustomers(items, total, attached);
    }

    /**
     * Mijozlarni narx turiga biriktirish (shu filial sharti): {@code attach} — narx turi shu turga o'zgaradi (shart yo'q bo'lsa —
     * yaratiladi); {@code detach} — faqat hozir shu turda bo'lsa, bazaviyga qaytadi (NULL). Har o'zgarish auditda.
     */
    @Transactional
    int attachPriceType(PriceTypeAttachRequest r) {
        if (!branchExists(r.branchId())) {
            throw MedixException.badRequest("employee.branchUnknown");
        }
        checkRef("price_type", r.priceTypeId());
        int changed = 0;
        List<Long> attach = r.attach().stream().distinct().sorted().toList();
        List<Long> detach = r.detach().stream().filter(id -> !attach.contains(id)).distinct().sorted().toList();
        for (long id : attach) {
            if (setCustomerPriceType(id, r.branchId(), r.priceTypeId(), null)) {
                changed++;
            }
        }
        for (long id : detach) {
            if (setCustomerPriceType(id, r.branchId(), null, r.priceTypeId())) {
                changed++;
            }
        }
        return changed;
    }

    /** {@code onlyIf} berilsa — joriy tur shu bo'lsagina o'zgaradi. O'zgargan bo'lsa true. */
    private boolean setCustomerPriceType(long counterpartyId, long branchId, Long priceTypeId, Long onlyIf) {
        Boolean customer = jdbc.sql("SELECT is_customer AND active FROM counterparty WHERE id = :id FOR UPDATE")
                .param("id", counterpartyId).query(Boolean.class).optional().orElse(null);
        if (customer == null || !customer) {
            throw MedixException.badRequest("counterparty.notCustomer");
        }
        Optional<Long> current = jdbc.sql("""
                SELECT price_type_id FROM counterparty_branch_terms WHERE counterparty_id = :cp AND branch_id = :b FOR UPDATE""")
                .param("cp", counterpartyId).param("b", branchId)
                .query((rs, n) -> Optional.ofNullable(rs.getObject("price_type_id", Long.class)))
                .optional()
                .orElse(null);
        Long before = current == null ? null : current.orElse(null);
        if (onlyIf != null && !onlyIf.equals(before)) {
            return false;
        }
        if (Objects.equals(before, priceTypeId)) {
            return false;
        }
        jdbc.sql("""
                INSERT INTO counterparty_branch_terms (counterparty_id, branch_id, price_type_id) VALUES (:cp, :b, :t)
                ON CONFLICT (counterparty_id, branch_id) DO UPDATE SET price_type_id = excluded.price_type_id, updated_at = now(),
                       version = counterparty_branch_terms.version + 1""")
                .param("cp", counterpartyId).param("b", branchId).param("t", priceTypeId)
                .update();
        Map<String, Object> was = new HashMap<>();
        was.put("branch", branchId);
        was.put("price", before);
        Map<String, Object> now = new HashMap<>();
        now.put("branch", branchId);
        now.put("price", priceTypeId);
        audit.record(AuditEntry.of("counterparty.terms", "counterparty", counterpartyId).change(was, now));
        return true;
    }

    /** Litsenziya amal qiladimi (Toshkent sanasi bo'yicha) — buyurtma tekshiruvida ishlatiladi (6-bosqich). */
    boolean hasValidLicense(long counterpartyId) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM counterparty_license WHERE counterparty_id = :id
                               AND (valid_until IS NULL OR valid_until >= :today))""")
                .param("id", counterpartyId)
                .param("today", Date.valueOf(LocalDate.now(clock.withZone(TASHKENT))))
                .query(Boolean.class)
                .single();
    }

    // ===== Ichki =====

    private void validateCard(CounterpartyRequest r, Long exceptId) {
        if (!r.customer() && !r.supplier()) {
            throw MedixException.badRequest("counterparty.roleRequired");
        }
        Optional<String> owner = jdbc.sql("SELECT name FROM counterparty WHERE tin = :tin AND id <> :id")
                .param("tin", r.tin().strip())
                .param("id", exceptId == null ? 0L : exceptId)
                .query(String.class)
                .optional();
        if (owner.isPresent()) {
            throw MedixException.conflict("counterparty.tinTaken", r.tin().strip(), owner.get());
        }
        checkRef("region", r.regionId());
    }

    private void checkRef(String table, Long id) {
        if (id == null) {
            return;
        }
        boolean ok = jdbc.sql("SELECT EXISTS (SELECT 1 FROM " + table + " WHERE id = :id AND active)")
                .param("id", id)
                .query(Boolean.class)
                .single();
        if (!ok) {
            throw MedixException.badRequest("counterparty.refUnknown");
        }
    }

    private void checkEmployee(Long id) {
        if (id == null) {
            return;
        }
        boolean ok = jdbc.sql("SELECT EXISTS (SELECT 1 FROM employee WHERE id = :id AND status = 'ACTIVE')")
                .param("id", id)
                .query(Boolean.class)
                .single();
        if (!ok) {
            throw MedixException.badRequest("counterparty.refUnknown");
        }
    }

    private boolean branchExists(long branchId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM branch WHERE id = :b AND active)").param("b", branchId).query(Boolean.class).single();
    }

    private static void datesInOrder(LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw MedixException.badRequest("counterparty.datesOrder");
        }
    }

    private Map<String, Object> lockCard(long id) {
        return jdbc.sql("""
                SELECT tin, name, legal_name, is_customer, is_supplier, region_id, address, phone, contact_person, email, bank_name,
                       bank_account, bank_mfo, vat_code, note FROM counterparty WHERE id = :id FOR UPDATE""")
                .param("id", id)
                .query()
                .listOfRows()
                .stream()
                .findFirst()
                .orElseThrow(() -> MedixException.notFound("error.notFound"));
    }

    private static Map<String, Object> cardParams(CounterpartyRequest r) {
        Map<String, Object> m = new HashMap<>();
        m.put("tin", r.tin().strip());
        m.put("name", r.name().strip());
        m.put("legal", blankToNull(r.legalName()));
        m.put("customer", r.customer());
        m.put("supplier", r.supplier());
        m.put("region", r.regionId());
        m.put("address", blankToNull(r.address()));
        m.put("phone", blankToNull(r.phone()));
        m.put("contact", blankToNull(r.contactPerson()));
        m.put("email", blankToNull(r.email()));
        m.put("bank", blankToNull(r.bankName()));
        m.put("account", blankToNull(r.bankAccount()));
        m.put("mfo", blankToNull(r.bankMfo()));
        m.put("vat", blankToNull(r.vatCode()));
        m.put("note", blankToNull(r.note()));
        return m;
    }

    private void refreshSearchText(long id) {
        Map<String, Object> row = jdbc.sql("SELECT tin, name, legal_name, phone, contact_person FROM counterparty WHERE id = :id")
                .param("id", id)
                .query()
                .singleRow();
        String text = SearchText.of(Objects.toString(row.get("tin"), null), Objects.toString(row.get("name"), null),
                Objects.toString(row.get("legal_name"), null), Objects.toString(row.get("phone"), null),
                Objects.toString(row.get("contact_person"), null));
        String digits = Objects.toString(row.get("phone"), "").replaceAll("\\D", "");
        jdbc.sql("UPDATE counterparty SET search_text = :s WHERE id = :id")
                .param("s", digits.isEmpty() ? text : text + " " + digits)
                .param("id", id)
                .update();
    }

    /** {@code query} bo'lsa — «topilgan joy qator ostida» (jadvalda ko'rinmaydigan aloqa shaxsida topilganmi). */
    static String orderBy(SortField sort, boolean desc) {
        String dir = desc ? " DESC" : "";
        return switch (sort == null ? SortField.NAME : sort) {
            case NAME -> " ORDER BY lower(c.name)" + dir;
            case TIN -> " ORDER BY c.tin" + dir;
            case REGION -> " ORDER BY lower(r.name)" + dir + " NULLS LAST, lower(c.name)";
            case LICENSE -> " ORDER BY license_valid_until" + dir + " NULLS LAST, lower(c.name)";
        };
    }

    private static CounterpartyRow row(ResultSet rs, String query) throws SQLException {
        String tin = rs.getString("tin");
        String name = rs.getString("name");
        String legalName = rs.getString("legal_name");
        String phone = rs.getString("phone");
        SearchMatch match = query == null ? null
                : SearchMatch.hidden(query, Arrays.asList(tin, name, legalName, phone, phone == null ? null : phone.replaceAll("\\D", "")),
                        List.of(new SearchMatch("CONTACT_PERSON", Objects.toString(rs.getString("contact_person"), "")))).orElse(null);
        return new CounterpartyRow(rs.getLong("id"), tin, name, legalName,
                rs.getBoolean("is_customer"), rs.getBoolean("is_supplier"), rs.getString("region"), phone,
                date(rs, "license_valid_until"), rs.getBoolean("blocked"), rs.getBoolean("active"), match);
    }

    private static LocalDate date(ResultSet rs, String col) throws SQLException {
        Date d = rs.getDate(col);
        return d == null ? null : d.toLocalDate();
    }

    private static Ref ref(ResultSet rs, String idCol, String nameCol) throws SQLException {
        long id = rs.getLong(idCol);
        return rs.wasNull() ? null : new Ref(id, rs.getString(nameCol));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
