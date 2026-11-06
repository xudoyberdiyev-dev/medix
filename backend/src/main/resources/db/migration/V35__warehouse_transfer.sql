-- MEDIX — V2: OK, ombor ko'chirishi (bitta filial ichida, bir ombordan boshqasiga). SPEC 7 (holatlar: Jo'natildi → Yo'lda →
-- Qabul qilindi), T12: draft → transit (trOut) → received (trIn, kamomad → hal qilish).
-- Qoralama (DRAFT) → jo'natishda tovar manba zonadan chiqadi (jurnal, «Yo'lda» — IN_TRANSIT) → qabulda qabul qiluvchi ombor zonasiga
-- kiradi (RECEIVED). Qabul qilingan miqdor jo'natilgandan oshmaydi; farq — kamomad (shortage_qty), hal qilish kutiladi.
-- Bekor qilish — faqat qoralamada. Jurnal va qoldiq StockLedger orqali, hujjat bilan BITTA tranzaksiyada.

CREATE TABLE warehouse_transfer (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number             VARCHAR(32)   NOT NULL UNIQUE,
    branch_id          BIGINT        NOT NULL REFERENCES branch (id),
    from_warehouse_id  BIGINT        NOT NULL REFERENCES warehouse (id),
    from_zone_id       BIGINT        NOT NULL REFERENCES zone (id),
    to_warehouse_id    BIGINT        NOT NULL REFERENCES warehouse (id),
    to_zone_id         BIGINT        REFERENCES zone (id),
    note               VARCHAR(500),
    status             VARCHAR(16)   NOT NULL CHECK (status IN ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED')),
    shortage_qty       INTEGER       NOT NULL DEFAULT 0 CHECK (shortage_qty >= 0),
    receive_note       VARCHAR(500),
    created_by         BIGINT        NOT NULL REFERENCES employee (id),
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    sent_by            BIGINT        REFERENCES employee (id),
    sent_at            TIMESTAMPTZ,
    received_by        BIGINT        REFERENCES employee (id),
    received_at        TIMESTAMPTZ,
    cancelled_by       BIGINT        REFERENCES employee (id),
    cancelled_at       TIMESTAMPTZ,
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version            BIGINT        NOT NULL DEFAULT 0,
    CHECK (from_warehouse_id <> to_warehouse_id),
    CHECK (status IN ('DRAFT', 'CANCELLED') OR (sent_by IS NOT NULL AND sent_at IS NOT NULL)),
    CHECK (status <> 'RECEIVED' OR (received_by IS NOT NULL AND received_at IS NOT NULL AND to_zone_id IS NOT NULL)),
    CHECK (status <> 'CANCELLED' OR (cancelled_by IS NOT NULL AND sent_at IS NULL))
);
CREATE INDEX warehouse_transfer_branch_idx ON warehouse_transfer (branch_id, created_at DESC);
CREATE INDEX warehouse_transfer_transit_idx ON warehouse_transfer (branch_id) WHERE status = 'IN_TRANSIT';

CREATE TABLE warehouse_transfer_line (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transfer_id   BIGINT  NOT NULL REFERENCES warehouse_transfer (id),
    line_no       INTEGER NOT NULL CHECK (line_no > 0),
    batch_id      BIGINT  NOT NULL REFERENCES batch (id),
    product_id    BIGINT  NOT NULL REFERENCES product (id),
    qty           INTEGER NOT NULL CHECK (qty > 0),
    received_qty  INTEGER CHECK (received_qty >= 0),
    CHECK (received_qty IS NULL OR received_qty <= qty),
    UNIQUE (transfer_id, line_no),
    UNIQUE (transfer_id, batch_id)
);

-- Yakunlangan (qabul qilingan / bekor qilingan) OK o'zgarmaydi, hech qachon o'chirilmaydi (SPEC 6-4). Qatorlar faqat qoralamada
-- qo'shiladi; qabulda faqat received_qty bir marta yoziladi.
CREATE FUNCTION medix_warehouse_transfer_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'OK o''chirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_TABLE_NAME = 'warehouse_transfer' THEN
        IF OLD.status IN ('RECEIVED', 'CANCELLED') THEN
            RAISE EXCEPTION 'OK % yakunlangan: o''zgartirib bo''lmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.number <> OLD.number OR NEW.branch_id <> OLD.branch_id OR NEW.from_warehouse_id <> OLD.from_warehouse_id
                OR NEW.from_zone_id <> OLD.from_zone_id OR NEW.to_warehouse_id <> OLD.to_warehouse_id THEN
            RAISE EXCEPTION 'OK % rekvizitlari o''zgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status = 'IN_TRANSIT' AND NEW.status NOT IN ('IN_TRANSIT', 'RECEIVED') THEN
            RAISE EXCEPTION 'Yo''ldagi OK % faqat qabul qilinadi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    SELECT status INTO doc_status FROM warehouse_transfer WHERE id = NEW.transfer_id;
    IF TG_OP = 'INSERT' THEN
        IF doc_status <> 'DRAFT' THEN
            RAISE EXCEPTION 'OK qatorlari faqat qoralamada qo''shiladi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF doc_status <> 'IN_TRANSIT' OR OLD.received_qty IS NOT NULL OR NEW.batch_id <> OLD.batch_id OR NEW.qty <> OLD.qty
            OR NEW.product_id <> OLD.product_id OR NEW.line_no <> OLD.line_no OR NEW.transfer_id <> OLD.transfer_id THEN
        RAISE EXCEPTION 'OK qatorlari o''zgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER warehouse_transfer_locked BEFORE UPDATE OR DELETE ON warehouse_transfer
    FOR EACH ROW EXECUTE FUNCTION medix_warehouse_transfer_locked();
CREATE TRIGGER warehouse_transfer_line_locked BEFORE INSERT OR UPDATE OR DELETE ON warehouse_transfer_line
    FOR EACH ROW EXECUTE FUNCTION medix_warehouse_transfer_locked();
