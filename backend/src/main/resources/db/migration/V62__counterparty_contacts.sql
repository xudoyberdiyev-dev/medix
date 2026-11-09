-- MEDIX — kontragent kontaktlari (prototip CounterpartyForm «Kontakt shaxslar»: ism, lavozim, telefon — bir nechta).
-- counterparty.contact_person — birinchi kontakt ismi (qidiruv va roʻyxatlar uchun) sifatida qoladi.
CREATE TABLE counterparty_contact (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    counterparty_id  BIGINT       NOT NULL REFERENCES counterparty (id),
    sort_order       INTEGER      NOT NULL CHECK (sort_order > 0),
    name             VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
    job_title        VARCHAR(200),
    phone            VARCHAR(64),
    UNIQUE (counterparty_id, sort_order)
);

INSERT INTO counterparty_contact (counterparty_id, sort_order, name)
SELECT id, 1, btrim(contact_person) FROM counterparty WHERE btrim(coalesce(contact_person, '')) <> '';
