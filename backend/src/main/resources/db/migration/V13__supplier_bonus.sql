-- MEDIX — 5-bosqich: YB bonus balansi (SPEC 5.1 «Chegirma = bonus balans»).
-- Kirimdagi chegirma qarzdan ayrilmaydi; olish sanasida «Bonus tasdiqlandi» (BNS) — balans oshadi. Balans hisobidan kirim
-- qarz hosil qilmaydi, tannarxi 0, partiyasi «Bonus». Balans bilan qarz yopilmaydi. Muddati yo'q.

CREATE TABLE supplier_bonus (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number        VARCHAR(32)    NOT NULL UNIQUE,
    branch_id     BIGINT         NOT NULL REFERENCES branch (id),
    supplier_id   BIGINT         NOT NULL REFERENCES counterparty (id),
    receipt_id    BIGINT         NOT NULL UNIQUE REFERENCES receipt (id),
    amount        NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
    created_by    BIGINT         NOT NULL REFERENCES employee (id),
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TRIGGER supplier_bonus_append_only
    BEFORE UPDATE OR DELETE ON supplier_bonus
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- Bonus balans jurnali: + BNS tasdig'i, − bonus hisobidan kirim (yoki bekor qilishdagi teskari yozuvlar). Faqat qo'shiladi.
CREATE TABLE supplier_bonus_ledger (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
    branch_id     BIGINT         NOT NULL REFERENCES branch (id),
    supplier_id   BIGINT         NOT NULL REFERENCES counterparty (id),
    amount        NUMERIC(18, 2) NOT NULL CHECK (amount <> 0),
    doc_type      VARCHAR(8)     NOT NULL,
    doc_id        BIGINT         NOT NULL,
    doc_number    VARCHAR(32)    NOT NULL,
    employee_id   BIGINT,
    note          VARCHAR(300)
);
CREATE INDEX supplier_bonus_ledger_party_idx ON supplier_bonus_ledger (supplier_id, branch_id);

CREATE TRIGGER supplier_bonus_ledger_append_only
    BEFORE UPDATE OR DELETE ON supplier_bonus_ledger
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- Bonus balans hisobidan kirim: qarz va to'lov kuni yo'q.
ALTER TABLE receipt ADD COLUMN from_bonus BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE receipt DROP CONSTRAINT receipt_check2;
ALTER TABLE receipt ADD CONSTRAINT receipt_due_required CHECK (prepaid OR from_bonus OR due_date IS NOT NULL);
ALTER TABLE receipt ADD CONSTRAINT receipt_bonus_not_prepaid CHECK (NOT (from_bonus AND prepaid));
