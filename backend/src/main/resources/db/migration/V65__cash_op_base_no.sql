-- Prototip `MoneyOpDoc`: KO / BO uchun «Asos hujjat №» (shartnoma, hisob, avans hisoboti raqami) — ixtiyoriy.
ALTER TABLE cash_op ADD COLUMN base_no VARCHAR(40) CHECK (base_no IS NULL OR btrim(base_no) <> '');
