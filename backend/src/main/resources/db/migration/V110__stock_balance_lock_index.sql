-- S1 yuklama sinovi (22.11.2026): zahira paytida mahsulot qoldiq qatorlarini qulflash
-- (StockReservations: «WHERE warehouse_id = :w AND product_id = :p … FOR UPDATE») indeks ishlata olmasdi —
-- mavjud indekslar qisman (WHERE qty > 0), soʻrovda bu shart yoʻq → har buyurtma qatori uchun butun jadval skani
-- qulf ostida (480 ming qatorda 27 ms → 0,16 ms; yuklamada 108 ms va qulf kutish).
CREATE INDEX stock_balance_wh_product_idx ON stock_balance (warehouse_id, product_id);
