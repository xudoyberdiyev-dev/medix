-- MEDIX — 2-bosqich: kontragentlar (SPEC 2, 12). Bitta STIR — bitta karta; mijoz va/yoki yetkazib beruvchi.
-- Shartlar (limit, muddat, narx turi, ...) har filial bo'yicha alohida. O'chirilmaydi — nofaol qilinadi yoki bloklanadi.

-- ===== Narx turlari (pricing moduli; 3-bosqichda narxlar shu jadvalga bog'lanadi) =====
CREATE TABLE price_type (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        VARCHAR(32)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    base        BOOLEAN      NOT NULL DEFAULT false,
    batch       BOOLEAN      NOT NULL DEFAULT false,
    sort_order  INTEGER      NOT NULL,
    active      BOOLEAN      NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX price_type_single_base ON price_type (base) WHERE base;
COMMENT ON COLUMN price_type.base IS 'Bazaviy narx turi («Narx») — narx tanlashda oxirgi zaxira (SPEC 6)';
COMMENT ON COLUMN price_type.batch IS 'Partiyaga bog''langan narx turi';

INSERT INTO price_type (code, name, base, batch, sort_order) VALUES
    ('BASE',            'Narx',                   true,  false, 1),
    ('PROMO',           'Promo',                  false, false, 2),
    ('SALE',            'Aksiya',                 false, false, 3),
    ('RETURN',          'Vozvrat',                false, false, 4),
    ('HEALTH_LINE',     'Health Line narxi',      false, false, 5),
    ('WHOLESALE_BATCH', 'Ulgurji partiya narxi',  false, true,  6),
    ('GOODS_DISCOUNT',  'Tovar chegirmasi',       false, false, 7),
    ('DISTRIBUTOR',     'Distribyutor narxi',     false, false, 8);

-- ===== Kontragent kartasi =====
CREATE TABLE counterparty (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- STIR (yuridik shaxs, 9 raqam) yoki JShShIR (yakka tadbirkor, 14 raqam).
    tin              VARCHAR(14)  NOT NULL UNIQUE CHECK (tin ~ '^([0-9]{9}|[0-9]{14})$'),
    name             VARCHAR(300) NOT NULL CHECK (btrim(name) <> ''),
    legal_name       VARCHAR(300),
    is_customer      BOOLEAN      NOT NULL DEFAULT false,
    is_supplier      BOOLEAN      NOT NULL DEFAULT false,
    region_id        BIGINT       REFERENCES region (id),
    address          VARCHAR(500),
    phone            VARCHAR(64),
    contact_person   VARCHAR(200),
    email            VARCHAR(200),
    bank_name        VARCHAR(200),
    bank_account     VARCHAR(20)  CHECK (bank_account ~ '^[0-9]{20}$'),
    bank_mfo         VARCHAR(5)   CHECK (bank_mfo ~ '^[0-9]{5}$'),
    vat_code         VARCHAR(12)  CHECK (vat_code ~ '^[0-9]{12}$'),
    note             VARCHAR(1000),
    blocked          BOOLEAN      NOT NULL DEFAULT false,
    blocked_reason   VARCHAR(300),
    active           BOOLEAN      NOT NULL DEFAULT true,
    search_text      TEXT         NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version          BIGINT       NOT NULL DEFAULT 0,
    CHECK (is_customer OR is_supplier),
    CHECK (blocked = (blocked_reason IS NOT NULL))
);
CREATE INDEX counterparty_search_trgm ON counterparty USING gin (search_text gin_trgm_ops);
COMMENT ON COLUMN counterparty.vat_code IS 'QQS to''lovchi registratsiya kodi (12 raqam)';

-- Litsenziyalar: muddati o'tgan litsenziyali mijozga buyurtma kiritilmaydi (SPEC 6).
CREATE TABLE counterparty_license (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    counterparty_id     BIGINT       NOT NULL REFERENCES counterparty (id),
    number              VARCHAR(100) NOT NULL CHECK (btrim(number) <> ''),
    kind                VARCHAR(200) NOT NULL CHECK (btrim(kind) <> ''),
    issued_on           DATE,
    valid_until         DATE,
    controlled_allowed  BOOLEAN      NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (issued_on IS NULL OR valid_until IS NULL OR issued_on <= valid_until)
);
CREATE INDEX counterparty_license_cp_idx ON counterparty_license (counterparty_id);
COMMENT ON COLUMN counterparty_license.controlled_allowed IS 'Nazoratdagi preparatlar savdosiga ruxsat (SPEC 6-8)';

-- Shartnomalar — filial (yuridik shaxs) bilan kontragent o'rtasida.
CREATE TABLE counterparty_contract (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    counterparty_id  BIGINT       NOT NULL REFERENCES counterparty (id),
    branch_id        BIGINT       NOT NULL REFERENCES branch (id),
    number           VARCHAR(100) NOT NULL CHECK (btrim(number) <> ''),
    signed_on        DATE,
    valid_until      DATE,
    note             VARCHAR(500),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (branch_id, counterparty_id, number)
);
CREATE INDEX counterparty_contract_cp_idx ON counterparty_contract (counterparty_id);

-- Filial shartlari (SPEC 2, 12). Mijoz va YB qismlari bir qatorda; kartadagi rol bo'yicha to'ldiriladi.
CREATE TABLE counterparty_branch_terms (
    counterparty_id         BIGINT        NOT NULL REFERENCES counterparty (id),
    branch_id               BIGINT        NOT NULL REFERENCES branch (id),
    -- Mijoz sifatida
    credit_limit            NUMERIC(18, 2) CHECK (credit_limit >= 0),
    payment_days            INTEGER       CHECK (payment_days >= 0 AND payment_days <= 365),
    price_type_id           BIGINT        REFERENCES price_type (id),
    min_shelf_life_days     INTEGER       CHECK (min_shelf_life_days >= 0 AND min_shelf_life_days <= 3650),
    operator_employee_id    BIGINT        REFERENCES employee (id),
    -- Yetkazib beruvchi sifatida
    supplier_payment_days   INTEGER       CHECK (supplier_payment_days >= 0 AND supplier_payment_days <= 365),
    default_payment_type    VARCHAR(16)   CHECK (default_payment_type IN ('CASH', 'TRANSFER', 'ONLINE')),
    supply_employee_id      BIGINT        REFERENCES employee (id),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version                 BIGINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (counterparty_id, branch_id)
);
COMMENT ON COLUMN counterparty_branch_terms.credit_limit IS 'Kredit limiti, so''m (NULL — limit belgilanmagan)';
COMMENT ON COLUMN counterparty_branch_terms.min_shelf_life_days IS 'Mijozning minimal qolgan yaroqlilik talabi, kun (FEFO hisobga oladi)';
