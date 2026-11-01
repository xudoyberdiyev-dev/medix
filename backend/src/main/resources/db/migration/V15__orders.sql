-- MEDIX — 6-bosqich: buyurtma (SPEC 5.2, 5.3, 6). Qoralama qoldiq va qarzga ta'sir qilmaydi. Tasdiqlangan (Navbatda va
-- keyingi) buyurtmada narx muzlatiladi. Holatlar zanjiri 7–8-bosqichlarda davom etadi.
CREATE TABLE sales_order (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number            VARCHAR(32)    NOT NULL UNIQUE,
    branch_id         BIGINT         NOT NULL REFERENCES branch (id),
    warehouse_id      BIGINT         NOT NULL REFERENCES warehouse (id),
    customer_id       BIGINT         NOT NULL REFERENCES counterparty (id),
    order_date        DATE           NOT NULL,
    delivery_type     VARCHAR(16)    NOT NULL CHECK (delivery_type IN ('DELIVERY', 'PICKUP')),
    delivery_date     DATE,
    address           VARCHAR(500),
    payment_type      VARCHAR(16)    NOT NULL CHECK (payment_type IN ('CASH', 'TRANSFER', 'ONLINE')),
    price_type_id     BIGINT         REFERENCES price_type (id),
    note              VARCHAR(500),
    status            VARCHAR(20)    NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'QUEUED', 'PICKING',
                          'MARKING', 'CHECKING', 'DOCUMENTING', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'UNDELIVERED', 'REJECTED',
                          'CANCELLED')),
    approval_level    VARCHAR(16)    CHECK (approval_level IN ('BRANCH', 'DIRECTOR')),
    approval_reasons  TEXT,
    total             NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    created_by        BIGINT         NOT NULL REFERENCES employee (id),
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
    submitted_at      TIMESTAMPTZ,
    decided_by        BIGINT         REFERENCES employee (id),
    decided_at        TIMESTAMPTZ,
    decision_reason   VARCHAR(300),
    queued_at         TIMESTAMPTZ,
    cancelled_by      BIGINT         REFERENCES employee (id),
    cancelled_at      TIMESTAMPTZ,
    cancel_reason     VARCHAR(300),
    status_changed_at TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
    version           BIGINT         NOT NULL DEFAULT 0,
    CHECK (status <> 'PENDING_APPROVAL' OR approval_level IS NOT NULL),
    CHECK (status NOT IN ('REJECTED', 'CANCELLED') OR (status = 'REJECTED' AND decision_reason IS NOT NULL)
           OR (status = 'CANCELLED' AND cancel_reason IS NOT NULL))
);
CREATE INDEX sales_order_branch_idx ON sales_order (branch_id, status, created_at DESC);
CREATE INDEX sales_order_customer_idx ON sales_order (customer_id, created_at DESC);

CREATE TABLE sales_order_line (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id          BIGINT         NOT NULL REFERENCES sales_order (id),
    line_no           INTEGER        NOT NULL CHECK (line_no > 0),
    product_id        BIGINT         NOT NULL REFERENCES product (id),
    qty               INTEGER        NOT NULL CHECK (qty > 0),
    -- Yuborishda (qoralamadan chiqishda) hisoblanadi va muzlatiladi; qoralamada — oxirgi saqlangan paytdagi narx.
    price             NUMERIC(18, 2) CHECK (price > 0),
    price_type_id     BIGINT         REFERENCES price_type (id),
    UNIQUE (order_id, line_no),
    UNIQUE (order_id, product_id)
);
CREATE INDEX sales_order_line_doc_idx ON sales_order_line (order_id);

-- Qatorlar faqat qoralamada o'zgaradi; buyurtma o'chirilmaydi; yakuniy holatdagi buyurtma o'zgarmaydi.
CREATE FUNCTION medix_sales_order_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(20);
BEGIN
    IF TG_TABLE_NAME = 'sales_order' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Buyurtma o''chirilmaydi' USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status IN ('DELIVERED', 'UNDELIVERED', 'REJECTED', 'CANCELLED') THEN
            RAISE EXCEPTION 'Buyurtma % yakunlangan (%): o''zgartirib bo''lmaydi', OLD.number, OLD.status
                USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status NOT IN ('DRAFT', 'PENDING_APPROVAL') AND (NEW.total <> OLD.total OR NEW.customer_id <> OLD.customer_id) THEN
            RAISE EXCEPTION 'Buyurtma % tasdiqlangan: mijoz va summa muzlatilgan', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    SELECT status INTO doc_status FROM sales_order WHERE id = COALESCE(NEW.order_id, OLD.order_id);
    IF doc_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Buyurtma qatorlari faqat qoralamada o''zgaradi (holat: %)', doc_status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER sales_order_locked BEFORE UPDATE OR DELETE ON sales_order
    FOR EACH ROW EXECUTE FUNCTION medix_sales_order_locked();
CREATE TRIGGER sales_order_line_locked BEFORE INSERT OR UPDATE OR DELETE ON sales_order_line
    FOR EACH ROW EXECUTE FUNCTION medix_sales_order_locked();
