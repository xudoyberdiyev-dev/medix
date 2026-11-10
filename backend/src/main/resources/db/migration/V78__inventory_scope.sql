-- MEDIX — Inventarizatsiya hujjati prototip InventoryDoc boʻyicha: qamrov (Butun ombor / Zonalar — bir nechta / Mahsulotlar),
-- hujjat sanasi, komissiya xodimlar roʻyxati + rais, qatorda izoh va «qayta sanash» belgisi (tekshiruvdan tanlangan qatorlar
-- sanoqqa qaytariladi). Qoralama avtomatik saqlanadi — DRAFT holatida ombor/zona oʻzgarishi mumkin.

ALTER TABLE inventory_count
    ADD COLUMN scope_mode VARCHAR(12) NOT NULL DEFAULT 'WAREHOUSE' CHECK (scope_mode IN ('WAREHOUSE', 'ZONES', 'PRODUCTS')),
    ADD COLUMN count_date DATE,
    ADD COLUMN chair_id   BIGINT REFERENCES employee (id);

CREATE TABLE inventory_count_zone (
    count_id BIGINT NOT NULL REFERENCES inventory_count (id),
    zone_id  BIGINT NOT NULL REFERENCES zone (id),
    PRIMARY KEY (count_id, zone_id)
);
CREATE INDEX inventory_count_zone_zone_idx ON inventory_count_zone (zone_id);

CREATE TABLE inventory_count_product (
    count_id   BIGINT NOT NULL REFERENCES inventory_count (id),
    product_id BIGINT NOT NULL REFERENCES product (id),
    PRIMARY KEY (count_id, product_id)
);

CREATE TABLE inventory_count_member (
    count_id    BIGINT NOT NULL REFERENCES inventory_count (id),
    employee_id BIGINT NOT NULL REFERENCES employee (id),
    PRIMARY KEY (count_id, employee_id)
);

ALTER TABLE inventory_count_line
    ADD COLUMN note    VARCHAR(300),
    ADD COLUMN recount BOOLEAN NOT NULL DEFAULT false;

-- Mavjud hujjatlar: bitta zonali → «Zonalar» qamrovi (yakunlanganlar ham — trigger vaqtincha oʻchiriladi)
ALTER TABLE inventory_count DISABLE TRIGGER inventory_count_locked;
UPDATE inventory_count SET scope_mode = 'ZONES', count_date = (created_at AT TIME ZONE 'Asia/Tashkent')::date WHERE zone_id IS NOT NULL;
UPDATE inventory_count SET count_date = (created_at AT TIME ZONE 'Asia/Tashkent')::date WHERE count_date IS NULL;
ALTER TABLE inventory_count ENABLE TRIGGER inventory_count_locked;
INSERT INTO inventory_count_zone (count_id, zone_id) SELECT id, zone_id FROM inventory_count WHERE zone_id IS NOT NULL;

-- Qamrov / komissiya jadvallari faqat qoralamada oʻzgaradi
CREATE FUNCTION medix_inventory_scope_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    SELECT status INTO doc_status FROM inventory_count WHERE id = coalesce(NEW.count_id, OLD.count_id);
    IF doc_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'IN qamrovi va komissiyasi faqat qoralamada oʻzgaradi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN coalesce(NEW, OLD);
END;
$$;

CREATE TRIGGER inventory_count_zone_locked BEFORE INSERT OR UPDATE OR DELETE ON inventory_count_zone
    FOR EACH ROW EXECUTE FUNCTION medix_inventory_scope_locked();
CREATE TRIGGER inventory_count_product_locked BEFORE INSERT OR UPDATE OR DELETE ON inventory_count_product
    FOR EACH ROW EXECUTE FUNCTION medix_inventory_scope_locked();
CREATE TRIGGER inventory_count_member_locked BEFORE INSERT OR UPDATE OR DELETE ON inventory_count_member
    FOR EACH ROW EXECUTE FUNCTION medix_inventory_scope_locked();

-- Asosiy trigger: qoralamada ombor/zona oʻzgarishi mumkin (filial — yoʻq); qatorda Tekshirish holatida faqat izoh oʻzgaradi
CREATE OR REPLACE FUNCTION medix_inventory_count_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'IN o''chirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_TABLE_NAME = 'inventory_count' THEN
        IF OLD.status IN ('POSTED', 'CANCELLED') THEN
            RAISE EXCEPTION 'IN % yakunlangan: o''zgartirib bo''lmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.number <> OLD.number OR NEW.branch_id <> OLD.branch_id THEN
            RAISE EXCEPTION 'IN % rekvizitlari o''zgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status <> 'DRAFT' AND (NEW.warehouse_id <> OLD.warehouse_id OR NEW.zone_id IS DISTINCT FROM OLD.zone_id
                OR NEW.scope_mode <> OLD.scope_mode) THEN
            RAISE EXCEPTION 'IN % qamrovi faqat qoralamada o''zgaradi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    SELECT status INTO doc_status FROM inventory_count WHERE id = NEW.count_id;
    IF doc_status = 'CHECK' AND TG_OP = 'UPDATE' THEN
        IF NEW.counted_qty IS DISTINCT FROM OLD.counted_qty OR NEW.zone_id <> OLD.zone_id OR NEW.batch_id <> OLD.batch_id
                OR NEW.book_qty <> OLD.book_qty OR NEW.cost <> OLD.cost OR NEW.recount <> OLD.recount THEN
            RAISE EXCEPTION 'Tekshirishda IN qatorida faqat izoh o''zgaradi' USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF doc_status <> 'COUNTING' THEN
        RAISE EXCEPTION 'IN qatorlari faqat sanoqda yoziladi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.zone_id <> OLD.zone_id OR NEW.batch_id <> OLD.batch_id OR NEW.book_qty <> OLD.book_qty
            OR NEW.cost <> OLD.cost) THEN
        RAISE EXCEPTION 'IN qatorida faqat sanalgan miqdor o''zgaradi' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
