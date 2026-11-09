-- MEDIX — Narxlar: tasdiqlangan, lekin hali kuchga kirmagan NO ni bekor qilish (prototip «Hali kuchga kirmagan — {d} gacha bekor qilish mumkin»).
-- Kuchga kirgan narx bekor qilinmaydi — yangi NO bilan o'zgartiriladi. «Bugun» — Asia/Tashkent.

CREATE OR REPLACE FUNCTION medix_price_change_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(20);
BEGIN
    IF TG_TABLE_NAME = 'price_change' THEN
        IF OLD.status = 'APPROVED' AND TG_OP = 'UPDATE' AND NEW.status = 'CANCELLED'
           AND OLD.effective_from > (now() AT TIME ZONE 'Asia/Tashkent')::date
           AND NEW.number = OLD.number AND NEW.branch_id = OLD.branch_id AND NEW.effective_from = OLD.effective_from
           AND NEW.created_by = OLD.created_by AND NEW.created_at = OLD.created_at
           AND NEW.receipt_id IS NOT DISTINCT FROM OLD.receipt_id AND NEW.note IS NOT DISTINCT FROM OLD.note THEN
            RETURN NEW;
        END IF;
        IF OLD.status IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
            RAISE EXCEPTION 'NO % yakunlangan (%): o''zgartirib bo''lmaydi', OLD.number, OLD.status USING ERRCODE = 'restrict_violation';
        END IF;
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'NO o''chirilmaydi' USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    SELECT status INTO doc_status FROM price_change WHERE id = COALESCE(NEW.price_change_id, OLD.price_change_id);
    IF doc_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'NO qatorlari faqat qoralamada o''zgaradi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Narx qatorlari: o'zgartirilmaydi; o'chirish — faqat bekor qilingan NO ning hali kuchga kirmagan qatorlari.
CREATE FUNCTION medix_price_void_only() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE'
       AND OLD.effective_from > (now() AT TIME ZONE 'Asia/Tashkent')::date
       AND EXISTS (SELECT 1 FROM price_change c WHERE c.id = OLD.price_change_id AND c.status = 'CANCELLED') THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Jadval % faqat qo''shiladigan: % taqiqlangan', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER price_append_only ON price;
CREATE TRIGGER price_append_only
    BEFORE UPDATE OR DELETE ON price
    FOR EACH ROW EXECUTE FUNCTION medix_price_void_only();

DROP TRIGGER batch_price_append_only ON batch_price;
CREATE TRIGGER batch_price_append_only
    BEFORE UPDATE OR DELETE ON batch_price
    FOR EACH ROW EXECUTE FUNCTION medix_price_void_only();
