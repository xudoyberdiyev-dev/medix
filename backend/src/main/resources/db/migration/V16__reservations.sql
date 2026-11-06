-- MEDIX — 7-bosqich boshlanishi: zahira (SPEC 6-7 FEFO). Buyurtma «Navbatda»ga o'tganda muddati eng yaqin partiyalar
-- (sotuvga ochiq zona, mijozning minimal yaroqlilik talabi) zahiraga qo'yiladi. Mavjud qoldiq = qoldiq − faol zahira.
-- Zahira qoldiqni o'zgartirmaydi (jurnalga yozilmaydi); bekor qilishda bo'shaydi, sotuvda iste'mol qilinadi (8-bosqich).
CREATE TABLE stock_reservation (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    doc_type      VARCHAR(8)   NOT NULL,
    doc_id        BIGINT       NOT NULL,
    doc_line_id   BIGINT       NOT NULL,
    doc_number    VARCHAR(32)  NOT NULL,
    zone_id       BIGINT       NOT NULL REFERENCES zone (id),
    batch_id      BIGINT       NOT NULL REFERENCES batch (id),
    product_id    BIGINT       NOT NULL REFERENCES product (id),
    warehouse_id  BIGINT       NOT NULL REFERENCES warehouse (id),
    qty           INTEGER      NOT NULL CHECK (qty > 0),
    status        VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED', 'CONSUMED')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    closed_at     TIMESTAMPTZ,
    CHECK ((status = 'ACTIVE') = (closed_at IS NULL))
);
CREATE INDEX stock_reservation_active_idx ON stock_reservation (zone_id, batch_id) WHERE status = 'ACTIVE';
CREATE INDEX stock_reservation_doc_idx ON stock_reservation (doc_type, doc_id);
