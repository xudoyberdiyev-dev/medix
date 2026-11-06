-- MEDIX — sozlash ustasi (SPEC 2: birinchi ishga tushirish). Usta tugaganini kompaniya yozuvi saqlaydi.
ALTER TABLE company ADD COLUMN setup_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN company.setup_completed_at IS 'Sozlash ustasi yakunlangan vaqt; NULL — usta hali tugamagan';
