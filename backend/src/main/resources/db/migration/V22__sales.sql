-- MEDIX — 8-bosqich: sotuv (SV) va hisob-faktura (HF), SPEC 5.2 №9. «Yuklab bo'lindi — reysni boshlash» (yoki «O'zi olib
-- ketadi» — mijoz olib chiqdi) paytida yoziladi: tovar Jo'natish zonasidan chiqadi (ombor jurnali), mijoz qarzi oshadi (qarz
-- jurnali), markirovka kodlari «sotilgan» bo'ladi, buyurtma «Yo'lda». Hammasi bitta tranzaksiyada. Summalar QQS bilan.
CREATE TABLE sale (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(32)     NOT NULL UNIQUE,
    invoice_number  VARCHAR(32)     NOT NULL UNIQUE,
    order_id        BIGINT          NOT NULL UNIQUE REFERENCES sales_order (id),
    branch_id       BIGINT          NOT NULL REFERENCES branch (id),
    warehouse_id    BIGINT          NOT NULL REFERENCES warehouse (id),
    customer_id     BIGINT          NOT NULL REFERENCES counterparty (id),
    sale_date       DATE            NOT NULL,
    total           NUMERIC(18, 2)  NOT NULL CHECK (total >= 0),
    vat_total       NUMERIC(18, 2)  NOT NULL CHECK (vat_total >= 0),
    cost_total      NUMERIC(18, 2)  NOT NULL CHECK (cost_total >= 0),
    due_date        DATE,
    trip_id         BIGINT          REFERENCES trip (id),
    status          VARCHAR(10)     NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'CANCELLED')),
    created_by      BIGINT          NOT NULL REFERENCES employee (id),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    cancelled_by    BIGINT          REFERENCES employee (id),
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   VARCHAR(300),
    CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL)
);
CREATE INDEX sale_branch_idx ON sale (branch_id, sale_date DESC);
CREATE INDEX sale_customer_idx ON sale (customer_id, sale_date DESC);

-- Sotuv qatorlari — partiya bo'yicha (har partiya o'z tannarxi bilan; narx — muzlatilgan qator narxi). Faqat qo'shiladi.
CREATE TABLE sale_line (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id        BIGINT          NOT NULL REFERENCES sale (id),
    order_line_id  BIGINT          NOT NULL REFERENCES sales_order_line (id),
    product_id     BIGINT          NOT NULL REFERENCES product (id),
    batch_id       BIGINT          NOT NULL REFERENCES batch (id),
    qty            INTEGER         NOT NULL CHECK (qty > 0),
    price          NUMERIC(18, 2)  NOT NULL CHECK (price > 0),
    amount         NUMERIC(18, 2)  NOT NULL CHECK (amount > 0),
    vat_rate       NUMERIC(5, 2)   NOT NULL,
    vat_amount     NUMERIC(18, 2)  NOT NULL CHECK (vat_amount >= 0),
    cost           NUMERIC(18, 2)  NOT NULL CHECK (cost >= 0)
);
CREATE INDEX sale_line_sale_idx ON sale_line (sale_id);

CREATE TRIGGER sale_line_append_only BEFORE UPDATE OR DELETE ON sale_line
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- Sotuv o'chirilmaydi; summalar o'zgarmaydi; faqat bekor qilish (yetkazilmadi — keyingi bosqich).
CREATE FUNCTION medix_sale_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Sotuv oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'CANCELLED' OR NEW.total <> OLD.total OR NEW.vat_total <> OLD.vat_total OR NEW.cost_total <> OLD.cost_total
        OR NEW.customer_id <> OLD.customer_id OR NEW.number <> OLD.number OR NEW.invoice_number <> OLD.invoice_number THEN
        RAISE EXCEPTION 'Sotuv % oʻzgarmaydi', OLD.number USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER sale_locked BEFORE UPDATE OR DELETE ON sale FOR EACH ROW EXECUTE FUNCTION medix_sale_locked();
