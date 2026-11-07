-- MEDIX — «Yig'ishga qaytarish» tanlangan qatorlar bo'yicha (SPEC 188): faqat shu qatorlar qayta yig'iladi va markirovka qilinadi,
-- ularning kodlari bekor qilinadi (tarixda qoladi); qolgan qatorlar Jo'natish zonasida, kodlari bilan qoladi.

-- Qaytarilgan qator (eski yozuvlarda — NULL: butun buyurtma qaytarilgan).
ALTER TABLE sales_order_pick_return
    ADD COLUMN line_id BIGINT REFERENCES sales_order_line (id);

-- Qayta yig'iladigan qatorlar: NULL — butun buyurtma (oddiy holat); hisobdan o'tkazilganda tozalanadi.
ALTER TABLE sales_order
    ADD COLUMN repick_line_ids BIGINT[];
