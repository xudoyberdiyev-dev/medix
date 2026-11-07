-- Egasi qarori (07.11.2026, E3): Buxgalter standart holatda FAQAT o'z filialini ko'radi.
-- Barcha filiallar — faqat Direktor ruxsat bergan buxgalterga (xodim kartasidagi belgi, audit bilan).
-- Direktor va Bosh administrator rol bo'yicha barcha filiallarni ko'radi; belgi faqat Buxgalter uchun ma'noli.
ALTER TABLE employee ADD COLUMN all_branches BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN employee.all_branches IS
    'Buxgalterga barcha filiallar doirasi (faqat Direktor yoqadi, audit: employee.allBranches). Boshqa rollarda e''tiborga olinmaydi';

-- Belgi faqat Buxgalterda bo'lishi mumkin (rol o'zgarsa — tozalanadi, pastdagi trigger)
CREATE FUNCTION employee_all_branches_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.all_branches AND NOT EXISTS (SELECT 1 FROM role r WHERE r.id = NEW.role_id AND r.code = 'ACCOUNTANT') THEN
        NEW.all_branches := false;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER employee_all_branches_guard
    BEFORE INSERT OR UPDATE OF all_branches, role_id ON employee
    FOR EACH ROW EXECUTE FUNCTION employee_all_branches_guard();
