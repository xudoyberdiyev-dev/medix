-- O15: kirim qatori qaysi KK qatoridan (qabul qilish — KK dan kirim qoralamasi). O'tkazilganda KK qatorining qabul qilingan /
-- hisobdan chiqarilgan soni shu bog'lanish orqali yangilanadi.
ALTER TABLE receipt_line ADD COLUMN expected_line_id BIGINT REFERENCES expected_receipt_line (id);
CREATE INDEX receipt_line_expected_idx ON receipt_line (expected_line_id) WHERE expected_line_id IS NOT NULL;
