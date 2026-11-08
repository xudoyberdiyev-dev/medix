-- Egasi qarori (07.11.2026, E6): mashina sig'imi va reysda sig'im tekshiruvi butunlay olib tashlanadi.
-- Mashina kartasida faqat «Muzlatkichi bor / yo'q» belgisi qoladi (faqat ma'lumot, reysga ta'sir qilmaydi).
ALTER TABLE vehicle DROP COLUMN capacity_boxes;
ALTER TABLE vehicle ADD COLUMN has_refrigerator BOOLEAN NOT NULL DEFAULT false;
