-- Bildirishnoma matni o'qilganda o'quvchi tilida chiqishi uchun: kalit va o'rinbosarlar saqlanadi (SPEC 10: uz-Latn, uz-Cyrl, ru).
-- title/body — yozilgan paytdagi o'zbekcha matn (eski yozuvlar va kalitsiz xabarlar uchun zaxira) saqlanib qoladi.
ALTER TABLE notification
    ADD COLUMN text_key  VARCHAR(80),
    ADD COLUMN text_args TEXT;
