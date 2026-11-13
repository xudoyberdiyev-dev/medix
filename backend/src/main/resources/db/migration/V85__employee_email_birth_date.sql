-- Xodim shaxsiy maʼlumotlari (egasi 13.11, O0): elektron pochta va tugʻilgan sana.
-- Profil sahifasida har kim oʻziniki, Xodimlar boʻlimida staff.edit ruxsati bilan.
ALTER TABLE employee
    ADD COLUMN email      VARCHAR(254) CHECK (email IS NULL OR btrim(email) <> ''),
    ADD COLUMN birth_date DATE CHECK (birth_date IS NULL OR birth_date > DATE '1900-01-01');

COMMENT ON COLUMN employee.email IS 'Elektron pochta (ixtiyoriy)';
COMMENT ON COLUMN employee.birth_date IS 'Tugʻilgan sana (ixtiyoriy)';
