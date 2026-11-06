-- MEDIX — 9-bosqich: yetkazib beruvchiga to'lov (YT), SPEC 5.5. Qoralama → Tasdiqlashda → O'tkazilgan; Tasdiqlashda → Qoralama
-- (qaytarish); tasdiqsiz o'tkazish — payments.ytDirect. O'tkazishda summa eng eski kirim qarzidan taqsimlanadi (qo'lda o'zgartirish
-- mumkin), ortig'i — YB avansi; pul hisobdan chiqadi (qoldiq yetmasa — o'tkazilmaydi). Bekor qilish teskari yozadi.
CREATE TABLE supplier_payment (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(32)     NOT NULL UNIQUE,
    branch_id       BIGINT          NOT NULL REFERENCES branch (id),
    supplier_id     BIGINT          NOT NULL REFERENCES counterparty (id),
    account_id      BIGINT          NOT NULL REFERENCES money_account (id),
    payment_date    DATE            NOT NULL,
    amount          NUMERIC(18, 2)  NOT NULL CHECK (amount > 0),
    advance         NUMERIC(18, 2)  CHECK (advance >= 0),
    note            VARCHAR(500),
    status          VARCHAR(10)     NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING', 'POSTED', 'CANCELLED')),
    created_by      BIGINT          NOT NULL REFERENCES employee (id),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    sent_by         BIGINT          REFERENCES employee (id),
    sent_at         TIMESTAMPTZ,
    returned_reason VARCHAR(300),
    posted_by       BIGINT          REFERENCES employee (id),
    posted_at       TIMESTAMPTZ,
    cancelled_by    BIGINT          REFERENCES employee (id),
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   VARCHAR(300),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    version         BIGINT          NOT NULL DEFAULT 0,
    CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL),
    CHECK (status <> 'POSTED' OR posted_at IS NOT NULL)
);
CREATE INDEX supplier_payment_branch_idx ON supplier_payment (branch_id, payment_date DESC);
CREATE INDEX supplier_payment_supplier_idx ON supplier_payment (supplier_id, branch_id);

CREATE TABLE supplier_payment_alloc (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id  BIGINT          NOT NULL REFERENCES supplier_payment (id),
    doc_type    VARCHAR(8)      NOT NULL,
    doc_id      BIGINT          NOT NULL,
    doc_number  VARCHAR(32)     NOT NULL,
    amount      NUMERIC(18, 2)  NOT NULL CHECK (amount > 0)
);
CREATE INDEX supplier_payment_alloc_payment_idx ON supplier_payment_alloc (payment_id);
CREATE TRIGGER supplier_payment_alloc_append_only BEFORE UPDATE OR DELETE ON supplier_payment_alloc
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

CREATE FUNCTION medix_supplier_payment_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Toʻlov oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'CANCELLED' OR (OLD.status = 'POSTED' AND (NEW.amount <> OLD.amount OR NEW.account_id <> OLD.account_id
        OR NEW.supplier_id <> OLD.supplier_id OR NEW.branch_id <> OLD.branch_id OR NEW.payment_date <> OLD.payment_date
        OR NEW.number <> OLD.number OR NEW.status NOT IN ('POSTED', 'CANCELLED')))
        OR (OLD.status = 'PENDING' AND (NEW.amount <> OLD.amount OR NEW.account_id <> OLD.account_id OR NEW.supplier_id <> OLD.supplier_id)) THEN
        RAISE EXCEPTION 'Toʻlov % oʻzgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER supplier_payment_locked BEFORE UPDATE OR DELETE ON supplier_payment
    FOR EACH ROW EXECUTE FUNCTION medix_supplier_payment_locked();
