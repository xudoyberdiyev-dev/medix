-- O10a (egasi 13.11.2026): markirovkada Saplayn tekshiruvi qadami.
-- Skanerlangan to'liq kod (kripto-qismi va GS ajratgichi bilan) — Saplayn'da tekshirish uchun eksportga chiqadi.
ALTER TABLE sales_order_mark ADD COLUMN scanned_raw VARCHAR(300);

-- Tekshiruv fayli yuklab olingan payt (yangi kod qabul qilinsa — NULL, qayta yuklab olish kerak)
-- va «Saplayn'da tekshirildi» deb yakunlagan xodim.
ALTER TABLE sales_order
    ADD COLUMN mark_exported_at TIMESTAMPTZ,
    ADD COLUMN mark_verified_by BIGINT REFERENCES employee (id);
