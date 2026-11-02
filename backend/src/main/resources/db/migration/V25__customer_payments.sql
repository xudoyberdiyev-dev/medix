-- MEDIX — 9-bosqich boshlanishi: pul hisoblari va mijozdan to'lov (MT), SPEC 5.5.
-- Hisoblar: har filialda kassa(lar), Terminal (karta/Online to'lovlari) va bank. Qoldiq faqat pul jurnalidan (money_move, faqat
-- qo'shiladi); money_account.balance jurnal bilan bitta tranzaksiyada yangilanadi (CHECK ≥ 0).
CREATE TABLE money_account (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_id   BIGINT          NOT NULL REFERENCES branch (id),
    kind        VARCHAR(10)     NOT NULL CHECK (kind IN ('CASH', 'TERMINAL', 'BANK')),
    code        VARCHAR(20)     NOT NULL UNIQUE,
    name        VARCHAR(120)    NOT NULL CHECK (btrim(name) <> ''),
    bank_name   VARCHAR(120),
    account_no  VARCHAR(30),
    cashier_id  BIGINT          REFERENCES employee (id),
    active      BOOLEAN         NOT NULL DEFAULT true,
    balance     NUMERIC(18, 2)  NOT NULL DEFAULT 0 CHECK (balance >= 0),
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    version     BIGINT          NOT NULL DEFAULT 0,
    CHECK (kind <> 'BANK' OR account_no IS NOT NULL)
);
CREATE INDEX money_account_branch_idx ON money_account (branch_id, kind);

CREATE TABLE money_move (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    account_id   BIGINT          NOT NULL REFERENCES money_account (id),
    move_date    DATE            NOT NULL,
    amount       NUMERIC(18, 2)  NOT NULL CHECK (amount <> 0),
    doc_type     VARCHAR(8)      NOT NULL,
    doc_id       BIGINT          NOT NULL,
    doc_number   VARCHAR(32)     NOT NULL,
    employee_id  BIGINT          REFERENCES employee (id),
    note         VARCHAR(300)
);
CREATE INDEX money_move_account_idx ON money_move (account_id, move_date, id);
CREATE INDEX money_move_doc_idx ON money_move (doc_type, doc_id);
CREATE TRIGGER money_move_append_only BEFORE UPDATE OR DELETE ON money_move
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- Qarz jurnali yozuvi qaysi hujjatni yopadi (MT taqsimoti, QM → SV). NULL — o'z hujjati (qarz) yoki avans.
ALTER TABLE party_ledger
    ADD COLUMN applies_doc_type VARCHAR(8),
    ADD COLUMN applies_doc_id   BIGINT,
    ADD CONSTRAINT party_ledger_applies_chk CHECK ((applies_doc_type IS NULL) = (applies_doc_id IS NULL));
CREATE INDEX party_ledger_applies_idx ON party_ledger (applies_doc_type, applies_doc_id) WHERE applies_doc_type IS NOT NULL;

-- MT: Qoralama → O'tkazilgan → Bekor qilingan. O'tkazishda summa eng eski qarzdan taqsimlanadi (qo'lda o'zgartirish mumkin),
-- ortig'i avans. Haydovchi puli (source = DRIVER) — Kassir qabul qilganda darhol o'tkaziladi.
CREATE TABLE customer_payment (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(32)     NOT NULL UNIQUE,
    branch_id       BIGINT          NOT NULL REFERENCES branch (id),
    customer_id     BIGINT          NOT NULL REFERENCES counterparty (id),
    account_id      BIGINT          NOT NULL REFERENCES money_account (id),
    payment_date    DATE            NOT NULL,
    amount          NUMERIC(18, 2)  NOT NULL CHECK (amount > 0),
    advance         NUMERIC(18, 2)  CHECK (advance >= 0),
    source          VARCHAR(10)     NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'DRIVER')),
    source_ref      VARCHAR(40),
    note            VARCHAR(500),
    status          VARCHAR(10)     NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
    created_by      BIGINT          NOT NULL REFERENCES employee (id),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
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
CREATE INDEX customer_payment_branch_idx ON customer_payment (branch_id, payment_date DESC);
CREATE INDEX customer_payment_customer_idx ON customer_payment (customer_id, branch_id);

-- Taqsimot (o'tkazishda yoziladi, faqat qo'shiladi): qaysi qarz hujjatiga qancha.
CREATE TABLE customer_payment_alloc (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id  BIGINT          NOT NULL REFERENCES customer_payment (id),
    doc_type    VARCHAR(8)      NOT NULL,
    doc_id      BIGINT          NOT NULL,
    doc_number  VARCHAR(32)     NOT NULL,
    amount      NUMERIC(18, 2)  NOT NULL CHECK (amount > 0)
);
CREATE INDEX customer_payment_alloc_payment_idx ON customer_payment_alloc (payment_id);
CREATE TRIGGER customer_payment_alloc_append_only BEFORE UPDATE OR DELETE ON customer_payment_alloc
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- O'tkazilgan MT summasi, hisobi va mijozi o'zgarmaydi; o'chirilmaydi; faqat bekor qilinadi.
CREATE FUNCTION medix_customer_payment_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Toʻlov oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'CANCELLED' OR (OLD.status = 'POSTED' AND (NEW.amount <> OLD.amount OR NEW.account_id <> OLD.account_id
        OR NEW.customer_id <> OLD.customer_id OR NEW.branch_id <> OLD.branch_id OR NEW.payment_date <> OLD.payment_date
        OR NEW.number <> OLD.number OR NEW.status NOT IN ('POSTED', 'CANCELLED'))) THEN
        RAISE EXCEPTION 'Toʻlov % oʻzgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER customer_payment_locked BEFORE UPDATE OR DELETE ON customer_payment
    FOR EACH ROW EXECUTE FUNCTION medix_customer_payment_locked();

-- Haydovchidagi pul: Kassir qabul qilgan MT
ALTER TABLE trip_stop ADD COLUMN cash_payment_id BIGINT REFERENCES customer_payment (id);
