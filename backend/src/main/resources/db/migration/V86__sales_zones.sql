-- MEDIX — Savdo zonalari (egasi talabi O6, 13.11.2026): filialga tegishli maʼlumotnoma; mijozning filial shartlarida zona.
-- Oʻchirilmaydi — faolsizlantiriladi. Nom filial ichida unikal (katta-kichik harf farqsiz).

CREATE TABLE sales_zone (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_id   BIGINT       NOT NULL REFERENCES branch (id),
    name        VARCHAR(100) NOT NULL CHECK (btrim(name) <> ''),
    note        VARCHAR(300),
    active      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version     BIGINT       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX sales_zone_branch_name_uq ON sales_zone (branch_id, lower(btrim(name)));
CREATE INDEX sales_zone_branch_idx ON sales_zone (branch_id);

COMMENT ON TABLE sales_zone IS 'Savdo zonalari (O6): mijozlarni guruhlash — buyurtma/hisobot/qarz filtrlari';

CREATE FUNCTION sales_zone_no_delete() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'sales_zone: oʻchirish taqiqlangan — faolsizlantiring';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sales_zone_no_delete BEFORE DELETE ON sales_zone FOR EACH ROW EXECUTE FUNCTION sales_zone_no_delete();

ALTER TABLE counterparty_branch_terms
    ADD COLUMN sales_zone_id BIGINT REFERENCES sales_zone (id);
CREATE INDEX counterparty_branch_terms_zone_idx ON counterparty_branch_terms (sales_zone_id);
COMMENT ON COLUMN counterparty_branch_terms.sales_zone_id IS 'Mijozning shu filialdagi savdo zonasi (O6); zona shu filialniki boʻlishi servisda tekshiriladi';

INSERT INTO permission (key, module, description, grp, kind, page)
VALUES ('salesZones.view', 'salesZones', 'Savdo zonalari: koʻrish', 'ref', 'view', 'salesZones'),
       ('salesZones.edit', 'salesZones', 'Savdo zonalari: yaratish va tahrirlash', 'ref', 'create', 'salesZones');

INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, k.key FROM role r
CROSS JOIN (VALUES ('salesZones.view'), ('salesZones.edit')) AS k(key)
WHERE r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER');
INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, 'salesZones.view' FROM role r WHERE r.code = 'OPERATOR';

INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, k.key FROM role r
CROSS JOIN (VALUES ('salesZones.view'), ('salesZones.edit')) AS k(key)
WHERE r.system AND r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER');
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, 'salesZones.view' FROM role r WHERE r.system AND r.code = 'OPERATOR';
