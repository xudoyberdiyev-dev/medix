-- MEDIX — 9-bosqich: avansni hisobga olish (AH, SPEC 7). Taqsimlanmagan to'lov (avans) eng eski qarzlarga yopiladi.
-- Qarz jurnalida har qator ikki yozuv: avans hujjatiga +x, qarz hujjatiga −x (saldo o'zgarmaydi). Darhol o'tkaziladi;
-- bekor qilish — teskari yozuvlar.
CREATE TABLE advance_offset (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number           VARCHAR(32)     NOT NULL UNIQUE,
    branch_id        BIGINT          NOT NULL REFERENCES branch (id),
    counterparty_id  BIGINT          NOT NULL REFERENCES counterparty (id),
    side             VARCHAR(10)     NOT NULL CHECK (side IN ('CUSTOMER', 'SUPPLIER')),
    offset_date      DATE            NOT NULL,
    amount           NUMERIC(18, 2)  NOT NULL CHECK (amount > 0),
    note             VARCHAR(500),
    status           VARCHAR(10)     NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'CANCELLED')),
    created_by       BIGINT          NOT NULL REFERENCES employee (id),
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
    cancelled_by     BIGINT          REFERENCES employee (id),
    cancelled_at     TIMESTAMPTZ,
    cancel_reason    VARCHAR(300),
    version          BIGINT          NOT NULL DEFAULT 0,
    CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL)
);
CREATE INDEX advance_offset_branch_idx ON advance_offset (branch_id, side, offset_date DESC);

CREATE TABLE advance_offset_line (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    offset_id            BIGINT          NOT NULL REFERENCES advance_offset (id),
    advance_doc_type     VARCHAR(8)      NOT NULL,
    advance_doc_id       BIGINT          NOT NULL,
    advance_doc_number   VARCHAR(32)     NOT NULL,
    debt_doc_type        VARCHAR(8)      NOT NULL,
    debt_doc_id          BIGINT          NOT NULL,
    debt_doc_number      VARCHAR(32)     NOT NULL,
    amount               NUMERIC(18, 2)  NOT NULL CHECK (amount > 0)
);
CREATE INDEX advance_offset_line_idx ON advance_offset_line (offset_id);
CREATE TRIGGER advance_offset_line_append_only BEFORE UPDATE OR DELETE ON advance_offset_line
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

CREATE FUNCTION medix_advance_offset_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'AH oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'CANCELLED' OR NEW.amount <> OLD.amount OR NEW.counterparty_id <> OLD.counterparty_id OR NEW.branch_id <> OLD.branch_id
        OR NEW.side <> OLD.side OR NEW.offset_date <> OLD.offset_date OR NEW.number <> OLD.number THEN
        RAISE EXCEPTION 'AH % oʻzgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER advance_offset_locked BEFORE UPDATE OR DELETE ON advance_offset
    FOR EACH ROW EXECUTE FUNCTION medix_advance_offset_locked();
