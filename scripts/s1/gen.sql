-- S1: sintetik hajm generatori (faqat mahalliy/CI sinov bazasi uchun, PRODUCTION'DA ISHLATILMAYDI).
-- Ishlatish: psql -v days=1460 -v opd=1500 -v lpo=15 -f scripts/s1/gen.sql
-- Model (S1 taxmini): 4 filial, 150 xodim, 15 000 mahsulot, 5 000 mijoz + 300 YB,
-- kuniga :opd buyurtma × :lpo qator, :days kun. Triggerlar/FK oʻchiriladi (session_replication_role=replica).
\set ON_ERROR_STOP 1
\timing on
SET session_replication_role = replica;
SET synchronous_commit = off;

INSERT INTO company (id, name) OVERRIDING SYSTEM VALUE VALUES (1, 'S1 Demo') ON CONFLICT DO NOTHING;
INSERT INTO branch (id, company_id, code, name, legal_name, tin) OVERRIDING SYSTEM VALUE
SELECT b, 1, (ARRAY['TSH','SAM','FAR','AND'])[b], 'Filial ' || b, 'MCHJ ' || b, lpad((100000000 + b)::text, 9, '0')
FROM generate_series(1, 4) b;
INSERT INTO region (id, name) OVERRIDING SYSTEM VALUE SELECT r, 'Hudud ' || r FROM generate_series(1, 14) r ON CONFLICT DO NOTHING;
INSERT INTO warehouse (id, branch_id, name) OVERRIDING SYSTEM VALUE
SELECT w, (w - 1) / 2 + 1, 'Ombor ' || w FROM generate_series(1, 8) w;
-- har omborda: 1 MAIN (sotuvga), 2 RECEIVING, 3 SHIPPING
INSERT INTO zone (id, warehouse_id, type, name, sellable) OVERRIDING SYSTEM VALUE
SELECT (w - 1) * 3 + z, w, (ARRAY['MAIN','RECEIVING','SHIPPING'])[z], 'Zona ' || z, z = 1
FROM generate_series(1, 8) w, generate_series(1, 3) z;
INSERT INTO employee (id, login, full_name, role_id, branch_id, password_hash, all_branches) OVERRIDING SYSTEM VALUE
SELECT e, 's1user' || e, 'Xodim ' || e, (SELECT min(id) FROM role), (e - 1) % 4 + 1, 'x', e <= 3
FROM generate_series(1, 150) e;

INSERT INTO product (id, code, name, unit_id, vat_rate, active, search_text, marked, pack_qty, per_pack) OVERRIDING SYSTEM VALUE
SELECT p, (10000000 + p)::text, 'Dori ' || p || ' ' || md5(p::text), (SELECT min(id) FROM unit), 12, true,
       lower('dori ' || p || ' ' || md5(p::text)), p % 3 = 0, 1, 1
FROM generate_series(1, 15000) p;
INSERT INTO counterparty (id, tin, name, is_customer, is_supplier, region_id, search_text, blocked, active, kind) OVERRIDING SYSTEM VALUE
SELECT c, lpad((200000000 + c)::text, 9, '0'), CASE WHEN c <= 5000 THEN 'Apteka ' ELSE 'Yetkazuvchi ' END || c || ' ' || md5(c::text),
       c <= 5000, c > 5000, c % 14 + 1, lower('apteka ' || c || ' ' || md5(c::text)), false, true,
       CASE WHEN c <= 5000 THEN 'PHARMACY' ELSE 'DISTRIBUTOR' END
FROM generate_series(1, 5300) c;
INSERT INTO counterparty_branch_terms (counterparty_id, branch_id, credit_limit, payment_days)
SELECT c, b, 50000000, 30 FROM generate_series(1, 5000) c, generate_series(1, 4) b;

-- partiyalar: har mahsulotga 8 ta
INSERT INTO batch (id, product_id, number, expiry_date, cost, source_type) OVERRIDING SYSTEM VALUE
SELECT (p - 1) * 8 + k, p, 'S' || p || '-' || k, date '2027-01-01' + k * 90, 10000 + (p % 500) * 100, 'RECEIPT'
FROM generate_series(1, 15000) p, generate_series(1, 8) k;
-- qoldiq: har ombor MAIN zonasida mahsulotning 4 ta partiyasi (480 000 qator)
INSERT INTO stock_balance (zone_id, batch_id, product_id, warehouse_id, branch_id, qty)
SELECT (w - 1) * 3 + 1, (p - 1) * 8 + k, p, w, (w - 1) / 2 + 1, 10 + (p * k) % 500
FROM generate_series(1, 8) w, generate_series(1, 15000) p, generate_series(1, 4) k;

-- buyurtmalar
INSERT INTO sales_order (id, number, branch_id, warehouse_id, customer_id, order_date, delivery_type, delivery_date, payment_type,
                         status, total, created_by, created_at, status_changed_at, updated_at, version, codes_owner, cancel_reason)
OVERRIDING SYSTEM VALUE
SELECT o, 'BY-' || (ARRAY['TSH','SAM','FAR','AND'])[(o % 4) + 1] || '-' || lpad(o::text, 7, '0'),
       (o % 4) + 1, (o % 4) * 2 + 1 + (o / 7) % 2, (o::bigint * 7919) % 5000 + 1,
       d, CASE WHEN o % 10 = 0 THEN 'PICKUP' ELSE 'DELIVERY' END, d + 1,
       (ARRAY['CASH','TRANSFER','ONLINE'])[o % 3 + 1],
       CASE WHEN d >= current_date - 1 THEN (ARRAY['DRAFT','QUEUED','PICKING','MARKING','CHECKING','IN_TRANSIT'])[o % 6 + 1]
            WHEN o % 50 = 0 THEN 'CANCELLED' ELSE 'DELIVERED' END,
       1500000 + (o % 1000) * 1000, (o % 150) + 1, d + time '09:00' + (o % 480) * interval '1 minute',
       d + time '18:00', d + time '18:00', 0, 'CUSTOMER',
       CASE WHEN d < current_date - 1 AND o % 50 = 0 THEN 's1' END
FROM (SELECT o, current_date - :days + (o - 1) / :opd AS d FROM generate_series(1, :days * :opd) o) s;

INSERT INTO sales_order_line (id, order_id, line_no, product_id, qty, price, list_price)
OVERRIDING SYSTEM VALUE
SELECT (o - 1) * :lpo + n, o, n, ((o * 31 + n * 7919) % 15000) + 1, 1 + (o + n) % 20, 25000, 25000
FROM generate_series(1, :days * :opd) o, generate_series(1, :lpo) n;

-- sotuv (yetkazilgan buyurtmalar) va sotuv qatorlari
INSERT INTO sale (id, number, invoice_number, order_id, branch_id, warehouse_id, customer_id, sale_date, total, vat_total, cost_total,
                  due_date, status, created_by, created_at)
OVERRIDING SYSTEM VALUE
SELECT id, 'SV-' || id, 'HF-' || id, id, branch_id, warehouse_id, customer_id, order_date, total, total * 12 / 112, total * 0.8,
       order_date + 30, 'POSTED', created_by, created_at
FROM sales_order WHERE status = 'DELIVERED';

INSERT INTO sale_line (id, sale_id, order_line_id, product_id, batch_id, qty, price, amount, vat_rate, vat_amount, cost)
OVERRIDING SYSTEM VALUE
SELECT l.id, l.order_id, l.id, l.product_id, (l.product_id - 1) * 8 + 1 + l.id % 4, l.qty, l.price, l.qty * l.price, 12,
       l.qty * l.price * 12 / 112, 20000
FROM sales_order_line l JOIN sale s ON s.id = l.order_id;

-- ombor jurnali: har sotuv qatori uchun chiqim (−) + har 5-qator uchun kirim (+)
INSERT INTO stock_move (id, occurred_at, branch_id, warehouse_id, zone_id, product_id, batch_id, qty, doc_type, doc_id, doc_number, employee_id)
OVERRIDING SYSTEM VALUE
SELECT sl.id, s.created_at, s.branch_id, s.warehouse_id, (s.warehouse_id - 1) * 3 + 1, sl.product_id, sl.batch_id, -sl.qty, 'SV', s.id, s.number, s.created_by
FROM sale_line sl JOIN sale s ON s.id = sl.sale_id;
INSERT INTO stock_move (id, occurred_at, branch_id, warehouse_id, zone_id, product_id, batch_id, qty, doc_type, doc_id, doc_number, employee_id)
OVERRIDING SYSTEM VALUE
SELECT 1000000000 + sl.id, s.created_at - interval '3 days', s.branch_id, s.warehouse_id, (s.warehouse_id - 1) * 3 + 2, sl.product_id, sl.batch_id,
       sl.qty * 5, 'KR', s.id, 'KR-' || s.id, s.created_by
FROM sale_line sl JOIN sale s ON s.id = sl.sale_id WHERE sl.id % 5 = 0;

-- qarz jurnali: sotuv (+) va toʻlov (−)
INSERT INTO party_ledger (id, occurred_at, branch_id, counterparty_id, side, amount, due_date, doc_type, doc_id, doc_number, employee_id)
OVERRIDING SYSTEM VALUE
SELECT s.id, s.created_at, s.branch_id, s.customer_id, 'CUSTOMER', s.total, s.due_date, 'SV', s.id, s.number, s.created_by FROM sale s;
INSERT INTO party_ledger (id, occurred_at, branch_id, counterparty_id, side, amount, doc_type, doc_id, doc_number, employee_id)
OVERRIDING SYSTEM VALUE
SELECT 1000000000 + s.id, s.created_at + interval '20 days', s.branch_id, s.customer_id, 'CUSTOMER', -s.total, 'MT', s.id, 'MT-' || s.id, s.created_by
FROM sale s WHERE s.sale_date < current_date - 30 OR s.id % 3 = 0;

-- markirovka kodlari: belgilangan mahsulotlar (har 3-chi), har qatorga qty ta kod (dona)
INSERT INTO sales_order_mark (id, order_id, line_id, batch_id, gtin, serial, batch_no, kind, raw, status, scanned_by, scanned_at, closed_at, units)
OVERRIDING SYSTEM VALUE
SELECT row_number() OVER (), l.order_id, l.id, (l.product_id - 1) * 8 + 1, lpad(l.product_id::text, 14, '0'),
       left(md5(l.id::text || '-' || k), 13), 'S' || l.product_id, 'D', '01' || lpad(l.product_id::text, 14, '0') || '21' || left(md5(l.id::text || '-' || k), 13),
       'SOLD', 1, now(), now(), 1
FROM sales_order_line l, generate_series(1, l.qty) k WHERE l.product_id % 3 = 0 AND l.order_id % :markdiv = 0;

SET session_replication_role = origin;
ANALYZE;
