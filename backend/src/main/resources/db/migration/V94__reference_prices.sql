-- O14 (egasi 17.11.2026): referent narx bilan solishtirish. Yuklangan fayl (masalan davlat referent narxlari) saqlanadi —
-- qatorlar mahsulotga moslanadi (shtrix-kod → MXIK → kod → nom oʻxshashligi; qoʻlda moslash eslab qolinadi), solishtirish
-- (kirim yoki sotuv narxi bilan) har ochilganda hisoblanadi.
CREATE TABLE ref_price_list (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    file_name    VARCHAR(255)  NOT NULL,
    row_count    INTEGER       NOT NULL DEFAULT 0,
    uploaded_by  BIGINT        NOT NULL REFERENCES employee (id),
    uploaded_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    branch_id    BIGINT        REFERENCES branch (id)
);
CREATE INDEX ref_price_list_uploaded_idx ON ref_price_list (uploaded_at DESC);

CREATE TABLE ref_price_row (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    list_id       BIGINT         NOT NULL REFERENCES ref_price_list (id),
    row_no        INTEGER        NOT NULL,
    name          VARCHAR(500)   NOT NULL,
    barcode       VARCHAR(64),
    ikpu          VARCHAR(32),
    code          VARCHAR(32),
    manufacturer  VARCHAR(300),
    unit          VARCHAR(50),
    price         NUMERIC(18, 2) NOT NULL CHECK (price > 0),
    product_id    BIGINT         REFERENCES product (id),
    -- BARCODE, IKPU, CODE, NAME, ALIAS (avval qoʻlda moslangan), MANUAL, NONE
    match_kind    VARCHAR(8)     NOT NULL CHECK (match_kind IN ('BARCODE', 'IKPU', 'CODE', 'NAME', 'ALIAS', 'MANUAL', 'NONE')),
    needs_check   BOOLEAN        NOT NULL DEFAULT false,
    UNIQUE (list_id, row_no),
    CHECK ((product_id IS NULL) = (match_kind = 'NONE'))
);
CREATE INDEX ref_price_row_list_idx ON ref_price_row (list_id);
CREATE INDEX ref_price_row_product_idx ON ref_price_row (product_id);

-- Qoʻlda moslash xotirasi: kalit — normallangan nom (+ ishlab chiqaruvchi) yoki shtrix-kod
CREATE TABLE ref_price_alias (
    key         VARCHAR(600)  PRIMARY KEY,
    product_id  BIGINT        NOT NULL REFERENCES product (id),
    updated_by  BIGINT        REFERENCES employee (id),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Ruxsat etilgan farq, % (Sozlamalar → Savdo): shu oraliqda «Mos»
INSERT INTO app_setting (key, value) VALUES ('refPriceTolPct', 0) ON CONFLICT (key) DO NOTHING;

INSERT INTO permission (key, module, description, grp, kind, page)
VALUES ('prices.reference', 'prices', 'Referent narxlar: fayl yuklash va solishtirish', 'ref', 'view', 'referencePrices');

INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, 'prices.reference' FROM role r WHERE r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'OPERATOR');
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, 'prices.reference' FROM role r WHERE r.system AND r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'OPERATOR');
