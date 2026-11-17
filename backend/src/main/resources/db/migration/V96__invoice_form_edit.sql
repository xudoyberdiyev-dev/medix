-- O18 (egasi 17.11.2026): 5 xil faktura (Excel) — chiqarishdan oldin qo'lda tuzatish. Tuzatishlar FAQAT faylga ta'sir qiladi
-- (buyurtma, qoldiq, qarz o'zgarmaydi); oxirgi holat buyurtmaga saqlanadi va barcha 5 turda umumiy. «Asl holatiga» — o'chiriladi.
CREATE TABLE order_invoice_edit (
    order_id    BIGINT       PRIMARY KEY REFERENCES sales_order (id),
    updated_by  BIGINT       NOT NULL REFERENCES employee (id),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE order_invoice_edit_row (
    order_id      BIGINT          NOT NULL REFERENCES order_invoice_edit (order_id) ON DELETE CASCADE,
    pos           INTEGER         NOT NULL CHECK (pos > 0),
    area          VARCHAR(60),
    farm_id       VARCHAR(50),
    name          VARCHAR(300)    NOT NULL CHECK (btrim(name) <> ''),
    manufacturer  VARCHAR(200),
    series        VARCHAR(60),
    qty           INTEGER         NOT NULL CHECK (qty >= 0),
    expiry        VARCHAR(20),
    unit          VARCHAR(20),
    price         NUMERIC(18, 2)  NOT NULL CHECK (price >= 0),
    PRIMARY KEY (order_id, pos)
);

-- Ruxsat: faktura tahriri (Direktor, Admin, Filial rahbari, Operator, Buxgalter); yig'uvchi faqat yuklab oladi.
INSERT INTO permission (key, module, description, grp, kind, page) VALUES
    ('invoices.edit', 'invoices', 'Fakturalar: chiqarishdan oldin qoʻlda tuzatish (faqat faylga)', 'money', 'special', 'invoices');
INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, 'invoices.edit' FROM role r WHERE r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'OPERATOR', 'ACCOUNTANT');
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, 'invoices.edit' FROM role r WHERE r.system AND r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'OPERATOR', 'ACCOUNTANT');
