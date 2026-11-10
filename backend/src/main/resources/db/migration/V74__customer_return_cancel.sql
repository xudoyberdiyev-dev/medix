-- MEDIX — o'tkazilgan QM (mijozdan qaytarish) ni bekor qilish (prototip StockDocs tryCancel / qmBlock).
-- Bekor qilish: Karantindan tovar chiqadi (StockLedger), mijoz qarzi qaytadi (PartyLedger storno), sales_return
-- «bekor qilingan» deb belgilanadi va hisobotlardan chiqadi. Karantindagi partiya keyingi hujjat bilan chiqarilgan
-- bo'lsa — bekor qilinmaydi (servisda tekshiriladi). Ruxsat: qm.cancelPosted (Direktor, Admin — receipt.cancelPosted kabi).

ALTER TABLE customer_return
    DROP CONSTRAINT customer_return_status_check,
    DROP CONSTRAINT customer_return_check,
    ADD COLUMN cancelled_by  BIGINT REFERENCES employee (id),
    ADD COLUMN cancelled_at  TIMESTAMPTZ,
    ADD COLUMN cancel_reason VARCHAR(300);

ALTER TABLE customer_return
    ADD CONSTRAINT customer_return_status_check CHECK (status IN ('PENDING', 'POSTED', 'REJECTED', 'CANCELLED')),
    ADD CONSTRAINT customer_return_posted_check
        CHECK ((status IN ('POSTED', 'CANCELLED')) = (posted_at IS NOT NULL AND sales_return_id IS NOT NULL)),
    ADD CONSTRAINT customer_return_cancelled_check
        CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
                                         AND cancel_reason IS NOT NULL AND btrim(cancel_reason) <> ''));

-- Hal qilingan hujjat o'zgarmaydi; yagona istisno — POSTED → CANCELLED (faqat bekor qilish maydonlari va versiya).
CREATE OR REPLACE FUNCTION customer_return_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'customer_return: faqat qoʻshiladi (oʻchirish taqiqlangan)';
    END IF;
    IF OLD.status = 'PENDING' THEN
        RETURN NEW;
    END IF;
    IF OLD.status = 'POSTED' AND NEW.status = 'CANCELLED'
       AND (to_jsonb(NEW) - ARRAY['status', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'version'])
         = (to_jsonb(OLD) - ARRAY['status', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'version']) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'customer_return %: hal qilingan hujjat oʻzgarmaydi', OLD.number;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE sales_return
    ADD COLUMN cancelled_by  BIGINT REFERENCES employee (id),
    ADD COLUMN cancelled_at  TIMESTAMPTZ,
    ADD COLUMN cancel_reason VARCHAR(300),
    ADD CONSTRAINT sales_return_cancelled_check
        CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL) AND (cancelled_at IS NULL) = (cancel_reason IS NULL));

COMMENT ON COLUMN sales_return.cancelled_at IS 'QM bekor qilingan (V74): hisobotlar va «qaytarilgan» miqdor bundan chiqaradi';

-- sales_return faqat qo'shiladi; yagona istisno — mijoz QM (trip_id IS NULL) bir marta bekor qilinadi.
CREATE FUNCTION sales_return_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL AND OLD.trip_id IS NULL
       AND (to_jsonb(NEW) - ARRAY['cancelled_by', 'cancelled_at', 'cancel_reason'])
         = (to_jsonb(OLD) - ARRAY['cancelled_by', 'cancelled_at', 'cancel_reason']) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'sales_return %: faqat qoʻshiladi', OLD.number USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER sales_return_append_only ON sales_return;
CREATE TRIGGER sales_return_guard BEFORE UPDATE OR DELETE ON sales_return FOR EACH ROW EXECUTE FUNCTION sales_return_guard();

INSERT INTO permission (key, module, description, grp, kind, page)
VALUES ('qm.cancelPosted', 'qm', 'Mijozdan qaytarish: oʻtkazilganini bekor qilish', 'wh', 'cancel', 'qm');
INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, 'qm.cancelPosted' FROM role r WHERE r.code IN ('DIRECTOR', 'ADMIN');
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, 'qm.cancelPosted' FROM role r WHERE r.system AND r.code IN ('DIRECTOR', 'ADMIN');
