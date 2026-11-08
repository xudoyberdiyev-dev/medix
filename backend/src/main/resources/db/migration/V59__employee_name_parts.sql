-- Xodim ismi qismlari (prototip WizStaff/AdminStaff: Familiya, Ism, Otasining ismi).
-- full_name saqlanadi (boshqa modullar va hujjatlar uchun «Ism Familiya»); qismlar berilsa undan quriladi.
ALTER TABLE employee
    ADD COLUMN last_name   VARCHAR(100) CHECK (last_name IS NULL OR btrim(last_name) <> ''),
    ADD COLUMN first_name  VARCHAR(100) CHECK (first_name IS NULL OR btrim(first_name) <> ''),
    ADD COLUMN middle_name VARCHAR(100);

COMMENT ON COLUMN employee.last_name IS 'Familiya (ixtiyoriy; eski yozuvlarda NULL — faqat full_name)';
