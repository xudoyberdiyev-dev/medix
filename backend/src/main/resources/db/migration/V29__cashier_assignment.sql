-- MEDIX — kassir faqat o'z kassasida (SPEC 3, 13): kassir faqat kassa (CASH) hisobiga biriktiriladi.
ALTER TABLE money_account ADD CONSTRAINT money_account_cashier_cash_only CHECK (kind = 'CASH' OR cashier_id IS NULL);
CREATE INDEX money_account_cashier_idx ON money_account (cashier_id) WHERE cashier_id IS NOT NULL;
