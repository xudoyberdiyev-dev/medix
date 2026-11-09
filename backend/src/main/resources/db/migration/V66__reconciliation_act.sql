-- MEDIX — Akt sverka hujjati (prototip Reconciliation): saqlanadigan AS-… hujjat, holatlar Tuzildi → Yuborildi → Imzolandi / Farq bor.
-- Davr oxiridagi qoldiq tuzilgan paytdagi qiymat bilan saqlanadi (roʻyxatdagi «Yakuniy qoldiq»); varaq qatorlari qarz jurnalidan.

CREATE TABLE reconciliation_act (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(32)   NOT NULL UNIQUE,
    side            VARCHAR(10)   NOT NULL CHECK (side IN ('CUSTOMER', 'SUPPLIER')),
    counterparty_id BIGINT        NOT NULL REFERENCES counterparty (id),
    branch_id       BIGINT        NOT NULL REFERENCES branch (id),
    period_from     DATE          NOT NULL,
    period_to       DATE          NOT NULL,
    closing         NUMERIC(18, 2) NOT NULL,
    status          VARCHAR(10)   NOT NULL DEFAULT 'MADE' CHECK (status IN ('MADE', 'SENT', 'SIGNED', 'DIFF')),
    their_balance   NUMERIC(18, 2),
    diff_note       VARCHAR(500),
    created_by      BIGINT        NOT NULL REFERENCES employee (id),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_by      BIGINT REFERENCES employee (id),
    updated_at      TIMESTAMPTZ,
    version         BIGINT        NOT NULL DEFAULT 0,
    CHECK (period_from <= period_to),
    CHECK (status <> 'DIFF' OR (their_balance IS NOT NULL AND diff_note IS NOT NULL))
);
CREATE INDEX reconciliation_act_branch_idx ON reconciliation_act (branch_id, created_at DESC);
CREATE INDEX reconciliation_act_party_idx ON reconciliation_act (counterparty_id);

-- Imzolangan akt oʻzgarmaydi
CREATE FUNCTION reconciliation_act_signed_guard() RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'SIGNED' THEN
        RAISE EXCEPTION 'Imzolangan akt sverkani oʻzgartirib boʻlmaydi: %', OLD.number;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER reconciliation_act_signed BEFORE UPDATE OR DELETE ON reconciliation_act
    FOR EACH ROW EXECUTE FUNCTION reconciliation_act_signed_guard();

-- Ruxsatlar recon.view / recon.create — V9 da mavjud.
