-- MEDIX — 7-bosqich: markirovka (SPEC 5.2 №5, 5.4, 6). Markirovkachi «Markirovkada» buyurtmani boshlaydi (bitta faol ish),
-- markirovkali qatorlarning har dona/qutisini skanerlaydi; har skanerlashda tekshiruv tartibi: format → takror (barcha
-- buyurtmalar bo'yicha global) → mahsulot (GTIN) → partiya (yig'ilgan) → tur (Q/D, qator birligiga mos) → qator to'lganmi.
ALTER TABLE sales_order
    ADD COLUMN marker_id         BIGINT REFERENCES employee (id),
    ADD COLUMN mark_started_at   TIMESTAMPTZ,
    ADD COLUMN mark_finished_at  TIMESTAMPTZ;

-- Bitta faol markirovka: bir markirovkachida faqat bitta boshlangan «Markirovkada» buyurtma.
CREATE UNIQUE INDEX sales_order_one_active_mark ON sales_order (marker_id) WHERE status = 'MARKING';

-- Skanerlangan kodlar. Holat: ACTIVE (buyurtmada), REMOVED (yakunlashdan oldin sabab bilan olib tashlandi),
-- RELEASED (bekor qilish yoki «Yig'ishga qaytarish» — kod bo'shadi, tarixda qoladi), SOLD (sotuvda — 8-bosqich).
-- Bo'shagan kodni qayta urish mumkin (yangi yozuv). Kod maydonlari o'zgarmaydi, yozuv o'chirilmaydi.
CREATE TABLE sales_order_mark (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id       BIGINT        NOT NULL REFERENCES sales_order (id),
    line_id        BIGINT        NOT NULL REFERENCES sales_order_line (id),
    batch_id       BIGINT        NOT NULL REFERENCES batch (id),
    gtin           CHAR(14)      NOT NULL CHECK (gtin ~ '^[0-9]{14}$'),
    serial         VARCHAR(20)   NOT NULL,
    batch_no       VARCHAR(20)   NOT NULL,
    expiry_date    DATE,
    kind           CHAR(1)       NOT NULL CHECK (kind IN ('Q', 'D')),
    raw            VARCHAR(300)  NOT NULL,
    status         VARCHAR(10)   NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED', 'RELEASED', 'SOLD')),
    scanned_by     BIGINT        NOT NULL REFERENCES employee (id),
    scanned_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    closed_by      BIGINT        REFERENCES employee (id),
    closed_at      TIMESTAMPTZ,
    close_reason   VARCHAR(300),
    CHECK ((status = 'ACTIVE') = (closed_at IS NULL)),
    CHECK (status <> 'REMOVED' OR close_reason IS NOT NULL)
);
-- Takror — global: bir kod (GTIN + seriya) bir vaqtda faqat bitta buyurtmada yoki sotilgan.
CREATE UNIQUE INDEX sales_order_mark_code_uq ON sales_order_mark (gtin, serial) WHERE status IN ('ACTIVE', 'SOLD');
CREATE INDEX sales_order_mark_order_idx ON sales_order_mark (order_id, status);
CREATE INDEX sales_order_mark_scanned_idx ON sales_order_mark (scanned_by, scanned_at DESC);

CREATE FUNCTION medix_sales_order_mark_guard() RETURNS trigger
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
    IF OLD.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Yopilgan markirovka kodi oʻzgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER sales_order_mark_guard BEFORE UPDATE OR DELETE ON sales_order_mark
    FOR EACH ROW EXECUTE FUNCTION medix_sales_order_mark_guard();
