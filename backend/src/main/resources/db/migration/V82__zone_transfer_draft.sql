-- ZK qoralamasi (prototip TransferDoc, kind = zk — qoralama avtomatik saqlanadi): yangi holatlar «Qoralama» (DRAFT) va «Bekor
-- qilingan» (CANCELLED). Qoralamada ombor / zonalar / izoh o'zgaradi, qatorlar almashtiriladi (o'chirish + qo'shish); tovar
-- harakatlanmaydi. Qoralama → O'tkazildi / Tasdiqda / Bekor qilingan. Raqam va filial hech qachon o'zgarmaydi; hujjat o'chirilmaydi;
-- «Tasdiqda» va yakunlangan ZK qoidalari avvalgidek (V34).
ALTER TABLE zone_transfer DROP CONSTRAINT zone_transfer_status_check;
ALTER TABLE zone_transfer ADD CONSTRAINT zone_transfer_status_check
    CHECK (status IN ('DRAFT', 'PENDING', 'POSTED', 'REJECTED', 'CANCELLED'));
ALTER TABLE zone_transfer ADD COLUMN cancelled_by BIGINT REFERENCES employee (id);
ALTER TABLE zone_transfer ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE zone_transfer ADD CONSTRAINT zone_transfer_cancelled_check
    CHECK (status <> 'CANCELLED' OR (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL));

CREATE OR REPLACE FUNCTION medix_zone_transfer_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    IF TG_TABLE_NAME = 'zone_transfer' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'ZK o''chirilmaydi' USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status NOT IN ('DRAFT', 'PENDING') THEN
            RAISE EXCEPTION 'ZK % yakunlangan: o''zgartirib bo''lmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.number <> OLD.number OR NEW.branch_id <> OLD.branch_id THEN
            RAISE EXCEPTION 'ZK % raqami va filiali o''zgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status = 'PENDING' THEN
            IF NEW.warehouse_id <> OLD.warehouse_id OR NEW.from_zone_id <> OLD.from_zone_id OR NEW.to_zone_id <> OLD.to_zone_id THEN
                RAISE EXCEPTION 'ZK % rekvizitlari o''zgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
            END IF;
            IF NEW.status NOT IN ('PENDING', 'POSTED', 'REJECTED') THEN
                RAISE EXCEPTION 'Tasdiqdagi ZK % faqat tasdiqlanadi yoki rad etiladi', OLD.number USING ERRCODE = 'restrict_violation';
            END IF;
        ELSIF NEW.status NOT IN ('DRAFT', 'PENDING', 'POSTED', 'CANCELLED') THEN
            RAISE EXCEPTION 'ZK % qoralamasi rad etilmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'ZK qatorlari o''zgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
        SELECT status INTO doc_status FROM zone_transfer WHERE id = OLD.transfer_id;
        IF doc_status <> 'DRAFT' THEN
            RAISE EXCEPTION 'ZK qatorlari o''chirilmaydi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;
    SELECT status INTO doc_status FROM zone_transfer WHERE id = NEW.transfer_id;
    IF doc_status NOT IN ('DRAFT', 'PENDING') THEN
        RAISE EXCEPTION 'ZK qatorlari faqat qoralamada qo''shiladi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
