-- MEDIX — V2: QY, yetkazib beruvchiga (YB) qaytarish (SPEC 4, 7; T12: qy.create / qy.approve / qy.view; QY: supplier, receiptNo,
-- reason). Har QY bitta o'tkazilgan kirimga (KR) va bitta zonaga bog'lanadi: faqat shu kirim partiyalari qaytariladi. Holatlar:
-- Tasdiqda (PENDING) → O'tkazildi (POSTED); yonidan Rad etildi (REJECTED). O'tkazish — BITTA tranzaksiya: tovar zonadan chiqadi
-- (StockLedger), YB qarzi kirim narxida kamayadi (party_ledger, KR ga qo'llanadi) yoki bonus balansdan to'langan kirimda — summa
-- bonus balansga qaytadi; bonus partiya (narx 0) qarzga ta'sir qilmaydi. Narx qator yaratilganda kirim qatoridan olinadi.

CREATE TABLE supplier_return (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(32)    NOT NULL UNIQUE,
    branch_id       BIGINT         NOT NULL REFERENCES branch (id),
    warehouse_id    BIGINT         NOT NULL REFERENCES warehouse (id),
    zone_id         BIGINT         NOT NULL REFERENCES zone (id),
    supplier_id     BIGINT         NOT NULL REFERENCES counterparty (id),
    receipt_id      BIGINT         NOT NULL REFERENCES receipt (id),
    reason          VARCHAR(16)    NOT NULL CHECK (reason IN ('EXPIRING', 'DAMAGED', 'QUALITY', 'SURPLUS', 'OTHER')),
    note            VARCHAR(500),
    total_amount    NUMERIC(18, 2) NOT NULL CHECK (total_amount >= 0),
    from_bonus      BOOLEAN        NOT NULL,
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
CREATE INDEX supplier_return_branch_idx ON supplier_return (branch_id, created_at DESC);
CREATE INDEX supplier_return_receipt_idx ON supplier_return (receipt_id);
CREATE INDEX supplier_return_pending_idx ON supplier_return (branch_id) WHERE status = 'PENDING';

CREATE TABLE supplier_return_line (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_return_id BIGINT         NOT NULL REFERENCES supplier_return (id),
    line_no            INTEGER        NOT NULL CHECK (line_no > 0),
    receipt_line_id    BIGINT         NOT NULL REFERENCES receipt_line (id),
    batch_id           BIGINT         NOT NULL REFERENCES batch (id),
    product_id         BIGINT         NOT NULL REFERENCES product (id),
    bonus              BOOLEAN        NOT NULL,
    qty                INTEGER        NOT NULL CHECK (qty > 0),
    price              NUMERIC(18, 2) NOT NULL CHECK (price >= 0),
    amount             NUMERIC(18, 2) NOT NULL CHECK (amount >= 0),
    UNIQUE (supplier_return_id, line_no),
    UNIQUE (supplier_return_id, batch_id),
    CHECK (NOT bonus OR price = 0)
);

-- O'tkazilgan / rad etilgan QY o'zgarmaydi, hech qachon o'chirilmaydi (SPEC 6-4). Qatorlar faqat «Tasdiqda» holatida qo'shiladi.
CREATE FUNCTION medix_supplier_return_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'QY o''chirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_TABLE_NAME = 'supplier_return' THEN
        IF OLD.status <> 'PENDING' THEN
            RAISE EXCEPTION 'QY % yakunlangan: o''zgartirib bo''lmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.number <> OLD.number OR NEW.branch_id <> OLD.branch_id OR NEW.warehouse_id <> OLD.warehouse_id
                OR NEW.zone_id <> OLD.zone_id OR NEW.supplier_id <> OLD.supplier_id OR NEW.receipt_id <> OLD.receipt_id
                OR NEW.total_amount <> OLD.total_amount OR NEW.from_bonus <> OLD.from_bonus THEN
            RAISE EXCEPTION 'QY % rekvizitlari o''zgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'QY qatorlari o''zgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    SELECT status INTO doc_status FROM supplier_return WHERE id = NEW.supplier_return_id;
    IF doc_status <> 'PENDING' THEN
        RAISE EXCEPTION 'QY qatorlari faqat yaratilganda qo''shiladi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_return_locked BEFORE UPDATE OR DELETE ON supplier_return
    FOR EACH ROW EXECUTE FUNCTION medix_supplier_return_locked();
CREATE TRIGGER supplier_return_line_locked BEFORE INSERT OR UPDATE OR DELETE ON supplier_return_line
    FOR EACH ROW EXECUTE FUNCTION medix_supplier_return_locked();
