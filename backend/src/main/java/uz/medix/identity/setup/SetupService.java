package uz.medix.identity.setup;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.medix.identity.employee.Employees;
import uz.medix.identity.organization.CompanyLogos;
import uz.medix.identity.organization.Organization;
import uz.medix.inventory.Warehouses;
import uz.medix.inventory.ZoneType;
import uz.medix.shared.error.MedixException;
import uz.medix.shared.text.Texts;

/**
 * Sozlash ustasi (SPEC 2): kompaniya → filiallar → omborlar va zonalar → rollar → xodimlar → yakun.
 * Usta yakunlangach yozish amallari yopiladi (keyingi o'zgarishlar oddiy sahifalar orqali).
 */
@Service
class SetupService {

    private static final Set<ZoneType> OPTIONAL_ZONES = EnumSet.of(ZoneType.COLD, ZoneType.SAFE);

    private final Organization organization;
    private final Warehouses warehouses;
    private final Employees employees;
    private final MessageSource messages;

    SetupService(Organization organization, Warehouses warehouses, Employees employees, MessageSource messages) {
        this.organization = organization;
        this.warehouses = warehouses;
        this.employees = employees;
        this.messages = messages;
    }

    @Transactional(readOnly = true)
    SetupStatus status() {
        var company = organization.company();
        var branches = organization.branches();
        return new SetupStatus(
                company.map(c -> c.setupCompletedAt() != null).orElse(false),
                company.orElse(null),
                branches,
                warehouses.listByBranches(branches.stream().map(Organization.Branch::id).toList()),
                employees.list(),
                blockers(company.isPresent(), branches));
    }

    @Transactional
    Organization.Company saveCompany(SetupRequests.CompanyRequest r) {
        ensureOpen();
        return r.defaultLocale() == null ? organization.saveCompany(r.name()) : organization.saveCompany(r.name(), r.defaultLocale());
    }

    /** Logotip: PNG yoki xavfsiz SVG, 2 MB gacha (prototip SetupWizard 1-qadam). */
    @Transactional
    Organization.Company saveLogo(byte[] content) {
        ensureOpen();
        if (content.length > CompanyLogos.MAX_BYTES) {
            throw MedixException.badRequest("setup.logoTooBig");
        }
        String type = CompanyLogos.detect(content).orElseThrow(() -> MedixException.badRequest("setup.logoType"));
        return organization.saveLogo(content, type);
    }

    @Transactional
    Organization.Company removeLogo() {
        ensureOpen();
        return organization.saveLogo(null, null);
    }

    @Transactional
    Organization.Branch createBranch(SetupRequests.BranchRequest r) {
        ensureOpen();
        return organization.createBranch(toData(r));
    }

    @Transactional
    Organization.Branch updateBranch(long id, SetupRequests.BranchRequest r) {
        ensureOpen();
        return organization.updateBranch(id, toData(r));
    }

    @Transactional
    Warehouses.Warehouse createWarehouse(SetupRequests.WarehouseRequest r) {
        ensureOpen();
        organization.branch(r.branchId()).orElseThrow(() -> MedixException.badRequest("employee.branchUnknown"));
        Set<ZoneType> extra = r.extraZones() == null ? Set.of() : r.extraZones();
        if (!OPTIONAL_ZONES.containsAll(extra)) {
            throw MedixException.badRequest("warehouse.extraZones");
        }
        return warehouses.create(r.branchId(), r.name(), r.address(), extra);
    }

    @Transactional
    Employees.Employee createEmployee(SetupRequests.EmployeeRequest r) {
        ensureOpen();
        return employees.create(new Employees.NewEmployee(r.login(), r.fullName(), r.phone(), r.position(), r.roleCode(),
                r.branchId(), r.temporaryPassword()));
    }

    @Transactional
    SetupStatus complete() {
        ensureOpen();
        var branches = organization.branches();
        List<String> blockers = blockers(organization.company().isPresent(), branches);
        if (!blockers.isEmpty()) {
            throw MedixException.badRequest("setup.incomplete", String.join(" ", blockers));
        }
        organization.markSetupCompleted();
        return status();
    }

    private void ensureOpen() {
        if (organization.company().map(c -> c.setupCompletedAt() != null).orElse(false)) {
            throw MedixException.conflict("setup.completed");
        }
    }

    private List<String> blockers(boolean hasCompany, List<Organization.Branch> branches) {
        List<String> result = new ArrayList<>();
        if (!hasCompany) {
            result.add(msg("setup.companyMissing"));
        }
        if (branches.isEmpty()) {
            result.add(msg("setup.branchesMissing"));
        }
        for (var b : branches) {
            if (warehouses.countByBranch(b.id()) == 0) {
                result.add(msg("setup.warehouseMissing", b.name()));
            }
        }
        return result;
    }

    private String msg(String code, Object... args) {
        return messages.getMessage(code, args, code, Texts.requestLocale());
    }

    private static Organization.BranchData toData(SetupRequests.BranchRequest r) {
        return new Organization.BranchData(r.code(), r.name(), r.legalName(), r.tin(), r.address(), r.phone(), r.extra());
    }
}
