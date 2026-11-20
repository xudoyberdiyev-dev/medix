-- M2: haydovchi mobil ilovasi — qurilma tokeni (Bearer). Bazada faqat SHA-256 xesh saqlanadi.
-- Bekor qilish: ilovadan chiqish, xodim sessiyalarini tugatish, bloklash/rol oʻzgarishi (filtrda tekshiriladi),
-- 30 kun ishlatilmasa — eskiradi.
CREATE TABLE mobile_device_token (
    id            BIGSERIAL    PRIMARY KEY,
    employee_id   BIGINT       NOT NULL REFERENCES employee (id),
    branch_id     BIGINT       REFERENCES branch (id),
    token_hash    CHAR(64)     NOT NULL CONSTRAINT mobile_device_token_hash_uq UNIQUE,
    device        VARCHAR(160),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_used_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    revoked_at    TIMESTAMPTZ,
    revoke_reason VARCHAR(20)  CHECK (revoke_reason IN ('LOGOUT', 'ADMIN', 'EXPIRED', 'REPLACED'))
);
CREATE INDEX mobile_device_token_employee_idx ON mobile_device_token (employee_id) WHERE revoked_at IS NULL;
