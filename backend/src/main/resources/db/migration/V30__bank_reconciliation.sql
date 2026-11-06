-- MEDIX — 9-bosqich: bank koʻchirmasi bilan solishtirish (SPEC 5.5). Bank hisobi boʻyicha koʻchirma sanasi, bankdagi qoldiq,
-- MEDIX jurnalidagi qoldiq va bank tasdiqlagan harakatlar. Faqat qoʻshiladi; bir hisob × sana — bitta solishtirish.
CREATE TABLE bank_reconciliation (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id      BIGINT          NOT NULL REFERENCES money_account (id),
    statement_date  DATE            NOT NULL,
    bank_balance    NUMERIC(18, 2)  NOT NULL CHECK (bank_balance >= 0),
    medix_balance   NUMERIC(18, 2)  NOT NULL,
    note            VARCHAR(500),
    created_by      BIGINT          NOT NULL REFERENCES employee (id),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (account_id, statement_date),
    CHECK (bank_balance = medix_balance OR note IS NOT NULL)
);
CREATE TRIGGER bank_reconciliation_append_only BEFORE UPDATE OR DELETE ON bank_reconciliation
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- Bank tasdiqlagan harakat bir marta belgilanadi
CREATE TABLE bank_reconciliation_move (
    reconciliation_id  BIGINT  NOT NULL REFERENCES bank_reconciliation (id),
    move_id            BIGINT  NOT NULL UNIQUE REFERENCES money_move (id),
    PRIMARY KEY (reconciliation_id, move_id)
);
CREATE TRIGGER bank_reconciliation_move_append_only BEFORE UPDATE OR DELETE ON bank_reconciliation_move
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();
