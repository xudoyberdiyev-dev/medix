-- MEDIX — boshlang'ich sxema (0-bosqich).
-- Hujjat raqamlash: PREFIKS-FILIAL-000001. Raqam qoralama yaratilganda bir marta beriladi
-- va hech qachon qayta ishlatilmaydi (SPEC 7-bo'lim).

CREATE TABLE document_sequence (
    prefix       VARCHAR(4)  NOT NULL,
    branch_code  VARCHAR(3)  NOT NULL,
    last_value   BIGINT      NOT NULL DEFAULT 0 CHECK (last_value >= 0),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (prefix, branch_code)
);

COMMENT ON TABLE document_sequence IS 'Hujjat raqamlari hisoblagichi (prefiks × filial). Faqat oshadi.';
