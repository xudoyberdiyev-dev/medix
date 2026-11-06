-- MEDIX — bildirishnomalar (SPEC 5.1 «Eslatmalar», 8). Xodimga shaxsiy; bir eslatma bir kunda bir marta (dedup_key).
CREATE TABLE notification (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id   BIGINT        NOT NULL REFERENCES employee (id),
    kind          VARCHAR(32)   NOT NULL,
    title         VARCHAR(200)  NOT NULL CHECK (btrim(title) <> ''),
    body          VARCHAR(500),
    link          VARCHAR(200),
    dedup_key     VARCHAR(160)  NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    read_at       TIMESTAMPTZ,
    UNIQUE (employee_id, dedup_key)
);
CREATE INDEX notification_employee_idx ON notification (employee_id, created_at DESC);
CREATE INDEX notification_unread_idx ON notification (employee_id) WHERE read_at IS NULL;
