-- MEDIX — Mijozdan qaytarish (QM) hujjati (prototip StockDocs `qm`). Operator yetkazilgan sotuv (SV) asosida yaratadi —
-- «Qabul kutilmoqda»; Ombor mudiri (qm.approve) tovarni sanab qabul qiladi: tovar Karantin zonasiga kiradi, mijoz qarzi qaytarish
-- summasiga (sotuv narxi, chegirma bilan) kamayadi, `sales_return` (sof savdo = SV − QM) yoziladi. Hammasi bitta tranzaksiyada.
-- Rad etilsa — hech narsa o'zgarmaydi. Qaytarish mumkin = sotilgan − o'tkazilgan QM − kutilayotgan QM (qator bo'yicha).
CREATE TABLE customer_return (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number           VARCHAR(32)     NOT NULL UNIQUE,
    branch_id        BIGINT          NOT NULL REFERENCES branch (id),
    sale_id          BIGINT          NOT NULL REFERENCES sale (id),
    order_id         BIGINT          NOT NULL REFERENCES sales_order (id),
    customer_id      BIGINT          NOT NULL REFERENCES counterparty (id),
    warehouse_id     BIGINT          NOT NULL REFERENCES warehouse (id),
    return_date      DATE            NOT NULL,
    status           VARCHAR(10)     NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'POSTED', 'REJECTED')),
    note             VARCHAR(500),
    total            NUMERIC(18, 2)  NOT NULL CHECK (total > 0),
    sales_return_id  BIGINT          REFERENCES sales_return (id),
    created_by       BIGINT          NOT NULL REFERENCES employee (id),
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
    posted_by        BIGINT          REFERENCES employee (id),
    posted_at        TIMESTAMPTZ,
    rejected_by      BIGINT          REFERENCES employee (id),
    rejected_at      TIMESTAMPTZ,
    reject_reason    VARCHAR(300),
    version          BIGINT          NOT NULL DEFAULT 0,
    CHECK ((status = 'POSTED') = (posted_at IS NOT NULL AND sales_return_id IS NOT NULL)),
    CHECK ((status = 'REJECTED') = (rejected_at IS NOT NULL AND reject_reason IS NOT NULL))
);
CREATE INDEX customer_return_branch_idx ON customer_return (branch_id, created_at DESC);
CREATE INDEX customer_return_sale_idx ON customer_return (sale_id);

CREATE TABLE customer_return_line (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_return_id  BIGINT          NOT NULL REFERENCES customer_return (id),
    line_no             INTEGER         NOT NULL,
    sale_line_id        BIGINT          NOT NULL REFERENCES sale_line (id),
    product_id          BIGINT          NOT NULL REFERENCES product (id),
    batch_id            BIGINT          NOT NULL REFERENCES batch (id),
    qty                 INTEGER         NOT NULL CHECK (qty > 0),
    price               NUMERIC(18, 2)  NOT NULL CHECK (price > 0),
    amount              NUMERIC(18, 2)  NOT NULL CHECK (amount > 0),
    reason              VARCHAR(16)     NOT NULL CHECK (reason IN ('EXPIRING', 'DAMAGED', 'WRONG_ITEM', 'REFUSED', 'OTHER')),
    UNIQUE (customer_return_id, line_no),
    UNIQUE (customer_return_id, sale_line_id)
);
CREATE INDEX customer_return_line_sale_line_idx ON customer_return_line (sale_line_id);

-- Hal qilingan hujjat (o'tkazilgan / rad etilgan) va uning qatorlari o'zgarmaydi.
CREATE FUNCTION customer_return_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'customer_return: faqat qoʻshiladi (oʻchirish taqiqlangan)';
    END IF;
    IF OLD.status <> 'PENDING' THEN
        RAISE EXCEPTION 'customer_return %: hal qilingan hujjat oʻzgarmaydi', OLD.number;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER customer_return_guard BEFORE UPDATE OR DELETE ON customer_return FOR EACH ROW EXECUTE FUNCTION customer_return_guard();

CREATE TRIGGER customer_return_line_append_only BEFORE UPDATE OR DELETE ON customer_return_line
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();
