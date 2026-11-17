-- O16 (egasi 17.11.2026): markirovka haqiqiy kodlar formati va agregatsiya (quti, SSCC).
-- kind: Q — quti (eski, AI 91), D — dona, A — agregatsiya kodi (SSCC, AI 00). A uchun serial = 18 raqamli SSCC,
-- gtin = mahsulotning GTIN-14 (shtrix-koddan), units = qutidagi dona soni (mahsulotning «1 qadoqdagi dona»).
ALTER TABLE sales_order_mark DROP CONSTRAINT IF EXISTS sales_order_mark_kind_check;
ALTER TABLE sales_order_mark ADD CONSTRAINT sales_order_mark_kind_check CHECK (kind IN ('Q', 'D', 'A'));
ALTER TABLE sales_order_mark ADD CONSTRAINT sales_order_mark_sscc_check CHECK (kind <> 'A' OR serial ~ '^[0-9]{18}$');

ALTER TABLE sales_order_mark ADD COLUMN units INTEGER NOT NULL DEFAULT 1 CHECK (units > 0 AND units <= 100000);
ALTER TABLE sales_order_mark ADD COLUMN parent_sscc VARCHAR(18) CHECK (parent_sscc IS NULL OR parent_sscc ~ '^[0-9]{18}$');
COMMENT ON COLUMN sales_order_mark.units IS 'O16: kod qamraydigan birliklar soni (dona kodi — 1, quti/SSCC — qutidagi dona)';
COMMENT ON COLUMN sales_order_mark.parent_sscc IS 'O16: dona kodi qaysi qutidan (maʼlum boʻlsa)';

-- SSCC takrori — butun tizim bo'yicha (GTIN'dan qat'i nazar)
CREATE UNIQUE INDEX sales_order_mark_sscc_uq ON sales_order_mark (serial) WHERE kind = 'A' AND status IN ('ACTIVE', 'SOLD');

CREATE OR REPLACE FUNCTION medix_sales_order_mark_guard() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Markirovka kodi oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.order_id <> OLD.order_id OR NEW.line_id <> OLD.line_id OR NEW.batch_id <> OLD.batch_id OR NEW.gtin <> OLD.gtin
        OR NEW.serial <> OLD.serial OR NEW.raw <> OLD.raw OR NEW.kind <> OLD.kind OR NEW.scanned_by <> OLD.scanned_by
        OR NEW.scanned_at <> OLD.scanned_at OR NEW.units <> OLD.units THEN
        RAISE EXCEPTION 'Markirovka kodi maydonlari oʻzgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status <> 'ACTIVE' AND NOT (OLD.status = 'SOLD' AND NEW.status IN ('RELEASED', 'RETURNED')) THEN
        RAISE EXCEPTION 'Yopilgan markirovka kodi oʻzgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
