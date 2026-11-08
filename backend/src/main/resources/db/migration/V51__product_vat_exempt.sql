-- Mahsulot shakli (prototip «Soliq»): QQS 12% / 0% / «QQSsiz» (ozod). Ozod — stavka 0 bilan birga.
ALTER TABLE product ADD COLUMN vat_exempt BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE product ADD CONSTRAINT product_vat_exempt_rate_ck CHECK (NOT vat_exempt OR vat_rate = 0);
