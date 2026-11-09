-- Egasi E11 (09.11.2026): filial kodi 2–4 ta katta lotin harfi (masalan TS, TSH, TSHK).
-- Hujjat raqami: BY-TS-000001 ham boʻlishi mumkin.
ALTER TABLE branch DROP CONSTRAINT branch_code_check;
ALTER TABLE branch ALTER COLUMN code TYPE VARCHAR(4);
ALTER TABLE branch ADD CONSTRAINT branch_code_check CHECK (code ~ '^[A-Z]{2,4}$');

ALTER TABLE document_sequence ALTER COLUMN branch_code TYPE VARCHAR(4);
