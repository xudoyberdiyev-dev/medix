-- O10d (egasi 13.11.2026): buxgalter faktura navbati.
-- Buyurtma «Yuklanmoqda» ga o'tganda (kodlar «Mijoz nomiga» yoki to'lov — Perechisleniye) parallel faktura vazifasi ochiladi:
-- «Faktura yuborilishi kerak» (PENDING) → «Yuborildi» (SENT). Buyurtma zanjirini to'xtatmaydi.
CREATE TABLE invoice_task (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id         BIGINT       NOT NULL UNIQUE REFERENCES sales_order (id),
    branch_id        BIGINT       NOT NULL REFERENCES branch (id),
    status           VARCHAR(8)   NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT')),
    opened_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    efaktura_number  VARCHAR(60),
    efaktura_date    DATE,
    sent_by          BIGINT       REFERENCES employee (id),
    sent_at          TIMESTAMPTZ,
    CHECK (status = 'PENDING' OR (efaktura_number IS NOT NULL AND efaktura_date IS NOT NULL AND sent_by IS NOT NULL AND sent_at IS NOT NULL))
);
CREATE INDEX invoice_task_queue_idx ON invoice_task (branch_id, status, opened_at);

-- «Yuborildi» — yakuniy: qaytarilmaydi, o'chirilmaydi.
CREATE FUNCTION medix_invoice_task_guard() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Faktura vazifasi oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status <> 'PENDING' OR NEW.order_id <> OLD.order_id OR NEW.branch_id <> OLD.branch_id OR NEW.opened_at <> OLD.opened_at THEN
        RAISE EXCEPTION 'Yuborilgan faktura oʻzgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_task_guard BEFORE UPDATE OR DELETE ON invoice_task
    FOR EACH ROW EXECUTE FUNCTION medix_invoice_task_guard();

-- E-faktura va TTN fayllari (PDF/JPG/PNG, ≤ 10 MB) — bazada (Railway diskiga ishonilmaydi). Faqat qo'shiladi;
-- «Yuborildi» da har turdan eng oxirgisi hisobga olinadi.
CREATE TABLE invoice_task_file (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id       BIGINT        NOT NULL REFERENCES invoice_task (id),
    kind          VARCHAR(10)   NOT NULL CHECK (kind IN ('EFAKTURA', 'TTN')),
    file_name     VARCHAR(200)  NOT NULL,
    content_type  VARCHAR(40)   NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    size_bytes    INTEGER       NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    data          BYTEA         NOT NULL,
    created_by    BIGINT        NOT NULL REFERENCES employee (id),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX invoice_task_file_task_idx ON invoice_task_file (task_id, kind, id DESC);
CREATE TRIGGER invoice_task_file_append_only BEFORE UPDATE OR DELETE ON invoice_task_file
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

-- Ruxsatlar: navbatni ko'rish va «Yuborildi» (Buxgalter, Direktor, Admin, Filial rahbari).
INSERT INTO permission (key, module, description, grp, kind, page) VALUES
    ('invoices.view', 'invoices', 'Fakturalar: navbatni koʻrish, HF va kodlarni yuklab olish', 'money', 'view', 'invoices'),
    ('invoices.send', 'invoices', 'Fakturalar: fayl yuklash, «Yuborildi» deb belgilash', 'money', 'special', 'invoices');
INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, k.key FROM role r CROSS JOIN (VALUES ('invoices.view'), ('invoices.send')) k(key)
WHERE r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT');
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, k.key FROM role r CROSS JOIN (VALUES ('invoices.view'), ('invoices.send')) k(key)
WHERE r.system AND r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT');
