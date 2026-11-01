-- MEDIX — 5-bosqich: Kirim (KR, SPEC 5.1) va kontragentlar bilan hisob-kitob jurnali (SPEC 6-10, 11).

-- ===== Hisob-kitob jurnali (finance) =====
-- Qarz, avans va muddat faqat shu jurnaldan hisoblanadi (qo'lda kiritilmaydi). Faqat qo'shiladi.
-- amount > 0 — kompaniyaning kontragentga qarzi oshdi (YB dan kirim) yoki mijozning qarzi oshdi (sotuv);
-- amount < 0 — kamaydi (to'lov, qaytarish, bekor qilish). side: SUPPLIER — biz qarzdormiz, CUSTOMER — mijoz qarzdor.
CREATE TABLE party_ledger (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    branch_id        BIGINT         NOT NULL REFERENCES branch (id),
    counterparty_id  BIGINT         NOT NULL REFERENCES counterparty (id),
    side             VARCHAR(8)     NOT NULL CHECK (side IN ('SUPPLIER', 'CUSTOMER')),
    amount           NUMERIC(18, 2) NOT NULL CHECK (amount <> 0),
    due_date         DATE,
    doc_type         VARCHAR(8)     NOT NULL,
    doc_id           BIGINT         NOT NULL,
    doc_number       VARCHAR(32)    NOT NULL,
    employee_id      BIGINT,
    note             VARCHAR(300)
);
CREATE INDEX party_ledger_party_idx ON party_ledger (counterparty_id, branch_id, side, occurred_at);
CREATE INDEX party_ledger_doc_idx ON party_ledger (doc_type, doc_id);

CREATE TRIGGER party_ledger_append_only
    BEFORE UPDATE OR DELETE ON party_ledger
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- ===== Kirim (purchasing) =====
-- Holatlar: Qoralama → Qabul qilindi → O'tkazildi; Qoralama / Qabul qilindi → Bekor qilingan; O'tkazildi → Bekor qilingan
-- (receipt.cancelPosted, partiyalarda boshqa harakat bo'lmasa).
CREATE TABLE receipt (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number            VARCHAR(32)    NOT NULL UNIQUE,
    branch_id         BIGINT         NOT NULL REFERENCES branch (id),
    warehouse_id      BIGINT         NOT NULL REFERENCES warehouse (id),
    supplier_id       BIGINT         NOT NULL REFERENCES counterparty (id),
    receipt_date      DATE           NOT NULL,
    invoice_number    VARCHAR(64),
    invoice_date      DATE,
    payment_type      VARCHAR(16)    NOT NULL CHECK (payment_type IN ('CASH', 'TRANSFER', 'ONLINE')),
    due_date          DATE,
    due_manual        BOOLEAN        NOT NULL DEFAULT false,
    owner_id          BIGINT         REFERENCES employee (id),
    prepaid           BOOLEAN        NOT NULL DEFAULT false,
    discount_kind     VARCHAR(8)     CHECK (discount_kind IN ('SUM', 'PERCENT')),
    discount_value    NUMERIC(18, 2) CHECK (discount_value > 0),
    discount_date     DATE,
    note              VARCHAR(500),
    status            VARCHAR(16)    NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACCEPTED', 'POSTED', 'CANCELLED')),
    resolution        VARCHAR(8)     CHECK (resolution IN ('ACTUAL', 'DOCUMENT')),
    debt_amount       NUMERIC(18, 2) CHECK (debt_amount >= 0),
    created_by        BIGINT         NOT NULL REFERENCES employee (id),
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
    accepted_by       BIGINT         REFERENCES employee (id),
    accepted_at       TIMESTAMPTZ,
    posted_by         BIGINT         REFERENCES employee (id),
    posted_at         TIMESTAMPTZ,
    cancelled_by      BIGINT         REFERENCES employee (id),
    cancelled_at      TIMESTAMPTZ,
    cancel_reason     VARCHAR(300),
    updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
    version           BIGINT         NOT NULL DEFAULT 0,
    CHECK ((discount_kind IS NULL) = (discount_value IS NULL)),
    CHECK (discount_kind <> 'PERCENT' OR discount_value <= 100),
    CHECK (prepaid OR due_date IS NOT NULL),
    CHECK (status <> 'CANCELLED' OR (cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL)),
    CHECK (status NOT IN ('ACCEPTED', 'POSTED') OR accepted_at IS NOT NULL),
    CHECK (status <> 'POSTED' OR (posted_at IS NOT NULL AND debt_amount IS NOT NULL))
);
CREATE INDEX receipt_branch_idx ON receipt (branch_id, created_at DESC);
CREATE INDEX receipt_supplier_idx ON receipt (supplier_id, branch_id);

CREATE TABLE receipt_line (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receipt_id        BIGINT         NOT NULL REFERENCES receipt (id),
    line_no           INTEGER        NOT NULL CHECK (line_no > 0),
    product_id        BIGINT         NOT NULL REFERENCES product (id),
    batch_number      VARCHAR(64)    NOT NULL CHECK (btrim(batch_number) <> ''),
    produced_on       DATE,
    expiry_date       DATE           NOT NULL,
    zone_id           BIGINT         NOT NULL REFERENCES zone (id),
    qty               INTEGER        NOT NULL CHECK (qty > 0),
    bonus_qty         INTEGER        NOT NULL DEFAULT 0 CHECK (bonus_qty >= 0),
    price             NUMERIC(18, 2) CHECK (price >= 0),
    -- Qabulda (Ombor mudiri): yaroqli va shikastlangan soni; farq bo'lsa sababi majburiy.
    received_qty      INTEGER        CHECK (received_qty >= 0),
    damaged_qty       INTEGER        CHECK (damaged_qty >= 0),
    diff_reason       VARCHAR(8)     CHECK (diff_reason IN ('SHORT', 'EXCESS', 'DAMAGED')),
    batch_id          BIGINT         REFERENCES batch (id),
    bonus_batch_id    BIGINT         REFERENCES batch (id),
    UNIQUE (receipt_id, line_no),
    CHECK (produced_on IS NULL OR produced_on <= expiry_date),
    CHECK ((received_qty IS NULL) = (damaged_qty IS NULL))
);
CREATE INDEX receipt_line_doc_idx ON receipt_line (receipt_id);

-- O'tkazilgan kirim tahrirlanmaydi (SPEC 6-4). Qatorlar: tarkib — faqat qoralamada; qabul natijasi va partiyalar — faqat
-- qoralama → qabul o'tishida (holat hali DRAFT). Bekor qilingan — o'zgarmaydi.
CREATE FUNCTION medix_receipt_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    IF TG_TABLE_NAME = 'receipt' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Kirim o''chirilmaydi' USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status = 'CANCELLED' THEN
            RAISE EXCEPTION 'Kirim % bekor qilingan: o''zgartirib bo''lmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status = 'POSTED' AND (NEW.status <> 'CANCELLED' OR NEW.debt_amount <> OLD.debt_amount
                OR NEW.supplier_id <> OLD.supplier_id OR NEW.warehouse_id <> OLD.warehouse_id OR NEW.number <> OLD.number) THEN
            RAISE EXCEPTION 'Kirim % o''tkazilgan: faqat bekor qilish mumkin', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status = 'ACCEPTED' AND (NEW.supplier_id <> OLD.supplier_id OR NEW.warehouse_id <> OLD.warehouse_id
                OR NEW.number <> OLD.number) THEN
            RAISE EXCEPTION 'Kirim % qabul qilingan: yetkazib beruvchi va omborni o''zgartirib bo''lmaydi', OLD.number
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    SELECT status INTO doc_status FROM receipt WHERE id = COALESCE(NEW.receipt_id, OLD.receipt_id);
    IF doc_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Kirim qatorlari faqat qoralamada o''zgaradi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER receipt_locked BEFORE UPDATE OR DELETE ON receipt
    FOR EACH ROW EXECUTE FUNCTION medix_receipt_locked();
CREATE TRIGGER receipt_line_locked BEFORE INSERT OR UPDATE OR DELETE ON receipt_line
    FOR EACH ROW EXECUTE FUNCTION medix_receipt_locked();
