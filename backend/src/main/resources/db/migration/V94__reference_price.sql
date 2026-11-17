-- O14 (egasi 17.11.2026): referent narx bilan solishtirish. Har yuklangan fayl — bitta solishtirish (tarix), qatorlari natijasi
-- bilan saqlanadi. Qo'lda moslash eslab qolinadi (nom + ishlab chiqaruvchi kaliti bo'yicha) — keyingi faylda avtomatik.
CREATE TABLE reference_compare (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_id       BIGINT         NOT NULL REFERENCES branch (id),
    file_name       VARCHAR(255)   NOT NULL,
    mode            VARCHAR(8)     NOT NULL CHECK (mode IN ('PURCHASE', 'SALE')),
    price_type_id   BIGINT         REFERENCES price_type (id),
    receipt_id      BIGINT         REFERENCES receipt (id),
    tolerance_pct   NUMERIC(5, 2)  NOT NULL CHECK (tolerance_pct >= 0 AND tolerance_pct <= 100),
    dearer          INTEGER        NOT NULL DEFAULT 0,
    cheaper         INTEGER        NOT NULL DEFAULT 0,
    matched         INTEGER        NOT NULL DEFAULT 0,
    not_found       INTEGER        NOT NULL DEFAULT 0,
    created_by      BIGINT         NOT NULL REFERENCES employee (id),
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CHECK ((mode = 'SALE') = (price_type_id IS NOT NULL)),
    CHECK (mode = 'PURCHASE' OR receipt_id IS NULL)
);
CREATE INDEX reference_compare_branch_idx ON reference_compare (branch_id, created_at DESC);
COMMENT ON TABLE reference_compare IS 'Referent narx bilan solishtirish (O14): yuklangan fayl, rejim va natija soni';

CREATE TABLE reference_compare_line (
    compare_id     BIGINT         NOT NULL REFERENCES reference_compare (id) ON DELETE CASCADE,
    row_no         INTEGER        NOT NULL CHECK (row_no > 0),
    name           VARCHAR(500)   NOT NULL,
    barcode        VARCHAR(64),
    ikpu           VARCHAR(32),
    code           VARCHAR(32),
    manufacturer   VARCHAR(300),
    unit           VARCHAR(50),
    ref_price      NUMERIC(18, 2) NOT NULL CHECK (ref_price > 0),
    product_id     BIGINT         REFERENCES product (id),
    match_by       VARCHAR(8)     NOT NULL CHECK (match_by IN ('BARCODE', 'IKPU', 'CODE', 'MEMORY', 'NAME', 'MANUAL', 'NONE')),
    confident      BOOLEAN        NOT NULL DEFAULT true,
    our_price      NUMERIC(18, 2),
    source         VARCHAR(120),
    status         VARCHAR(10)    NOT NULL CHECK (status IN ('DEARER', 'CHEAPER', 'MATCH', 'NOT_FOUND', 'NO_PRICE')),
    PRIMARY KEY (compare_id, row_no)
);
CREATE INDEX reference_compare_line_product_idx ON reference_compare_line (product_id);

CREATE TABLE reference_match (
    match_key   VARCHAR(400)  PRIMARY KEY,
    product_id  BIGINT        NOT NULL REFERENCES product (id),
    updated_by  BIGINT        REFERENCES employee (id),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
COMMENT ON TABLE reference_match IS 'Qo''lda moslangan referent nom (normallangan nom | ishlab chiqaruvchi) → mahsulot';

INSERT INTO app_setting (key, value) VALUES ('refPriceTolPct', 0) ON CONFLICT (key) DO NOTHING;

INSERT INTO permission (key, module, description, grp, kind, page)
VALUES ('prices.reference', 'prices', 'Narxlar: referent narx bilan solishtirish', 'ref', 'view', 'prices');
INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, 'prices.reference' FROM role r WHERE r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'OPERATOR');
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, 'prices.reference' FROM role r WHERE r.system AND r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'OPERATOR');
