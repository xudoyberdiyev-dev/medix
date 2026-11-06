-- MEDIX — 3-bosqich: narxlar (SPEC 6). Narx = mahsulot × narx turi × filial × kuchga kirish sanasi, QQS bilan.
-- Narx faqat tasdiqlangan NO (narx o'zgarishi) hujjati orqali yoziladi; tarix saqlanadi.

CREATE TABLE price_change (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number           VARCHAR(32)   NOT NULL UNIQUE,
    branch_id        BIGINT        NOT NULL REFERENCES branch (id),
    status           VARCHAR(20)   NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED')),
    effective_from   DATE          NOT NULL,
    note             VARCHAR(500),
    created_by       BIGINT        NOT NULL REFERENCES employee (id),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    submitted_at     TIMESTAMPTZ,
    decided_by       BIGINT        REFERENCES employee (id),
    decided_at       TIMESTAMPTZ,
    decision_reason  VARCHAR(300),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version          BIGINT        NOT NULL DEFAULT 0
);
CREATE INDEX price_change_branch_idx ON price_change (branch_id, created_at DESC);

CREATE TABLE price_change_line (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    price_change_id  BIGINT         NOT NULL REFERENCES price_change (id),
    product_id       BIGINT         NOT NULL REFERENCES product (id),
    price_type_id    BIGINT         NOT NULL REFERENCES price_type (id),
    old_price        NUMERIC(18, 2) CHECK (old_price >= 0),
    new_price        NUMERIC(18, 2) NOT NULL CHECK (new_price > 0),
    UNIQUE (price_change_id, product_id, price_type_id)
);
CREATE INDEX price_change_line_doc_idx ON price_change_line (price_change_id);

-- Amaldagi va tarixiy narxlar. Bir kun uchun bitta qiymat (keyingi NO shu kunni almashtiradi — yangi qator, eski saqlanadi).
CREATE TABLE price (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id       BIGINT         NOT NULL REFERENCES product (id),
    price_type_id    BIGINT         NOT NULL REFERENCES price_type (id),
    branch_id        BIGINT         NOT NULL REFERENCES branch (id),
    effective_from   DATE           NOT NULL,
    amount           NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
    price_change_id  BIGINT         NOT NULL REFERENCES price_change (id),
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);
-- Narx tanlash: (mahsulot, tur, filial) bo'yicha sana ≤ X dagi eng oxirgi qator (bir sanada — eng oxirgi yozilgani).
CREATE INDEX price_lookup_idx ON price (product_id, price_type_id, branch_id, effective_from DESC, id DESC);

CREATE TRIGGER price_append_only
    BEFORE UPDATE OR DELETE ON price
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- Tasdiqlangan / yakunlangan NO o'zgartirilmaydi (SPEC 6-4); qatorlari ham.
CREATE FUNCTION medix_price_change_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(20);
BEGIN
    IF TG_TABLE_NAME = 'price_change' THEN
        IF OLD.status IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
            RAISE EXCEPTION 'NO % yakunlangan (%): o''zgartirib bo''lmaydi', OLD.number, OLD.status USING ERRCODE = 'restrict_violation';
        END IF;
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'NO o''chirilmaydi' USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    SELECT status INTO doc_status FROM price_change WHERE id = COALESCE(NEW.price_change_id, OLD.price_change_id);
    IF doc_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'NO qatorlari faqat qoralamada o''zgaradi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER price_change_locked BEFORE UPDATE OR DELETE ON price_change
    FOR EACH ROW EXECUTE FUNCTION medix_price_change_locked();
CREATE TRIGGER price_change_line_locked BEFORE INSERT OR UPDATE OR DELETE ON price_change_line
    FOR EACH ROW EXECUTE FUNCTION medix_price_change_locked();
