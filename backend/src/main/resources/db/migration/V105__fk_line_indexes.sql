-- S1 (audit, 21.11): qatorni oʻchirishda FK tekshiruvi uchun indekslar.
-- Qoralama buyurtma saqlanganda barcha qatorlar oʻchirib qayta yoziladi (DELETE FROM sales_order_line WHERE order_id = …):
-- PostgreSQL har oʻchirilgan qator uchun bogʻlangan jadvallarni line_id boʻyicha tekshiradi. Indeks boʻlmasa — har safar
-- toʻliq skan (4 yilda o'n millionlab qator → saqlash daqiqalab). Shu sababli bolalar jadvallarida ustun indekslanadi.
CREATE INDEX IF NOT EXISTS sales_order_pick_line_idx ON sales_order_pick (line_id);
CREATE INDEX IF NOT EXISTS sales_order_pick_return_line_idx ON sales_order_pick_return (line_id);
CREATE INDEX IF NOT EXISTS sales_order_mark_line_idx ON sales_order_mark (line_id);
CREATE INDEX IF NOT EXISTS sale_line_order_line_idx ON sale_line (order_line_id);
-- Kirim qoralamasi qatorlari ham shunday almashtiriladi (YB ga qaytarish qatori kirim qatoriga bogʻlangan)
CREATE INDEX IF NOT EXISTS supplier_return_line_receipt_line_idx ON supplier_return_line (receipt_line_id);
