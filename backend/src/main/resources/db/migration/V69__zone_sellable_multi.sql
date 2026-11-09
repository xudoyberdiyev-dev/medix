-- Egasi E12 (09.11.2026): zona darajasida «Sotuvga ochiq» almashtirgichi (faqat Asosiy / Sovuq / Seyf ochilishi mumkin;
-- Qabul, Karantin, Joʻnatish doim yopiq) va bir omborda bir turdagi bir nechta saqlash zonasi (nomi bilan farqlanadi).
ALTER TABLE zone ALTER COLUMN sellable DROP EXPRESSION;
ALTER TABLE zone ADD CONSTRAINT zone_sellable_type_check CHECK (NOT sellable OR type IN ('MAIN', 'COLD', 'SAFE'));

-- Yangi zonada sotuvga ochiqlik koʻrsatilmasa — turidan (oldingi hisoblangan ustun kabi)
CREATE FUNCTION zone_sellable_default() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.sellable IS NULL THEN
        NEW.sellable := NEW.type IN ('MAIN', 'COLD', 'SAFE');
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER zone_sellable_default BEFORE INSERT ON zone FOR EACH ROW EXECUTE FUNCTION zone_sellable_default();

-- Qabul / Karantin / Joʻnatish — omborda bittadan (hujjatlar shu zonani turidan topadi); saqlash zonalari — bir nechta
ALTER TABLE zone DROP CONSTRAINT zone_warehouse_id_type_key;
CREATE UNIQUE INDEX zone_single_flow_type ON zone (warehouse_id, type) WHERE type IN ('RECEIVING', 'QUARANTINE', 'SHIPPING');
COMMENT ON COLUMN zone.sellable IS 'Sotuvga ochiq (zona darajasida, E12); faqat MAIN/COLD/SAFE da true boʻlishi mumkin';
