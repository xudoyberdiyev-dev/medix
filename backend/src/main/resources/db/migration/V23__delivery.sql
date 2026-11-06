-- MEDIX — 8-bosqich: yetkazish natijasi (SPEC 5.2 №10, 5.4). Har manzilda: «Yetkazildi» (kamida 1 rasm majburiy) yoki
-- «Yetkazilmadi» (sabab majburiy — sotuv va qarz bekor bo'ladi, tovar «Qaytmoqda», Ombor mudiri sanab Karantinga qabul qiladi).
-- Naqd to'lovda haydovchi olgan summa yoziladi («Haydovchidagi pul» — Kassir qabul qiladi, 9-bosqich).
ALTER TABLE trip_stop
    ADD COLUMN outcome        VARCHAR(12) CHECK (outcome IN ('DELIVERED', 'UNDELIVERED')),
    ADD COLUMN outcome_by     BIGINT REFERENCES employee (id),
    ADD COLUMN outcome_at     TIMESTAMPTZ,
    ADD COLUMN outcome_reason VARCHAR(300),
    ADD COLUMN cash_collected NUMERIC(18, 2) CHECK (cash_collected >= 0),
    ADD CONSTRAINT trip_stop_outcome_chk CHECK ((outcome IS NULL) = (outcome_at IS NULL)
        AND (outcome IS DISTINCT FROM 'UNDELIVERED' OR outcome_reason IS NOT NULL));

-- Yetkazish rasmlari. V1: bazada (bytea, ≤ 5 MB); MinIO ga o'tkazish — joylashtirishda (SPEC 10). Faqat qo'shiladi.
CREATE TABLE delivery_photo (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stop_id       BIGINT        NOT NULL REFERENCES trip_stop (id),
    content_type  VARCHAR(40)   NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes    INTEGER       NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    data          BYTEA         NOT NULL,
    kind          VARCHAR(10)   NOT NULL DEFAULT 'PHOTO' CHECK (kind IN ('PHOTO', 'SIGNATURE')),
    created_by    BIGINT        NOT NULL REFERENCES employee (id),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX delivery_photo_stop_idx ON delivery_photo (stop_id);
CREATE TRIGGER delivery_photo_append_only BEFORE UPDATE OR DELETE ON delivery_photo
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- Qaytayotgan tovar (yetkazilmadi): haydovchida → Ombor mudiri sanab qabul qiladi → Karantin. Farq — muammo sifatida.
CREATE TABLE sales_return_pending (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id      BIGINT        NOT NULL REFERENCES sales_order (id),
    sale_id       BIGINT        NOT NULL REFERENCES sale (id),
    batch_id      BIGINT        NOT NULL REFERENCES batch (id),
    product_id    BIGINT        NOT NULL REFERENCES product (id),
    warehouse_id  BIGINT        NOT NULL REFERENCES warehouse (id),
    qty           INTEGER       NOT NULL CHECK (qty > 0),
    received_qty  INTEGER       CHECK (received_qty >= 0 AND received_qty <= qty),
    received_by   BIGINT        REFERENCES employee (id),
    received_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CHECK ((received_at IS NULL) = (received_qty IS NULL))
);
CREATE INDEX sales_return_pending_open_idx ON sales_return_pending (warehouse_id) WHERE received_at IS NULL;

-- Yetkazilmagan buyurtmaning sotilgan kodlari bo'shaydi (SOLD → RELEASED); qolgan qoidalar o'zgarmaydi.
CREATE OR REPLACE FUNCTION medix_sales_order_mark_guard() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Markirovka kodi oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.order_id <> OLD.order_id OR NEW.line_id <> OLD.line_id OR NEW.batch_id <> OLD.batch_id OR NEW.gtin <> OLD.gtin
        OR NEW.serial <> OLD.serial OR NEW.raw <> OLD.raw OR NEW.kind <> OLD.kind OR NEW.scanned_by <> OLD.scanned_by
        OR NEW.scanned_at <> OLD.scanned_at THEN
        RAISE EXCEPTION 'Markirovka kodi maydonlari oʻzgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status <> 'ACTIVE' AND NOT (OLD.status = 'SOLD' AND NEW.status = 'RELEASED') THEN
        RAISE EXCEPTION 'Yopilgan markirovka kodi oʻzgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
