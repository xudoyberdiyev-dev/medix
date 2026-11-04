-- MEDIX — 9-bosqich: kassa/bank operatsiyalari (KO/BO), hisoblar orasida o'tkazma (IO), kunni yopish (SPEC 5.5).

-- KO (kassa) / BO (bank va Terminal): kirim yoki chiqim, modda bilan. Kassadan 2 000 000 so'mdan katta chiqim —
-- «Tasdiqlashda» (Filial rahbari tasdig'i), qolganlari darhol o'tkaziladi. O'tkazilgan — faqat bekor qilinadi (teskari yozuv).
CREATE TABLE cash_op (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number           VARCHAR(32)     NOT NULL UNIQUE,
    doc_type         VARCHAR(2)      NOT NULL CHECK (doc_type IN ('KO', 'BO')),
    branch_id        BIGINT          NOT NULL REFERENCES branch (id),
    account_id       BIGINT          NOT NULL REFERENCES money_account (id),
    op_date          DATE            NOT NULL,
    direction        VARCHAR(3)      NOT NULL CHECK (direction IN ('IN', 'OUT')),
    expense_item_id  BIGINT          NOT NULL REFERENCES expense_item (id),
    amount           NUMERIC(18, 2)  NOT NULL CHECK (amount > 0),
    party            VARCHAR(200),
    note             VARCHAR(500),
    source           VARCHAR(10)     NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'CLOSE')),
    status           VARCHAR(10)     NOT NULL CHECK (status IN ('PENDING', 'POSTED', 'REJECTED', 'CANCELLED')),
    created_by       BIGINT          NOT NULL REFERENCES employee (id),
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
    approved_by      BIGINT          REFERENCES employee (id),
    approved_at      TIMESTAMPTZ,
    posted_at        TIMESTAMPTZ,
    cancelled_by     BIGINT          REFERENCES employee (id),
    cancelled_at     TIMESTAMPTZ,
    cancel_reason    VARCHAR(300),
    updated_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
    version          BIGINT          NOT NULL DEFAULT 0,
    CHECK (status NOT IN ('CANCELLED', 'REJECTED') OR cancel_reason IS NOT NULL),
    CHECK (status <> 'POSTED' OR posted_at IS NOT NULL)
);
CREATE INDEX cash_op_branch_idx ON cash_op (branch_id, op_date DESC);
CREATE INDEX cash_op_account_idx ON cash_op (account_id, op_date DESC);
CREATE INDEX cash_op_pending_idx ON cash_op (branch_id) WHERE status = 'PENDING';

CREATE FUNCTION medix_cash_op_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Kassa operatsiyasi oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status IN ('CANCELLED', 'REJECTED')
        OR NEW.amount <> OLD.amount OR NEW.account_id <> OLD.account_id OR NEW.direction <> OLD.direction
        OR NEW.branch_id <> OLD.branch_id OR NEW.op_date <> OLD.op_date OR NEW.number <> OLD.number
        OR NEW.expense_item_id <> OLD.expense_item_id
        OR (OLD.status = 'POSTED' AND NEW.status NOT IN ('POSTED', 'CANCELLED')) THEN
        RAISE EXCEPTION 'Kassa operatsiyasi % oʻzgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER cash_op_locked BEFORE UPDATE OR DELETE ON cash_op
    FOR EACH ROW EXECUTE FUNCTION medix_cash_op_locked();

-- IO: bir filial hisoblari orasida o'tkazma (kassa → bank, Terminal → bank, …). Darhol o'tkaziladi; bekor qilish — teskari.
CREATE TABLE money_transfer (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number           VARCHAR(32)     NOT NULL UNIQUE,
    branch_id        BIGINT          NOT NULL REFERENCES branch (id),
    from_account_id  BIGINT          NOT NULL REFERENCES money_account (id),
    to_account_id    BIGINT          NOT NULL REFERENCES money_account (id),
    transfer_date    DATE            NOT NULL,
    amount           NUMERIC(18, 2)  NOT NULL CHECK (amount > 0),
    note             VARCHAR(500),
    status           VARCHAR(10)     NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'CANCELLED')),
    created_by       BIGINT          NOT NULL REFERENCES employee (id),
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
    cancelled_by     BIGINT          REFERENCES employee (id),
    cancelled_at     TIMESTAMPTZ,
    cancel_reason    VARCHAR(300),
    version          BIGINT          NOT NULL DEFAULT 0,
    CHECK (from_account_id <> to_account_id),
    CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL)
);
CREATE INDEX money_transfer_branch_idx ON money_transfer (branch_id, transfer_date DESC);

CREATE FUNCTION medix_money_transfer_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Oʻtkazma oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'CANCELLED' OR NEW.amount <> OLD.amount OR NEW.from_account_id <> OLD.from_account_id
        OR NEW.to_account_id <> OLD.to_account_id OR NEW.transfer_date <> OLD.transfer_date OR NEW.number <> OLD.number
        OR NEW.branch_id <> OLD.branch_id THEN
        RAISE EXCEPTION 'Oʻtkazma % oʻzgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER money_transfer_locked BEFORE UPDATE OR DELETE ON money_transfer
    FOR EACH ROW EXECUTE FUNCTION medix_money_transfer_locked();

-- Kunni yopish: faqat kassalarda; kupyuralar sanog'i. Farq bo'lsa — izoh, PIN va tuzatuvchi KO. Yopilgan kunga (va undan
-- oldingi kunlarga) shu hisobda yangi pul harakati yozilmaydi. Faqat qo'shiladi.
CREATE TABLE cash_day_close (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id          BIGINT          NOT NULL REFERENCES money_account (id),
    close_date          DATE            NOT NULL,
    expected            NUMERIC(18, 2)  NOT NULL,
    counted             NUMERIC(18, 2)  NOT NULL CHECK (counted >= 0),
    diff                NUMERIC(18, 2)  NOT NULL,
    denominations       JSONB           NOT NULL,
    note                VARCHAR(500),
    correction_op_id    BIGINT          REFERENCES cash_op (id),
    closed_by           BIGINT          NOT NULL REFERENCES employee (id),
    closed_at           TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (account_id, close_date),
    CHECK (diff = counted - expected),
    CHECK (diff = 0 OR (note IS NOT NULL AND correction_op_id IS NOT NULL))
);
CREATE TRIGGER cash_day_close_append_only BEFORE UPDATE OR DELETE ON cash_day_close
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();
