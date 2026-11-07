-- MEDIX — V2: filiallar o'rtasida hisob-kitob (FS qarzini to'lash). Qarzdor filial hisobidan (kassa/bank) chiqim, kreditor filial
-- hisobiga kirim va filiallararo qarz kamayadi (branch_ledger −) — bitta tranzaksiyada. Raqam — IO hisoblagichidan (hisoblar orasida
-- o'tkazma, SPEC 7), pul jurnalida hujjat turi «FIO». To'lov qarzdan oshmaydi. Bekor qilish — teskari (bugungi sana bilan).

CREATE TABLE branch_payment (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number            VARCHAR(32)     NOT NULL UNIQUE,
    payer_branch_id   BIGINT          NOT NULL REFERENCES branch (id),
    payee_branch_id   BIGINT          NOT NULL REFERENCES branch (id),
    from_account_id   BIGINT          NOT NULL REFERENCES money_account (id),
    to_account_id     BIGINT          NOT NULL REFERENCES money_account (id),
    payment_date      DATE            NOT NULL,
    amount            NUMERIC(18, 2)  NOT NULL CHECK (amount > 0),
    note              VARCHAR(500),
    status            VARCHAR(10)     NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'CANCELLED')),
    created_by        BIGINT          NOT NULL REFERENCES employee (id),
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
    cancelled_by      BIGINT          REFERENCES employee (id),
    cancelled_at      TIMESTAMPTZ,
    cancel_reason     VARCHAR(300),
    version           BIGINT          NOT NULL DEFAULT 0,
    CHECK (payer_branch_id <> payee_branch_id),
    CHECK (from_account_id <> to_account_id),
    CHECK (status <> 'CANCELLED' OR (cancel_reason IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL))
);
CREATE INDEX branch_payment_payer_idx ON branch_payment (payer_branch_id, payment_date DESC);
CREATE INDEX branch_payment_payee_idx ON branch_payment (payee_branch_id, payment_date DESC);

CREATE FUNCTION medix_branch_payment_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Filiallararo toʻlov oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'CANCELLED' OR NEW.amount <> OLD.amount OR NEW.from_account_id <> OLD.from_account_id
        OR NEW.to_account_id <> OLD.to_account_id OR NEW.payment_date <> OLD.payment_date OR NEW.number <> OLD.number
        OR NEW.payer_branch_id <> OLD.payer_branch_id OR NEW.payee_branch_id <> OLD.payee_branch_id THEN
        RAISE EXCEPTION 'Filiallararo toʻlov % oʻzgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER branch_payment_locked BEFORE UPDATE OR DELETE ON branch_payment
    FOR EACH ROW EXECUTE FUNCTION medix_branch_payment_locked();
