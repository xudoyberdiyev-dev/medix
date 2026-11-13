-- MEDIX — Mijozdan qaytarish muddati (egasi talabi O8, 13.11.2026): Sozlamalar → Savdo «returnDays» (standart 10, 0 — cheksiz).
-- Muddat o'tgan QM faqat qm.late ruxsati bilan (Direktor, Bosh administrator, Filial rahbari) yaratiladi va «Muddatdan keyin» belgilanadi.

INSERT INTO app_setting (key, value) VALUES ('returnDays', 10) ON CONFLICT (key) DO NOTHING;

ALTER TABLE customer_return ADD COLUMN late BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN customer_return.late IS 'Qaytarish muddatidan keyin yaratilgan (O8, qm.late ruxsati bilan)';

INSERT INTO permission (key, module, description, grp, kind, page)
VALUES ('qm.late', 'qm', 'Mijozdan qaytarish: muddati oʻtgan sotuvni qaytarish', 'wh', 'approve', 'qm');
INSERT INTO role_permission (role_id, permission_key)
SELECT r.id, 'qm.late' FROM role r WHERE r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER');
INSERT INTO role_permission_default (role_id, permission_key)
SELECT r.id, 'qm.late' FROM role r WHERE r.system AND r.code IN ('DIRECTOR', 'ADMIN', 'BRANCH_MANAGER');
