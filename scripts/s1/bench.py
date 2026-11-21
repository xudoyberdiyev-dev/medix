#!/usr/bin/env python3
"""S1: ogʻir soʻrovlarni sintetik hajmda oʻlchash (EXPLAIN ANALYZE, issiq kesh, 3 marta — mediana).

Soʻrovlar backend koddagi SQL nusxasi (parametrlar qoʻyilgan). Ishlatish:
  python3 scripts/s1/bench.py [filtr_soʻz]  → jadval: nom | ms | eng ogʻir tugun
"""
import re
import subprocess
import sys

PSQL = ["psql", "-h", "/var/tmp", "-p", "55432", "-U", "yuzplus", "-d", "yuzplus", "-At", "-v", "ON_ERROR_STOP=1"]

ORDER_FROM = (" FROM sales_order o JOIN counterparty c ON c.id = o.customer_id JOIN warehouse w ON w.id = o.warehouse_id"
              " JOIN employee e ON e.id = o.created_by")
ORDER_PAGE = """SELECT o.id, o.number, w.name, c.name, o.total, e.full_name,
  (SELECT count(*) FROM sales_order_line l WHERE l.order_id = o.id) AS lines,
  (SELECT r.name FROM region r WHERE r.id = c.region_id) AS region,
  (SELECT full_name FROM employee WHERE id = o.picker_id) AS picker,
  (SELECT d.full_name FROM trip_stop ts JOIN trip t ON t.id = ts.trip_id JOIN employee d ON d.id = t.driver_id
    WHERE ts.order_id = o.id AND ts.active AND t.status <> 'CANCELLED' ORDER BY ts.id DESC LIMIT 1) AS driver""" + ORDER_FROM

SALES_REPORT = """WITH x AS (
  SELECT s.branch_id, s.customer_id, o.created_by, s.sale_date AS d, s.order_id, s.total AS sales, 0 AS returns,
         s.vat_total AS svat, 0 AS rvat, s.cost_total AS cost, o.payment_type, cp.region_id, zt.sales_zone_id AS zone_id,
         s.discount_total AS discount
  FROM sale s JOIN sales_order o ON o.id = s.order_id JOIN counterparty cp ON cp.id = s.customer_id
       LEFT JOIN counterparty_branch_terms zt ON zt.counterparty_id = s.customer_id AND zt.branch_id = s.branch_id
  WHERE s.status = 'POSTED' AND s.sale_date BETWEEN {f} AND current_date {b}
  UNION ALL
  SELECT r.branch_id, r.customer_id, o.created_by, r.return_date, NULL, 0, r.total, 0, r.vat_total, -r.cost_total,
         o.payment_type, cp.region_id, zt.sales_zone_id, 0
  FROM sales_return r JOIN sales_order o ON o.id = r.order_id JOIN counterparty cp ON cp.id = r.customer_id
       LEFT JOIN counterparty_branch_terms zt ON zt.counterparty_id = r.customer_id AND zt.branch_id = r.branch_id
  WHERE r.cancelled_at IS NULL AND r.return_date BETWEEN {f} AND current_date)
SELECT x.customer_id, count(DISTINCT x.order_id), sum(x.sales), sum(x.discount), sum(x.returns), sum(x.cost)
FROM x GROUP BY 1 ORDER BY 3 DESC LIMIT 501"""

DEBTS = """SELECT branch_id, counterparty_id, due_date AS due, open_amount AS open FROM party_doc_balance
WHERE side = 'CUSTOMER' AND own_rows > 0 AND open_amount <> 0 {b}
ORDER BY branch_id, counterparty_id, coalesce(due_date, (first_at AT TIME ZONE 'Asia/Tashkent')::date), first_at, doc_id"""

STOCK = """WITH bal AS (
  SELECT s.product_id, s.batch_id, s.zone_id, s.qty, z.type AS zone_type, z.sellable, b.expiry_date, b.expiry_date < current_date AS expired, b.cost,
         coalesce((SELECT sum(r.qty) FROM stock_reservation r WHERE r.zone_id = s.zone_id AND r.batch_id = s.batch_id AND r.status = 'ACTIVE'), 0) AS res
  FROM stock_balance s JOIN batch b ON b.id = s.batch_id JOIN zone z ON z.id = s.zone_id JOIN product p ON p.id = s.product_id
  WHERE s.qty > 0 {b}),
agg AS (SELECT product_id, sum(qty) AS total, sum(res) AS reserved, sum(CASE WHEN sellable AND NOT expired THEN qty - res ELSE 0 END) AS available,
        count(DISTINCT batch_id) AS batches, min(expiry_date) AS nearest, sum(qty * cost) AS cost_sum FROM bal GROUP BY product_id)
SELECT p.id, p.code, p.name, a.total, a.available FROM product p LEFT JOIN agg a ON a.product_id = p.id
WHERE a.total > 0 ORDER BY p.name, p.id LIMIT 50"""

Q = {
    # Buyurtmalar roʻyxati (Orders.list): bitta sahifa ochilishida 6 ta soʻrov
    "orders.status_tabs.branch": "SELECT o.status, count(*), coalesce(sum(o.total), 0) FROM sales_order o WHERE o.branch_id = 1 GROUP BY o.status",
    "orders.page.branch": ORDER_PAGE + " WHERE o.branch_id = 1 ORDER BY o.created_at DESC, o.id DESC LIMIT 50",
    "orders.page.all": ORDER_PAGE + " WHERE true ORDER BY o.created_at DESC, o.id DESC LIMIT 50",
    "orders.facet_customers.branch": "SELECT c.id, c.name, count(*) FROM sales_order o JOIN counterparty c ON c.id = o.customer_id WHERE o.branch_id = 1 GROUP BY c.id, c.name ORDER BY c.name LIMIT 300",
    "orders.facet_operators.branch": "SELECT e.id, e.full_name, count(*) FROM sales_order o JOIN employee e ON e.id = o.created_by WHERE o.branch_id = 1 GROUP BY e.id, e.full_name ORDER BY e.full_name LIMIT 300",
    "orders.facet_regions.branch": "SELECT r.id, r.name, count(*) FROM sales_order o JOIN counterparty c ON c.id = o.customer_id JOIN region r ON r.id = c.region_id WHERE o.branch_id = 1 GROUP BY r.id, r.name ORDER BY r.name LIMIT 300",
    "orders.status_tabs.all": "SELECT o.status, count(*), coalesce(sum(o.total), 0) FROM sales_order o WHERE true GROUP BY o.status",
    "orders.search_number": ORDER_PAGE + " WHERE o.branch_id = 1 AND (o.number ILIKE '%0123457%' OR c.tin = '0123457' OR c.search_text LIKE '%0123457%') ORDER BY o.created_at DESC LIMIT 50",
    "orders.today_filter": "SELECT o.status, count(*), coalesce(sum(o.total), 0) FROM sales_order o WHERE o.branch_id = 1 AND o.order_date >= current_date AND o.order_date <= current_date GROUP BY o.status",
    # Savdo hisoboti (SalesReport): standart — joriy oy; maksimal — 366 kun
    "report.sales.month.all": SALES_REPORT.format(f="date_trunc('month', current_date)::date", b=""),
    "report.sales.year.all": SALES_REPORT.format(f="current_date - 366", b=""),
    # Mijozlar qarzi (Debts.report) — butun jurnal tarixi
    "debts.customers.all": DEBTS.format(b=""),
    "debts.customers.branch": DEBTS.format(b="AND branch_id = 1"),
    # Qoldiqlar (StockOverview)
    "stock.overview.branch": STOCK.format(b="AND s.branch_id = 1"),
    # Ctrl+K (GlobalSearch): buyurtma raqami
    "search.ctrlk.order": """SELECT o.id, o.number, c.name FROM sales_order o JOIN counterparty c ON c.id = o.customer_id LEFT JOIN sale s ON s.order_id = o.id
        WHERE o.id = ANY(ARRAY(SELECT id FROM sales_order WHERE lower(number) LIKE '%0123457%'
          UNION SELECT order_id FROM sale WHERE lower(number) LIKE '%0123457%' OR lower(invoice_number) LIKE '%0123457%'))
        ORDER BY o.id DESC LIMIT 5""",
    "search.ctrlk.order_nohit": """SELECT o.id, o.number, c.name FROM sales_order o JOIN counterparty c ON c.id = o.customer_id LEFT JOIN sale s ON s.order_id = o.id
        WHERE o.id = ANY(ARRAY(SELECT id FROM sales_order WHERE lower(number) LIKE '%zzz9%'
          UNION SELECT order_id FROM sale WHERE lower(number) LIKE '%zzz9%' OR lower(invoice_number) LIKE '%zzz9%'))
        ORDER BY o.id DESC LIMIT 5""",
    # Markirovka: takror kod tekshiruvi (har skanerda)
    "mark.duplicate_check": """SELECT o.number FROM sales_order_mark m JOIN sales_order o ON o.id = m.order_id
        WHERE m.gtin = (SELECT gtin FROM sales_order_mark WHERE id = 12345) AND m.serial = (SELECT serial FROM sales_order_mark WHERE id = 12345)
        AND m.kind <> 'A' AND m.status IN ('ACTIVE', 'SOLD') LIMIT 1""",
    # Mahsulot harakati tarixi, akt sverka
    "stock_move.product_history": "SELECT * FROM stock_move WHERE product_id = 777 ORDER BY occurred_at DESC LIMIT 50",
    "ledger.act_sverka": """SELECT * FROM party_ledger WHERE counterparty_id = 77 AND branch_id = 2 AND side = 'CUSTOMER'
        AND occurred_at >= current_date - 90 ORDER BY occurred_at""",
    "ledger.customer_balance": "SELECT coalesce(sum(amount), 0) FROM party_ledger WHERE branch_id = 2 AND counterparty_id = 77 AND side = 'CUSTOMER'",
}


def run(sql):
    out = subprocess.run(PSQL + ["-c", "SET jit = off", "-c", "EXPLAIN (ANALYZE, BUFFERS) " + sql], capture_output=True, text=True)
    if out.returncode != 0:
        return None, out.stderr.strip().splitlines()[0]
    ms = float(re.search(r"Execution Time: ([0-9.]+)", out.stdout).group(1))
    scans = [l.strip() for l in out.stdout.splitlines() if "Seq Scan" in l or "Sort Method" in l]
    return ms, out.stdout, scans


def main():
    flt = sys.argv[1] if len(sys.argv) > 1 else ""
    for name, sql in Q.items():
        if flt not in name:
            continue
        times = []
        last = None
        for _ in range(3):
            r = run(sql)
            if r[0] is None:
                print(f"{name:34} XATO {r[1]}")
                break
            times.append(r[0])
            last = r
        if not times:
            continue
        times.sort()
        hint = "; ".join(s[:90] for s in last[2][:2])
        print(f"{name:34} {times[1]:10.1f} ms  {hint}")


if __name__ == "__main__":
    main()
