-- Real vaqt signallari (V32 davomi): ko'chirish hujjatlari — «transfers» mavzusi. Ombor mudiri panelidagi «Ko'chirish qabuli»
-- va Zona / Ombor ko'chirishlari sahifalari jo'natish, qabul, tasdiq paytida darhol yangilanadi.
CREATE TRIGGER warehouse_transfer_live AFTER INSERT OR UPDATE ON warehouse_transfer
    FOR EACH ROW EXECUTE FUNCTION medix_live_signal('transfers');

CREATE TRIGGER zone_transfer_live AFTER INSERT OR UPDATE ON zone_transfer
    FOR EACH ROW EXECUTE FUNCTION medix_live_signal('transfers');
