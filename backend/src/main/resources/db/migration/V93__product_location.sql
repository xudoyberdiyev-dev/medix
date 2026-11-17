-- O13 (egasi 17.11.2026): mahsulotning ombordagi joyi («Hudud»), masalan «A qator · 3-stellaj · 2-polka».
-- Bir mahsulot turli omborlarda turli joyda bo'lishi mumkin — ombor bo'yicha bitta qator. Bo'sh joy saqlanmaydi (qator o'chiriladi).
CREATE TABLE product_location (
    product_id    BIGINT       NOT NULL REFERENCES product (id),
    warehouse_id  BIGINT       NOT NULL REFERENCES warehouse (id),
    location      VARCHAR(60)  NOT NULL CHECK (btrim(location) <> ''),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, warehouse_id)
);
CREATE INDEX product_location_warehouse_idx ON product_location (warehouse_id, lower(location));
