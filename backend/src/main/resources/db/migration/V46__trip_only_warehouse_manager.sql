-- Egasi qarori (07.11.2026, E5): reysni FAQAT Ombor mudiri tuzadi.
-- Direktor va Admin to'liq huquqli rol sifatida qoladi; Operator, Filial rahbari va boshqa barcha rollardan
-- shipments.trip olib tashlanadi.
DELETE FROM role_permission rp
USING role r
WHERE rp.role_id = r.id
  AND rp.permission_key = 'shipments.trip'
  AND r.code NOT IN ('WAREHOUSE_MANAGER', 'DIRECTOR', 'ADMIN');
