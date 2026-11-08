-- MEDIX — Rollar va ruxsatlar matritsasi prototip (WizRoles) bo'yicha: rol tavsifi, doirasi (barcha / o'z filiali),
-- bosh sahifa turi, faol belgisi; ruxsat guruhi, turi, bog'liq sahifasi va qulf turi; standart rollarning standart ruxsatlari (tiklash uchun).

ALTER TABLE role
    ADD COLUMN description VARCHAR(300),
    ADD COLUMN scope       VARCHAR(10) NOT NULL DEFAULT 'own' CHECK (scope IN ('all', 'own')),
    ADD COLUMN home_kind   VARCHAR(20) NOT NULL DEFAULT 'operator'
        CHECK (home_kind IN ('director', 'branch', 'operator', 'purchase', 'keeper', 'cashier', 'accountant', 'picker', 'marker', 'driver')),
    ADD COLUMN active      BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN role.scope IS 'all — barcha filiallar maʼlumoti, own — faqat oʻz filiali (Direktor va Bosh administrator doim all)';
COMMENT ON COLUMN role.home_kind IS 'Bosh sahifa turi (prototip HOME_KINDS)';

UPDATE role SET scope = 'all' WHERE code IN ('DIRECTOR', 'ADMIN');
UPDATE role SET home_kind = CASE code
    WHEN 'DIRECTOR' THEN 'director' WHEN 'ADMIN' THEN 'director' WHEN 'BRANCH_MANAGER' THEN 'branch'
    WHEN 'OPERATOR' THEN 'operator' WHEN 'PURCHASER' THEN 'purchase' WHEN 'WAREHOUSE_MANAGER' THEN 'keeper'
    WHEN 'CASHIER' THEN 'cashier' WHEN 'ACCOUNTANT' THEN 'accountant' WHEN 'PICKER' THEN 'picker'
    WHEN 'MARKER' THEN 'marker' WHEN 'DRIVER' THEN 'driver' ELSE 'operator' END;
-- Nusxa rollar — manba rolning bosh sahifasi
UPDATE role r SET home_kind = s.home_kind FROM role s WHERE r.copied_from = s.id AND NOT r.system;

ALTER TABLE permission
    ADD COLUMN grp       VARCHAR(10) NOT NULL DEFAULT 'special' CHECK (grp IN ('sales', 'wh', 'money', 'ref', 'rep', 'admin', 'special')),
    ADD COLUMN kind      VARCHAR(10) NOT NULL DEFAULT 'special' CHECK (kind IN ('view', 'create', 'cancel', 'approve', 'special')),
    ADD COLUMN page      VARCHAR(40),
    ADD COLUMN lock_kind VARCHAR(10) CHECK (lock_kind IN ('dir', 'excl'));

COMMENT ON COLUMN permission.page IS 'Bogʻliq sahifa: amal yoqilsa <page>.view ham yoqiladi, koʻrish oʻchsa — sahifa amallari ham';
COMMENT ON COLUMN permission.lock_kind IS 'dir — faqat Direktorda (boshqa rolga berilmaydi), excl — Direktorga avtomatik berilmaydi';

UPDATE permission p SET grp = v.grp, kind = v.kind, page = v.page, lock_kind = v.lk FROM (VALUES
    ('orders.view', 'sales', 'view', 'orders', NULL),
    ('orders.create', 'sales', 'create', 'orders', NULL),
    ('orders.cancel', 'sales', 'cancel', 'orders', NULL),
    ('orders.manage', 'sales', 'cancel', 'orders', NULL),
    ('orders.cancelPick', 'sales', 'cancel', 'orders', NULL),
    ('orders.price', 'sales', 'special', 'orders', NULL),
    ('approvals.view', 'sales', 'view', 'approvals', NULL),
    ('approvals.branch', 'sales', 'approve', 'approvals', NULL),
    ('approvals.director', 'sales', 'approve', 'approvals', 'dir'),
    ('reports.pickers', 'rep', 'view', 'reports', NULL),
    ('reports.markers', 'rep', 'view', 'reports', NULL),
    ('orders.queue', 'sales', 'special', 'orders', NULL),
    ('orders.check', 'sales', 'approve', 'orders', NULL),
    ('orders.docs', 'sales', 'create', 'orders', NULL),
    ('picking.do', 'sales', 'special', 'orders', NULL),
    ('trip.driver', 'sales', 'special', 'shipments', NULL),
    ('shipments.view', 'sales', 'view', 'shipments', NULL),
    ('shipments.trip', 'sales', 'create', 'shipments', NULL),
    ('shipments.ship', 'sales', 'approve', 'shipments', NULL),
    ('receipt.view', 'wh', 'view', 'receipt', NULL),
    ('receipt.create', 'wh', 'create', 'receipt', NULL),
    ('receipt.accept', 'wh', 'approve', 'receipt', NULL),
    ('receipt.post', 'wh', 'approve', 'receipt', NULL),
    ('receipt.cancel', 'wh', 'cancel', 'receipt', NULL),
    ('receipt.cancelPosted', 'wh', 'cancel', 'receipt', NULL),
    ('supplierBonus.confirm', 'money', 'approve', 'receipt', NULL),
    ('supplierPay.notify', 'money', 'special', 'sdebt', NULL),
    ('supplierBonus.notify', 'money', 'special', 'sdebt', NULL),
    ('stock.view', 'wh', 'view', 'stock', NULL),
    ('expiry.view', 'wh', 'view', 'expiry', NULL),
    ('transfer.view', 'wh', 'view', 'transfer', NULL),
    ('transfer.zk', 'wh', 'create', 'transfer', NULL),
    ('transfer.ok', 'wh', 'create', 'transfer', NULL),
    ('transfer.fs', 'wh', 'create', 'transfer', NULL),
    ('transfer.send', 'wh', 'special', 'transfer', NULL),
    ('transfer.receive', 'wh', 'special', 'transfer', NULL),
    ('transfer.resolve', 'wh', 'approve', 'transfer', NULL),
    ('transfer.quar', 'wh', 'approve', 'transfer', NULL),
    ('transfer.cancel', 'wh', 'cancel', 'transfer', NULL),
    ('inventory.view', 'wh', 'view', 'inventory', NULL),
    ('inventory.create', 'wh', 'create', 'inventory', NULL),
    ('inventory.count', 'wh', 'create', 'inventory', NULL),
    ('inventory.openCount', 'wh', 'special', 'inventory', NULL),
    ('inventory.approve', 'wh', 'approve', 'inventory', NULL),
    ('inventory.director', 'wh', 'approve', 'inventory', NULL),
    ('marking.view', 'wh', 'view', 'marking', 'excl'),
    ('marking.scan', 'wh', 'create', 'marking', 'excl'),
    ('marking.export', 'wh', 'special', 'marking', 'excl'),
    ('opening.view', 'wh', 'view', 'opening', NULL),
    ('opening.list', 'wh', 'view', 'opening', NULL),
    ('opening.create', 'wh', 'create', 'opening', NULL),
    ('opening.goods', 'wh', 'create', 'opening', NULL),
    ('opening.approve', 'wh', 'approve', 'opening', NULL),
    ('opening.cancel', 'wh', 'cancel', 'opening', 'dir'),
    ('qm.view', 'wh', 'view', 'qm', NULL),
    ('qm.create', 'wh', 'create', 'qm', NULL),
    ('qm.approve', 'wh', 'approve', 'qm', NULL),
    ('hc.view', 'wh', 'view', 'hc', NULL),
    ('hc.create', 'wh', 'create', 'hc', NULL),
    ('hc.approve', 'wh', 'approve', 'hc', NULL),
    ('hc.director', 'wh', 'approve', 'hc', NULL),
    ('qy.view', 'wh', 'view', 'qy', NULL),
    ('qy.create', 'wh', 'create', 'qy', NULL),
    ('qy.approve', 'wh', 'approve', 'qy', NULL),
    ('payments.view', 'money', 'view', 'payments', NULL),
    ('payments.create', 'money', 'create', 'payments', NULL),
    ('payments.noncash', 'money', 'special', 'payments', NULL),
    ('payments.mt', 'money', 'create', 'payments', NULL),
    ('payments.yt', 'money', 'create', 'payments', NULL),
    ('payments.ytDirect', 'money', 'approve', 'payments', NULL),
    ('payments.ytApprove', 'money', 'approve', 'payments', NULL),
    ('payments.cancel', 'money', 'cancel', 'payments', NULL),
    ('cash.view', 'money', 'view', 'cash', NULL),
    ('cash.create', 'money', 'create', 'cash', NULL),
    ('cash.io', 'money', 'create', 'cash', NULL),
    ('cash.approve', 'money', 'approve', 'cash', NULL),
    ('cash.cancel', 'money', 'cancel', 'cash', NULL),
    ('cash.close', 'money', 'special', 'cash', NULL),
    ('cash.closeDiff', 'money', 'special', 'cash', NULL),
    ('bank.view', 'money', 'view', 'bank', NULL),
    ('cdebt.view', 'money', 'view', 'cdebt', NULL),
    ('sdebt.view', 'money', 'view', 'sdebt', NULL),
    ('recon.view', 'money', 'view', 'recon', NULL),
    ('recon.create', 'money', 'create', 'recon', NULL),
    ('adv.create', 'money', 'create', 'cdebt', NULL),
    ('adv.cancel', 'money', 'cancel', 'cdebt', NULL),
    ('adv.cancelAuto', 'money', 'cancel', 'cdebt', NULL),
    ('products.view', 'ref', 'view', 'products', NULL),
    ('products.create', 'ref', 'create', 'products', NULL),
    ('clients.view', 'ref', 'view', 'clients', NULL),
    ('clients.create', 'ref', 'create', 'clients', NULL),
    ('clients.contact', 'ref', 'create', 'clients', NULL),
    ('clients.terms', 'ref', 'special', 'clients', NULL),
    ('clients.block', 'ref', 'cancel', 'clients', NULL),
    ('clients.lic', 'ref', 'special', 'clients', NULL),
    ('clients.bank', 'ref', 'special', 'clients', NULL),
    ('clients.all', 'ref', 'special', 'clients', NULL),
    ('suppliers.view', 'ref', 'view', 'suppliers', NULL),
    ('suppliers.create', 'ref', 'create', 'suppliers', NULL),
    ('suppliers.contact', 'ref', 'create', 'suppliers', NULL),
    ('suppliers.terms', 'ref', 'special', 'suppliers', NULL),
    ('suppliers.block', 'ref', 'cancel', 'suppliers', NULL),
    ('prices.view', 'ref', 'view', 'prices', NULL),
    ('prices.create', 'ref', 'create', 'prices', NULL),
    ('prices.approve', 'ref', 'approve', 'prices', NULL),
    ('prices.below', 'ref', 'approve', 'prices', 'dir'),
    ('prices.all', 'ref', 'special', 'prices', NULL),
    ('prices.cost', 'ref', 'special', 'prices', NULL),
    ('lookups.view', 'ref', 'view', 'lookups', NULL),
    ('lookups.makers', 'ref', 'create', 'lookups', NULL),
    ('lookups.cats', 'ref', 'create', 'lookups', NULL),
    ('lookups.units', 'ref', 'create', 'lookups', NULL),
    ('lookups.ptypes', 'ref', 'create', 'lookups', NULL),
    ('lookups.regions', 'ref', 'create', 'lookups', NULL),
    ('lookups.fleet', 'ref', 'create', 'lookups', NULL),
    ('lookups.items', 'ref', 'create', 'lookups', NULL),
    ('reports.view', 'rep', 'view', 'reports', NULL),
    ('reports.own', 'rep', 'view', 'reports', NULL),
    ('reports.all', 'rep', 'special', 'reports', NULL),
    ('company.view', 'admin', 'view', 'company', NULL),
    ('branches.view', 'admin', 'view', 'branches', NULL),
    ('warehouses.view', 'admin', 'view', 'warehouses', NULL),
    ('staff.view', 'admin', 'view', 'staff', NULL),
    ('roles.view', 'admin', 'view', 'roles', NULL),
    ('audit.view', 'admin', 'view', 'audit', NULL),
    ('settings.view', 'admin', 'view', 'settings', NULL),
    ('company.edit', 'admin', 'create', 'company', NULL),
    ('staff.edit', 'admin', 'create', 'staff', NULL),
    ('special.cost', 'special', 'special', NULL, NULL),
    ('special.ctrl', 'special', 'special', NULL, NULL),
    ('special.whs', 'special', 'special', NULL, 'excl'),
    ('special.till', 'special', 'special', NULL, 'excl')
) AS v(key, grp, kind, page, lk) WHERE p.key = v.key;

-- Standart rollarning standart ruxsatlari («Standartga qaytarish» uchun) — hozirgi holatdan nusxa
CREATE TABLE role_permission_default (
    role_id        BIGINT      NOT NULL REFERENCES role (id) ON DELETE CASCADE,
    permission_key VARCHAR(64) NOT NULL REFERENCES permission (key),
    PRIMARY KEY (role_id, permission_key)
);
INSERT INTO role_permission_default (role_id, permission_key)
SELECT rp.role_id, rp.permission_key FROM role_permission rp JOIN role r ON r.id = rp.role_id WHERE r.system;
