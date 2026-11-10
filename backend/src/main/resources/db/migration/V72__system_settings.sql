-- Tizim sozlamalari (prototip «Sozlamalar»): biznes chegaralari, xavfsizlik, QQS stavkalari tarixi, chop etish imzochilari.

CREATE TABLE system_setting (
    key         VARCHAR(40)  PRIMARY KEY CHECK (key ~ '^[a-zA-Z][a-zA-Z0-9.]*$'),
    value       VARCHAR(40)  NOT NULL CHECK (btrim(value) <> ''),
    updated_at  TIMESTAMPTZ,
    updated_by  BIGINT       REFERENCES employee (id)
);

COMMENT ON TABLE system_setting IS 'Kompaniya darajasidagi sozlamalar (kalit → qiymat). updated_at NULL — standart qiymat.';

INSERT INTO system_setting (key, value) VALUES
    ('expiryWarnDays', '90'),
    ('invRemindDays', '90'),
    ('orderLateDays', '2'),
    ('limitBranchPct', '20'),
    ('overdueDirDays', '30'),
    ('priceWarnPct', '20'),
    ('cashBranchApprove', '2000000.00'),
    ('hcDirApprove', '5000000.00'),
    ('ivDirApprove', '5000000.00'),
    ('pwMin', '8'),
    ('sessionMin', '30'),
    ('pinTries', '5'),
    ('pinLockMin', '15'),
    ('print.reprint', 'true'),
    ('print.nakVariant', 'price');

CREATE TABLE vat_rate (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rate        NUMERIC(5,2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
    valid_from  DATE         NOT NULL UNIQUE,
    created_by  BIGINT       REFERENCES employee (id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE vat_rate IS 'QQS stavkalari tarixi: amaldagi — valid_from <= bugun boʻlgan oxirgisi. Faqat kelajak sanadan qoʻshiladi.';

INSERT INTO vat_rate (rate, valid_from) VALUES (12.00, DATE '2023-01-01');

CREATE TABLE print_signer (
    branch_id               BIGINT PRIMARY KEY REFERENCES branch (id),
    head_employee_id        BIGINT REFERENCES employee (id),
    accountant_employee_id  BIGINT REFERENCES employee (id),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE print_signer IS 'Chop etiladigan hujjatlardagi imzochilar (filial rahbari, bosh buxgalter). NULL — avtomatik (shu roldagi birinchi faol xodim).';
