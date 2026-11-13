-- O11: hisob-faktura rasmiy shakli — oʻlchov birligi kodi (soliq tizimidagi kod, ixtiyoriy).
ALTER TABLE unit ADD COLUMN code VARCHAR(10) CHECK (code ~ '^[0-9]{1,10}$');
COMMENT ON COLUMN unit.code IS 'Oʻlchov birligi kodi (hisob-faktura, soliq klassifikatori), faqat raqam';
