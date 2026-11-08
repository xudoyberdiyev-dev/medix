-- Mahsulot kartochkasi (prototip `Products`): dori shakli, dozasi, qadoqdagi soni, 1 qadoqdagi dona soni, izoh.
ALTER TABLE product
    ADD COLUMN dosage_form VARCHAR(20)
        CHECK (dosage_form IN ('TABLET', 'CAPSULE', 'AMPOULE', 'VIAL', 'SYRUP', 'OINTMENT', 'PEN', 'POWDER', 'GEL')),
    ADD COLUMN dose        VARCHAR(50) CHECK (dose IS NULL OR btrim(dose) <> ''),
    ADD COLUMN pack_qty    INTEGER CHECK (pack_qty > 0 AND pack_qty <= 100000),
    ADD COLUMN per_pack    INTEGER CHECK (per_pack > 0 AND per_pack <= 100000),
    ADD COLUMN note        VARCHAR(1000) CHECK (note IS NULL OR btrim(note) <> '');

CREATE INDEX product_country_idx ON product (country_id);
CREATE INDEX product_supply_employee_idx ON product (supply_employee_id);
