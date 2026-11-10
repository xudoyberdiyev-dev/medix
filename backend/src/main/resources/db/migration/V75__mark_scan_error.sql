-- MEDIX — Markirovkachi paneli «Xato urishlar» (prototip MarkerPanel): rad etilgan skanerlashlar jurnali.
-- Faqat qo'shiladi; kodning o'zi saqlanmaydi (faqat xato kaliti), statistika uchun.
CREATE TABLE mark_scan_error (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id     BIGINT       NOT NULL REFERENCES sales_order (id),
    employee_id  BIGINT       NOT NULL REFERENCES employee (id),
    error_key    VARCHAR(64)  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX mark_scan_error_order_idx ON mark_scan_error (order_id, employee_id);
