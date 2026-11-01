-- MEDIX — 4-bosqich: BQ, boshlang'ich qoldiq (tovar). SPEC 4, 7, 12: OpeningBalance.
-- Holatlar: Qoralama → O'tkazildi; yonidan Bekor qilingan. Qoralama qoldiqqa ta'sir qilmaydi (SPEC 6-2).
-- O'tkazilganda har (mahsulot, partiya raqami, yaroqlilik, tannarx) uchun bitta partiya yaratiladi (source_type = 'BQ')
-- va StockLedger orqali kirim harakatlari yoziladi — hujjat bilan BITTA tranzaksiyada.

CREATE TABLE opening_balance (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number         VARCHAR(32)   NOT NULL UNIQUE,
    branch_id      BIGINT        NOT NULL REFERENCES branch (id),
    warehouse_id   BIGINT        NOT NULL REFERENCES warehouse (id),
    cutoff_date    DATE          NOT NULL,
    source         VARCHAR(16)   NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'IMPORT')),
    file_name      VARCHAR(255),
    note           VARCHAR(500),
    status         VARCHAR(16)   NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
    created_by     BIGINT        NOT NULL REFERENCES employee (id),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    posted_by      BIGINT        REFERENCES employee (id),
    posted_at      TIMESTAMPTZ,
    cancelled_by   BIGINT        REFERENCES employee (id),
    cancelled_at   TIMESTAMPTZ,
    cancel_reason  VARCHAR(300),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version        BIGINT        NOT NULL DEFAULT 0,
    CHECK (status <> 'POSTED' OR (posted_by IS NOT NULL AND posted_at IS NOT NULL)),
    CHECK (status <> 'CANCELLED' OR (cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL))
);
CREATE INDEX opening_balance_branch_idx ON opening_balance (branch_id, created_at DESC);

CREATE TABLE opening_balance_line (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opening_id     BIGINT         NOT NULL REFERENCES opening_balance (id),
    line_no        INTEGER        NOT NULL CHECK (line_no > 0),
    product_id     BIGINT         NOT NULL REFERENCES product (id),
    zone_id        BIGINT         NOT NULL REFERENCES zone (id),
    batch_number   VARCHAR(64)    NOT NULL CHECK (btrim(batch_number) <> ''),
    produced_on    DATE,
    expiry_date    DATE           NOT NULL,
    cost           NUMERIC(18, 2) NOT NULL CHECK (cost >= 0),
    bonus          BOOLEAN        NOT NULL DEFAULT false,
    qty            INTEGER        NOT NULL CHECK (qty > 0),
    batch_id       BIGINT         REFERENCES batch (id),
    UNIQUE (opening_id, line_no),
    CHECK (NOT bonus OR cost = 0),
    CHECK (produced_on IS NULL OR produced_on <= expiry_date)
);
CREATE INDEX opening_balance_line_doc_idx ON opening_balance_line (opening_id);

-- O'tkazilgan BQ tahrirlanmaydi va o'chirilmaydi (SPEC 6-4): faqat «Bekor qilingan» holatiga o'tadi. Qatorlar faqat qoralamada.
CREATE FUNCTION medix_opening_balance_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    IF TG_TABLE_NAME = 'opening_balance' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'BQ o''chirilmaydi' USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status = 'CANCELLED' THEN
            RAISE EXCEPTION 'BQ % bekor qilingan: o''zgartirib bo''lmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status = 'POSTED' AND (NEW.status <> 'CANCELLED'
                OR NEW.number <> OLD.number OR NEW.branch_id <> OLD.branch_id OR NEW.warehouse_id <> OLD.warehouse_id
                OR NEW.cutoff_date <> OLD.cutoff_date OR NEW.posted_by <> OLD.posted_by OR NEW.posted_at <> OLD.posted_at) THEN
            RAISE EXCEPTION 'BQ % o''tkazilgan: faqat bekor qilish mumkin', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    SELECT status INTO doc_status FROM opening_balance WHERE id = COALESCE(NEW.opening_id, OLD.opening_id);
    IF doc_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'BQ qatorlari faqat qoralamada o''zgaradi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER opening_balance_locked BEFORE UPDATE OR DELETE ON opening_balance
    FOR EACH ROW EXECUTE FUNCTION medix_opening_balance_locked();
CREATE TRIGGER opening_balance_line_locked BEFORE INSERT OR UPDATE OR DELETE ON opening_balance_line
    FOR EACH ROW EXECUTE FUNCTION medix_opening_balance_locked();
