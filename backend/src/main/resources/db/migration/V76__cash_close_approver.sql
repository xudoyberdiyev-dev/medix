-- MEDIX — Kunni yopish (prototip CashClose): farq bo'lsa kassir tasdiqlovchini tanlaydi (Filial rahbari va b., cash.closeDiff),
-- tasdiqlovchi o'z PIN kodi bilan tasdiqlaydi. Kim tasdiqlagani saqlanadi («PIN bilan tasdiqladi: …»).
ALTER TABLE cash_day_close ADD COLUMN approved_by BIGINT REFERENCES employee (id);

COMMENT ON COLUMN cash_day_close.approved_by IS 'Farqni PIN bilan tasdiqlagan xodim (farqsiz yopishda NULL)';
