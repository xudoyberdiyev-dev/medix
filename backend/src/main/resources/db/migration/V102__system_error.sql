-- P4: ushlanmagan server xatolari (5xx) — Direktor uchun «Tizim holati» va kunlik Telegram xulosasi.
-- Faqat texnik maʼlumot (metod, yoʻl, istisno turi, qisqa matn); 30 kundan eskilari har kecha oʻchiriladi.
CREATE TABLE system_error (
    id          BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    method      VARCHAR(10)  NOT NULL,
    path        VARCHAR(300) NOT NULL,
    exception   VARCHAR(200) NOT NULL,
    message     VARCHAR(500)
);

CREATE INDEX system_error_occurred_idx ON system_error (occurred_at DESC);
