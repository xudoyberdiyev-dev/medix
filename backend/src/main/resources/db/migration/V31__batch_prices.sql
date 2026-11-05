-- MEDIX — 3-bosqich: «Kirim bo'yicha» narx rejimi (SPEC 6).
-- NO «Kirim bo'yicha» rejimida faqat bitta o'tkazilgan kirimning tanlangan partiyalariga narx qo'yadi.
-- Narx tanlash: 1) partiya narxi (mijoz turida, bo'lmasa bazaviy turda); 2) mijoz narx turi; 3) bazaviy narx.

ALTER TABLE price_change
    ADD COLUMN receipt_id BIGINT REFERENCES receipt (id);
COMMENT ON COLUMN price_change.receipt_id IS 'To''ldirilgan bo''lsa — «Kirim bo''yicha» rejimi: qatorlar shu kirim partiyalariga';

ALTER TABLE price_change_line
    ADD COLUMN batch_id BIGINT REFERENCES batch (id);

-- Bir mahsulot × tur endi bir necha partiyada bo'lishi mumkin.
DO
$$
DECLARE
    c TEXT;
BEGIN
    SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'price_change_line'::regclass AND contype = 'u';
    EXECUTE format('ALTER TABLE price_change_line DROP CONSTRAINT %I', c);
END;
$$;
CREATE UNIQUE INDEX price_change_line_uniq ON price_change_line (price_change_id, product_id, price_type_id, coalesce(batch_id, 0));

-- Partiya narxlari: (partiya, tur, filial) bo'yicha sana ≤ X dagi eng oxirgi qator. Faqat qo'shiladi.
CREATE TABLE batch_price (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id         BIGINT         NOT NULL REFERENCES batch (id),
    price_type_id    BIGINT         NOT NULL REFERENCES price_type (id),
    branch_id        BIGINT         NOT NULL REFERENCES branch (id),
    effective_from   DATE           NOT NULL,
    amount           NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
    price_change_id  BIGINT         NOT NULL REFERENCES price_change (id),
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX batch_price_lookup_idx ON batch_price (batch_id, price_type_id, branch_id, effective_from DESC, id DESC);

CREATE TRIGGER batch_price_append_only
    BEFORE UPDATE OR DELETE ON batch_price
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();
