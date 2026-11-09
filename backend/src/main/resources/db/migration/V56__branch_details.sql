-- Filial kartasi (prototip BranchPanel): QQS to'lovchi va guvohnoma, viloyat, haqiqiy manzil, mas'ul shaxslar, bank hisoblari.
ALTER TABLE branch
    ADD COLUMN vat_payer       BOOLEAN      NOT NULL DEFAULT true,
    ADD COLUMN vat_cert_no     VARCHAR(20)  CHECK (vat_cert_no ~ '^[0-9]{6,20}$'),
    ADD COLUMN region          VARCHAR(100),
    ADD COLUMN actual_address  VARCHAR(500),
    ADD COLUMN director_name   VARCHAR(200),
    ADD COLUMN accountant_name VARCHAR(200);

CREATE TABLE branch_bank_account (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_id  BIGINT       NOT NULL REFERENCES branch (id),
    bank_name  VARCHAR(200) NOT NULL CHECK (btrim(bank_name) <> ''),
    mfo        VARCHAR(5)   NOT NULL CHECK (mfo ~ '^[0-9]{5}$'),
    account    VARCHAR(20)  NOT NULL CHECK (account ~ '^[0-9]{20}$'),
    is_main    BOOLEAN      NOT NULL DEFAULT false,
    sort_order INTEGER      NOT NULL DEFAULT 0,
    UNIQUE (branch_id, account)
);
-- Filialda bitta asosiy hisob
CREATE UNIQUE INDEX branch_bank_account_main ON branch_bank_account (branch_id) WHERE is_main;
COMMENT ON TABLE branch_bank_account IS 'Filial bank rekvizitlari (to''lov hujjatlari, hisob-faktura)';
