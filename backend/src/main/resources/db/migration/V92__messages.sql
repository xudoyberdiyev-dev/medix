-- O12 (egasi 17.11.2026): ichki xabarlar va topshiriqlar.
-- Suhbat (thread) — ikki xodim orasida (DIRECT, juftlik bo'yicha yagona) yoki guruh (GROUP: tanlangan xodimlar, rol yoki
-- butun filial — qatnashchilar yaratilgan paytdagi ro'yxat). O'qildi holati — qatnashchining oxirgi o'qigan xabar id'si.
CREATE TABLE msg_thread (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind                VARCHAR(8)   NOT NULL CHECK (kind IN ('DIRECT', 'GROUP')),
    -- GROUP: kimga yuborilgan — PEOPLE (tanlangan xodimlar), ROLE (rol, filial ichida yoki barcha filiallar), BRANCH (filial)
    audience            VARCHAR(8)   NOT NULL CHECK (audience IN ('PERSON', 'PEOPLE', 'ROLE', 'BRANCH')),
    audience_role       VARCHAR(40),
    audience_branch_id  BIGINT       REFERENCES branch (id),
    direct_key          VARCHAR(41)  UNIQUE,
    created_by          BIGINT       NOT NULL REFERENCES employee (id),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_message_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK ((kind = 'DIRECT') = (direct_key IS NOT NULL)),
    CHECK ((kind = 'DIRECT') = (audience = 'PERSON')),
    CHECK (audience <> 'ROLE' OR audience_role IS NOT NULL)
);

CREATE TABLE msg_participant (
    thread_id     BIGINT       NOT NULL REFERENCES msg_thread (id),
    employee_id   BIGINT       NOT NULL REFERENCES employee (id),
    last_read_id  BIGINT       NOT NULL DEFAULT 0,
    joined_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (thread_id, employee_id)
);
CREATE INDEX msg_participant_employee_idx ON msg_participant (employee_id, thread_id);

CREATE TABLE msg_message (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    thread_id   BIGINT        NOT NULL REFERENCES msg_thread (id),
    sender_id   BIGINT        NOT NULL REFERENCES employee (id),
    kind        VARCHAR(8)    NOT NULL CHECK (kind IN ('MESSAGE', 'TASK')),
    body        VARCHAR(4000),
    task_title  VARCHAR(200),
    due_at      TIMESTAMPTZ,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    edited_at   TIMESTAMPTZ,
    deleted_at  TIMESTAMPTZ,
    CHECK (kind = 'TASK' OR (task_title IS NULL AND due_at IS NULL)),
    CHECK (kind = 'MESSAGE' OR (task_title IS NOT NULL AND btrim(task_title) <> '')),
    -- Topshiriq o'chirilmaydi — «Bekor qilish» bilan yopiladi.
    CHECK (kind = 'MESSAGE' OR deleted_at IS NULL)
);
CREATE INDEX msg_message_thread_idx ON msg_message (thread_id, id DESC);

-- Topshiriq ijrochilari: har birining holati alohida.
CREATE TABLE msg_task_assignee (
    message_id   BIGINT       NOT NULL REFERENCES msg_message (id),
    employee_id  BIGINT       NOT NULL REFERENCES employee (id),
    status       VARCHAR(12)  NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    done_at      TIMESTAMPTZ,
    PRIMARY KEY (message_id, employee_id),
    CHECK ((status = 'DONE') = (done_at IS NOT NULL))
);
CREATE INDEX msg_task_assignee_employee_idx ON msg_task_assignee (employee_id, status);

-- Biriktirmalar (rasm, PDF, Excel, Word …; ≤ 20 MB) — bazada. Avval yuklanadi (message_id NULL), xabar yuborilganda bog'lanadi.
CREATE TABLE msg_file (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    message_id    BIGINT        REFERENCES msg_message (id),
    uploaded_by   BIGINT        NOT NULL REFERENCES employee (id),
    file_name     VARCHAR(200)  NOT NULL CHECK (btrim(file_name) <> ''),
    content_type  VARCHAR(120)  NOT NULL,
    size_bytes    INTEGER       NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
    data          BYTEA         NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX msg_file_message_idx ON msg_file (message_id);
CREATE INDEX msg_file_orphan_idx ON msg_file (uploaded_by, created_at) WHERE message_id IS NULL;

-- Ruxsatlar: xabarlar (hamma rollar), rol/filialga yuborish (Direktor, Admin, Filial rahbari, Ombor mudiri).
INSERT INTO permission (key, module, description, grp, kind, page) VALUES
    ('messages.use', 'messages', 'Xabarlar: yozish, javob berish, topshiriq berish va bajarish', 'special', 'special', NULL),
    ('messages.broadcast', 'messages', 'Xabarlar: butun rol yoki filialga yuborish', 'special', 'special', NULL);
INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, 'messages.use' FROM role r;
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, 'messages.use' FROM role r WHERE r.system;
INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, 'messages.broadcast' FROM role r WHERE r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER');
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, 'messages.broadcast' FROM role r WHERE r.system AND r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER');
