-- MEDIX — V2: ZK, zona ko'chirishi (bitta ombor ichida). SPEC 4, 7; T12: ZK — karantindan sotuvga ochiq zonaga ko'chirish tasdiq
-- talab qiladi (transfer.quar). Holatlar: Tasdiqda (PENDING) → O'tkazildi (POSTED); yonidan Rad etildi (REJECTED).
-- Tasdiq talab qilinmasa — yaratilganda darhol o'tkaziladi. Jurnal va qoldiq StockLedger orqali, hujjat bilan BITTA tranzaksiyada.

CREATE TABLE zone_transfer (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(32)   NOT NULL UNIQUE,
    branch_id       BIGINT        NOT NULL REFERENCES branch (id),
    warehouse_id    BIGINT        NOT NULL REFERENCES warehouse (id),
    from_zone_id    BIGINT        NOT NULL REFERENCES zone (id),
    to_zone_id      BIGINT        NOT NULL REFERENCES zone (id),
    needs_approval  BOOLEAN       NOT NULL,
    note            VARCHAR(500),
    status          VARCHAR(16)   NOT NULL CHECK (status IN ('PENDING', 'POSTED', 'REJECTED')),
    created_by      BIGINT        NOT NULL REFERENCES employee (id),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    posted_by       BIGINT        REFERENCES employee (id),
    posted_at       TIMESTAMPTZ,
    rejected_by     BIGINT        REFERENCES employee (id),
    rejected_at     TIMESTAMPTZ,
    reject_reason   VARCHAR(300),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version         BIGINT        NOT NULL DEFAULT 0,
    CHECK (from_zone_id <> to_zone_id),
    CHECK (status <> 'POSTED' OR (posted_by IS NOT NULL AND posted_at IS NOT NULL)),
    CHECK (status <> 'REJECTED' OR (rejected_by IS NOT NULL AND reject_reason IS NOT NULL))
);
CREATE INDEX zone_transfer_branch_idx ON zone_transfer (branch_id, created_at DESC);
CREATE INDEX zone_transfer_pending_idx ON zone_transfer (branch_id) WHERE status = 'PENDING';

CREATE TABLE zone_transfer_line (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transfer_id  BIGINT  NOT NULL REFERENCES zone_transfer (id),
    line_no      INTEGER NOT NULL CHECK (line_no > 0),
    batch_id     BIGINT  NOT NULL REFERENCES batch (id),
    product_id   BIGINT  NOT NULL REFERENCES product (id),
    qty          INTEGER NOT NULL CHECK (qty > 0),
    UNIQUE (transfer_id, line_no),
    UNIQUE (transfer_id, batch_id)
);

-- O'tkazilgan / rad etilgan ZK o'zgarmaydi, hech qachon o'chirilmaydi (SPEC 6-4). Qatorlar faqat «Tasdiqda» holatida qo'shiladi.
CREATE FUNCTION medix_zone_transfer_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'ZK o''chirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_TABLE_NAME = 'zone_transfer' THEN
        IF OLD.status <> 'PENDING' THEN
            RAISE EXCEPTION 'ZK % yakunlangan: o''zgartirib bo''lmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.number <> OLD.number OR NEW.branch_id <> OLD.branch_id OR NEW.warehouse_id <> OLD.warehouse_id
                OR NEW.from_zone_id <> OLD.from_zone_id OR NEW.to_zone_id <> OLD.to_zone_id THEN
            RAISE EXCEPTION 'ZK % rekvizitlari o''zgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'ZK qatorlari o''zgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    SELECT status INTO doc_status FROM zone_transfer WHERE id = NEW.transfer_id;
    IF doc_status <> 'PENDING' THEN
        RAISE EXCEPTION 'ZK qatorlari faqat yaratilganda qo''shiladi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER zone_transfer_locked BEFORE UPDATE OR DELETE ON zone_transfer
    FOR EACH ROW EXECUTE FUNCTION medix_zone_transfer_locked();
CREATE TRIGGER zone_transfer_line_locked BEFORE INSERT OR UPDATE OR DELETE ON zone_transfer_line
    FOR EACH ROW EXECUTE FUNCTION medix_zone_transfer_locked();
