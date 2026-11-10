-- FS qoralamasini tahrirlash (prototip TransferDoc, kind = fs — qoralama avtomatik saqlanadi): qoralamada sotuvchi zona, xaridor
-- ombori (va filiali) o'zgarishi, qatorlarni almashtirish (o'chirish + qo'shish) mumkin. Raqam va sotuvchi filial hech qachon
-- o'zgarmaydi; hujjat o'chirilmaydi; jo'natilgandan keyingi qoidalar avvalgidek (V41).
CREATE OR REPLACE FUNCTION medix_branch_sale_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    IF TG_TABLE_NAME = 'branch_sale' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'FS o''chirilmaydi' USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status IN ('RECEIVED', 'CANCELLED') THEN
            RAISE EXCEPTION 'FS % yakunlangan: o''zgartirib bo''lmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.number <> OLD.number OR NEW.seller_branch_id <> OLD.seller_branch_id THEN
            RAISE EXCEPTION 'FS % raqami va sotuvchi filiali o''zgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status <> 'DRAFT' AND (NEW.buyer_branch_id <> OLD.buyer_branch_id OR NEW.from_warehouse_id <> OLD.from_warehouse_id
                OR NEW.from_zone_id <> OLD.from_zone_id OR NEW.to_warehouse_id <> OLD.to_warehouse_id) THEN
            RAISE EXCEPTION 'FS % rekvizitlari o''zgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status = 'IN_TRANSIT' THEN
            IF NEW.status NOT IN ('IN_TRANSIT', 'RECEIVED') THEN
                RAISE EXCEPTION 'Yo''ldagi FS % faqat qabul qilinadi', OLD.number USING ERRCODE = 'restrict_violation';
            END IF;
            IF NEW.total <> OLD.total OR NEW.vat_total <> OLD.vat_total OR NEW.invoice_number <> OLD.invoice_number THEN
                RAISE EXCEPTION 'FS % summasi o''zgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
        SELECT status INTO doc_status FROM branch_sale WHERE id = OLD.sale_id;
        IF doc_status <> 'DRAFT' OR OLD.unit_cost IS NOT NULL THEN
            RAISE EXCEPTION 'FS qatorlari o''chirilmaydi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;
    SELECT status INTO doc_status FROM branch_sale WHERE id = NEW.sale_id;
    IF TG_OP = 'INSERT' THEN
        IF doc_status <> 'DRAFT' THEN
            RAISE EXCEPTION 'FS qatorlari faqat qoralamada qo''shiladi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.batch_id <> OLD.batch_id OR NEW.qty <> OLD.qty OR NEW.product_id <> OLD.product_id OR NEW.line_no <> OLD.line_no
            OR NEW.sale_id <> OLD.sale_id THEN
        RAISE EXCEPTION 'FS qatorlari o''zgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF doc_status = 'DRAFT' THEN
        -- Jo'natish tranzaksiyasida narx bir marta yoziladi (holat hali DRAFT)
        IF OLD.unit_cost IS NOT NULL OR NEW.received_qty IS NOT NULL THEN
            RAISE EXCEPTION 'FS qatorlari o''zgarmaydi' USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF doc_status <> 'IN_TRANSIT' OR OLD.received_qty IS NOT NULL OR NEW.unit_cost IS DISTINCT FROM OLD.unit_cost
            OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.vat_rate IS DISTINCT FROM OLD.vat_rate
            OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount THEN
        RAISE EXCEPTION 'FS qatorlari o''zgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
