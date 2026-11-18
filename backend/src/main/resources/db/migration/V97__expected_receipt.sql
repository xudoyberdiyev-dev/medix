-- O15 (egasi 17.11.2026): «Kutilayotgan kirim» (KK, yuk xati). Yetkazib beruvchi tovarni chiqarib, yuk xatini darhol yuboradi,
-- tovar ~1 hafta yo'lda. KK tasdiqlanganda (to'lov «qarzga») YB qarzi DARHOL yoziladi (hujjat sanasi = yuk xati sanasi,
-- to'lov kuni = hisob-faktura sanasi (yo'q bo'lsa yuk xati sanasi) + YB sharti); qoldiq o'zgarmaydi — tovar «Yo'lda».
-- Tovar kelganda KK dan kirim (KR) tuziladi: qoldiq kiradi, qarz qayta yozilmaydi (farq — KK ga qo'llanadigan tuzatish).
-- Holatlar: Qoralama → Yo'lda → Qisman qabul qilindi → Qabul qilindi; Qoralama / Yo'lda (hech narsa qabul qilinmagan) → Bekor qilingan.
CREATE TABLE expected_receipt (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(32)    NOT NULL UNIQUE,
    branch_id       BIGINT         NOT NULL REFERENCES branch (id),
    warehouse_id    BIGINT         NOT NULL REFERENCES warehouse (id),
    supplier_id     BIGINT         NOT NULL REFERENCES counterparty (id),
    waybill_number  VARCHAR(64)    NOT NULL CHECK (btrim(waybill_number) <> ''),
    waybill_date    DATE           NOT NULL,
    invoice_number  VARCHAR(64),
    invoice_date    DATE,
    contract        VARCHAR(100),
    payment_kind    VARCHAR(8)     NOT NULL CHECK (payment_kind IN ('CREDIT', 'PREPAID', 'CASH')),
    expected_date   DATE,
    due_date        DATE,
    due_manual      BOOLEAN        NOT NULL DEFAULT false,
    note            VARCHAR(500),
    status          VARCHAR(16)    NOT NULL DEFAULT 'DRAFT'
                                   CHECK (status IN ('DRAFT', 'IN_TRANSIT', 'PARTIAL', 'RECEIVED', 'CANCELLED')),
    total_amount    NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    debt_amount     NUMERIC(18, 2) CHECK (debt_amount >= 0),
    created_by      BIGINT         NOT NULL REFERENCES employee (id),
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    approved_by     BIGINT         REFERENCES employee (id),
    approved_at     TIMESTAMPTZ,
    closed_by       BIGINT         REFERENCES employee (id),
    closed_at       TIMESTAMPTZ,
    cancelled_by    BIGINT         REFERENCES employee (id),
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   VARCHAR(300),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    version         BIGINT         NOT NULL DEFAULT 0,
    CHECK (payment_kind <> 'CREDIT' OR status IN ('DRAFT', 'CANCELLED') OR due_date IS NOT NULL),
    CHECK (status IN ('DRAFT', 'CANCELLED') OR (approved_at IS NOT NULL AND debt_amount IS NOT NULL)),
    CHECK (status <> 'CANCELLED' OR (cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL))
);
CREATE INDEX expected_receipt_branch_idx ON expected_receipt (branch_id, created_at DESC);
CREATE INDEX expected_receipt_supplier_idx ON expected_receipt (supplier_id, branch_id);
CREATE INDEX expected_receipt_open_idx ON expected_receipt (warehouse_id) WHERE status IN ('IN_TRANSIT', 'PARTIAL');

CREATE TABLE expected_receipt_line (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expected_receipt_id  BIGINT         NOT NULL REFERENCES expected_receipt (id),
    line_no              INTEGER        NOT NULL CHECK (line_no > 0),
    product_id           BIGINT         NOT NULL REFERENCES product (id),
    qty                  INTEGER        NOT NULL CHECK (qty > 0),
    -- Narx — tannarx: ko'rish huquqisiz xodim (Ombor mudiri) kiritmaydi; «qarzga» KK tasdig'ida hamma narx majburiy.
    price                NUMERIC(18, 2) CHECK (price >= 0),
    vat_rate             SMALLINT       CHECK (vat_rate >= 0 AND vat_rate <= 100),
    batch_number         VARCHAR(64),
    expiry_date          DATE,
    -- Qabul qilingan (kirimlar o'tkazilganda oshadi) va hisobdan chiqarilgan (kam / shikastlangan — qarz kamaygan) soni.
    received_qty         INTEGER        NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
    written_off_qty      INTEGER        NOT NULL DEFAULT 0 CHECK (written_off_qty >= 0),
    UNIQUE (expected_receipt_id, line_no)
);
CREATE INDEX expected_receipt_line_doc_idx ON expected_receipt_line (expected_receipt_id);
CREATE INDEX expected_receipt_line_product_idx ON expected_receipt_line (product_id);

-- Yuk xati fayli (PDF / rasm) — bazada (Railway diskiga ishonilmaydi), faqat qo'shiladi.
CREATE TABLE expected_receipt_file (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expected_receipt_id  BIGINT        NOT NULL REFERENCES expected_receipt (id),
    file_name            VARCHAR(200)  NOT NULL,
    content_type         VARCHAR(40)   NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    size_bytes           INTEGER       NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    data                 BYTEA         NOT NULL,
    created_by           BIGINT        NOT NULL REFERENCES employee (id),
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX expected_receipt_file_doc_idx ON expected_receipt_file (expected_receipt_id, id DESC);
CREATE TRIGGER expected_receipt_file_append_only BEFORE UPDATE OR DELETE ON expected_receipt_file
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- Kirim qaysi KK dan tuzilgan (qisman kelish — bitta KK dan bir nechta kirim).
ALTER TABLE receipt ADD COLUMN expected_receipt_id BIGINT REFERENCES expected_receipt (id);
CREATE INDEX receipt_expected_idx ON receipt (expected_receipt_id) WHERE expected_receipt_id IS NOT NULL;

-- Himoya: KK o'chirilmaydi; yakunlangan (Qabul qilindi / Bekor qilingan) o'zgarmaydi; tasdiqlangandan keyin yetkazib beruvchi,
-- ombor, raqam, qarz summasi o'zgarmaydi. Qatorlar tarkibi — faqat qoralamada; qabul soni — faqat Yo'lda / Qisman holatida.
CREATE FUNCTION medix_expected_receipt_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    doc_status VARCHAR(16);
BEGIN
    IF TG_TABLE_NAME = 'expected_receipt' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Kutilayotgan kirim o''chirilmaydi' USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status IN ('RECEIVED', 'CANCELLED') THEN
            RAISE EXCEPTION 'Kutilayotgan kirim % yakunlangan: o''zgartirib bo''lmaydi', OLD.number USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status <> 'DRAFT' AND (NEW.supplier_id <> OLD.supplier_id OR NEW.warehouse_id <> OLD.warehouse_id
                OR NEW.number <> OLD.number OR NEW.debt_amount IS DISTINCT FROM OLD.debt_amount
                OR NEW.total_amount <> OLD.total_amount OR NEW.payment_kind <> OLD.payment_kind) THEN
            RAISE EXCEPTION 'Kutilayotgan kirim % tasdiqlangan: asosiy maydonlarni o''zgartirib bo''lmaydi', OLD.number
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;
    SELECT status INTO doc_status FROM expected_receipt WHERE id = COALESCE(NEW.expected_receipt_id, OLD.expected_receipt_id);
    IF TG_OP = 'UPDATE' AND doc_status IN ('IN_TRANSIT', 'PARTIAL') AND NEW.product_id = OLD.product_id AND NEW.qty = OLD.qty
            AND NEW.price IS NOT DISTINCT FROM OLD.price AND NEW.line_no = OLD.line_no THEN
        RETURN NEW;
    END IF;
    IF doc_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Kutilayotgan kirim qatorlari faqat qoralamada o''zgaradi (holat: %)', doc_status
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER expected_receipt_locked BEFORE UPDATE OR DELETE ON expected_receipt
    FOR EACH ROW EXECUTE FUNCTION medix_expected_receipt_locked();
CREATE TRIGGER expected_receipt_line_locked BEFORE INSERT OR UPDATE OR DELETE ON expected_receipt_line
    FOR EACH ROW EXECUTE FUNCTION medix_expected_receipt_locked();

-- Ruxsatlar: ko'rish (Direktor, Admin, Filial rahbari, Ombor mudiri, Xarid, Buxgalter, Operator), yaratish va tasdiqlash /
-- bekor qilish (Direktor, Admin, Filial rahbari, Ombor mudiri).
INSERT INTO permission (key, module, description, grp, kind, page) VALUES
    ('kk.view', 'kk', 'Kutilayotgan kirim: koʻrish', 'wh', 'view', 'kk'),
    ('kk.create', 'kk', 'Kutilayotgan kirim: yaratish va tahrirlash', 'wh', 'create', 'kk'),
    ('kk.approve', 'kk', 'Kutilayotgan kirim: tasdiqlash (qarz yoziladi), bekor qilish', 'wh', 'approve', 'kk');
INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, k.key FROM role r CROSS JOIN (VALUES ('kk.view')) k (key)
WHERE r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASER', 'ACCOUNTANT', 'OPERATOR');
INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, k.key FROM role r CROSS JOIN (VALUES ('kk.create'), ('kk.approve')) k (key)
WHERE r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER');
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, k.key FROM role r CROSS JOIN (VALUES ('kk.view')) k (key)
WHERE r.system AND r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASER', 'ACCOUNTANT', 'OPERATOR');
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, k.key FROM role r CROSS JOIN (VALUES ('kk.create'), ('kk.approve')) k (key)
WHERE r.system AND r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER');
