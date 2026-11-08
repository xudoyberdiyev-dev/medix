-- Import ustasi: ustun moslashtirish profili (prototip `ImportWizard` → «Moslashtirishni saqlash»).
-- Har import turi uchun bitta profil (tashkilot darajasida): MEDIX maydoni → fayldagi ustun sarlavhasi.
CREATE TABLE import_profile (
    type        VARCHAR(30)  PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    updated_by  BIGINT       REFERENCES employee (id),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE import_profile_field (
    type          VARCHAR(30)  NOT NULL REFERENCES import_profile (type) ON DELETE CASCADE,
    field         VARCHAR(40)  NOT NULL,
    column_title  VARCHAR(200) NOT NULL,
    PRIMARY KEY (type, field)
);
