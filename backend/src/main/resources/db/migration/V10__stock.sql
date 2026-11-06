-- MEDIX — 4-bosqich: ombor hisobining asosi (SPEC 2, 6, 11). Qoldiq tuzilishi: Filial → Ombor → Zona → Mahsulot → Partiya → Miqdor.
-- Harakatlar faqat qo'shiladigan jurnalga (stock_move) yoziladi; stock_balance — tezlik uchun, jurnal bilan BITTA tranzaksiyada
-- yangilanadi. Qoldiq hech qachon manfiy bo'lmaydi (CHECK). Miqdor — butun son.

-- Partiya: har kirim qatori o'z partiyasi (o'z tannarxi bilan). Bonus tovar — alohida partiya, tannarx 0, raqami «-B».
CREATE TABLE batch (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id    BIGINT         NOT NULL REFERENCES product (id),
    number        VARCHAR(64)    NOT NULL CHECK (btrim(number) <> ''),
    produced_on   DATE,
    expiry_date   DATE           NOT NULL,
    cost          NUMERIC(18, 2) NOT NULL CHECK (cost >= 0),
    bonus         BOOLEAN        NOT NULL DEFAULT false,
    source_type   VARCHAR(8)     NOT NULL,
    source_id     BIGINT,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CHECK (NOT bonus OR cost = 0),
    CHECK (produced_on IS NULL OR produced_on <= expiry_date)
);
CREATE INDEX batch_product_idx ON batch (product_id, expiry_date);
COMMENT ON COLUMN batch.source_type IS 'Partiyani yaratgan hujjat turi: KR (kirim), BQ (boshlang''ich qoldiq), ...';

CREATE TRIGGER batch_append_only
    BEFORE UPDATE OR DELETE ON batch
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- Harakatlar jurnali (faqat qo'shiladi). qty > 0 — kirdi, qty < 0 — chiqdi.
CREATE TABLE stock_move (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    branch_id     BIGINT       NOT NULL REFERENCES branch (id),
    warehouse_id  BIGINT       NOT NULL REFERENCES warehouse (id),
    zone_id       BIGINT       NOT NULL REFERENCES zone (id),
    product_id    BIGINT       NOT NULL REFERENCES product (id),
    batch_id      BIGINT       NOT NULL REFERENCES batch (id),
    qty           INTEGER      NOT NULL CHECK (qty <> 0),
    doc_type      VARCHAR(8)   NOT NULL,
    doc_id        BIGINT       NOT NULL,
    doc_number    VARCHAR(32)  NOT NULL,
    employee_id   BIGINT,
    note          VARCHAR(300)
);
CREATE INDEX stock_move_batch_idx ON stock_move (batch_id, zone_id);
CREATE INDEX stock_move_doc_idx ON stock_move (doc_type, doc_id);
CREATE INDEX stock_move_product_idx ON stock_move (product_id, occurred_at DESC);

CREATE TRIGGER stock_move_append_only
    BEFORE UPDATE OR DELETE ON stock_move
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- Qoldiq (zona × partiya). Faqat StockLedger yangilaydi — jurnal bilan bitta tranzaksiyada.
CREATE TABLE stock_balance (
    zone_id       BIGINT       NOT NULL REFERENCES zone (id),
    batch_id      BIGINT       NOT NULL REFERENCES batch (id),
    product_id    BIGINT       NOT NULL REFERENCES product (id),
    warehouse_id  BIGINT       NOT NULL REFERENCES warehouse (id),
    branch_id     BIGINT       NOT NULL REFERENCES branch (id),
    qty           INTEGER      NOT NULL CHECK (qty >= 0),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (zone_id, batch_id)
);
CREATE INDEX stock_balance_product_idx ON stock_balance (product_id) WHERE qty > 0;
CREATE INDEX stock_balance_branch_idx ON stock_balance (branch_id, warehouse_id) WHERE qty > 0;

COMMENT ON TABLE stock_balance IS 'Joriy qoldiq: stock_move yig''indisi bilan doim teng (StockLedgerIT tekshiradi)';
