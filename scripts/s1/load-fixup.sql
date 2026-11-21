-- S1 yuklama sinovi: gen.sql dan keyin sintetik bazani backend bilan ishlashga tayyorlash
-- (faqat CI/mahalliy sinov bazasi, PRODUCTION'DA ISHLATILMAYDI).
--  1) identity ketma-ketliklari max(id) ga suriladi (gen.sql OVERRIDING SYSTEM VALUE bilan yozgan);
--  2) har mahsulotga har filialda bazaviy narx (buyurtma yaratish uchun);
--  3) gen.sql triggerlarsiz yozgan hosila jadval (V107 party_doc_balance) jurnaldan quriladi;
--  4) xodimlar: sinov paroli, rollar aralashmasi (Operator koʻp), parolni almashtirish talab qilinmaydi.
\set ON_ERROR_STOP 1

DO $$
DECLARE r record; m bigint;
BEGIN
  FOR r IN SELECT c.table_name, c.column_name FROM information_schema.columns c
           WHERE c.table_schema = 'public' AND c.is_identity = 'YES' LOOP
    EXECUTE format('SELECT max(%I) FROM %I', r.column_name, r.table_name) INTO m;
    IF m IS NOT NULL THEN
      PERFORM setval(pg_get_serial_sequence(quote_ident(r.table_name), r.column_name), m);
    END IF;
  END LOOP;
END $$;

INSERT INTO price_change (number, branch_id, status, effective_from, created_by, decided_by, decided_at)
SELECT 'S1-NB-' || b.id, b.id, 'APPROVED', current_date - 400, 1, 1, now() FROM branch b;
INSERT INTO price (product_id, price_type_id, branch_id, effective_from, amount, price_change_id)
SELECT p.id, (SELECT id FROM price_type WHERE code = 'BASE'), pc.branch_id, current_date - 400,
       12000 + (p.id % 500) * 110, pc.id
FROM product p, price_change pc WHERE pc.number LIKE 'S1-NB-%';

TRUNCATE party_doc_balance;
INSERT INTO party_doc_balance (side, branch_id, counterparty_id, doc_type, doc_id, own_rows, own_amount, due_date, first_at, doc_number)
SELECT side, branch_id, counterparty_id, doc_type, doc_id, count(*), sum(amount), min(due_date), min(occurred_at), min(doc_number)
FROM party_ledger WHERE applies_doc_type IS NULL
GROUP BY side, branch_id, counterparty_id, doc_type, doc_id;
INSERT INTO party_doc_balance AS d (side, branch_id, counterparty_id, doc_type, doc_id, applied_amount)
SELECT side, branch_id, counterparty_id, applies_doc_type, applies_doc_id, sum(amount)
FROM party_ledger WHERE applies_doc_type IS NOT NULL
GROUP BY side, branch_id, counterparty_id, applies_doc_type, applies_doc_id
ON CONFLICT (side, branch_id, counterparty_id, doc_type, doc_id) DO UPDATE SET applied_amount = EXCLUDED.applied_amount;

-- parol: S1-yuklama-2026 (bcrypt, faqat sintetik baza)
UPDATE employee e SET
  password_hash = '{bcrypt}$2b$10$HvMAAEJFpl3PaVD62HeqGOAizPs9OCHQ8/mXe6hw0p8p2CemUnQXO',
  must_change_password = false, status = 'ACTIVE', failed_login_count = 0,
  role_id = (SELECT r.id FROM role r WHERE r.code = CASE
      WHEN e.id <= 3 THEN 'DIRECTOR'
      WHEN e.id % 10 = 1 THEN 'ACCOUNTANT'
      WHEN e.id % 10 = 2 THEN 'WAREHOUSE_MANAGER'
      WHEN e.id % 10 = 3 THEN 'BRANCH_MANAGER'
      ELSE 'OPERATOR' END),
  all_branches = e.id <= 3;

ANALYZE price; ANALYZE party_doc_balance; ANALYZE employee;
