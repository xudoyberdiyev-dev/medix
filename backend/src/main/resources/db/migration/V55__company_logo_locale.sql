-- Sozlash ustasi 1-qadam (prototip SetupWizard): tizimning asosiy tili va logotip (PNG yoki SVG, 2 MB gacha).
ALTER TABLE company
    ADD COLUMN default_locale  VARCHAR(8)  NOT NULL DEFAULT 'uz-Latn' CHECK (default_locale IN ('uz-Latn', 'uz-Cyrl', 'ru')),
    ADD COLUMN logo            BYTEA,
    ADD COLUMN logo_type       VARCHAR(32) CHECK (logo_type IN ('image/png', 'image/svg+xml')),
    ADD COLUMN logo_updated_at TIMESTAMPTZ,
    ADD CONSTRAINT company_logo_size CHECK (logo IS NULL OR octet_length(logo) <= 2097152),
    ADD CONSTRAINT company_logo_pair CHECK ((logo IS NULL) = (logo_type IS NULL));
