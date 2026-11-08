-- Narxlar → «Narx turlari» yorlig'i (prototip `Prices`): muqobil nom (masalan, SmartUp'dagi nomi) — ma'lumot uchun.
ALTER TABLE price_type ADD COLUMN alt_name VARCHAR(100);
