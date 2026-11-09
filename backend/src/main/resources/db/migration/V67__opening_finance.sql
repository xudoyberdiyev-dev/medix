-- MEDIX — Boshlang'ich qoldiq (BQ): mijozlar qarzi, YB qarzi, kassa va bank (prototip OpeningBalances / OpeningDoc).
-- Tovar BQ — opening_balance (V11). Bu yerda pul turlari: filial bo'yicha bitta hujjat, qatorlari — kontragent yoki hisob.
-- O'tkazilganda: qarz — party_ledger (doc_type 'BQ', muddat bilan), pul — money_move + money_account.balance — BITTA tranzaksiyada.
-- Har (filial, tur) uchun faqat bitta o'tkazilgan BQ. O'tkazilgan hujjat o'zgarmaydi (pul jurnali qaytarilmaydi).

CREATE TABLE opening_finance (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number         VARCHAR(32)   NOT NULL UNIQUE,
    kind           VARCHAR(16)   NOT NULL CHECK (kind IN ('CUSTOMER_DEBT', 'SUPPLIER_DEBT', 'MONEY')),
    branch_id      BIGINT        NOT NULL REFERENCES branch (id),
    cutoff_date    DATE          NOT NULL,
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
CREATE INDEX opening_finance_branch_idx ON opening_finance (branch_id, created_at DESC);
CREATE UNIQUE INDEX opening_finance_posted_uq ON opening_finance (branch_id, kind) WHERE status = 'POSTED';

CREATE TABLE opening_finance_line (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opening_id       BIGINT         NOT NULL REFERENCES opening_finance (id),
    line_no          INTEGER        NOT NULL CHECK (line_no > 0),
    counterparty_id  BIGINT         REFERENCES counterparty (id),
    account_id       BIGINT         REFERENCES money_account (id),
    -- Qarz: musbat — qarz, manfiy — avans. Pul: faqat musbat.
    amount           NUMERIC(18, 2) NOT NULL CHECK (amount <> 0),
    due_date         DATE,
    doc_ref          VARCHAR(60),
    UNIQUE (opening_id, line_no),
    CHECK ((counterparty_id IS NULL) <> (account_id IS NULL)),
    CHECK (account_id IS NULL OR (amount > 0 AND due_date IS NULL))
);
CREATE INDEX opening_finance_line_doc_idx ON opening_finance_line (opening_id);

CREATE FUNCTION medix_opening_finance_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    IF TG_TABLE_NAME = 'opening_finance' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'BQ o''chirilmaydi' USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status <> 'DRAFT' THEN
            RAISE EXCEPTION 'BQ % qoralama emas: o''zgartirib bo''lmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    SELECT status INTO doc_status FROM opening_finance WHERE id = COALESCE(NEW.opening_id, OLD.opening_id);
    IF doc_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'BQ qatorlari faqat qoralamada o''zgaradi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER opening_finance_locked BEFORE UPDATE OR DELETE ON opening_finance
    FOR EACH ROW EXECUTE FUNCTION medix_opening_finance_locked();
CREATE TRIGGER opening_finance_line_locked BEFORE INSERT OR UPDATE OR DELETE ON opening_finance_line
    FOR EACH ROW EXECUTE FUNCTION medix_opening_finance_locked();
