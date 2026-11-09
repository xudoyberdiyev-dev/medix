-- Kirishdagi noto'g'ri urinishlar (prototip LoginScreen: «Qolgan urinishlar: N», «Juda ko'p noto'g'ri urinish»).
-- Login matni bo'yicha (mavjud bo'lmagan login ham) — javob bir xil bo'lgani uchun loginlar borligi oshkor qilinmaydi.
CREATE TABLE login_throttle (
    login        TEXT        PRIMARY KEY,
    failed_count INTEGER     NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    locked_until TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
