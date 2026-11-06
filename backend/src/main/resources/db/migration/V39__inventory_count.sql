-- MEDIX — V2: IN, inventarizatsiya (SPEC 4, 6; T12: inventory.create / openCount / count / approve / director, ivDirApprove = 5 000 000).
-- Holatlar: Qoralama (DRAFT) → Sanoq (COUNTING) → Tekshirish (CHECK) → Tasdiqlangan (POSTED); yonidan Bekor qilingan (CANCELLED).
-- Sanoq ochilganda hisob qoldig'i (book_qty) qatorlarga yoziladi va qamrovdagi zonalar QULFLANADI (ivLock): sanoq/tekshirish
-- davomida bu zonalarda ombor harakati bo'lmaydi (StockLedger tekshiradi), shuning uchun hisob qoldig'i o'zgarmaydi.
-- Tasdiqda farq (sanaldi − hisobda) jurnalga yoziladi (StockLedger, hujjat bilan BITTA tranzaksiyada). Kamomad tannarxi chegaradan katta
-- yoki nazoratdagi tovarda farq bo'lsa — Direktor tasdig'i (needs_director). Bitta omborda bir vaqtda bitta faol inventarizatsiya.

CREATE TABLE inventory_count (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(32)    NOT NULL UNIQUE,
    branch_id       BIGINT         NOT NULL REFERENCES branch (id),
    warehouse_id    BIGINT         NOT NULL REFERENCES warehouse (id),
    zone_id         BIGINT         REFERENCES zone (id),
    blind           BOOLEAN        NOT NULL DEFAULT false,
    commission      VARCHAR(500),
    note            VARCHAR(500),
    status          VARCHAR(16)    NOT NULL CHECK (status IN ('DRAFT', 'COUNTING', 'CHECK', 'POSTED', 'CANCELLED')),
    shortage_qty    INTEGER        NOT NULL DEFAULT 0 CHECK (shortage_qty >= 0),
    shortage_cost   NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (shortage_cost >= 0),
    surplus_qty     INTEGER        NOT NULL DEFAULT 0 CHECK (surplus_qty >= 0),
    surplus_cost    NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (surplus_cost >= 0),
    needs_director  BOOLEAN        NOT NULL DEFAULT false,
    created_by      BIGINT         NOT NULL REFERENCES employee (id),
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    started_by      BIGINT         REFERENCES employee (id),
    started_at      TIMESTAMPTZ,
    submitted_by    BIGINT         REFERENCES employee (id),
    submitted_at    TIMESTAMPTZ,
    posted_by       BIGINT         REFERENCES employee (id),
    posted_at       TIMESTAMPTZ,
    cancelled_by    BIGINT         REFERENCES employee (id),
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   VARCHAR(300),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    version         BIGINT         NOT NULL DEFAULT 0,
    CHECK (status <> 'POSTED' OR (posted_by IS NOT NULL AND posted_at IS NOT NULL)),
    CHECK (status <> 'CANCELLED' OR (cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL)),
    CHECK (status IN ('DRAFT', 'CANCELLED') OR started_at IS NOT NULL)
);
CREATE INDEX inventory_count_branch_idx ON inventory_count (branch_id, created_at DESC);
-- Bitta omborda bitta faol inventarizatsiya (qulf qamrovi kesishmasin)
CREATE UNIQUE INDEX inventory_count_active_uq ON inventory_count (warehouse_id) WHERE status IN ('DRAFT', 'COUNTING', 'CHECK');

CREATE TABLE inventory_count_line (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    count_id     BIGINT         NOT NULL REFERENCES inventory_count (id),
    zone_id      BIGINT         NOT NULL REFERENCES zone (id),
    batch_id     BIGINT         NOT NULL REFERENCES batch (id),
    product_id   BIGINT         NOT NULL REFERENCES product (id),
    book_qty     INTEGER        NOT NULL CHECK (book_qty >= 0),
    counted_qty  INTEGER        CHECK (counted_qty >= 0),
    cost         NUMERIC(18, 2) NOT NULL CHECK (cost >= 0),
    added        BOOLEAN        NOT NULL DEFAULT false,
    counted_by   BIGINT         REFERENCES employee (id),
    counted_at   TIMESTAMPTZ,
    UNIQUE (count_id, zone_id, batch_id)
);
CREATE INDEX inventory_count_line_count_idx ON inventory_count_line (count_id);

-- Tasdiqlangan / bekor qilingan IN o'zgarmaydi, hech qachon o'chirilmaydi (SPEC 6-4). Qatorlar faqat «Sanoq» holatida yoziladi.
CREATE FUNCTION medix_inventory_count_locked() RETURNS trigger
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
        IF NEW.number <> OLD.number OR NEW.branch_id <> OLD.branch_id OR NEW.warehouse_id <> OLD.warehouse_id
                OR NEW.zone_id IS DISTINCT FROM OLD.zone_id THEN
            RAISE EXCEPTION 'IN % rekvizitlari o''zgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    SELECT status INTO doc_status FROM inventory_count WHERE id = NEW.count_id;
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

CREATE TRIGGER inventory_count_locked BEFORE UPDATE OR DELETE ON inventory_count
    FOR EACH ROW EXECUTE FUNCTION medix_inventory_count_locked();
CREATE TRIGGER inventory_count_line_locked BEFORE INSERT OR UPDATE OR DELETE ON inventory_count_line
    FOR EACH ROW EXECUTE FUNCTION medix_inventory_count_locked();
