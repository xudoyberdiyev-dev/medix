-- MEDIX — 8-bosqich: qisman yetkazish (SPEC 5.2 №10, 5.4). Haydovchi manzilda «Qisman»: mijoz qabul qilmagan qism asl sotuv
-- narxida mijozdan qaytarish (QM) sifatida yoziladi — mijoz qarzi shu summaga kamayadi, tovar «Qaytmoqda» (Ombor mudiri sanab
-- Karantinga qabul qiladi). Sotuv (SV) o'zgarmaydi; sof savdo = SV − QM (SPEC 6). Hammasi bitta tranzaksiyada. Faqat qo'shiladi.
CREATE TABLE sales_return (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number        VARCHAR(32)     NOT NULL UNIQUE,
    sale_id       BIGINT          NOT NULL REFERENCES sale (id),
    order_id      BIGINT          NOT NULL REFERENCES sales_order (id),
    branch_id     BIGINT          NOT NULL REFERENCES branch (id),
    warehouse_id  BIGINT          NOT NULL REFERENCES warehouse (id),
    customer_id   BIGINT          NOT NULL REFERENCES counterparty (id),
    trip_id       BIGINT          REFERENCES trip (id),
    return_date   DATE            NOT NULL,
    total         NUMERIC(18, 2)  NOT NULL CHECK (total > 0),
    vat_total     NUMERIC(18, 2)  NOT NULL CHECK (vat_total >= 0),
    cost_total    NUMERIC(18, 2)  NOT NULL CHECK (cost_total >= 0),
    reason        VARCHAR(300)    NOT NULL,
    created_by    BIGINT          NOT NULL REFERENCES employee (id),
    created_at    TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX sales_return_sale_idx ON sales_return (sale_id);
CREATE INDEX sales_return_branch_idx ON sales_return (branch_id, return_date DESC);

CREATE TABLE sales_return_line (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    return_id     BIGINT          NOT NULL REFERENCES sales_return (id),
    sale_line_id  BIGINT          NOT NULL REFERENCES sale_line (id),
    product_id    BIGINT          NOT NULL REFERENCES product (id),
    batch_id      BIGINT          NOT NULL REFERENCES batch (id),
    qty           INTEGER         NOT NULL CHECK (qty > 0),
    price         NUMERIC(18, 2)  NOT NULL CHECK (price > 0),
    amount        NUMERIC(18, 2)  NOT NULL CHECK (amount > 0),
    vat_rate      NUMERIC(5, 2)   NOT NULL,
    vat_amount    NUMERIC(18, 2)  NOT NULL CHECK (vat_amount >= 0),
    cost          NUMERIC(18, 2)  NOT NULL CHECK (cost >= 0)
);
CREATE INDEX sales_return_line_return_idx ON sales_return_line (return_id);
CREATE INDEX sales_return_line_sale_line_idx ON sales_return_line (sale_line_id);

CREATE TRIGGER sales_return_append_only BEFORE UPDATE OR DELETE ON sales_return
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();
CREATE TRIGGER sales_return_line_append_only BEFORE UPDATE OR DELETE ON sales_return_line
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- Qaytayotgan tovar QM ga ham bog'lanadi (yetkazilmadi — faqat sotuv, qisman — sotuv + QM)
ALTER TABLE sales_return_pending ADD COLUMN return_id BIGINT REFERENCES sales_return (id);

-- Manzil natijasi: PARTIAL (qisman) — sabab majburiy
ALTER TABLE trip_stop DROP CONSTRAINT trip_stop_outcome_check;
ALTER TABLE trip_stop DROP CONSTRAINT trip_stop_outcome_chk;
ALTER TABLE trip_stop
    ADD CONSTRAINT trip_stop_outcome_check CHECK (outcome IN ('DELIVERED', 'PARTIAL', 'UNDELIVERED')),
    ADD CONSTRAINT trip_stop_outcome_chk CHECK ((outcome IS NULL) = (outcome_at IS NULL)
        AND (outcome NOT IN ('UNDELIVERED', 'PARTIAL') OR outcome IS NULL OR outcome_reason IS NOT NULL));
