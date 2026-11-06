-- MEDIX — 7-bosqich: hisobdan o'tkazish (SPEC 5.2 №6). Ombor mudiri har qatorni «Tekshirildi», joylar sonini (quti) kiritadi;
-- xato bo'lsa — «Yig'ishga qaytarish» (sabab bilan): tovar Jo'natish zonasidan olingan joyiga qaytadi, zahira qayta qo'yiladi.
ALTER TABLE sales_order
    ADD COLUMN places      INTEGER CHECK (places > 0),
    ADD COLUMN checked_by  BIGINT REFERENCES employee (id),
    ADD COLUMN checked_at  TIMESTAMPTZ;

-- Yig'ilganni qaytarish yozuvlari (faqat qo'shiladi). Sof yig'ilgan = sales_order_pick − sales_order_pick_return.
CREATE TABLE sales_order_pick_return (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id      BIGINT        NOT NULL REFERENCES sales_order (id),
    batch_id      BIGINT        NOT NULL REFERENCES batch (id),
    from_zone_id  BIGINT        NOT NULL REFERENCES zone (id),
    to_zone_id    BIGINT        NOT NULL REFERENCES zone (id),
    qty           INTEGER       NOT NULL CHECK (qty > 0),
    reason        VARCHAR(300)  NOT NULL,
    created_by    BIGINT        NOT NULL REFERENCES employee (id),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX sales_order_pick_return_order_idx ON sales_order_pick_return (order_id);

CREATE TRIGGER sales_order_pick_return_append_only
    BEFORE UPDATE OR DELETE ON sales_order_pick_return
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();
