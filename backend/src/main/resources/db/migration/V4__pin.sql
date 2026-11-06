-- MEDIX — PIN (SPEC 13: rahbar tasdiqlari va kassa farqi uchun ikkinchi tasdiq).
-- Ketma-ket 5 xato urinishdan keyin PIN 15 daqiqaga qulflanadi (taxmin qilishdan himoya).
ALTER TABLE employee
    ADD COLUMN pin_failed_count INTEGER NOT NULL DEFAULT 0 CHECK (pin_failed_count >= 0),
    ADD COLUMN pin_locked_until TIMESTAMPTZ,
    ADD COLUMN pin_set_at       TIMESTAMPTZ;

COMMENT ON COLUMN employee.pin_locked_until IS 'Shu vaqtgacha PIN qabul qilinmaydi (ketma-ket xato urinishlar)';
