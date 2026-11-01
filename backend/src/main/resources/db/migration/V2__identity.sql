-- MEDIX — 1-bosqich: tashkilot tuzilmasi, xodimlar, rollar, ruxsatlar, audit, sessiyalar (SPEC 2, 3, 12, 13).
-- Vaqt doim TIMESTAMPTZ. Har jadvalda optimistik qulf uchun `version`.

-- ===== Umumiy: faqat qo'shiladigan jadvallar uchun himoya =====
CREATE FUNCTION medix_forbid_modification() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    RAISE EXCEPTION 'Jadval % faqat qo''shiladigan: % taqiqlangan', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$;

-- ===== Kompaniya va filiallar =====
CREATE TABLE company (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version     BIGINT       NOT NULL DEFAULT 0
);

-- V1: bitta kompaniya (guruh). Ikkinchisini yaratishni bazada taqiqlaymiz.
CREATE UNIQUE INDEX company_single_row ON company ((true));

CREATE TABLE branch (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id  BIGINT       NOT NULL REFERENCES company (id),
    code        VARCHAR(3)   NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{3}$'),
    name        VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
    legal_name  VARCHAR(300) NOT NULL CHECK (btrim(legal_name) <> ''),
    tin         VARCHAR(9)   NOT NULL UNIQUE CHECK (tin ~ '^[0-9]{9}$'),
    address     VARCHAR(500),
    phone       VARCHAR(32),
    active      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version     BIGINT       NOT NULL DEFAULT 0
);

COMMENT ON COLUMN branch.code IS 'Hujjat raqamidagi filial kodi: TSH, SMQ, BXR, FRG';
COMMENT ON COLUMN branch.tin IS 'STIR — har filial alohida yuridik shaxs';

-- ===== Omborlar va zonalar =====
CREATE TABLE warehouse (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_id   BIGINT       NOT NULL REFERENCES branch (id),
    name        VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
    address     VARCHAR(500),
    active      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version     BIGINT       NOT NULL DEFAULT 0,
    UNIQUE (branch_id, name)
);

CREATE INDEX warehouse_branch_idx ON warehouse (branch_id);

-- Zona turlari (SPEC 2): Qabul, Asosiy saqlash, Karantin, Jo'natish, Sovuq, Seyf.
-- Sotuvga ochiq — faqat Asosiy saqlash, Sovuq, Seyf (biznes qoidasi, bazada hisoblanadi).
CREATE TABLE zone (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id  BIGINT       NOT NULL REFERENCES warehouse (id),
    type          VARCHAR(16)  NOT NULL CHECK (type IN ('RECEIVING', 'MAIN', 'QUARANTINE', 'SHIPPING', 'COLD', 'SAFE')),
    name          VARCHAR(100) NOT NULL CHECK (btrim(name) <> ''),
    sellable      BOOLEAN      NOT NULL GENERATED ALWAYS AS (type IN ('MAIN', 'COLD', 'SAFE')) STORED,
    controlled    BOOLEAN      NOT NULL GENERATED ALWAYS AS (type = 'SAFE') STORED,
    active        BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version       BIGINT       NOT NULL DEFAULT 0,
    UNIQUE (warehouse_id, type),
    UNIQUE (warehouse_id, name)
);

COMMENT ON COLUMN zone.controlled IS 'Seyf — nazoratdagi preparatlar';

-- ===== Rollar va ruxsatlar =====
CREATE TABLE permission (
    key          VARCHAR(64)  PRIMARY KEY CHECK (key ~ '^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$'),
    module       VARCHAR(32)  NOT NULL,
    description  VARCHAR(300) NOT NULL
);

COMMENT ON TABLE permission IS 'Ruxsat kalitlari katalogi (masalan receipt.post, special.cost). Kod bilan birga migratsiyada keladi.';

CREATE TABLE role (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code          VARCHAR(40)  NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
    name          VARCHAR(100) NOT NULL UNIQUE CHECK (btrim(name) <> ''),
    system        BOOLEAN      NOT NULL DEFAULT false,
    copied_from   BIGINT       REFERENCES role (id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version       BIGINT       NOT NULL DEFAULT 0
);

COMMENT ON COLUMN role.system IS '11 ta standart rol: o''chirilmaydi, kodi o''zgarmaydi; ruxsatlarini administrator o''zgartira oladi';

CREATE TABLE role_permission (
    role_id         BIGINT      NOT NULL REFERENCES role (id) ON DELETE CASCADE,
    permission_key  VARCHAR(64) NOT NULL REFERENCES permission (key),
    PRIMARY KEY (role_id, permission_key)
);

-- Standart rollar (SPEC 3). Ruxsatlar matritsasi 1.3 da qo'shiladi.
INSERT INTO role (code, name, system) VALUES
    ('DIRECTOR',          'Direktor',           true),
    ('ADMIN',             'Bosh administrator', true),
    ('BRANCH_MANAGER',    'Filial rahbari',     true),
    ('OPERATOR',          'Operator',           true),
    ('PURCHASER',         'Xarid',              true),
    ('ACCOUNTANT',        'Buxgalter',          true),
    ('CASHIER',           'Kassir',             true),
    ('WAREHOUSE_MANAGER', 'Ombor mudiri',       true),
    ('PICKER',            'Yig''uvchi',         true),
    ('MARKER',            'Markirovkachi',      true),
    ('DRIVER',            'Haydovchi',          true);

CREATE FUNCTION medix_protect_system_role() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' AND OLD.system THEN
        RAISE EXCEPTION 'Standart rolni o''chirib bo''lmaydi: %', OLD.code USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.system AND (NEW.code <> OLD.code OR NOT NEW.system) THEN
        RAISE EXCEPTION 'Standart rol kodi o''zgarmaydi: %', OLD.code USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER role_protect_system
    BEFORE UPDATE OR DELETE ON role
    FOR EACH ROW EXECUTE FUNCTION medix_protect_system_role();

-- ===== Xodimlar =====
CREATE TABLE employee (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    login                 VARCHAR(64)  NOT NULL CHECK (login ~ '^[a-z0-9._-]{3,64}$'),
    full_name             VARCHAR(200) NOT NULL CHECK (btrim(full_name) <> ''),
    phone                 VARCHAR(32),
    position              VARCHAR(100),
    role_id               BIGINT       NOT NULL REFERENCES role (id),
    -- Asosiy filial. NULL faqat sozlash ustasi tugaguncha (CEO) yoki barcha filiallar xodimi uchun.
    branch_id             BIGINT       REFERENCES branch (id),
    password_hash         VARCHAR(255) NOT NULL,
    must_change_password  BOOLEAN      NOT NULL DEFAULT true,
    pin_hash              VARCHAR(255),
    status                VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED')),
    blocked_reason        VARCHAR(300),
    failed_login_count    INTEGER      NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    last_login_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version               BIGINT       NOT NULL DEFAULT 0,
    CHECK (status = 'BLOCKED' OR blocked_reason IS NULL)
);

COMMENT ON COLUMN employee.login IS 'Kichik harflarda saqlanadi; o''zi ro''yxatdan o''tish yo''q — administrator yaratadi';

CREATE UNIQUE INDEX employee_login_uq ON employee (login);
CREATE INDEX employee_branch_idx ON employee (branch_id);
CREATE INDEX employee_role_idx ON employee (role_id);

-- ===== Audit jurnali (faqat qo'shiladigan) =====
CREATE TABLE audit_log (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    employee_id  BIGINT,
    branch_id    BIGINT,
    action       VARCHAR(64)  NOT NULL,
    entity_type  VARCHAR(64)  NOT NULL,
    entity_id    VARCHAR(64),
    old_value    JSONB,
    new_value    JSONB,
    reason       VARCHAR(500),
    ip_address   INET,
    request_id   VARCHAR(64)
);

COMMENT ON TABLE audit_log IS 'Kim, qachon, nima, eski → yangi. FK yo''q: yozuv bog''liq obyektdan uzoq yashaydi.';

CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_log_employee_idx ON audit_log (employee_id, occurred_at DESC);
CREATE INDEX audit_log_occurred_idx ON audit_log (occurred_at DESC);

CREATE TRIGGER audit_log_append_only
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

CREATE TRIGGER audit_log_no_truncate
    BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION medix_forbid_modification();

-- ===== Spring Session JDBC (rasmiy PostgreSQL sxemasi) =====
CREATE TABLE spring_session (
    primary_id             CHAR(36)     NOT NULL,
    session_id             CHAR(36)     NOT NULL,
    creation_time          BIGINT       NOT NULL,
    last_access_time       BIGINT       NOT NULL,
    max_inactive_interval  INT          NOT NULL,
    expiry_time            BIGINT       NOT NULL,
    principal_name         VARCHAR(100),
    CONSTRAINT spring_session_pk PRIMARY KEY (primary_id)
);

CREATE UNIQUE INDEX spring_session_ix1 ON spring_session (session_id);
CREATE INDEX spring_session_ix2 ON spring_session (expiry_time);
CREATE INDEX spring_session_ix3 ON spring_session (principal_name);

CREATE TABLE spring_session_attributes (
    session_primary_id  CHAR(36)     NOT NULL,
    attribute_name      VARCHAR(200) NOT NULL,
    attribute_bytes     BYTEA        NOT NULL,
    CONSTRAINT spring_session_attributes_pk PRIMARY KEY (session_primary_id, attribute_name),
    CONSTRAINT spring_session_attributes_fk FOREIGN KEY (session_primary_id) REFERENCES spring_session (primary_id) ON DELETE CASCADE
);
