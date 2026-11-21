# S1 — texnik audit, 1-qism (21.11.2026 kechki oyna)

## Topilma 1 (YUQORI xavf, tuzatildi — V105): qatorni oʻchirishdagi FK tekshiruvi indekssiz

- Qoralama buyurtma saqlanganda `Orders.update` barcha qatorlarni oʻchirib qayta yozadi (`DELETE FROM sales_order_line WHERE order_id = …`).
- PostgreSQL har oʻchirilgan qator uchun unga bogʻlangan jadvallarni tekshiradi: `sales_order_pick.line_id`, `sales_order_pick_return.line_id`, `sales_order_mark.line_id`, `sale_line.order_line_id`. Bu ustunlarda indeks yoʻq edi → har qatorga toʻliq skan.
- Oʻlchov (mahalliy PostgreSQL 16, `sales_order_pick` da 3 mln qator, 15 qatorli qoralama, bitta jadval): **indekssiz 3,25 s → indeks bilan 2,6 ms**. 4 jadval va 4 yillik hajm (~33 mln qator) da bitta qoralamani saqlash **daqiqalab** choʻzilardi.
- Xuddi shunday: kirim qatori ↔ `supplier_return_line.receipt_line_id`.
- Tuzatish: `V105__fk_line_indexes.sql` (5 ta indeks).

## Kuzatuv: indekssiz FK lar (247 ta)

Koʻpchiligi maʼlumotnoma jadvallariga (xodim, filial, ombor, zona, narx turi) — ular deyarli oʻchirilmaydi, shuning uchun hozircha xavfsiz. Toʻliq roʻyxat va hisobot soʻrovlari (`product_id` boʻyicha mahsulot tarixi va h.k.) — S1 ning keyingi qismida sintetik 4 yillik hajm bilan `EXPLAIN (ANALYZE, BUFFERS)` orqali tekshiriladi; indeks faqat oʻlchov koʻrsatsa qoʻshiladi (har indeks yozishni sekinlashtiradi).

Tekshirish soʻrovi: barcha `FOREIGN KEY` lar uchun birinchi ustunlari mos keladigan indeks bormi (`pg_constraint` × `pg_index`).
