-- O10b/c (egasi 13.11.2026): markirovka kodlarining egasi va «Zaxira kodlar».
-- Kodlar egasi: CUSTOMER — mijoz nomiga, RESERVE — zaxira kodlarga. NULL — to'lov turidan (TRANSFER → CUSTOMER, qolgani → RESERVE).
ALTER TABLE sales_order ADD COLUMN codes_owner VARCHAR(10) CHECK (codes_owner IN ('CUSTOMER', 'RESERVE'));
COMMENT ON COLUMN sales_order.codes_owner IS 'O10b: kodlar egasi qo''lda tanlangan (NULL — to''lov turi bo''yicha standart)';

-- Yetkazilmagan / qaytgan tovar kodlari — «Qaytarilgan» (RETURNED); kod bo'shaydi (takror tekshiruvida hisoblanmaydi).
ALTER TABLE sales_order_mark DROP CONSTRAINT IF EXISTS sales_order_mark_status_check;
ALTER TABLE sales_order_mark ADD CONSTRAINT sales_order_mark_status_check
    CHECK (status IN ('ACTIVE', 'REMOVED', 'RELEASED', 'SOLD', 'RETURNED'));

CREATE OR REPLACE FUNCTION medix_sales_order_mark_guard() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Markirovka kodi oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.order_id <> OLD.order_id OR NEW.line_id <> OLD.line_id OR NEW.batch_id <> OLD.batch_id OR NEW.gtin <> OLD.gtin
        OR NEW.serial <> OLD.serial OR NEW.raw <> OLD.raw OR NEW.kind <> OLD.kind OR NEW.scanned_by <> OLD.scanned_by
        OR NEW.scanned_at <> OLD.scanned_at THEN
        RAISE EXCEPTION 'Markirovka kodi maydonlari oʻzgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status <> 'ACTIVE' AND NOT (OLD.status = 'SOLD' AND NEW.status IN ('RELEASED', 'RETURNED')) THEN
        RAISE EXCEPTION 'Yopilgan markirovka kodi oʻzgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- Zaxira kodlar: «Zaxira kodlarga» egali buyurtma yetkazilganda uning kodlari shu yerga tushadi.
CREATE TABLE reserve_code (
    id          BIGSERIAL PRIMARY KEY,
    mark_id     BIGINT       NOT NULL UNIQUE REFERENCES sales_order_mark (id),
    branch_id   BIGINT       NOT NULL REFERENCES branch (id),
    status      VARCHAR(12)  NOT NULL DEFAULT 'IN_RESERVE' CHECK (status IN ('IN_RESERVE', 'USED', 'WRITTEN_OFF')),
    note        VARCHAR(300),
    changed_by  BIGINT       REFERENCES employee (id),
    changed_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (status = 'IN_RESERVE' OR (note IS NOT NULL AND changed_by IS NOT NULL AND changed_at IS NOT NULL))
);
CREATE INDEX reserve_code_branch_idx ON reserve_code (branch_id, status, created_at DESC);

-- Faqat «Zaxirada» dan bir marta o'tadi (Ishlatildi / Hisobdan chiqarildi — yakuniy), o'chirilmaydi.
CREATE FUNCTION medix_reserve_code_guard() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Zaxira kodi oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status <> 'IN_RESERVE' OR NEW.mark_id <> OLD.mark_id OR NEW.branch_id <> OLD.branch_id THEN
        RAISE EXCEPTION 'Yopilgan zaxira kodi oʻzgarmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER reserve_code_guard BEFORE UPDATE OR DELETE ON reserve_code
    FOR EACH ROW EXECUTE FUNCTION medix_reserve_code_guard();

-- Ruxsatlar: kodlar egasini o'zgartirish (Ombor mudiri, Filial rahbari, Direktor, Admin); zaxira kodlar (+ Buxgalter).
INSERT INTO permission (key, module, description, grp, kind, page) VALUES
    ('marking.owner', 'marking', 'Markirovka: kodlar egasini oʻzgartirish (mijoz / zaxira)', 'wh', 'special', 'marking'),
    ('zcodes.view', 'zcodes', 'Zaxira kodlar: koʻrish', 'wh', 'view', 'zcodes'),
    ('zcodes.edit', 'zcodes', 'Zaxira kodlar: ishlatildi / hisobdan chiqarish', 'wh', 'special', 'zcodes');
INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, k.key FROM role r CROSS JOIN (VALUES ('marking.owner'), ('zcodes.view'), ('zcodes.edit')) k(key)
WHERE r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'ACCOUNTANT')
  AND NOT (r.code = 'ACCOUNTANT' AND k.key = 'marking.owner');
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, k.key FROM role r CROSS JOIN (VALUES ('marking.owner'), ('zcodes.view'), ('zcodes.edit')) k(key)
WHERE r.system AND r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'ACCOUNTANT')
  AND NOT (r.code = 'ACCOUNTANT' AND k.key = 'marking.owner');
