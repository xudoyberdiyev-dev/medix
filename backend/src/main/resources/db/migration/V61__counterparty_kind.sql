-- Kontragent turi (prototip Counterparties: Dorixona / Klinika / Shifoxona / Distribyutor / Ishlab chiqaruvchi).
ALTER TABLE counterparty ADD COLUMN kind VARCHAR(16)
    CHECK (kind IN ('PHARMACY', 'CLINIC', 'HOSPITAL', 'DISTRIBUTOR', 'MAKER'));
COMMENT ON COLUMN counterparty.kind IS 'Kontragent turi; NULL — koʻrsatilmagan';
