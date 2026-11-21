-- S1 audit, 2-qism (22.11.2026): sintetik 2 yillik hajmda (1,1 mln buyurtma, 16 mln qator) oʻlchangan ogʻir soʻrovlar.
-- Oʻlchovlar va izohlar: docs/notes/S1-audit-2.md

-- Buyurtmalar roʻyxati: standart saralash «kiritilgan vaqti, yangisi tepada» (filial va Direktor doirasi) — 158/960 ms → 2 ms
CREATE INDEX sales_order_branch_created_idx ON sales_order (branch_id, created_at DESC, id DESC);
CREATE INDEX sales_order_created_idx ON sales_order (created_at DESC, id DESC);
-- Buyurtma sanasi filtri («Bugun», davr) — 79 ms → 0,1 ms
CREATE INDEX sales_order_branch_date_idx ON sales_order (branch_id, order_date);
-- Holat yorliqlari va filtr variantlari: jadvalni oʻqimasdan (index-only scan)
CREATE INDEX sales_order_branch_status_cover_idx ON sales_order (branch_id, status) INCLUDE (total, customer_id, created_by);

-- Ctrl+K: hujjat raqami qismi boʻyicha qidiruv (LIKE '%…%') — 1,8–2,3 s → 1–25 ms
CREATE INDEX sales_order_number_trgm_idx ON sales_order USING gin (lower(number) gin_trgm_ops);
CREATE INDEX sale_number_trgm_idx ON sale USING gin (lower(number) gin_trgm_ops);
CREATE INDEX sale_invoice_number_trgm_idx ON sale USING gin (lower(invoice_number) gin_trgm_ops);
CREATE INDEX customer_payment_number_trgm_idx ON customer_payment USING gin (lower(number) gin_trgm_ops);

-- Savdo hisoboti (barcha filiallar): sana boʻyicha
CREATE INDEX sale_date_idx ON sale (sale_date);

-- Savdo hisoboti: berilgan chegirma (E7) har safar sotuv qatorlaridan qayta hisoblanardi (oy: 2,0 s, yil: 17 s).
-- Endi sotuv oʻtkazilganda bir marta yoziladi (oʻsha formula: Σ qty × max(narx turidagi narx − sotuv narxi, 0)).
ALTER TABLE sale ADD COLUMN discount_total NUMERIC(18, 2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN sale.discount_total IS 'Berilgan chegirma (E7): Σ qty × max(coalesce(list_price, price) − price, 0); sotuv oʻtkazilganda yoziladi';
-- Mavjud oʻtkazilgan sotuvlar uchun toʻldirish (bekor qilinganlar hisobotga kirmaydi; sale_locked trigger ularni oʻzgartirishga yoʻl qoʻymaydi)
UPDATE sale s SET discount_total = d.amt
FROM (SELECT sl.sale_id, sum(sl.qty * greatest(coalesce(ol.list_price, sl.price) - sl.price, 0)) AS amt
      FROM sale_line sl JOIN sales_order_line ol ON ol.id = sl.order_line_id
      GROUP BY sl.sale_id) d
WHERE d.sale_id = s.id AND d.amt <> 0 AND s.status = 'POSTED';
