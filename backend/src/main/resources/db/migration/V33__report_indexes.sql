-- T12-audit №26 (tezlik): hisobotdan hujjatlarga o'tish va «Mening buyurtmalarim» uchun indekslar.
-- Buyurtmalar ro'yxati: ?soldFrom/soldTo — EXISTS (sales_return.order_id); ?mine / ?operatorId — kiritgan xodim bo'yicha.
CREATE INDEX sales_return_order_idx ON sales_return (order_id);
CREATE INDEX sales_order_created_by_idx ON sales_order (created_by, created_at DESC);
