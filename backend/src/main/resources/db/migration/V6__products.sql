-- MEDIX — 2-bosqich: mahsulotlar katalogi (SPEC 6-1, 12). Mahsulot o'chirilmaydi — faqat nofaol qilinadi.
-- Qidiruv lotin/kirill farqsiz: `search_text` ilova tomonida normalizatsiya qilinib yoziladi (uz.medix.shared.text.SearchText).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE product (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- 8 raqamli noyob kod: tasodifiy, boshida 0 yo'q; o'zgartirsa bo'ladi (tarix — product_code_history).
    code                CHAR(8)       NOT NULL UNIQUE CHECK (code ~ '^[1-9][0-9]{7}$'),
    name                VARCHAR(300)  NOT NULL CHECK (btrim(name) <> ''),
    contract_name       VARCHAR(300),
    classifier_name     VARCHAR(500),
    manufacturer_id     BIGINT        REFERENCES manufacturer (id),
    category_id         BIGINT        REFERENCES category (id),
    country_id          BIGINT        REFERENCES country (id),
    unit_id             BIGINT        NOT NULL REFERENCES unit (id),
    -- Ta'minot mas'uli («Kim nomiga», SPEC 6: ta'minotchi hisobi).
    supply_employee_id  BIGINT        REFERENCES employee (id),
    ikpu                VARCHAR(17)   CHECK (ikpu ~ '^[0-9]{17}$'),
    farm_id             VARCHAR(50),
    controlled          BOOLEAN       NOT NULL DEFAULT false,
    marked              BOOLEAN       NOT NULL DEFAULT false,
    prescription        BOOLEAN       NOT NULL DEFAULT false,
    vat_rate            NUMERIC(5, 2) NOT NULL DEFAULT 12.00 CHECK (vat_rate >= 0 AND vat_rate <= 100),
    min_qty             INTEGER       CHECK (min_qty > 0),
    max_qty             INTEGER       CHECK (max_qty > 0),
    active              BOOLEAN       NOT NULL DEFAULT true,
    search_text         TEXT          NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version             BIGINT        NOT NULL DEFAULT 0,
    CHECK (min_qty IS NULL OR max_qty IS NULL OR min_qty <= max_qty)
);

CREATE INDEX product_search_trgm ON product USING gin (search_text gin_trgm_ops);
CREATE INDEX product_manufacturer_idx ON product (manufacturer_id);
CREATE INDEX product_category_idx ON product (category_id);
CREATE INDEX product_name_idx ON product (lower(name));

COMMENT ON COLUMN product.vat_rate IS 'QQS stavkasi, %. Narxlar QQS bilan saqlanadi (SPEC 2)';
COMMENT ON COLUMN product.marked IS 'Markirovkali: sotuvda har dona/quti 2D kodi skanerlanadi';
COMMENT ON COLUMN product.controlled IS 'Nazoratdagi: faqat Seyf zonasi va litsenziyali mijoz (SPEC 6-8)';

-- Shtrix-kodlar (bir mahsulotda bir nechta; GTIN markirovka tekshiruvida ishlatiladi).
CREATE TABLE product_barcode (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id  BIGINT       NOT NULL REFERENCES product (id),
    barcode     VARCHAR(50)  NOT NULL UNIQUE CHECK (barcode ~ '^[0-9A-Za-z-]{4,50}$'),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX product_barcode_product_idx ON product_barcode (product_id);

-- Kod o'zgarishlari tarixi (faqat qo'shiladi).
CREATE TABLE product_code_history (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id   BIGINT       NOT NULL REFERENCES product (id),
    old_code     CHAR(8)      NOT NULL,
    new_code     CHAR(8)      NOT NULL,
    reason       VARCHAR(300),
    employee_id  BIGINT,
    changed_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX product_code_history_product_idx ON product_code_history (product_id);
-- Eski kod boshqa mahsulotga berilmaydi (eski hujjatlar va qidiruv adashmasin).
CREATE UNIQUE INDEX product_code_history_old_uq ON product_code_history (old_code);

CREATE TRIGGER product_code_history_append_only
    BEFORE UPDATE OR DELETE ON product_code_history
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();
