-- OK qoralamasini tahrirlash (prototip TransferDoc — qoralama avtomatik saqlanadi): qoralamada manba zona / qabul qiluvchi ombor
-- o'zgarishi, qatorlarni almashtirish (o'chirish + qo'shish) mumkin. Raqam va filial hech qachon o'zgarmaydi; hujjat o'chirilmaydi;
-- jo'natilgandan keyingi qoidalar avvalgidek (V35).
CREATE OR REPLACE FUNCTION medix_warehouse_transfer_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    IF TG_TABLE_NAME = 'warehouse_transfer' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'OK o''chirilmaydi' USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status IN ('RECEIVED', 'CANCELLED') THEN
            RAISE EXCEPTION 'OK % yakunlangan: o''zgartirib bo''lmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.number <> OLD.number OR NEW.branch_id <> OLD.branch_id THEN
            RAISE EXCEPTION 'OK % raqami va filiali o''zgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status <> 'DRAFT' AND (NEW.from_warehouse_id <> OLD.from_warehouse_id OR NEW.from_zone_id <> OLD.from_zone_id
                OR NEW.to_warehouse_id <> OLD.to_warehouse_id) THEN
            RAISE EXCEPTION 'OK % rekvizitlari o''zgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status = 'IN_TRANSIT' AND NEW.status NOT IN ('IN_TRANSIT', 'RECEIVED') THEN
            RAISE EXCEPTION 'Yo''ldagi OK % faqat qabul qilinadi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
        SELECT status INTO doc_status FROM warehouse_transfer WHERE id = OLD.transfer_id;
        IF doc_status <> 'DRAFT' THEN
            RAISE EXCEPTION 'OK qatorlari o''chirilmaydi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;
    SELECT status INTO doc_status FROM warehouse_transfer WHERE id = NEW.transfer_id;
    IF TG_OP = 'INSERT' THEN
        IF doc_status <> 'DRAFT' THEN
            RAISE EXCEPTION 'OK qatorlari faqat qoralamada qo''shiladi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF doc_status = 'DRAFT' AND NEW.transfer_id = OLD.transfer_id AND OLD.received_qty IS NULL AND NEW.received_qty IS NULL THEN
        RETURN NEW;
    END IF;
    IF doc_status <> 'IN_TRANSIT' OR OLD.received_qty IS NOT NULL OR NEW.batch_id <> OLD.batch_id OR NEW.qty <> OLD.qty
            OR NEW.product_id <> OLD.product_id OR NEW.line_no <> OLD.line_no OR NEW.transfer_id <> OLD.transfer_id THEN
        RAISE EXCEPTION 'OK qatorlari o''zgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
