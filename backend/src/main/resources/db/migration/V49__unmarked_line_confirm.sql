-- Egasi qarori (07.11.2026, E1): HAR bir buyurtma Markirovkachi bosqichidan o'tadi.
-- Markirovkali qatorlar skanerlanadi; markirovkasiz qatorlar Markirovkachi tomonidan «Tasdiqlash» bilan o'tadi.
-- Tasdiq qator bo'yicha; «Yig'ishga qaytarish» yoki bekor qilishda faol tasdiq yopiladi (tarixda qoladi).
CREATE TABLE sales_order_mark_confirm (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id       BIGINT       NOT NULL REFERENCES sales_order (id),
    line_id        BIGINT       NOT NULL REFERENCES sales_order_line (id),
    confirmed_by   BIGINT       NOT NULL REFERENCES employee (id),
    confirmed_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    active         BOOLEAN      NOT NULL DEFAULT true,
    closed_at      TIMESTAMPTZ,
    CHECK (active = (closed_at IS NULL))
);
-- Bir qatorda bitta faol tasdiq
CREATE UNIQUE INDEX sales_order_mark_confirm_active_uq ON sales_order_mark_confirm (line_id) WHERE active;
CREATE INDEX sales_order_mark_confirm_order_idx ON sales_order_mark_confirm (order_id);

COMMENT ON TABLE sales_order_mark_confirm IS 'Markirovkasiz qatorni Markirovkachi tasdiqlagani (E1). Oʻchirilmaydi; yopilganda active = false';

CREATE FUNCTION sales_order_mark_confirm_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Markirovkasiz qator tasdigʻi oʻchirilmaydi';
    END IF;
    IF NEW.order_id <> OLD.order_id OR NEW.line_id <> OLD.line_id OR NEW.confirmed_by <> OLD.confirmed_by
       OR NEW.confirmed_at <> OLD.confirmed_at OR (NOT OLD.active AND NEW.active) THEN
        RAISE EXCEPTION 'Markirovkasiz qator tasdigʻi oʻzgartirilmaydi (faqat yopiladi)';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER sales_order_mark_confirm_guard
    BEFORE UPDATE OR DELETE ON sales_order_mark_confirm
    FOR EACH ROW EXECUTE FUNCTION sales_order_mark_confirm_guard();
