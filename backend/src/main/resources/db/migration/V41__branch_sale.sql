-- MEDIX — V2: FS, filiallararo savdo (SPEC 2: guruh ichida tannarxda, hisob-faktura va QQS bilan; guruh ichidagi qarz umumiy
-- jamiga kirmaydi). T12: draft → transit → received (kamomad → hal qilish). Dizayn: docs/notes/FS-dizayn.md.
-- Qoralama (DRAFT) → jo'natishda tovar sotuvchi zonadan chiqadi, summa = partiya tannarxi (QQS ichida), HF raqami beriladi,
-- xaridor filial sotuvchiga qarzdor bo'ladi (branch_ledger) — «Yo'lda» → qabulda xaridor ombori zonasiga kiradi (o'sha partiya).
-- party_ledger ga yozilmaydi: mijoz / YB qarzi jamlariga kirmaydi.

CREATE TABLE branch_sale (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number             VARCHAR(32)    NOT NULL UNIQUE,
    seller_branch_id   BIGINT         NOT NULL REFERENCES branch (id),
    buyer_branch_id    BIGINT         NOT NULL REFERENCES branch (id),
    from_warehouse_id  BIGINT         NOT NULL REFERENCES warehouse (id),
    from_zone_id       BIGINT         NOT NULL REFERENCES zone (id),
    to_warehouse_id    BIGINT         NOT NULL REFERENCES warehouse (id),
    to_zone_id         BIGINT         REFERENCES zone (id),
    note               VARCHAR(500),
    status             VARCHAR(16)    NOT NULL CHECK (status IN ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED')),
    total              NUMERIC(18, 2) CHECK (total >= 0),
    vat_total          NUMERIC(18, 2) CHECK (vat_total >= 0),
    invoice_number     VARCHAR(32)    UNIQUE,
    shortage_qty       INTEGER        NOT NULL DEFAULT 0 CHECK (shortage_qty >= 0),
    receive_note       VARCHAR(500),
    created_by         BIGINT         NOT NULL REFERENCES employee (id),
    created_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    sent_by            BIGINT         REFERENCES employee (id),
    sent_at            TIMESTAMPTZ,
    received_by        BIGINT         REFERENCES employee (id),
    received_at        TIMESTAMPTZ,
    cancelled_by       BIGINT         REFERENCES employee (id),
    cancelled_at       TIMESTAMPTZ,
    updated_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    version            BIGINT         NOT NULL DEFAULT 0,
    CHECK (seller_branch_id <> buyer_branch_id),
    CHECK (from_warehouse_id <> to_warehouse_id),
    CHECK (status IN ('DRAFT', 'CANCELLED')
           OR (sent_by IS NOT NULL AND sent_at IS NOT NULL AND total IS NOT NULL AND vat_total IS NOT NULL AND invoice_number IS NOT NULL)),
    CHECK (status <> 'RECEIVED' OR (received_by IS NOT NULL AND received_at IS NOT NULL AND to_zone_id IS NOT NULL)),
    CHECK (status <> 'CANCELLED' OR (cancelled_by IS NOT NULL AND sent_at IS NULL))
);
CREATE INDEX branch_sale_seller_idx ON branch_sale (seller_branch_id, created_at DESC);
CREATE INDEX branch_sale_buyer_idx ON branch_sale (buyer_branch_id, created_at DESC);
CREATE INDEX branch_sale_transit_idx ON branch_sale (buyer_branch_id) WHERE status = 'IN_TRANSIT';

CREATE TABLE branch_sale_line (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id       BIGINT         NOT NULL REFERENCES branch_sale (id),
    line_no       INTEGER        NOT NULL CHECK (line_no > 0),
    batch_id      BIGINT         NOT NULL REFERENCES batch (id),
    product_id    BIGINT         NOT NULL REFERENCES product (id),
    qty           INTEGER        NOT NULL CHECK (qty > 0),
    unit_cost     NUMERIC(18, 2) CHECK (unit_cost >= 0),
    amount        NUMERIC(18, 2) CHECK (amount >= 0),
    vat_rate      NUMERIC(5, 2)  CHECK (vat_rate >= 0 AND vat_rate <= 100),
    vat_amount    NUMERIC(18, 2) CHECK (vat_amount >= 0),
    received_qty  INTEGER        CHECK (received_qty >= 0),
    CHECK (received_qty IS NULL OR received_qty <= qty),
    UNIQUE (sale_id, line_no),
    UNIQUE (sale_id, batch_id)
);

-- Filiallararo qarz jurnali (faqat qo'shiladi): musbat — debtor creditor'ga qarzdor bo'ldi, manfiy — qarz kamaydi.
CREATE TABLE branch_ledger (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    debtor_branch_id    BIGINT         NOT NULL REFERENCES branch (id),
    creditor_branch_id  BIGINT         NOT NULL REFERENCES branch (id),
    amount              NUMERIC(18, 2) NOT NULL CHECK (amount <> 0),
    doc_type            VARCHAR(8)     NOT NULL,
    doc_id              BIGINT         NOT NULL,
    doc_number          VARCHAR(32)    NOT NULL,
    occurred_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    created_by          BIGINT         NOT NULL REFERENCES employee (id),
    CHECK (debtor_branch_id <> creditor_branch_id)
);
CREATE INDEX branch_ledger_pair_idx ON branch_ledger (debtor_branch_id, creditor_branch_id);
CREATE INDEX branch_ledger_doc_idx ON branch_ledger (doc_type, doc_id);

CREATE TRIGGER branch_ledger_append_only
    BEFORE UPDATE OR DELETE ON branch_ledger
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- Jo'natilgan FS summasi va qatorlari o'zgarmaydi; yakunlangani umuman o'zgarmaydi; hech qachon o'chirilmaydi.
CREATE FUNCTION medix_branch_sale_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'FS o''chirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_TABLE_NAME = 'branch_sale' THEN
        IF OLD.status IN ('RECEIVED', 'CANCELLED') THEN
            RAISE EXCEPTION 'FS % yakunlangan: o''zgartirib bo''lmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.number <> OLD.number OR NEW.seller_branch_id <> OLD.seller_branch_id OR NEW.buyer_branch_id <> OLD.buyer_branch_id
                OR NEW.from_warehouse_id <> OLD.from_warehouse_id OR NEW.from_zone_id <> OLD.from_zone_id
                OR NEW.to_warehouse_id <> OLD.to_warehouse_id THEN
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

CREATE TRIGGER branch_sale_locked BEFORE UPDATE OR DELETE ON branch_sale
    FOR EACH ROW EXECUTE FUNCTION medix_branch_sale_locked();
CREATE TRIGGER branch_sale_line_locked BEFORE INSERT OR UPDATE OR DELETE ON branch_sale_line
    FOR EACH ROW EXECUTE FUNCTION medix_branch_sale_locked();
