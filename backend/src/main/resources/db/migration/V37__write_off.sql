-- MEDIX — V2: HC, hisobdan chiqarish (SPEC 4, 7; T12: hc.create / hc.approve / hc.director, hcDirApprove = 5 000 000).
-- Bitta zonadan (odatda Karantin): muddati o'tgan, shikastlangan, kamomad yoki boshqa sabab (izoh majburiy). Holatlar: Tasdiqda
-- (PENDING) → O'tkazildi (POSTED); yonidan Rad etildi (REJECTED). Tannarx summasi chegaradan katta bo'lsa — Direktor tasdig'i
-- (needs_director). Tovar faqat o'tkazilganda zonadan chiqadi (StockLedger, hujjat bilan BITTA tranzaksiyada). Tannarx qator
-- yaratilganda partiyadan olinadi va o'zgarmaydi.

CREATE TABLE write_off (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(32)    NOT NULL UNIQUE,
    branch_id       BIGINT         NOT NULL REFERENCES branch (id),
    warehouse_id    BIGINT         NOT NULL REFERENCES warehouse (id),
    zone_id         BIGINT         NOT NULL REFERENCES zone (id),
    reason          VARCHAR(16)    NOT NULL CHECK (reason IN ('EXPIRED', 'DAMAGED', 'SHORTAGE', 'OTHER')),
    act_no          VARCHAR(64),
    commission      VARCHAR(500),
    note            VARCHAR(500),
    total_cost      NUMERIC(18, 2) NOT NULL CHECK (total_cost >= 0),
    needs_director  BOOLEAN        NOT NULL,
    status          VARCHAR(16)    NOT NULL CHECK (status IN ('PENDING', 'POSTED', 'REJECTED')),
    created_by      BIGINT         NOT NULL REFERENCES employee (id),
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    posted_by       BIGINT         REFERENCES employee (id),
    posted_at       TIMESTAMPTZ,
    rejected_by     BIGINT         REFERENCES employee (id),
    rejected_at     TIMESTAMPTZ,
    reject_reason   VARCHAR(300),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    version         BIGINT         NOT NULL DEFAULT 0,
    CHECK (reason <> 'OTHER' OR note IS NOT NULL),
    CHECK (status <> 'POSTED' OR (posted_by IS NOT NULL AND posted_at IS NOT NULL)),
    CHECK (status <> 'REJECTED' OR (rejected_by IS NOT NULL AND reject_reason IS NOT NULL))
);
CREATE INDEX write_off_branch_idx ON write_off (branch_id, created_at DESC);
CREATE INDEX write_off_pending_idx ON write_off (branch_id) WHERE status = 'PENDING';

CREATE TABLE write_off_line (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    write_off_id BIGINT         NOT NULL REFERENCES write_off (id),
    line_no      INTEGER        NOT NULL CHECK (line_no > 0),
    batch_id     BIGINT         NOT NULL REFERENCES batch (id),
    product_id   BIGINT         NOT NULL REFERENCES product (id),
    qty          INTEGER        NOT NULL CHECK (qty > 0),
    cost         NUMERIC(18, 2) NOT NULL CHECK (cost >= 0),
    amount       NUMERIC(18, 2) NOT NULL CHECK (amount >= 0),
    UNIQUE (write_off_id, line_no),
    UNIQUE (write_off_id, batch_id)
);

-- O'tkazilgan / rad etilgan HC o'zgarmaydi, hech qachon o'chirilmaydi (SPEC 6-4). Qatorlar faqat «Tasdiqda» holatida qo'shiladi.
CREATE FUNCTION medix_write_off_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'HC o''chirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_TABLE_NAME = 'write_off' THEN
        IF OLD.status <> 'PENDING' THEN
            RAISE EXCEPTION 'HC % yakunlangan: o''zgartirib bo''lmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.number <> OLD.number OR NEW.branch_id <> OLD.branch_id OR NEW.warehouse_id <> OLD.warehouse_id
                OR NEW.zone_id <> OLD.zone_id OR NEW.total_cost <> OLD.total_cost OR NEW.needs_director <> OLD.needs_director THEN
            RAISE EXCEPTION 'HC % rekvizitlari o''zgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'HC qatorlari o''zgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    SELECT status INTO doc_status FROM write_off WHERE id = NEW.write_off_id;
    IF doc_status <> 'PENDING' THEN
        RAISE EXCEPTION 'HC qatorlari faqat yaratilganda qo''shiladi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER write_off_locked BEFORE UPDATE OR DELETE ON write_off
    FOR EACH ROW EXECUTE FUNCTION medix_write_off_locked();
CREATE TRIGGER write_off_line_locked BEFORE INSERT OR UPDATE OR DELETE ON write_off_line
    FOR EACH ROW EXECUTE FUNCTION medix_write_off_locked();
