-- Ombor kartasi (prototip WarehousePanel): ombor turi va masʼul ombor mudiri.
-- Zonalar va ularning sotuvga ochiqligi oʻzgarmaydi (SPEC 2: tur boʻyicha hisoblanadi).
ALTER TABLE warehouse
    ADD COLUMN kind      VARCHAR(8) NOT NULL DEFAULT 'NORMAL' CHECK (kind IN ('NORMAL', 'COLD')),
    ADD COLUMN keeper_id BIGINT REFERENCES employee (id);

CREATE INDEX warehouse_keeper_idx ON warehouse (keeper_id) WHERE keeper_id IS NOT NULL;
