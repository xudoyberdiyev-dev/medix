-- MEDIX — Sozlamalar sahifasi (prototip Settings): biznes chegaralari, QQS stavkalari tarixi, chop etish sozlamalari.
-- Qiymatlar audit jurnaliga yoziladi (entity_type = 'app_setting' / 'vat_rate' / 'print_setting').

CREATE TABLE app_setting (
    key         VARCHAR(40)    PRIMARY KEY,
    value       NUMERIC(18, 2) NOT NULL CHECK (value >= 0),
    updated_by  BIGINT         REFERENCES employee (id),
    updated_at  TIMESTAMPTZ
);

COMMENT ON TABLE app_setting IS 'Tizim sozlamalari (kalit → son). updated_by NULL — standart qiymat';

INSERT INTO app_setting (key, value) VALUES
    ('expiryWarnDays', 90),
    ('invRemindDays', 90),
    ('orderLateDays', 2),
    ('limitBranchPct', 20),
    ('overdueDirDays', 30),
    ('priceWarnPct', 20),
    ('cashBranchApprove', 2000000),
    ('hcDirApprove', 5000000),
    ('ivDirApprove', 5000000),
    ('pwMin', 8),
    ('sessionMin', 30),
    ('pinTries', 5),
    ('pinLockMin', 15);

CREATE TABLE vat_rate (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rate        NUMERIC(5, 2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
    valid_from  DATE          NOT NULL UNIQUE,
    created_by  BIGINT        REFERENCES employee (id),
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE vat_rate IS 'QQS stavkalari tarixi: yangi stavka faqat kelajak sanadan; amaldagisi — valid_from <= bugun eng oxirgisi';

INSERT INTO vat_rate (rate, valid_from) VALUES (12, DATE '2020-01-01');

CREATE TABLE print_setting (
    id               SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    reprint_mark     BOOLEAN      NOT NULL DEFAULT true,
    invoice_variant  VARCHAR(8)   NOT NULL DEFAULT 'PRICE' CHECK (invoice_variant IN ('PRICE', 'NOPRICE')),
    updated_by       BIGINT       REFERENCES employee (id),
    updated_at       TIMESTAMPTZ
);

INSERT INTO print_setting (id) VALUES (1);

CREATE TABLE print_signer (
    branch_id      BIGINT      PRIMARY KEY REFERENCES branch (id),
    head_id        BIGINT      REFERENCES employee (id),
    accountant_id  BIGINT      REFERENCES employee (id),
    updated_by     BIGINT      REFERENCES employee (id),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE print_signer IS 'Qogʻoz shakllaridagi imzo qoʻyuvchilar filial boʻyicha; NULL — avtomatik (rol boʻyicha)';

INSERT INTO permission (key, module, description, grp, kind, page) VALUES
    ('settings.edit', 'settings', 'Sozlamalar: biznes chegaralari, soliq, chop etish', 'admin', 'create', 'settings'),
    ('settings.security', 'settings', 'Sozlamalar: xavfsizlik', 'admin', 'special', 'settings');

INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, v.k FROM role r JOIN (VALUES ('DIRECTOR', 'settings.edit'), ('DIRECTOR', 'settings.security'), ('ADMIN', 'settings.security'))
    AS v(code, k) ON v.code = r.code;
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, v.k FROM role r JOIN (VALUES ('DIRECTOR', 'settings.edit'), ('DIRECTOR', 'settings.security'), ('ADMIN', 'settings.security'))
    AS v(code, k) ON v.code = r.code WHERE r.system;
