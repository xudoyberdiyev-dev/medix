-- MEDIX — E7 (egasi 09.11.2026): buyurtma qatorida chegirma %.
-- price — chegirmadan keyingi (sotuv, hisob-faktura, qarz shundan); list_price — narx turidagi narx (chegirmasiz).
-- Operator 5% gacha o'zi beradi; 5% dan katta — buyurtma Filial rahbari tasdigʻiga ketadi.

ALTER TABLE sales_order_line
    ADD COLUMN discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct < 100),
    ADD COLUMN list_price   NUMERIC(18, 2) CHECK (list_price > 0);

COMMENT ON COLUMN sales_order_line.discount_pct IS 'Qator chegirmasi, %; price = list_price × (100 − %) / 100, HALF_UP';
COMMENT ON COLUMN sales_order_line.list_price IS 'Narx turidagi narx (chegirmasiz); price bilan birga muzlatiladi';

UPDATE sales_order_line SET list_price = price WHERE price IS NOT NULL;

INSERT INTO permission (key, module, description, grp, kind, page)
VALUES ('orders.discount', 'orders', 'Buyurtmalar: chegirma berish', 'sales', 'special', 'orders');

INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, 'orders.discount' FROM role r WHERE r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'OPERATOR');
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, 'orders.discount' FROM role r WHERE r.system AND r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'OPERATOR');

-- E8: kontragent shartlari — mijozning standart chegirmasi (buyurtma qatoriga avtomatik qo'yiladi, E7 qoidalari bilan)
-- va yetkazib beruvchining yetkazish muddati (kun).
ALTER TABLE counterparty_branch_terms
    ADD COLUMN discount_pct           NUMERIC(5, 2) CHECK (discount_pct >= 0 AND discount_pct < 100),
    ADD COLUMN supplier_delivery_days INTEGER CHECK (supplier_delivery_days >= 0 AND supplier_delivery_days <= 365);
