-- MEDIX — 2-bosqich: kichik maʼlumotnomalar (SPEC 4, 12): ishlab chiqaruvchilar, kategoriyalar, birliklar,
-- davlatlar, hududlar, mashinalar, xarajat/kirim moddalari. O'chirilmaydi — faqat nofaol qilinadi (SPEC 6, 13-qoida).

CREATE TABLE manufacturer (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
    short_name  VARCHAR(50),
    active      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version     BIGINT       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX manufacturer_name_uq ON manufacturer (lower(name));
COMMENT ON TABLE manufacturer IS 'Ishlab chiqaruvchilar (dori ishlab chiqaruvchi korxonalar)';

CREATE TABLE category (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
    short_name  VARCHAR(50),
    active      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version     BIGINT       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX category_name_uq ON category (lower(name));
COMMENT ON TABLE category IS 'Mahsulot kategoriyalari';

CREATE TABLE unit (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
    short_name  VARCHAR(50),
    active      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version     BIGINT       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX unit_name_uq ON unit (lower(name));
COMMENT ON TABLE unit IS 'Oʻlchov birliklari (dona, qadoq, ...)';

CREATE TABLE country (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
    short_name  VARCHAR(50),
    active      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version     BIGINT       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX country_name_uq ON country (lower(name));
COMMENT ON TABLE country IS 'Davlatlar (ishlab chiqarilgan joy)';

CREATE TABLE region (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
    short_name  VARCHAR(50),
    active      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version     BIGINT       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX region_name_uq ON region (lower(name));
COMMENT ON TABLE region IS 'Hududlar (mijoz manzili, yetkazish)';

COMMENT ON COLUMN unit.short_name IS 'Qisqa yozuvi, masalan «dona», «qad.»';
COMMENT ON COLUMN country.short_name IS 'ISO 3166-1 alpha-2 kodi, masalan UZ';

-- Mashinalar filialga tegishli (reys tuzishda tanlanadi, SPEC 5.2). Sig'im — joylar (quti) soni.
CREATE TABLE vehicle (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_id       BIGINT       NOT NULL REFERENCES branch (id),
    plate_number    VARCHAR(20)  NOT NULL CHECK (plate_number ~ '^[0-9A-Z ]{5,20}$'),
    model           VARCHAR(100) NOT NULL CHECK (btrim(model) <> ''),
    capacity_boxes  INTEGER      CHECK (capacity_boxes > 0),
    active          BOOLEAN      NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version         BIGINT       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX vehicle_plate_uq ON vehicle (replace(plate_number, ' ', ''));
CREATE INDEX vehicle_branch_idx ON vehicle (branch_id);

-- Kassa/bank operatsiyalari moddalari (SPEC 5.5): chiqim (EXPENSE) va kirim (INCOME).
CREATE TABLE expense_item (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    direction   VARCHAR(8)   NOT NULL CHECK (direction IN ('EXPENSE', 'INCOME')),
    name        VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
    system      BOOLEAN      NOT NULL DEFAULT false,
    active      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version     BIGINT       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX expense_item_name_uq ON expense_item (direction, lower(name));
COMMENT ON COLUMN expense_item.system IS 'SPEC dagi standart modda: nomi o''zgartirilmaydi, nofaol qilinmaydi';

-- ===== Boshlang'ich qiymatlar =====
INSERT INTO unit (name, short_name) VALUES
    ('Dona', 'dona'), ('Qadoq', 'qad.'), ('Quti', 'quti'), ('Flakon', 'fl.'), ('Ampula', 'amp.'), ('Tuba', 'tuba');

INSERT INTO country (name, short_name) VALUES
    ('Oʻzbekiston', 'UZ'), ('Rossiya', 'RU'), ('Hindiston', 'IN'), ('Germaniya', 'DE'), ('Turkiya', 'TR'),
    ('Xitoy', 'CN'), ('Belarus', 'BY'), ('Ukraina', 'UA'), ('Qozogʻiston', 'KZ'), ('Fransiya', 'FR'),
    ('Italiya', 'IT'), ('Polsha', 'PL'), ('Vengriya', 'HU'), ('Sloveniya', 'SI'), ('Janubiy Koreya', 'KR'),
    ('Pokiston', 'PK'), ('Eron', 'IR'), ('Misr', 'EG'), ('Iordaniya', 'JO'), ('Shveytsariya', 'CH'),
    ('Avstriya', 'AT'), ('Ispaniya', 'ES'), ('Buyuk Britaniya', 'GB'), ('AQSH', 'US'), ('Latviya', 'LV');

INSERT INTO region (name) VALUES
    ('Toshkent shahri'), ('Toshkent viloyati'), ('Andijon viloyati'), ('Buxoro viloyati'), ('Fargʻona viloyati'),
    ('Jizzax viloyati'), ('Xorazm viloyati'), ('Namangan viloyati'), ('Navoiy viloyati'), ('Qashqadaryo viloyati'),
    ('Qoraqalpogʻiston Respublikasi'), ('Samarqand viloyati'), ('Sirdaryo viloyati'), ('Surxondaryo viloyati');

INSERT INTO expense_item (direction, name, system) VALUES
    ('EXPENSE', 'Transport va yoqilgʻi', true), ('EXPENSE', 'Xoʻjalik', true), ('EXPENSE', 'Bank komissiyasi', true),
    ('EXPENSE', 'Soliqlar', true), ('EXPENSE', 'Ish haqi', true), ('EXPENSE', 'Ijara', true),
    ('EXPENSE', 'Kommunal', true), ('EXPENSE', 'Boshqa', true),
    ('INCOME', 'Boshqa kirim', true), ('INCOME', 'Bank foizi', true), ('INCOME', 'Qaytarilgan mablagʻ', true);
