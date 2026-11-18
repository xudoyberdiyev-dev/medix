-- O20: kirish sahifasi pastidagi yordam telefoni va ish vaqti (Kompaniya sozlamalarida tahrirlanadi, kirishdan oldin ko'rinadi).
ALTER TABLE company
    ADD COLUMN support_phone VARCHAR(32) CHECK (support_phone IS NULL OR btrim(support_phone) <> ''),
    ADD COLUMN support_hours VARCHAR(60) CHECK (support_hours IS NULL OR btrim(support_hours) <> '');

COMMENT ON COLUMN company.support_phone IS 'Yordam telefoni (kirish sahifasida ommaviy ko''rinadi)';
COMMENT ON COLUMN company.support_hours IS 'Yordam ish vaqti, erkin matn, masalan «du–ju 09:00–18:00»';
