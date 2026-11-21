-- S1 (22.11.2026): audit jurnali «Nazoratdagi» koʻrinishi. Avval belgi har soʻrovda har yozuv uchun qayta hisoblanardi
-- (mahsulot / zona / buyurtma qatorlari / kirim qatorlari): sintetik hajmda «oxirgi 7 kun» 1,2 s, 30 kun 5,3 s, 1 yil 63 s.
-- Endi belgi yozuv paytida (BEFORE INSERT) bir marta yoziladi: amal bajarilgan paytdagi holat (keyin mahsulot nazoratdan
-- chiqarilsa ham, oʻsha amal nazoratdagi tovar bilan qilingan boʻlib qoladi).

ALTER TABLE audit_log ADD COLUMN controlled BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN audit_log.controlled IS 'Nazoratdagi tovar bilan bogʻliq amal (yozuv paytida: mahsulot/zona/buyurtma/kirim)';

CREATE FUNCTION yuzplus_audit_controlled(p_type VARCHAR, p_id VARCHAR) RETURNS BOOLEAN AS $$
DECLARE
    eid BIGINT := CASE WHEN p_id ~ '^[0-9]{1,18}$' THEN CAST(p_id AS BIGINT) END;
BEGIN
    IF eid IS NULL THEN
        RETURN false;
    END IF;
    RETURN CASE p_type
        WHEN 'product' THEN EXISTS (SELECT 1 FROM product p WHERE p.id = eid AND p.controlled)
        WHEN 'zone' THEN EXISTS (SELECT 1 FROM zone z WHERE z.id = eid AND z.controlled)
        WHEN 'sales_order' THEN EXISTS (SELECT 1 FROM sales_order_line l JOIN product p ON p.id = l.product_id
                                        WHERE l.order_id = eid AND p.controlled)
        WHEN 'receipt' THEN EXISTS (SELECT 1 FROM receipt_line l JOIN product p ON p.id = l.product_id
                                    WHERE l.receipt_id = eid AND p.controlled)
        ELSE false
    END;
END;
$$ LANGUAGE plpgsql STABLE;

-- Mavjud yozuvlar (jurnal oʻzgartirilmaydigan — faqat shu ustun uchun trigger vaqtincha oʻchiriladi)
ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only;
UPDATE audit_log SET controlled = true
WHERE entity_type IN ('product', 'zone', 'sales_order', 'receipt') AND yuzplus_audit_controlled(entity_type, entity_id);
ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only;

CREATE FUNCTION yuzplus_audit_controlled_flag() RETURNS trigger AS $$
BEGIN
    NEW.controlled := NEW.entity_type IN ('product', 'zone', 'sales_order', 'receipt')
                      AND yuzplus_audit_controlled(NEW.entity_type, NEW.entity_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_controlled BEFORE INSERT ON audit_log
    FOR EACH ROW EXECUTE FUNCTION yuzplus_audit_controlled_flag();

CREATE INDEX audit_log_controlled_idx ON audit_log (occurred_at DESC) WHERE controlled;
